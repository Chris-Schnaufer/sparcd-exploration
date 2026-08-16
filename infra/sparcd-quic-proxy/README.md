# sparcd-quic-proxy

A Caddy reverse proxy on Jetstream2 that fronts the JS2 object store
(`js2.jetstream-cloud.org:8001`, Ceph RGW) with HTTPS on ports
443/8443/8444/8445, HTTP/3 on every port, and browser-grade CORS. It exists so
the sparcd-uploader can reach S3 storage from a browser at full parallel
throughput: the uploader stripes its lanes across the ports (one browser
connection per host+port origin), escaping HTTP/2+3 single-connection
coalescing.

Instance: `sparcd-quic-proxy-02` (m3.tiny) in JS2 project BIO260073.
DNS: `sparcd-quic-proxy-02.bio260073.projects.jetstream-cloud.org`.
A sibling `sparcd-quic-proxy-01` (m3.small, keyed elsewhere) dates from the
uploader benchmark and also fronts RGW, with CORS pinned to one origin.

## Deploying a config change

SSH from residential CGNAT networks is unreliable (per-flow egress IPs defeat
IP-pinned security-group rules), so the working method is a full reimage with
this directory's cloud-init:

```bash
openstack --os-cloud BIO260073_IU server rebuild \
  --image Featured-Minimal-Ubuntu24 \
  --user-data infra/sparcd-quic-proxy/cloud-init.yaml \
  sparcd-quic-proxy-02
```

The instance keeps its IP, DNS name, flavor, and security groups; the disk is
wiped, so Caddy re-issues its TLS certificate on boot (~90s to serving).
**Let's Encrypt allows 5 certificates per exact name per week** — batch config
changes rather than iterating one directive per rebuild.

## Lessons encoded in the Caddyfile (do not simplify away)

- `header_up Host {host}` — SigV4 signs the Host header. RGW validates
  against the Host it receives, so the client's Host must survive. (The
  wildcats MinIO cannot be proxied this way: its front routes by Host and
  drops foreign hostnames — a server-side alias would be needed there.)
- Caddy owns CORS — RGW has no service-level CORS, so ListBuckets (the
  uploader's collection discovery) is browser-dead without it. RGW's
  per-bucket CORS headers are stripped (`header_down -Access-Control-*`) so
  they never duplicate Caddy's.
- `request_buffers 16KiB` — HTTP/3 requests carry no Content-Length; without
  buffering Caddy forwards bodyless requests as `Transfer-Encoding: chunked`,
  which RGW rejects with `501 NotImplemented`. This one cost an evening.
- The uploader also strips the SDK's `?x-id=` query param before signing
  (`packages/s3-safe`) — RGW 501s unknown query params. Server config can't
  fix that one; it must be stripped before the signature is computed.

## Measured context (2026-07-31, Ecuador residential → JS2)

| Path | Throughput |
|---|---|
| wildcats (UA campus) direct, browser | ~0.15 MB/s |
| JS2 via proxy, HTTP/2, single origin | ~7.5 MB/s |
| JS2 via proxy, HTTP/3, single origin | 4.8 MB/s settled |
| Path capacity per TCP connection | ~2.5 MB/s |

h3 underperforms h2 here (clean route + userspace QUIC on 1 vCPU); its value
is lossy/high-RTT field networks, so both stay available. Port sharding exists
to break the single-connection ceiling; production hardening would swap ports
for subdomain shards (port 443 everywhere) once DNS records are available.

## Deployment state (2026-07-31)

The running instance serves the pre-snippet revision: ports answer but
:8443-:8445 fail SigV4 (the old config forwarded a portless Host on them —
clients sign `host:port` on non-default ports). Redeploy this directory's
cloud-init after 2026-08-06 (cert budget) to activate all four shard ports.
Until then, two working :443 origins exist for sharding: proxy-02 (this box)
and proxy-01 (the benchmark-era sibling, CORS-pinned to the vite preview
origin http://127.0.0.1:4173).
