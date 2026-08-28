// A shard proxy with no server: one Worker, N custom-domain hostnames, one S3
// upstream. Browsers key connections on host+port, so shard1..shardN each get
// their own connection and their own congestion window — the same trick the
// Caddy recipe plays with ports.
//
// The important difference from Caddy: a Worker cannot preserve the client's
// Host header on a cross-zone subrequest. Cloudflare rewrites it to the
// upstream's hostname. SigV4 signs Host, so the browser's signature is invalid
// by the time the request lands — passthrough is not available here.
//
// So this Worker verifies, then re-signs. It holds two credential pairs:
//
//   CLIENT_ACCESS_KEY_ID / CLIENT_SECRET_ACCESS_KEY   what browsers sign with
//   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY           what reaches the upstream
//
// Every request must arrive carrying a valid SigV4 signature over the client
// pair, or it is rejected with 403 before the upstream credential is touched.
// Without that check the Worker is an open proxy for its own S3 credential:
// CORS restrains browsers, and nothing else. Callers are unchanged from the
// Caddy recipe — a browser S3 client signs the way it always does, just with
// the proxy-issued key pair and the shard hostname.
//
// Vars (wrangler.toml):              UPSTREAM, S3_REGION
// Secrets (wrangler secret put ...): all four key/secret values above

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

// Only these reach the upstream, plus whatever `x-amz-*` the client set (user
// metadata, ACLs, storage class — all of it carries meaning and all of it has
// to be signed). Everything else the browser and the platform attach —
// `origin`, `accept-*`, `sec-fetch-*`, `cf-connecting-ip`, `user-agent` — is
// dropped rather than forwarded. Forwarding them means signing them, and any
// one the platform rewrites between signing and sending invalidates the
// signature at the far end.
const FORWARD_HEADERS = new Set([
  'content-type', 'content-md5', 'cache-control', 'content-disposition',
  'content-encoding', 'content-language', 'expires',
  'range', 'if-match', 'if-none-match', 'if-modified-since', 'if-unmodified-since',
]);

// The `x-amz-*` exceptions: what the browser signed for its own signature, or
// what describes a body this Worker is about to re-frame.
const DROP_FROM_CLIENT = new Set([
  'authorization',
  'x-amz-content-sha256',
  'x-amz-date',
  'x-amz-security-token',
  'x-amz-decoded-content-length',
  'content-length',
  'host',
]);

function upstreamHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (DROP_FROM_CLIENT.has(name)) continue;
    if (FORWARD_HEADERS.has(name) || name.startsWith('x-amz-')) headers.set(name, value);
  }
  return headers;
}

// S3's own tolerance. A signature stays replayable inside the window; that is
// the same posture S3 itself takes, and the reason to keep the window tight.
const MAX_CLOCK_SKEW_MS = 15 * 60 * 1000;

const encoder = new TextEncoder();

const toHex = (bytes) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(key, data) {
  const imported = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, encoder.encode(data)));
}

async function sha256hex(data) {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

// Header names and the fixed reasons below are HTTP tokens, so this never has
// anything to do — it is here because the output is markup and the input came
// off the wire.
const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// encodeURIComponent leaves !'()* alone; SigV4 wants them percent-encoded.
const encodeRfc3986 = (s) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

function parseAuthorization(header) {
  const match = /^AWS4-HMAC-SHA256\s+(.*)$/.exec(header ?? '');
  if (!match) return null;
  const fields = {};
  for (const part of match[1].split(',')) {
    const [key, ...rest] = part.trim().split('=');
    fields[key] = rest.join('=');
  }
  if (!fields.Credential || !fields.SignedHeaders || !fields.Signature) return null;
  return {
    credential: fields.Credential.split('/'),
    signedHeaders: fields.SignedHeaders.split(';'),
    signature: fields.Signature,
  };
}

function canonicalQueryString(url) {
  return [...url.searchParams]
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)])
    // Sort by encoded key, then by encoded value. The value tiebreak is not
    // decorative: `?partNumber=2&partNumber=1` is a legitimate shape, and both
    // the browser SDK (@smithy/signature-v4 sorts the serialized pairs) and
    // aws4fetch sort values, so a verifier that stops at the key disagrees with
    // every real client. Note that some upstreams — MinIO among them —
    // canonicalize duplicate values in wire order instead, and will reject such
    // a request no matter what fronts them.
    .sort(([ka, va], [kb, vb]) =>
      ka < kb ? -1 : ka > kb ? 1 : va < vb ? -1 : va > vb ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

/**
 * Recompute the caller's SigV4 signature and compare it. Returns null when the
 * request is authentic, or a short reason to log otherwise.
 *
 * `url` must be the request exactly as it arrived: the signature covers the
 * path and query the client sent, so verification has to happen before the
 * host rewrite and before the `x-id` strip.
 */
async function verifyClientSignature(request, url, body, env) {
  const auth = parseAuthorization(request.headers.get('Authorization'));
  if (!auth) return 'missing or unparseable Authorization header';

  const [accessKeyId, date, region, service, terminator] = auth.credential;
  if (accessKeyId !== env.CLIENT_ACCESS_KEY_ID) return 'unknown access key';
  if (service !== 's3' || terminator !== 'aws4_request') return 'unexpected credential scope';

  // A header the caller did not sign is a header an attacker can add to a
  // captured request. This Worker forwards every `x-amz-*` upstream and signs
  // it there, so an unsigned one would be laundered into an authentic-looking
  // upstream request — `x-amz-acl: public-read` bolted onto someone else's
  // PUT. S3 enforces the same rule for the same reason. `host` and
  // `x-amz-date` are required because the whole scheme rests on them: the
  // first binds the signature to this shard, the second to the time window.
  const signed = new Set(auth.signedHeaders);
  for (const required of ['host', 'x-amz-date', 'x-amz-content-sha256']) {
    if (!signed.has(required)) return `${required} is not in SignedHeaders`;
  }
  for (const [name] of request.headers) {
    if (DROP_FROM_CLIENT.has(name)) continue;
    if (name.startsWith('x-amz-') && !signed.has(name)) {
      return `unsigned x-amz header: ${name}`;
    }
  }

  // A signature with no expiry is a bearer token forever. The window bounds
  // how long a captured request stays replayable.
  const amzDate = request.headers.get('x-amz-date');
  const parts = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(amzDate ?? '');
  if (!parts) return 'missing or malformed x-amz-date';
  const signedAt = Date.UTC(+parts[1], +parts[2] - 1, +parts[3], +parts[4], +parts[5], +parts[6]);
  if (Math.abs(Date.now() - signedAt) > MAX_CLOCK_SKEW_MS) return 'x-amz-date outside the window';
  if (parts[1] + parts[2] + parts[3] !== date) return 'x-amz-date does not match the credential scope';

  // The signature covers the *declared* payload hash, not the bytes. Checking
  // the declaration against the body is what stops a captured PUT from being
  // replayed inside the window with different contents.
  const payloadHash = request.headers.get('x-amz-content-sha256');
  if (!payloadHash) return 'missing x-amz-content-sha256';
  if (payloadHash === 'UNSIGNED-PAYLOAD') {
    // Accepted, because the uploader's blob path produces it: the browser AWS
    // SDK hashes string and ArrayBuffer bodies but declares UNSIGNED-PAYLOAD
    // for a Blob, and image uploads stream Blob slices so memory stays flat.
    // The consequence is real and worth stating: for those requests the body
    // is not bound to the signature, so a captured PUT can be replayed with
    // different contents until x-amz-date ages out. The README says how to
    // close it client-side.
  } else if (!/^[0-9a-f]{64}$/.test(payloadHash)) {
    // `STREAMING-AWS4-HMAC-SHA256-PAYLOAD` and friends carry their own chunk
    // framing and per-chunk signatures. Verifying those means implementing
    // the chunked protocol; rejecting is the honest answer.
    return `unsupported x-amz-content-sha256: ${payloadHash}`;
  } else if (await sha256hex(body ?? new ArrayBuffer(0)) !== payloadHash) {
    return 'body does not match x-amz-content-sha256';
  }

  // Cloudflare rewrites Host on the way out, but on the way in it still holds
  // the shard hostname the client signed. Read it from the URL, which is the
  // same value and cannot be spoofed by a header.
  const canonicalHeaders = auth.signedHeaders
    .map((name) => {
      const value = name === 'host' ? url.host : (request.headers.get(name) ?? '');
      return `${name}:${value.trim().replace(/\s+/g, ' ')}\n`;
    })
    .join('');

  const canonicalRequest = [
    request.method,
    url.pathname,
    canonicalQueryString(url),
    canonicalHeaders,
    auth.signedHeaders.join(';'),
    payloadHash,
  ].join('\n');

  const scope = `${date}/${region}/${service}/${terminator}`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256hex(canonicalRequest),
  ].join('\n');

  let key = encoder.encode(`AWS4${env.CLIENT_SECRET_ACCESS_KEY}`);
  for (const part of [date, region, service, terminator]) key = await hmac(key, part);
  const expected = encoder.encode(toHex(await hmac(key, stringToSign)));
  const given = encoder.encode(auth.signature);

  // timingSafeEqual throws on a length mismatch, and comparing hex strings
  // with === would leak the signature a character at a time.
  if (expected.byteLength !== given.byteLength) return 'signature mismatch';
  if (!crypto.subtle.timingSafeEqual(expected, given)) return 'signature mismatch';
  return null;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Expose-Headers': EXPOSE_HEADERS,
    Vary: 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');

    // Preflights carry no Authorization by definition — the browser sends them
    // to find out whether it may send one — so they are answered before the
    // signature check.
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

    // Buffered before verification, because verification hashes it: the
    // declared x-amz-content-sha256 is only worth anything if the bytes are
    // checked against it. The same buffer then goes upstream, which is also
    // what the Caddy recipe's `request_buffers` achieves — a length-less body
    // never reaches the upstream as Transfer-Encoding: chunked, which RGW
    // rejects. Camera-trap objects are a few MB, and a Worker's body limit
    // (100 MB free, 500 MB paid) is the real ceiling either way.
    const body = request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await request.arrayBuffer();

    const inbound = new URL(request.url);
    const rejection = await verifyClientSignature(request, inbound, body, env);
    if (rejection) {
      // S3-shaped so a browser S3 client surfaces it as an S3 error rather than
      // an opaque network failure. CORS headers included, or the browser shows
      // the caller nothing at all.
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Error><Code>SignatureDoesNotMatch</Code>` +
          `<Message>${escapeXml(rejection)}</Message></Error>`,
        { status: 403, headers: { ...corsHeaders(origin), 'Content-Type': 'application/xml' } },
      );
    }

    const upstream = new URL(env.UPSTREAM);
    const url = new URL(request.url);
    url.protocol = upstream.protocol;
    url.hostname = upstream.hostname;
    url.port = upstream.port;

    // Ceph RGW answers 501 NotImplemented for query params it does not
    // recognise, and the AWS SDK appends `?x-id=<Operation>` to everything.
    // Strip it after verification and before re-signing, so neither signature
    // disagrees with the query it covers.
    url.searchParams.delete('x-id');

    const aws = new AwsClient({
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      service: 's3',
      region: env.S3_REGION ?? 'us-east-1',
    });

    const upstreamResponse = await aws.fetch(url, {
      method: request.method,
      headers: upstreamHeaders(request),
      body,
    });

    // The Worker owns CORS the way Caddy does, so any CORS headers the
    // upstream set per bucket are dropped rather than doubled up.
    const out = new Headers(upstreamResponse.headers);
    for (const name of [...out.keys()]) {
      if (name.toLowerCase().startsWith('access-control-')) out.delete(name);
    }
    for (const [name, value] of Object.entries(corsHeaders(origin))) {
      if (name === 'Vary') out.append(name, value);
      else out.set(name, value);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: out,
    });
  },
};
