import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from '@playwright/test';

const root = process.argv[2];
if (!root) throw new Error('Usage: node remember_connection_wasm.mjs <exported-wasm-directory>');
const server = createServer(async (req, res) => {
  const path = normalize(join(root, req.url === '/' ? 'index.html' : req.url)).replace(root, root);
  try { const body = await readFile(path); res.end(body); } catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem('sparcd-connection', JSON.stringify({ endpoint: 'shared.example', accessKey: 'shared-access', secure: true, region: 'us-west-2', forcePathStyle: true })));
  await page.goto(url);
  const endpoint = page.getByLabel('Endpoint');
  await endpoint.waitFor({ state: 'visible', timeout: 60_000 });
  await assert.doesNotReject(() => expectValue(endpoint, 'shared.example'));
  await assert.doesNotReject(() => expectValue(page.getByLabel('Access key'), 'shared-access'));
  await assert.equal(await page.getByLabel('Use HTTPS (when no scheme in endpoint)').isChecked(), true);
  await page.getByLabel('Secret key').fill('never-stored');
  await page.getByLabel('Remember endpoint & access key on this device').uncheck();
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.waitForFunction(() => localStorage.getItem('sparcd-connection') === null);
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
async function expectValue(locator, value) { assert.equal(await locator.inputValue(), value); }
