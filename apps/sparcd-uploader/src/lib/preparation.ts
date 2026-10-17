// The pre-upload journal is separate from real-upload sessions and credentials.
// A single IndexedDB transaction replaces the snapshot: interrupted writes keep
// the previous version. Original File bytes never enter this record.
import { flipDb, loadPreparedSpecies, readFlipRecord, validPreparedSpecies, type PreparedSpecies } from '@sparcd/flip';
import { useStore, type FileEntry } from '../store';
import { reconcileReselect, restoreFromHandle, type RestoreOk } from './resume';
import type { ScannedFile } from './scanFiles';
export type LocalPreparation = {
  v: 1;
  id: string;
  dirHandle?: FileSystemDirectoryHandle;
  savedAt: string;
  files: (Omit<FileEntry, 'file'> & { lastModified: number })[];
  flipId: string | null;
  species: PreparedSpecies | null;
  inputs: Pick<ReturnType<typeof useStore.getState>, 'selectedBucket' | 'selectedLocationId' | 'uploadDescription' | 'uploadTimeZone'>;
};
let pending = Promise.resolve();
let failure: Error | null = null;
let installed = false;
let batchSpecies: PreparedSpecies | null = null;
let lastToken = -1;
let preparationId = '';
export function bindCurrentPreparationSpecies(species: PreparedSpecies | null | undefined): void {
  batchSpecies = validPreparedSpecies(species) ? species : null;
  lastToken = useStore.getState().batchToken + 1;
}
export function acceptPreparationSpecies(species: PreparedSpecies): void {
  if (!validPreparedSpecies(batchSpecies)) { batchSpecies = species; lastToken = useStore.getState().batchToken; retryPreparation(); }
}
const listeners = new Set<() => void>();
let status = '';
let revision = 0;
export const preparationStatus = () => status;
export const subscribePreparation = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function report(message: string) { status = message; for (const listener of listeners) listener(); }
export async function readPreparation(): Promise<LocalPreparation | null> {
  const value = (await flipDb.preparations.get('active'))?.value as LocalPreparation | undefined;
  if (!value) return null;
  const valid = value.v === 1 && typeof value.id === 'string' && !!value.id && Number.isFinite(Date.parse(value.savedAt)) &&
    Array.isArray(value.files) && value.files.length > 0 && new Set(value.files.map(f => f?.relPath)).size === value.files.length &&
    value.files.every(f => f && typeof f.id === 'string' && typeof f.relPath === 'string' && !!f.relPath && typeof f.fileName === 'string' &&
      Number.isFinite(f.size) && f.size >= 0 && Number.isFinite(f.lastModified) && ['image', 'video'].includes(f.mediaKind) &&
      ['queued', 'processing', 'ready', 'error'].includes(f.processState) && (f.processState !== 'ready' || typeof f.sha256 === 'string')) &&
    !!value.inputs && typeof value.inputs.uploadDescription === 'string' && typeof value.inputs.uploadTimeZone === 'string' &&
    (value.inputs.selectedBucket === null || typeof value.inputs.selectedBucket === 'string') &&
    (value.inputs.selectedLocationId === null || typeof value.inputs.selectedLocationId === 'string');
  if (!valid) throw new Error('Saved preparation is damaged or from an unsupported version. Its stored data has been kept. Reopen the compatible app or reselect your folder to start a new batch.');
  return value;
}
export function startPreparationJournal(): void {
  if (installed) return;
  installed = true;
  useStore.subscribe((s, previous) => {
    const changed = s.files !== previous.files || s.flipId !== previous.flipId || s.selectedBucket !== previous.selectedBucket || s.selectedLocationId !== previous.selectedLocationId || s.uploadDescription !== previous.uploadDescription || s.uploadTimeZone !== previous.uploadTimeZone;
    const published = s.activeSnap?.phase === 'done' && !s.activeSnap.dryRun;
    if (!changed && !published) return;
    // Do not erase a recoverable batch merely because the startup store is empty.
    if (!s.files.length && !previous.files.length && !published) return;
    const files = s.files.map(({ file, ...entry }) => ({ ...entry, lastModified: file.lastModified }));
    const inputs = { selectedBucket: s.selectedBucket, selectedLocationId: s.selectedLocationId, uploadDescription: s.uploadDescription, uploadTimeZone: s.uploadTimeZone };
    const token = s.batchToken;
    const writing = ++revision;
    report('Saving local preparation…');
    pending = pending.catch(() => {}).then(async () => {
      if (!files.length || published) await flipDb.preparations.delete('active');
      else {
        if (lastToken !== token) { batchSpecies = await loadPreparedSpecies(s.s3Config ?? undefined); preparationId = crypto.randomUUID(); lastToken = token; }
        if (!preparationId) preparationId = crypto.randomUUID();
        if (!validPreparedSpecies(batchSpecies)) batchSpecies = await loadPreparedSpecies(s.s3Config ?? undefined);
        const species = batchSpecies;
        const value: LocalPreparation = { v: 1, id: preparationId, dirHandle: s.dirHandle ?? undefined, savedAt: new Date().toISOString(), files, flipId: s.flipId, species, inputs };
        await flipDb.preparations.put({ id: 'active', value });
      }
      failure = null; if (writing === revision) report(files.length && !published ? 'Local preparation saved. Original files remain in your folder.' : '');
    }).catch(error => { failure = error; report('Local preparation could not be saved. Keep this tab open, free browser storage, and retry before leaving.'); });
  });
}
export async function flushPreparation(): Promise<void> {
  let observed: Promise<void>;
  do { observed = pending; await observed; } while (observed !== pending);
  if (failure) throw new Error('Local preparation could not be saved. Keep this tab open and retry after checking browser storage.');
}
export function retryPreparation(): void {
  const s = useStore.getState();
  useStore.setState({ files: [...s.files] });
}
export async function recoverPreparation(saved: LocalPreparation, scanned: ScannedFile[]): Promise<void> {
  const result = await reconcileReselect(saved.files.map(f => ({ localPath: f.relPath, fileName: f.fileName, size: f.size, sha256: f.sha256 })), scanned);
  await applyRecoveredPreparation(saved, result);
}
export async function recoverPreparationFromHandle(saved: LocalPreparation): Promise<void> {
  const result = await restoreFromHandle({ dirHandle: saved.dirHandle }, Promise.resolve(saved.files.map(f => ({ localPath: f.relPath, fileName: f.fileName, size: f.size, sha256: f.sha256 }))));
  if (!result.ok) throw new Error(result.reason);
  await applyRecoveredPreparation(saved, result);
}
async function applyRecoveredPreparation(saved: LocalPreparation, result: Pick<RestoreOk, 'attached' | 'problems' | 'resolved'>): Promise<void> {
  if (result.problems.length) throw new Error(result.problems.map(p => `${p.fileName}: ${p.reason}`).join('; ') + '. Your saved preparation is unchanged. Reselect the original folder.');
  const flip = saved.flipId ? await readFlipRecord(saved.flipId) : null;
  const files: FileEntry[] = saved.files.map(({ lastModified, ...entry }) => {
    const fresh = result.resolved.get(entry.relPath);
    const original = result.attached.get(entry.relPath)!;
    return { ...entry, ...(entry.sha256 ? {} : fresh), id: entry.id, ...(flip ? { preTags: flip.tags[entry.relPath] ?? [], preTaggerUser: flip.taggerUser } : {}), file: new File([original], original.name, { type: original.type, lastModified }), processState: 'ready' };
  });
  preparationId = saved.id;
  batchSpecies = flip?.preparedSpecies ?? saved.species;
  lastToken = useStore.getState().batchToken + 1;
  useStore.getState().adoptTaggedBatch({ flipId: saved.flipId, files, dirHandle: null });
  useStore.setState(saved.inputs);
}
