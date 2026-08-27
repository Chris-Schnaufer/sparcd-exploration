// A shard proxy with no server: one Worker, N custom-domain hostnames, one S3
// upstream. Browsers key connections on host+port, so shard1..shardN each get
// their own connection and their own congestion window — the same trick the
// Caddy recipe plays with ports.
//
// The important difference from Caddy: a Worker cannot preserve the client's
// Host header on a cross-zone subrequest. Cloudflare rewrites it to the
// upstream's hostname, which invalidates any SigV4 signature the browser
// computed, so signature passthrough is impossible here. This Worker
// RE-SIGNS instead: it drops the inbound Authorization and signs the request
// itself with credentials held as Worker secrets.
//
// Secrets (wrangler secret put ...): S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
// Vars (wrangler.toml):              UPSTREAM, S3_REGION

import { AwsClient } from 'aws4fetch';

const ALLOW_METHODS = 'GET, HEAD, PUT, POST, DELETE';

// Mirrors the Caddyfile's list. Anything a browser S3 client may set must be
// named here or the preflight fails before a byte moves.
const ALLOW_HEADERS = [
  'authorization', 'content-type', 'if-match', 'if-none-match', 'range',
  'amz-sdk-invocation-id', 'amz-sdk-request', 'x-amz-content-sha256',
  'x-amz-date', 'x-amz-meta-sha256', 'x-amz-user-agent',
  'x-amz-checksum-crc32', 'x-amz-checksum-sha256', 'x-amz-checksum-mode',
  'x-amz-sdk-checksum-algorithm', 'x-amz-security-token',
  'x-amz-decoded-content-length', 'x-amz-trailer',
].join(', ');

const EXPOSE_HEADERS =
  'ETag, Content-Length, x-amz-meta-sha256, x-amz-request-id, x-amz-version-id';

// Headers the browser signed for the old signature, or that describe a body
// this Worker is about to re-frame. Both sets have to go before re-signing.
const DROP_FROM_CLIENT = [
  'authorization',
  'x-amz-content-sha256',
  'x-amz-date',
  'x-amz-security-token',
  'x-amz-decoded-content-length',
  'content-length',
  'host',
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin ?? '*',
          'Access-Control-Allow-Methods': ALLOW_METHODS,
          'Access-Control-Allow-Headers': ALLOW_HEADERS,
          'Access-Control-Max-Age': '600',
          Vary: 'Origin',
        },
      });
    }

    const upstream = new URL(env.UPSTREAM);
    const url = new URL(request.url);
    url.protocol = upstream.protocol;
    url.hostname = upstream.hostname;
    url.port = upstream.port;

    // Ceph RGW answers 501 NotImplemented for query params it does not
    // recognise, and the AWS SDK appends `?x-id=<Operation>` to everything.
    // Strip it before signing so the canonical query matches the wire.
    url.searchParams.delete('x-id');

    const headers = new Headers(request.headers);
    for (const name of DROP_FROM_CLIENT) headers.delete(name);

    // The Caddy recipe uses `request_buffers` so a length-less body never
    // reaches the upstream as Transfer-Encoding: chunked, which RGW rejects.
    // Buffering here is the same fix, and it also lets aws4fetch sign the real
    // payload hash. Camera-trap objects are a few MB; a Worker's body limit
    // (100 MB free, 500 MB paid) is the real ceiling either way. Swap in
    // `request.body` plus a fixed `x-amz-content-sha256: UNSIGNED-PAYLOAD`
    // header if you need to stream something larger and your upstream accepts
    // chunked requests.
    const body = request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await request.arrayBuffer();

    const aws = new AwsClient({
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      service: 's3',
      region: env.S3_REGION ?? 'us-east-1',
    });

    const upstreamResponse = await aws.fetch(url, {
      method: request.method,
      headers,
      body,
    });

    // The Worker owns CORS the way Caddy does, so any CORS headers the
    // upstream set per bucket are dropped rather than doubled up.
    const out = new Headers(upstreamResponse.headers);
    for (const name of [...out.keys()]) {
      if (name.toLowerCase().startsWith('access-control-')) out.delete(name);
    }
    out.set('Access-Control-Allow-Origin', origin ?? '*');
    out.set('Access-Control-Expose-Headers', EXPOSE_HEADERS);
    out.append('Vary', 'Origin');

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: out,
    });
  },
};
