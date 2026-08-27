# Cloudflare Worker recipe

The serverless shape of the same idea: N hostnames on one Worker, each its own
browser origin, all forwarding to one S3 upstream. Nothing to operate, no VM,
no certificates to renew.

## The trade-off, up front

**A Worker cannot preserve the client's Host header on a cross-zone
subrequest.** Cloudflare rewrites it to the upstream's hostname. SigV4 signs
Host, so the browser's signature is invalid by the time the request lands —
signature passthrough is not available here, at any amount of cleverness.

So this Worker **re-signs**. It holds bucket-scoped S3 credentials as Worker
secrets, drops the browser's `Authorization`, and signs the request itself.
That means:

- **Credentials move server-side.** The Worker can act on the bucket by
  itself, which the Caddy recipe's proxy cannot. Scope the key tightly — one
  bucket, the operations you actually need.
- **The browser never holds an S3 secret.** For a public-facing tool that is
  usually the better posture, not the worse one. It also becomes the place to
  put your own authorization, since the Worker now decides who gets to use the
  credential.
- **Request bodies are capped**: 100 MB on the free plan, 500 MB on paid.
  Camera-trap JPEGs and short MP4s are well under that; a multi-GB object is
  not.
- **The passthrough option is the VM.** If you need the proxy to be
  credential-free, use [Docker + Caddy](../../README.md#docker--caddy) or the
  [Jetstream2 image](../jetstream2/).

Everything else matches the Caddyfile: the Worker owns CORS, strips the
upstream's per-bucket CORS headers, removes the SDK's `?x-id=` param, and
buffers request bodies so a length-less body never reaches the upstream as
`Transfer-Encoding: chunked`.

## Setup

```sh
npm install

# UPSTREAM, S3_REGION, and the shard hostnames live in wrangler.toml.
$EDITOR wrangler.toml

npx wrangler secret put S3_ACCESS_KEY_ID
npx wrangler secret put S3_SECRET_ACCESS_KEY

npx wrangler deploy --dry-run   # bundles and type-checks without publishing
npx wrangler deploy
```

Each `[[routes]]` entry with `custom_domain = true` gets its own DNS record in
a zone on your Cloudflare account. Four entries, four origins, four browser
connections — the whole mechanism.

This directory is a standalone npm project on purpose. It is deployed by
wrangler, not built by the repo's pnpm workspace, and it keeps its own
`node_modules` so `wrangler deploy` works from here with nothing else
installed.

## Verify it

The repo's smoke test works unchanged against Worker origins, minus the signed
checks — the Worker re-signs, so the browser's credentials are irrelevant and
signing from the test proves nothing about the upstream:

```sh
node ../../smoke.mjs --origins https://shard1.example.org,https://shard2.example.org
```

Unsigned, each origin should still answer with S3 XML (an `AccessDenied` or a
bucket listing, depending on how you scoped the key) rather than a
connection-level failure or a 501.
