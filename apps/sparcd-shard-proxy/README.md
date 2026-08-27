# sparcd-shard-proxy

A reverse proxy that presents one S3 endpoint as several origins, so a browser
can upload to it over several connections at once. It also supplies the CORS
that object stores like Ceph RGW do not, which is what makes an S3 endpoint
usable from a static browser tool at all.

It is a config, a compose file, and a test — no application code, nothing
stateful. Point it at your own S3, RGW, or MinIO endpoint.

## Why it exists

A browser opens **one** connection per origin for HTTP/2 and HTTP/3 and
multiplexes everything onto it. That is the right default for a web page. For
a bulk uploader it is a ceiling: thirty parallel PUTs share one congestion
window, so the whole upload runs at whatever a single TCP or QUIC flow can
pull down that path. On the route we measured, that is about 2.5 MB/s no
matter how many lanes the uploader opens.

Origins are keyed on **scheme + host + port**. Give the same storage four
origins and the browser opens four connections with four independent
congestion windows, and the uploader stripes its lanes across them.

## Measured (2026-07-31, Ecuador residential → Jetstream2)

| Path | Throughput |
|---|---|
| wildcats (UA campus) direct, browser | ~0.15 MB/s |
| JS2 via proxy, HTTP/2, single origin | ~7.5 MB/s |
| JS2 via proxy, HTTP/3, single origin | 4.8 MB/s settled |
| JS2 via 2 proxies, HTTP/3, 2 origins | 8.5 MB/s settled |
| JS2 via proxy, HTTP/3, 4 origins | 10 MB/s settled |
| JS2 via proxy, HTTP/2, 4 origins, 32 lanes | 15 MB/s settled |
| Path capacity per TCP connection | ~2.5 MB/s |

Two things to read out of that. Sharding is where the win is: four origins
beat one by roughly 2x, and the whole path beats the un-proxied baseline by
100x. And HTTP/3 loses to HTTP/2 here — a clean route plus userspace QUIC on
one vCPU — so h3 stays enabled but is not the default assumption. Its case is
lossy, high-RTT field networks, which is exactly where these uploads often
start.

## How sharding is spelled

Two ways to hand out extra origins, both supported by the same config:

- **Extra ports** — `proxy.example.org:443`, `:8443`, `:8444`, `:8445`. One
  DNS record, one certificate. Needs those ports open outbound on the client's
  network, which some institutional firewalls will not allow.
- **Subdomains on :443** — `shard1.example.org` … `shard4.example.org`. Works
  from behind any firewall that permits HTTPS, costs a DNS record per shard.
  This is the production shape.

Set `SHARD_ADDRESSES` to whichever you are using; the client's shard-endpoint
list has to match.

## What the config gets right

Four things cost real time to discover. They are load-bearing.

1. **The client's Host must reach the upstream byte-identical.** SigV4 signs
   the Host header, and S3 recomputes the signature from the request it
   receives. Browsers omit the port when it is the scheme default, so a
   request to `:443` signs `proxy.example.org` and a request to `:8443` signs
   `proxy.example.org:8443`. The Caddyfile passes `{host}` from the :443 site
   and `{http.request.hostport}` from the shard sites. The common
   `header_up Host {upstream_hostport}` breaks every signature silently.

   This is also why some endpoints cannot be fronted this way at all: the
   wildcats MinIO routes on Host and drops hostnames it does not recognise, so
   passthrough there needs a server-side alias. Re-signing (see the
   [Cloudflare Worker recipe](./deploy/cloudflare-worker/)) is the way around
   that.

2. **The proxy owns CORS.** RGW answers CORS per bucket only — there is no
   service-level CORS — so `ListBuckets`, which is how a browser tool
   discovers what it can see, is dead in a browser without this. The proxy
   answers preflights itself and strips the upstream's per-bucket CORS headers
   on the way back (`header_down -Access-Control-*`) so the browser never sees
   two `Access-Control-Allow-Origin` values and rejects both.

3. **`request_buffers 16KiB`.** HTTP/3 requests carry no Content-Length.
   Unbuffered, Caddy forwards them to an HTTP/1.1 upstream as
   `Transfer-Encoding: chunked`, and RGW answers `501 NotImplemented`. With
   buffering Caddy reads the body and sets a real length. This one cost an
   evening.

4. **The client has to strip `?x-id=` before signing.** The AWS SDK appends an
   `x-id=<Operation>` telemetry query param to every request. RGW treats
   unknown query params as unimplemented sub-resources and answers 501; AWS
   and MinIO ignore them. No proxy setting can repair this, because the
   parameter is inside the signed canonical request — it has to be removed
   client-side, before signing. In this repo `@sparcd/s3-safe` does it in an
   SDK `build`-step middleware.

## Choose your deployment

| | [Docker + Caddy](#docker--caddy) | [Jetstream2 VM](./deploy/jetstream2/) | [Cloudflare Worker](./deploy/cloudflare-worker/) |
|---|---|---|---|
| Signature handling | passthrough | passthrough | re-signed at the edge |
| S3 credentials | in the browser | in the browser | Worker secrets |
| Shards | ports or subdomains | ports | subdomains |
| HTTP/3 | yes | yes | yes |
| You operate | a host | a VM image | nothing |

Passthrough is the honest default: the proxy never sees a credential and
cannot act on its own. The Worker recipe trades that for having no server, and
gets a real benefit in exchange — the browser never holds an S3 secret. Read
its README before choosing it.

### Docker + Caddy

Any host with Docker, a public hostname, and the shard ports open.

```sh
cp .env.example .env      # UPSTREAM, PROXY_DOMAIN, SHARD_ADDRESSES
docker compose up -d
```

Certificates land in the `caddy_data` volume. Keep that volume: Let's Encrypt
issues **5 certificates per exact name per week**, and a fresh volume spends
one every restart.

Everything site-specific is an environment variable, so the same
[`Caddyfile`](./Caddyfile) runs here, on the VM image, and in local dev.

## Verify it

[`smoke.mjs`](./smoke.mjs) checks each shard origin the way a browser client
uses it — a CORS preflight, a SigV4-signed `ListBuckets`, and the two failures
that stay invisible until an upload is already running.

```sh
S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
  node smoke.mjs --base https://proxy.example.org --ports 443,8443,8444,8445
```

Per origin it asserts:

- the preflight reflects the request `Origin` and allows the SigV4 headers
- exactly one `Access-Control-Allow-Origin` comes back, on preflight and on
  the real response
- the signed request is accepted by S3 — proof the Host survived the hop
- a length-less (chunked) request body does not come back `501`

Credentials are optional; without them the signed checks run unsigned and only
prove the request reached S3 and returned S3 XML.

### Against a local stack, with no cloud resources

[`compose.dev.yaml`](./compose.dev.yaml) runs MinIO as the upstream and the
canonical Caddyfile in front of it on four localhost shard origins.

```sh
pnpm dev:up      # docker compose -f compose.dev.yaml up -d --wait
pnpm dev:smoke   # smoke.mjs against localhost:8443-8446
pnpm dev:down    # and remove the volumes
```

Caddy issues internal certificates for `localhost` automatically, so the dev
smoke run passes `--insecure`. Do not use that flag against a real deployment.

What the local stack proves and what it does not. Break the Host passthrough
and the signed checks fail with `SignatureDoesNotMatch`; remove the CORS block
and the preflight check fails — both regressions are caught here. The chunked
check is weaker locally, because MinIO accepts chunked request bodies where
RGW does not; against MinIO it only shows the request survived. All four shard
origins are non-default ports, so the local run exercises the `host:port`
branch of the Host passthrough and not the portless `:443` branch.

## Client side

A client stripes across shards by holding a list of endpoints and handing each
upload lane one of them. In this repo the uploader takes a comma-separated
shard list in Settings and builds one S3 client per endpoint, all sharing the
connection's credentials. The requirements on any client are the two the proxy
cannot cover: sign for the origin it is actually talking to, and strip `?x-id=`
before signing.
