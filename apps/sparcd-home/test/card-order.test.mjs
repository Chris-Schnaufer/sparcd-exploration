import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const homePage = fileURLToPath(new URL('../index.html', import.meta.url));

test('lists app cards in the Uploader, Tagger, Explorer order', async () => {
  const html = await readFile(homePage, 'utf8');
  const tools = html.match(/<nav class="deck" aria-label="Tools">([\s\S]*?)<\/nav>/)?.[1];

  assert.ok(tools, 'expected the Tools navigation');
  assert.deepEqual(
    [...tools.matchAll(/<h2>([^<]+)<\/h2>/g)].map(([, name]) => name),
    ['Uploader', 'Tagger', 'Explorer'],
  );
});
