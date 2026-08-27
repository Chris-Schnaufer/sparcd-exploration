#!/usr/bin/env node
// Checks a shard proxy the way a browser S3 client uses it: one CORS preflight
// and one SigV4-signed service call per shard origin, plus the two failure
// modes that are invisible until an upload is already running (duplicated CORS
// headers, chunked request bodies).
//
//   node smoke.mjs --base https://proxy.example.org --ports 443,8443,8444,8445
//   node smoke.mjs --origins https://a.example.org,https://b.example.org
//
// Credentials are optional. With them the signed call is a real ListBuckets;
// without them it is unsigned and only proves the request reached S3 and came
// back as S3 XML rather than a proxy-level failure.
//
//   S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_SESSION_TOKEN, S3_REGION

import { createHash, createHmac } from 'node:crypto';

const USAGE = `usage: node smoke.mjs [--base URL --ports 443,8443] [--origins URL,URL]
                     [--bucket NAME] [--insecure]

  --base      scheme://host to combine with --ports into shard origins
  --ports     comma-separated ports; 443 yields a portless origin
  --origins   explicit shard origins, instead of --base/--ports
  --bucket    also issue a signed HEAD against this bucket
  --insecure  accept untrusted TLS certificates (the local dev stack only)`;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--insecure') out.insecure = true;
    else if (arg.startsWith('--')) out[arg.slice(2)] = argv[++i];
    else throw new Error(`unexpected argument: ${arg}`);
  }
  return out;
}

function resolveOrigins(args) {
  if (args.origins) return args.origins.split(',').map((s) => s.trim()).filter(Boolean);
  if (!args.base || !args.ports) throw new Error('need --origins, or --base with --ports');
  const base = new URL(args.base);
  return args.ports
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((port) => {
      const u = new URL(base);
      // A browser omits the port when it is the scheme default, and signs the
      // Host it actually sends. Mirror that exactly.
      u.port = (base.protocol === 'https:' && port === '443') ||
        (base.protocol === 'http:' && port === '80')
        ? ''
        : port;
      return u.origin;
    });
}

// --- SigV4 ------------------------------------------------------------------

const sha256hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

const EMPTY_SHA256 = sha256hex('');

function signedHeadersFor({ method, url, region, creds }) {
  const u = new URL(url);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const date = stamp.slice(0, 8);

  // No query string, deliberately. Ceph RGW answers 501 NotImplemented for
  // query params it does not recognise, so browser clients must strip the AWS
  // SDK's `?x-id=` telemetry param before signing. Nothing on the proxy can
  // repair that after the fact.
  const canonicalUri = u.pathname
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');

  const headers = {
    host: u.host,
    'x-amz-content-sha256': EMPTY_SHA256,
    'x-amz-date': stamp,
  };
  if (creds.sessionToken) headers['x-amz-security-token'] = creds.sessionToken;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    EMPTY_SHA256,
  ].join('\n');

  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    stamp,
    scope,
    sha256hex(canonicalRequest),
  ].join('\n');

  let key = hmac(`AWS4${creds.secretAccessKey}`, date);
  for (const part of [region, 's3', 'aws4_request']) key = hmac(key, part);
  const signature = hmac(key, stringToSign).toString('hex');

  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

// --- checks -----------------------------------------------------------------

const TEST_ORIGIN = 'https://smoke.invalid';
const REQUIRED_ALLOW_HEADERS = ['authorization', 'x-amz-content-sha256', 'x-amz-date'];

function fail(message) {
  return { ok: false, message };
}
function pass(message) {
  return { ok: true, message };
}

async function checkPreflight(origin) {
  let res;
  try {
    res = await fetch(`${origin}/`, {
      method: 'OPTIONS',
      headers: {
        origin: TEST_ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': REQUIRED_ALLOW_HEADERS.join(','),
      },
    });
  } catch (err) {
    return fail(`no response (${err.cause?.code ?? err.message})`);
  }
  if (res.status >= 400) return fail(`HTTP ${res.status}`);

  const allowOrigin = res.headers.get('access-control-allow-origin');
  if (!allowOrigin) return fail(`HTTP ${res.status}, no Access-Control-Allow-Origin`);
  // Node joins repeated headers with ", ". Two values means the proxy is
  // emitting CORS and passing the upstream's through — browsers reject that.
  if (allowOrigin.includes(',')) {
    return fail(`duplicated Access-Control-Allow-Origin: ${allowOrigin}`);
  }
  if (allowOrigin !== TEST_ORIGIN && allowOrigin !== '*') {
    return fail(`Access-Control-Allow-Origin is ${allowOrigin}, not the request Origin`);
  }

  const allowHeaders = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
  const missing = REQUIRED_ALLOW_HEADERS.filter((h) => !allowHeaders.includes(h));
  if (missing.length) return fail(`Access-Control-Allow-Headers missing ${missing.join(', ')}`);

  const allowMethods = (res.headers.get('access-control-allow-methods') ?? '').toUpperCase();
  for (const method of ['GET', 'PUT']) {
    if (!allowMethods.includes(method)) {
      return fail(`Access-Control-Allow-Methods missing ${method}`);
    }
  }
  return pass(`HTTP ${res.status}, origin reflected, SigV4 headers allowed`);
}

async function checkSigned(origin, path, region, creds) {
  const url = `${origin}${path}`;
  const method = path === '/' ? 'GET' : 'HEAD';
  const headers = creds
    ? signedHeadersFor({ method, url, region, creds })
    : { 'x-amz-content-sha256': EMPTY_SHA256 };
  headers.origin = TEST_ORIGIN;

  let res;
  try {
    res = await fetch(url, { method, headers, redirect: 'manual' });
  } catch (err) {
    return fail(`no response (${err.cause?.code ?? err.message})`);
  }
  if (res.status === 501) {
    return fail('HTTP 501 NotImplemented — the request never made it to S3 intact');
  }

  const allowOrigin = res.headers.get('access-control-allow-origin');
  if (!allowOrigin) return fail(`HTTP ${res.status}, no Access-Control-Allow-Origin on the response`);
  if (allowOrigin.includes(',')) {
    return fail(`duplicated Access-Control-Allow-Origin: ${allowOrigin}`);
  }

  const body = method === 'HEAD' ? '' : await res.text();
  const requestId = res.headers.get('x-amz-request-id');
  const isS3 = body.includes('<?xml') || body.includes('<ListAllMyBucketsResult') || requestId;

  if (!creds) {
    return isS3
      ? pass(`HTTP ${res.status}, unsigned request reached S3 (${describe(body, res)})`)
      : fail(`HTTP ${res.status}, response is not from S3`);
  }
  if (res.status >= 400) {
    return fail(`HTTP ${res.status} ${describe(body, res)}`);
  }
  return pass(`HTTP ${res.status}, ${describe(body, res)}`);
}

function describe(body, res) {
  const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1];
  if (code) return `S3 error ${code}`;
  const buckets = (body.match(/<Name>/g) ?? []).length;
  if (body.includes('<ListAllMyBucketsResult')) return `ListBuckets, ${buckets} bucket(s)`;
  return res.headers.get('x-amz-request-id') ? 'S3 responded' : 'no body';
}

async function checkChunked(origin) {
  // HTTP/3 request bodies arrive with no Content-Length. A proxy that forwards
  // them unbuffered hands the HTTP/1.1 upstream `Transfer-Encoding: chunked`,
  // which RGW answers with 501. This sends exactly that shape — unsigned, to
  // the service root, where every S3 implementation rejects it before touching
  // data — and only cares whether the answer is a 501.
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('smoke'));
      controller.close();
    },
  });
  let res;
  try {
    res = await fetch(`${origin}/`, { method: 'POST', body, duplex: 'half', headers: { origin: TEST_ORIGIN } });
  } catch (err) {
    return fail(`no response (${err.cause?.code ?? err.message})`);
  }
  if (res.status === 501) {
    return fail('HTTP 501 — chunked body reached the upstream (request_buffers missing?)');
  }
  return pass(`HTTP ${res.status}, length-less body survived the hop`);
}

// --- main -------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.insecure) {
    // Deliberately process-wide and deliberately loud: the local dev stack
    // serves Caddy's internal CA, which no Node trust store knows about.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    process.removeAllListeners('warning');
    console.log('TLS verification disabled (--insecure)\n');
  }

  const origins = resolveOrigins(args);
  const region = process.env.S3_REGION ?? 'us-east-1';
  const creds = process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        sessionToken: process.env.S3_SESSION_TOKEN,
      }
    : null;
  if (!creds) console.log('no S3 credentials in the environment: signed checks run unsigned\n');

  let failures = 0;
  for (const origin of origins) {
    console.log(origin);
    const checks = [
      ['preflight', await checkPreflight(origin)],
      [creds ? 'signed ListBuckets' : 'ListBuckets', await checkSigned(origin, '/', region, creds)],
    ];
    if (args.bucket) {
      checks.push([
        `${creds ? 'signed ' : ''}HEAD ${args.bucket}`,
        await checkSigned(origin, `/${args.bucket}`, region, creds),
      ]);
    }
    checks.push(['chunked body', await checkChunked(origin)]);

    for (const [name, result] of checks) {
      if (!result.ok) failures++;
      console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(22)} ${result.message}`);
    }
    console.log();
  }

  const total = origins.length;
  console.log(
    failures === 0
      ? `all checks passed across ${total} origin${total === 1 ? '' : 's'}`
      : `${failures} check(s) failed across ${total} origin${total === 1 ? '' : 's'}`,
  );
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${err.message}\n\n${USAGE}`);
    process.exit(2);
  },
);
