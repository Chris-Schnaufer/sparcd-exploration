import { beforeAll, expect, it, vi } from 'vitest';
const storage = () => { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) }; };
Object.assign(globalThis, { window: Object.assign(globalThis, { addEventListener() {}, removeEventListener() {}, localStorage: storage(), sessionStorage: storage() }) });
const memory = vi.hoisted(() => ({ rows: new Map<string, any>(), fail: false }));
vi.mock('@sparcd/flip', async original => ({ ...(await original<typeof import('@sparcd/flip')>()),
  flipDb: { transaction: async (_mode: string, _table: unknown, work: () => Promise<void>) => work(), preparations: { toArray: async () => structuredClone([...memory.rows.values()]), get: async (id: string) => structuredClone(memory.rows.get(id)), put: async (row: any) => { if (memory.fail) throw new Error('QuotaExceededError'); memory.rows.set(row.id, structuredClone(row)); }, delete: async (id: string) => { memory.rows.delete(id); } } },
  loadPreparedSpecies: async () => null,
}));
vi.mock('../src/lib/processPool', () => ({ processBatch: (items: any[], _started: any, result: any) => {
  for (const item of items) result({ id: item.id, sha256: item.file.name === 'edited.jpg' ? 'changed' : 'original', mediaKind: 'image' });
  return { done: Promise.resolve(), cancel() {} };
} }));
let store: typeof import('../src/store')['useStore'];
let journal: typeof import('../src/lib/preparation');
beforeAll(async () => { ({ useStore: store } = await import('../src/store')); journal = await import('../src/lib/preparation'); journal.startPreparationJournal(); });
it('persists only non-secret batch data, survives failed writes, retries, and validates originals before recovery', async () => {
  const file = new File(['original bytes'], 'original.jpg', { lastModified: 123 });
  store.getState().setFiles([{ id: 'SD/a.jpg', relPath: 'SD/a.jpg', fileName: 'a.jpg', size: file.size, mediaKind: 'image', file }]);
  store.setState({ files: [{ ...store.getState().files[0], processState: 'ready', sha256: 'original', manualNaive: { year: 2026, month: 7, day: 1, hour: 12, minute: 0, second: 0 }, manualSource: 'manual', thumbnail: new Blob(['thumb']) }], uploadDescription: 'preserved notes', uploadTimeZone: 'America/Phoenix', s3Config: { endpoint: 'https://example.test', accessKey: 'person', secretKey: 'NEVER-PERSIST', region: 'us-east-1', forcePathStyle: true } });
  await journal.flushPreparation();
  const saved = (await journal.readPreparation())!;
  expect(saved.files[0].thumbnail).toBeInstanceOf(Blob);
  expect(saved.files[0]).not.toHaveProperty('file');
  expect(JSON.stringify(saved)).not.toContain('NEVER-PERSIST');
  expect(saved.inputs.uploadDescription).toBe('preserved notes');
  memory.fail = true;
  store.getState().setUploadDescription('pending notes');
  await expect(journal.flushPreparation()).rejects.toThrow('could not be saved');
  expect((await journal.readPreparation())?.inputs.uploadDescription).toBe('preserved notes');
  memory.fail = false; journal.retryPreparation(); await journal.flushPreparation();
  expect((await journal.readPreparation())?.inputs.uploadDescription).toBe('pending notes');
  const scanned = { id: 'SD/a.jpg', relPath: 'SD/a.jpg', fileName: 'a.jpg', size: file.size, mediaKind: 'image' as const, file };
  await expect(journal.recoverPreparation(saved, [])).rejects.toThrow('not in the selected folder');
  await expect(journal.recoverPreparation(saved, [{ ...scanned, file: new File(['changed bytes!'], 'edited.jpg') }])).rejects.toThrow('content hash differs');
  await journal.recoverPreparation(saved, [scanned]); await journal.flushPreparation();
  expect(store.getState().files[0]).toMatchObject({ sha256: 'original', manualSource: 'manual', manualNaive: saved.files[0].manualNaive });
  expect(store.getState().uploadDescription).toBe('preserved notes');
  store.getState().resetBatch(); await journal.flushPreparation();
  expect(await journal.readPreparation()).toBeNull();
});
it('writes batch-owned keys and never overwrites or clears a sibling journal', async () => {
  const sibling = { id: 'sibling', value: { keep: 'other window' } };
  memory.rows.set('sibling', sibling);
  const file = new File(['bytes'], 'new.jpg');
  store.getState().setFiles([{ id: 'new.jpg', relPath: 'new.jpg', fileName: 'new.jpg', size: file.size, mediaKind: 'image', file }]);
  await journal.flushPreparation();
  const owned = (await journal.readPreparation())!;
  expect(owned.id).not.toBe('active');
  expect(memory.rows.has(owned.id)).toBe(true);
  store.getState().resetBatch(); await journal.flushPreparation();
  expect(memory.rows.has(owned.id)).toBe(false);
  expect(memory.rows.get('sibling')).toEqual(sibling);
  memory.rows.delete('sibling');
});
it('recovers a legacy singleton without losing it until the batch-owned replacement is saved', async () => {
  const file = new File(['original bytes'], 'original.jpg');
  const saved = { v: 1 as const, id: 'legacy-batch', savedAt: new Date().toISOString(), files: [{ id: 'original.jpg', relPath: 'original.jpg', fileName: 'original.jpg', size: file.size, mediaKind: 'image' as const, processState: 'ready' as const, sha256: 'original', lastModified: file.lastModified }], flipId: null, species: null, inputs: { selectedBucket: null, selectedLocationId: null, uploadDescription: 'legacy notes', uploadTimeZone: 'America/Phoenix' } };
  memory.rows.set('active', { id: 'active', value: saved });
  expect((await journal.listPreparations())[0].id).toBe(saved.id);
  memory.fail = true;
  await journal.recoverPreparation(saved, [{ id: file.name, relPath: file.name, fileName: file.name, size: file.size, mediaKind: 'image', file }]);
  await expect(journal.flushPreparation()).rejects.toThrow('could not be saved');
  expect(memory.rows.has('active')).toBe(true);
  memory.fail = false; journal.retryPreparation(); await journal.flushPreparation();
  expect(memory.rows.has('active')).toBe(false);
  expect((await journal.listPreparations()).map(item => item.id)).toEqual([saved.id]);
  expect((await journal.readPreparation())?.inputs.uploadDescription).toBe('legacy notes');
  store.getState().resetBatch(); await journal.flushPreparation();
});
it('reports unsupported journals without deleting them or blocking healthy batch lookup', async () => {
  memory.rows.set('active', { id: 'active', value: { v: 99, files: [] } });
  const file = new File(['original bytes'], 'healthy.jpg');
  store.getState().setFiles([{ id: file.name, relPath: file.name, fileName: file.name, size: file.size, mediaKind: 'image', file }]);
  store.setState({ flipId: 'healthy-flip' });
  await journal.flushPreparation();
  const healthy = (await journal.readPreparation())!;
  const unavailable: string[] = [];
  expect(await journal.listPreparations(id => unavailable.push(id))).toEqual([healthy]);
  expect(unavailable).toEqual(['active']);
  expect(await journal.readPreparationForFlip('healthy-flip')).toEqual(healthy);
  expect(await journal.readPreparationForFlip('not-present')).toBeNull();
  expect(memory.rows.get('active').value.v).toBe(99);
});

it('keeps a damaged matching Flip journal an error rather than adopting incorrect inputs', async () => {
  memory.rows.set('broken-match', { id: 'broken-match', value: { v: 99, flipId: 'broken-flip' } });
  await expect(journal.readPreparationForFlip('broken-flip')).rejects.toThrow('unsupported version');
  expect(memory.rows.has('broken-match')).toBe(true);
});
