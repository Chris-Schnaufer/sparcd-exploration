import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, draftId, uploadId } from '../src/lib/db';
import { useDraftStore, type UploadCtx } from '../src/lib/drafts';

const CTX: UploadCtx = { bucket: 'discard-test', uploadPrefix: 'pending/' };
const PATH = 'pending/IMG001.JPG';
const ID = draftId(CTX.bucket, CTX.uploadPrefix, PATH);

function delayedDelete() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  const actualWhere = db.drafts.where.bind(db.drafts);
  let intercepted = false;
  const spy = vi.spyOn(db.drafts, 'where').mockImplementation(((index: string) => {
    if (!intercepted && index === '[bucket+uploadPrefix]') {
      intercepted = true;
      return { equals: () => ({ delete: () => promise }) };
    }
    return actualWhere(index);
  }) as typeof db.drafts.where);
  return { resolve, reject, restore: () => spy.mockRestore() };
}

const add = (scientificName: string, commonName: string) =>
  useDraftStore.getState().addSpecies(
    CTX,
    [{ mediaPath: PATH, deploymentId: 'deployment', base: { observations: [] } }],
    { scientificName, commonName, count: 1 },
  );

describe('discard persistence', () => {
  beforeEach(async () => {
    await db.open();
    await db.drafts.where('[bucket+uploadPrefix]').equals([CTX.bucket, CTX.uploadPrefix]).delete();
    useDraftStore.setState({
      loadedKey: uploadId(CTX.bucket, CTX.uploadPrefix),
      loading: false,
      drafts: {},
      timeOffset: null,
    });
  });

  afterEach(async () => {
    await db.drafts.where('[bucket+uploadPrefix]').equals([CTX.bucket, CTX.uploadPrefix]).delete();
  });

  it('does not let a pending debounced save resurrect a confirmed discard', async () => {
    add('Canis latrans', 'Coyote');

    await useDraftStore.getState().discardUpload(CTX);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(useDraftStore.getState().drafts).toEqual({});
    expect(
      await db.drafts.where('[bucket+uploadPrefix]').equals([CTX.bucket, CTX.uploadPrefix]).count(),
    ).toBe(0);
  });

  it('preserves and serializes a newer edit made while deletion is delayed', async () => {
    add('Canis latrans', 'Coyote');
    const deletion = delayedDelete();
    const discarding = useDraftStore.getState().discardUpload(CTX);

    add('Puma concolor', 'Puma');
    await new Promise((resolve) => setTimeout(resolve, 250));
    deletion.restore();
    expect(await db.drafts.get(ID)).toBeUndefined();

    deletion.resolve();
    await discarding;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(useDraftStore.getState().drafts[PATH].observations.map((o) => o.commonName)).toEqual([
      'Coyote',
      'Puma',
    ]);
    expect((await db.drafts.get(ID))?.observations.map((o) => o.commonName)).toEqual([
      'Coyote',
      'Puma',
    ]);
  });

  it('shares an in-flight deletion and releases newer saves after a deletion error', async () => {
    add('Canis latrans', 'Coyote');
    const deletion = delayedDelete();
    const first = useDraftStore.getState().discardUpload(CTX);
    const second = useDraftStore.getState().discardUpload(CTX);
    add('Puma concolor', 'Puma');
    await new Promise((resolve) => setTimeout(resolve, 250));
    deletion.restore();

    deletion.reject(new Error('IndexedDB unavailable'));
    await expect(first).rejects.toThrow('IndexedDB unavailable');
    await expect(second).rejects.toThrow('IndexedDB unavailable');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(useDraftStore.getState().drafts[PATH]).toBeDefined();
    expect((await db.drafts.get(ID))?.observations.map((o) => o.commonName)).toContain('Puma');
  });

  it('requeues a cancelled snapshot save when delayed deletion fails', async () => {
    add('Canis latrans', 'Coyote');
    const deletion = delayedDelete();
    const discarding = useDraftStore.getState().discardUpload(CTX);
    deletion.restore();

    deletion.reject(new Error('delete failed'));
    await expect(discarding).rejects.toThrow('delete failed');
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect((await db.drafts.get(ID))?.observations.map((o) => o.commonName)).toEqual(['Coyote']);
  });
});
