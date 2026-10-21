import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { db } from '../src/lib/db';
import { AutomaticSaver, SaveConflict, type SaveServices } from '../src/lib/automaticSaver';
import { accountScope, type AutomaticRecord, type EditAction } from '../src/lib/automaticModel';

const record = (): AutomaticRecord => ({ id: 'auto', scope: 'account', bucket: 'bucket', uploadPrefix: 'upload/', collectionKey: 'bucket::collection', actions: [], undo: null });
const image = { key: 'image.jpg', fileName: 'image.jpg', deploymentId: 'd', baseTimestamp: '2024-01-01T00:00:00', baseObservations: [], baseQuestionable: true };
const remote = { images: [image], location: null };
const action = (id: string): EditAction => ({ id, user: 'Alice', at: new Date().toISOString(), changes: [{ path: image.key, field: 'expert', before: false, after: true }] });
function services(): SaveServices {
  return { save: vi.fn(async () => remote), current: vi.fn(async () => remote), changed: vi.fn(), resolve: vi.fn(async () => {}),
    reverse: vi.fn(async original => ({ action: { ...action('undo'), undoOf: original.id } })) };
}
let savers: AutomaticSaver[];
async function start(s = services()) { const saver = new AutomaticSaver(record(), s); savers.push(saver); await saver.open(); return saver; }
async function settle() { await new Promise<void>(resolve => setTimeout(resolve, 15)); }

beforeEach(async () => {
  await db.open(); await db.automatic.clear(); await db.syncJournals.clear(); savers = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async (_name: string, task: () => Promise<unknown>) => task() } } });
});
afterEach(() => { savers.forEach(s => s.dispose()); vi.useRealTimers(); });

describe('durable automatic saving', () => {
  it('persists action and Undo boundaries before the debounce, and announces Saving immediately', async () => {
    const s = services(), saver = await start(s);
    saver.accept(action('first')); saver.accept(action('second'));
    expect(saver.view.phase).toBe('saving');
    await settle();
    const saved = await db.automatic.get('auto');
    expect(saved?.actions.map(a => a.id)).toEqual(['first', 'second']);
    expect(saved?.undo?.id).toBe('second');
    expect(s.save).not.toHaveBeenCalled();
  });
  it('starts after 250ms idle and bounds a continuous queue at one second', async () => {
    const s = services(), saver = await start(s);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    saver.accept(action('a'));
    await vi.advanceTimersByTimeAsync(249); expect(s.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await saver.flush(); expect(s.save).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) { saver.accept(action(`b${i}`)); await vi.advanceTimersByTimeAsync(200); }
    await saver.flush(); expect(s.save).toHaveBeenCalledTimes(2);
  });
  it('retains newer edits and serializes a second save behind an in-flight save', async () => {
    const s = services(); let finish!: () => void;
    s.save = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(remote); })).mockResolvedValue(remote);
    const saver = await start(s); saver.accept(action('a')); const first = saver.flush();
    await settle(); saver.accept(action('b')); expect(saver.flush()).toBe(first);
    expect(s.save).toHaveBeenCalledTimes(1); finish();
    expect(await first).toBe(true); expect(s.save).toHaveBeenCalledTimes(2);
    expect(saver.record.actions).toEqual([]); expect(saver.record.undo?.id).toBe('b');
  });
  it('retains failed flights across reload and retries without consuming Undo early', async () => {
    const s = services(); s.save = vi.fn().mockRejectedValue(new Error('Denied'));
    const saver = await start(s); saver.accept(action('a')); expect(await saver.flush()).toBe(false);
    expect(saver.view.phase).toBe('failed'); expect(saver.record.undo?.id).toBe('a');
    saver.dispose(); const resumed = await start();
    expect(resumed.record.flight?.ids).toEqual(['a']); expect(await resumed.flush()).toBe(true);
    expect(resumed.record.undo?.id).toBe('a');
  });
  it('does not retry conflicts automatically or through the ordinary Retry control', async () => {
    const s = services(); s.save = vi.fn().mockRejectedValue(new SaveConflict('remote changed'));
    const saver = await start(s); saver.accept(action('a')); await saver.flush();
    expect(await saver.retry()).toBe(false); expect(s.save).toHaveBeenCalledTimes(1);
    expect(saver.record.actions).toHaveLength(1);
  });
  it('pauses offline editing and saving, then flushes on reconnection', async () => {
    const s = services(), saver = await start(s); saver.accept(action('a')); saver.setOnline(false);
    expect(saver.view.canEdit).toBe(false); expect(await saver.flush()).toBe(false); expect(s.save).not.toHaveBeenCalled();
    saver.setOnline(true); await saver.flush(); expect(s.save).toHaveBeenCalledTimes(1);
  });
  it('consumes Undo only after the reversal commits, without creating Redo', async () => {
    const saver = await start(); saver.accept(action('a')); await saver.flush();
    expect(saver.view.undoReason).toBe(''); expect(await saver.undo()).toBe(true);
    expect(saver.record.undo).toBeNull(); expect((await db.automatic.get('auto'))?.undo).toBeNull();
    expect(await saver.undo()).toBe(false);
  });
  it('disables Undo when affected remote data changed', async () => {
    const s = services(), saver = await start(s); saver.accept(action('a')); await saver.flush();
    s.current = vi.fn(async () => ({ ...remote, images: [{ ...image, baseQuestionable: false }] }));
    expect(await saver.undo()).toBe(false); expect(s.reverse).not.toHaveBeenCalled();
    expect(saver.view.undoReason).toContain('affected data changed'); expect(saver.record.undo).not.toBeNull();
  });
  it('refuses a stale cross-tab Undo and preserves the newer durable record', async () => {
    const saver = await start(); saver.accept(action('a')); await saver.flush();
    const other = await start(); other.accept(action('b')); await other.flush();
    expect(await saver.undo()).toBe(false); expect((await db.automatic.get('auto'))?.undo?.id).toBe('b');
  });
  it('isolates account/destination scopes while permitting secret-key repair', () => {
    const cfg = { endpoint: 'https://example.com', accessKey: 'alice', secretKey: 'old', region: 'x', forcePathStyle: true };
    expect(accountScope(cfg)).toBe(accountScope({ ...cfg, secretKey: 'new' }));
    expect(accountScope(cfg)).not.toBe(accountScope({ ...cfg, accessKey: 'bob' }));
    expect(accountScope(cfg)).not.toBe(accountScope({ ...cfg, endpoint: 'https://other.example.com' }));
  });
});
