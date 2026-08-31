import type { UploadSnapshot } from './upload';
import type { UploadState } from '../components/StatePill';

export function uploadStateOf(snapshot: UploadSnapshot | null): UploadState {
  if (!snapshot || snapshot.phase === 'idle') return 'ready';
  if (snapshot.phase === 'done') return snapshot.dryRun ? 'dry-run' : 'complete';
  if (snapshot.phase === 'metadata') return snapshot.dryRun ? 'dry-run' : 'publishing';
  if (snapshot.phase === 'partial' || snapshot.phase === 'error') return 'failed';
  return 'uploading'; // preparing or blobs
}
