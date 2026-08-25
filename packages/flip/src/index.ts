// The hand-off record between the uploader and the tagger — one not-yet-uploaded
// local batch, handed over for species tagging and handed back with tags.
//
// Both tools deploy under the same origin in production
// (`/sparcd-exploration/uploader/` and `.../tagger/`), so a shared IndexedDB
// database is the transport: the uploader writes a record and navigates, the
// tagger opens it by id, writes tags back into the same row, and navigates home.
// Nothing leaves the browser, so a batch can be tagged with no connection at all.
//
// Blobs (the 64px thumbnails) and a `FileSystemDirectoryHandle` are stored
// directly — IndexedDB structured-clones both, which is the whole reason this
// is a Dexie store and not a query string.
//
// Schema versioning follows the two apps' rule: Dexie's versioning API with
// forward-carrying upgrade callbacks. v1 is the initial schema.

import Dexie, { type Table } from 'dexie';

/** One species applied to one image. Structurally identical to the tagger's
 *  `DraftObservation` and deliberately duplicated — the two apps stay
 *  independent, and this shape is the wire contract between them. */
export type FlipObservation = {
  scientificName: string;
  commonName: string;
  count: number;
  requestedSpecies: string;
  freeTags: string;
};

/**
 * One file in the handed-over batch. `relPath` is the uploader's scan id — the
 * path within the chosen folder — and is unique within a batch, so it doubles
 * as the tag key and the tagger's media key.
 *
 * Everything Inspect established rides along, not just what the tagger needs to
 * draw a tile: the batch is rebuilt from this record on the way back, and a
 * field that didn't travel is a field the uploader has to do without. Most of
 * it is display-only, but `mimeType` reaches `media.csv`, so a batch that went
 * through the tagger would otherwise publish differently from the same batch
 * uploaded straight through.
 */
export interface FlipFile {
  relPath: string;
  fileName: string;
  size: number;
  sha256: string;
  mediaKind: 'image' | 'video';

  // Capture time, naive wall-clock `YYYY-MM-DDTHH:mm:ss` with no zone applied.
  // The two sources stay apart: the uploader shows and offers different things
  // for a time the camera wrote than for one a person entered, so a manual time
  // must not come home looking like EXIF.
  /** The camera's own capture time, from EXIF or the video container. */
  exifTimestamp?: string;
  /** A capture time entered by hand for a file the camera left blank. */
  manualTimestamp?: string;

  /** The worker's own sniff of the media type — authoritative over the file
   *  extension, and the value that lands in `media.csv`. */
  mimeType?: string;
  exifCamera?: string;
  gps?: { lat: number; lon: number };
  width?: number;
  height?: number;

  thumb?: Blob; // the 64px thumbnail the uploader already computed
}

/**
 * The one capture time to display for a file: the camera's own, else the one
 * entered by hand. Mirrors how the uploader resolves it at bundle build, so the
 * tagger shows the same value the upload will carry.
 */
export const captureTimestampOf = (file: FlipFile): string | undefined =>
  file.exifTimestamp ?? file.manualTimestamp;

/**
 * How the tagger can reach the full-resolution bytes. `persistent-handle` means
 * a durable folder handle rode along and the tagger can re-open the folder
 * (with a user gesture if the browser demands one); `reselect-required` means
 * there is no handle and only the thumbnails are available.
 */
export type FlipAccessMode = 'persistent-handle' | 'reselect-required';

export type FlipStatus = 'pending' | 'tagging' | 'done';

export interface FlipRecord {
  id: string;
  v: 1;
  createdAt: string; // ISO
  returnUrl: string; // where the tagger sends the user back to
  accessMode: FlipAccessMode;
  dirHandle?: FileSystemDirectoryHandle;
  files: FlipFile[];
  tags: Record<string, FlipObservation[]>; // keyed by relPath; `[]` means detagged
  taggerUser?: string;
  status: FlipStatus;
}

class FlipDb extends Dexie {
  records!: Table<FlipRecord, string>;

  constructor() {
    super('sparcd-flip');
    this.version(1).stores({ records: 'id' });
  }
}

export const flipDb = new FlipDb();

export const newFlipId = (): string => crypto.randomUUID();

/**
 * Merge a partial tag map over the stored one. Only the images the partial
 * mentions change, so a debounced per-image save can never clobber tags for
 * images it wasn't carrying. An empty array is a real value — the image was
 * deliberately detagged — not an absence.
 */
export function mergeTags(
  existing: Record<string, FlipObservation[]>,
  partial: Record<string, FlipObservation[]>,
): Record<string, FlipObservation[]> {
  return { ...existing, ...partial };
}

export async function writeFlipRecord(record: FlipRecord): Promise<void> {
  await flipDb.records.put(record);
}

export function readFlipRecord(id: string): Promise<FlipRecord | undefined> {
  return flipDb.records.get(id);
}

/**
 * Merge tags for some images into the record. Runs inside a read-write
 * transaction so a debounced save and a whole-record write never interleave
 * into a lost update.
 */
export async function updateFlipTags(
  id: string,
  partial: Record<string, FlipObservation[]>,
): Promise<void> {
  await flipDb.transaction('rw', flipDb.records, async () => {
    const rec = await flipDb.records.get(id);
    if (!rec) return;
    await flipDb.records.put({ ...rec, tags: mergeTags(rec.tags, partial) });
  });
}

export async function setFlipStatus(id: string, status: FlipStatus): Promise<void> {
  await flipDb.transaction('rw', flipDb.records, async () => {
    const rec = await flipDb.records.get(id);
    if (!rec) return;
    await flipDb.records.put({ ...rec, status });
  });
}

/** The tagger's final hand-back: merge the last tags, record who tagged, close. */
export async function finishFlipRecord(
  id: string,
  tags: Record<string, FlipObservation[]>,
  taggerUser: string,
): Promise<void> {
  await flipDb.transaction('rw', flipDb.records, async () => {
    const rec = await flipDb.records.get(id);
    if (!rec) return;
    await flipDb.records.put({
      ...rec,
      tags: mergeTags(rec.tags, tags),
      taggerUser,
      status: 'done',
    });
  });
}
