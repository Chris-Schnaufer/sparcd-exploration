import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createProxyConfig } from './vite.config.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const host = '127.0.0.1';

async function freePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolve);
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function startApp(relativeRoot) {
  const root = fileURLToPath(new URL(relativeRoot, import.meta.url));
  const port = await freePort();
  const server = await createServer({
    root,
    server: { host, port, strictPort: true },
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert(address && typeof address !== 'string');
  return { server, origin: `http://${host}:${address.port}` };
}

let uploader;
let tagger;
let proxy;

try {
  uploader = await startApp('../sparcd-uploader/');
  tagger = await startApp('../sparcd-tagger/');
  const proxyPort = await freePort();
  const proxyConfig = createProxyConfig({
    targets: { uploader: uploader.origin, tagger: tagger.origin },
    port: proxyPort,
  });
  proxy = await createServer({
    ...proxyConfig,
    configFile: false,
    root: here,
    server: {
      ...proxyConfig.server,
      host,
    },
  });
  await proxy.listen();
  const address = proxy.httpServer?.address();
  assert(address && typeof address !== 'string');
  const origin = `http://${host}:${address.port}`;
  const uploaderUrl = new URL('/sparcd-exploration/uploader/', origin);
  const taggerUrl = new URL('/sparcd-exploration/tagger/', origin);

  assert.equal(uploaderUrl.origin, taggerUrl.origin);
  const [uploaderResponse, taggerResponse, uploaderClient, taggerClient] = await Promise.all([
    fetch(uploaderUrl),
    fetch(taggerUrl),
    fetch(new URL('/sparcd-exploration/uploader/@vite/client', origin)),
    fetch(new URL('/sparcd-exploration/tagger/@vite/client', origin)),
  ]);
  assert.equal(uploaderResponse.status, 200);
  assert.equal(taggerResponse.status, 200);
  assert.equal(uploaderClient.status, 200);
  assert.equal(taggerClient.status, 200);

  const [uploaderHtml, taggerHtml] = await Promise.all([
    uploaderResponse.text(),
    taggerResponse.text(),
  ]);
  assert.match(uploaderHtml, /\/sparcd-exploration\/uploader\/@vite\/client/);
  assert.match(taggerHtml, /\/sparcd-exploration\/tagger\/@vite\/client/);
  console.log(`same-origin proxy smoke passed at ${origin}`);
} finally {
  await Promise.allSettled([
    proxy?.close(),
    uploader?.server.close(),
    tagger?.server.close(),
  ]);
}
