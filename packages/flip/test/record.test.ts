// The hand-off record's contract: a round trip preserves the batch, and the
// merge helpers only ever touch the images they were handed. Runs against
// fake-indexeddb, so it exercises the real Dexie schema — Blobs and directory
// handles are left out because Node has nothing to structured-clone them from.

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  flipDb,
  mergeTags,
  writeFlipRecord,
  readFlipRecord,
  updateFlipTags,
  setFlipStatus,
  finishFlipRecord,
  type FlipObservation,
  type FlipRecord,
} from '../src/index';

const coyote: FlipObservation = {
  scientificName: 'Canis latrans',
  commonName: 'Coyote',
  count: 2,
  requestedSpecies: '',
  freeTags: '',
};

const ghost: FlipObservation = {
  scientificName: 'Casper',
  commonName: 'Ghost',
  count: 1,
  requestedSpecies: '',
  freeTags: '',
};

const record = (over: Partial<FlipRecord> = {}): FlipRecord => ({
  id: 'batch-1',
  v: 1,
  createdAt: '2026-08-25T10:00:00.000Z',
  returnUrl: '/sparcd-exploration/uploader/?flip=batch-1',
  accessMode: 'persistent-handle',
  files: [
    { relPath: 'SD/IMG_0001.JPG', fileName: 'IMG_0001.JPG', size: 100, sha256: 'aa', mediaKind: 'image' },
    { relPath: 'SD/IMG_0002.JPG', fileName: 'IMG_0002.JPG', size: 200, sha256: 'bb', mediaKind: 'image' },
  ],
  tags: {},
  status: 'pending',
  ...over,
});

beforeEach(async () => {
  await flipDb.records.clear();
});

describe('mergeTags', () => {
  it('leaves images the partial does not mention alone', () => {
    const merged = mergeTags({ a: [coyote], b: [ghost] }, { a: [ghost] });
    expect(merged).toEqual({ a: [ghost], b: [ghost] });
  });

  it('treats an empty array as a real value — a detagged image', () => {
    expect(mergeTags({ a: [coyote] }, { a: [] })).toEqual({ a: [] });
  });
});

describe('the record round trip', () => {
  it('reads back everything the uploader wrote', async () => {
    await writeFlipRecord(record());
    const back = await readFlipRecord('batch-1');
    expect(back).toEqual(record());
  });

  it('is absent for an id nobody wrote', async () => {
    expect(await readFlipRecord('nope')).toBeUndefined();
  });
});

describe('tag updates', () => {
  it('merges one image at a time without disturbing the others', async () => {
    await writeFlipRecord(record());
    await updateFlipTags('batch-1', { 'SD/IMG_0001.JPG': [coyote] });
    await updateFlipTags('batch-1', { 'SD/IMG_0002.JPG': [ghost] });
    const back = await readFlipRecord('batch-1');
    expect(back!.tags).toEqual({ 'SD/IMG_0001.JPG': [coyote], 'SD/IMG_0002.JPG': [ghost] });
  });

  it('ignores an id that is not there rather than creating one', async () => {
    await updateFlipTags('gone', { x: [coyote] });
    expect(await readFlipRecord('gone')).toBeUndefined();
  });

  it('tracks the status the tagger moves it through', async () => {
    await writeFlipRecord(record());
    await setFlipStatus('batch-1', 'tagging');
    expect((await readFlipRecord('batch-1'))!.status).toBe('tagging');
  });
});

describe('the hand back', () => {
  it('merges the final tags, records the tagger, and closes the record', async () => {
    await writeFlipRecord(record({ tags: { 'SD/IMG_0001.JPG': [coyote] } }));
    await finishFlipRecord('batch-1', { 'SD/IMG_0002.JPG': [ghost] }, 'anita');
    const back = await readFlipRecord('batch-1');
    expect(back!.tags).toEqual({ 'SD/IMG_0001.JPG': [coyote], 'SD/IMG_0002.JPG': [ghost] });
    expect(back!.taggerUser).toBe('anita');
    expect(back!.status).toBe('done');
  });

  it('accepts a blank tagger identity — the tagger never forces one', async () => {
    await writeFlipRecord(record());
    await finishFlipRecord('batch-1', {}, '');
    expect((await readFlipRecord('batch-1'))!.taggerUser).toBe('');
  });
});
