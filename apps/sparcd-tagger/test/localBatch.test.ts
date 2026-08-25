// A batch handed over by the uploader has to look, to the rest of the
// workspace, exactly like one loaded from a collection — the projection into
// TagImage is where that promise is kept or broken.

import { describe, it, expect } from 'vitest';
import type { FlipRecord } from '@sparcd/flip';
import { localTagImages, tagsFromDrafts } from '../src/lib/localWorkspace';
import { DEFAULT_SPECIES } from '../src/lib/defaultSpecies';
import { GHOST, blankDraft } from '../src/lib/drafts';
import type { DraftObservation, DraftRecord } from '../src/lib/db';

const coyote: DraftObservation = {
  scientificName: 'Canis latrans',
  commonName: 'Coyote',
  count: 2,
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
    {
      relPath: 'SD/IMG_0001.JPG',
      fileName: 'IMG_0001.JPG',
      size: 100,
      sha256: 'aa',
      captureTimestamp: '2026-08-01T06:30:00',
      mediaKind: 'image',
    },
    { relPath: 'SD/CLIP.MP4', fileName: 'CLIP.MP4', size: 200, sha256: 'bb', mediaKind: 'video' },
  ],
  tags: {},
  status: 'pending',
  ...over,
});

describe('the record as the workspace sees it', () => {
  it('keys every image by its path within the chosen folder', () => {
    const images = localTagImages(record());
    expect(images.map((i) => i.key)).toEqual(['SD/IMG_0001.JPG', 'SD/CLIP.MP4']);
    expect(images.map((i) => i.fileName)).toEqual(['IMG_0001.JPG', 'CLIP.MP4']);
  });

  it('carries the camera capture time, and an empty one where there is none', () => {
    const [image, clip] = localTagImages(record());
    expect(image.baseTimestamp).toBe('2026-08-01T06:30:00');
    expect(clip.baseTimestamp).toBe('');
  });

  it('has no deployment — the uploader assigns one after tagging', () => {
    expect(localTagImages(record()).every((i) => i.deploymentId === '')).toBe(true);
  });

  it('seeds each image from the tags already in the record, so re-entry resumes', () => {
    const images = localTagImages(record({ tags: { 'SD/IMG_0001.JPG': [coyote] } }));
    expect(images[0].baseObservations).toEqual([coyote]);
    expect(images[1].baseObservations).toEqual([]);
  });

  it('copies the observations, never aliasing the arrays inside the record', () => {
    const src = record({ tags: { 'SD/IMG_0001.JPG': [coyote] } });
    const [image] = localTagImages(src);
    image.baseObservations[0].count = 99;
    expect(src.tags['SD/IMG_0001.JPG'][0].count).toBe(2);
  });
});

describe('drafts on the way back into the record', () => {
  const ctx = { bucket: 'local', uploadPrefix: 'batch-1' };

  it('writes each image its full intended species set', () => {
    const drafts: Record<string, DraftRecord> = {
      'SD/IMG_0001.JPG': { ...blankDraft(ctx, 'SD/IMG_0001.JPG', ''), observations: [coyote] },
      'SD/CLIP.MP4': blankDraft(ctx, 'SD/CLIP.MP4', ''),
    };
    expect(tagsFromDrafts(drafts)).toEqual({
      'SD/IMG_0001.JPG': [coyote],
      'SD/CLIP.MP4': [],
    });
  });
});

describe('the offline species vocabulary', () => {
  it('parses the registry the desktop app ships', () => {
    expect(DEFAULT_SPECIES.length).toBeGreaterThan(40);
    const coyoteEntry = DEFAULT_SPECIES.find((s) => s.scientificName === 'Canis latrans');
    expect(coyoteEntry?.commonName).toBe('Coyote');
  });

  it('leaves Ghost out — the species panel has its own built-in row', () => {
    expect(DEFAULT_SPECIES.some((s) => s.scientificName === GHOST.label)).toBe(false);
  });

  it('carries the key bindings the desktop app uses', () => {
    expect(DEFAULT_SPECIES.find((s) => s.commonName === 'Bear')?.keyBinding).toBe('B');
  });
});
