import type { UploadSnapshot } from './upload';
import type { UploadState } from '../components/StatePill';

export function uploadStateOf(snapshot: UploadSnapshot | null): UploadState {
  if (!snapshot || snapshot.phase === 'idle') return 'ready';
  if (snapshot.phase === 'partial' || snapshot.phase === 'error') return 'failed';
  if (snapshot.dryRun) return 'dry-run';
  if (snapshot.phase === 'done') return 'complete';
  if (snapshot.phase === 'metadata') return 'publishing';
  return 'uploading'; // preparing or blobs
}
