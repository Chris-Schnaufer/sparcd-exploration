import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, uploadId } from '../src/lib/db';
import { useDraftStore, type UploadCtx } from '../src/lib/drafts';

const CTX: UploadCtx = { bucket: 'discard-test', uploadPrefix: 'pending/' };
const PATH = 'pending/IMG001.JPG';

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
    useDraftStore.getState().addSpecies(
      CTX,
      [{ mediaPath: PATH, deploymentId: 'deployment', base: { observations: [] } }],
      { scientificName: 'Canis latrans', commonName: 'Coyote', count: 1 },
    );

    await useDraftStore.getState().discardUpload(CTX);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(useDraftStore.getState().drafts).toEqual({});
    expect(
      await db.drafts.where('[bucket+uploadPrefix]').equals([CTX.bucket, CTX.uploadPrefix]).count(),
    ).toBe(0);
  });
});
