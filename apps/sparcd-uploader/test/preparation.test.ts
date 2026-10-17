import { beforeAll, expect, it, vi } from 'vitest';
const storage = () => { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) }; };
Object.assign(globalThis, { window: Object.assign(globalThis, { addEventListener() {}, removeEventListener() {}, localStorage: storage(), sessionStorage: storage() }) });
const memory = vi.hoisted(() => ({ row: undefined as any, fail: false }));
vi.mock('@sparcd/flip', async original => ({ ...(await original<typeof import('@sparcd/flip')>()),
  flipDb: { preparations: { get: async () => structuredClone(memory.row), put: async (row: any) => { if (memory.fail) throw new Error('QuotaExceededError'); memory.row = structuredClone(row); }, delete: async () => { memory.row = undefined; } } },
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
it('rejects unsupported journal versions without deleting them', async () => {
  memory.row = { id: 'active', value: { v: 99, files: [] } };
  await expect(journal.readPreparation()).rejects.toThrow('unsupported version');
  expect(memory.row.value.v).toBe(99);
});
