// Module-level bridge between the Inspect worker pool and a live streaming run.
// Lives outside any React component so it survives section navigation — the
// run keeps receiving newly-inspected files and the queue closes correctly even
// when the user is on the History or Settings section while a run is in flight.

import { onFilesReady } from './processing';
import { processingComplete, captureTimeComplete } from './validation';
import { useStore } from '../store';
import type { StreamingUploadRun } from './upload';
import type { FileEntry } from '../store';

let streamingRun: StreamingUploadRun | null = null;
let closed = false;

function maybeCloseQueue(files: FileEntry[]): void {
  if (!streamingRun || closed) return;
  if (processingComplete(files) && captureTimeComplete(files)) {
    closed = true;
    streamingRun.close(files);
  }
}

export function attachStreamingRun(run: StreamingUploadRun): void {
  streamingRun = run;
  closed = false;
  // If inspection already finished before Start was clicked, the files
  // subscriber below will never fire — check immediately so the queue closes.
  maybeCloseQueue(useStore.getState().files);
}

export function detachStreamingRun(): void {
  streamingRun = null;
}

// Feed newly-inspected files into the live run. Registered once at module load;
// never torn down, so navigation doesn't break the bridge.
onFilesReady((results) => {
  if (!streamingRun) return;
  const ids = new Set(results.map((r) => r.id));
  const current = useStore.getState().files;
  const arrived = current.filter((f) => ids.has(f.id) && f.processState === 'ready' && f.sha256);
  if (arrived.length > 0) streamingRun.notifyReady(arrived);
});

// Close the queue when the batch finishes inspection, regardless of which
// section is on screen.
useStore.subscribe((state, prev) => {
  if (state.files !== prev.files) maybeCloseQueue(state.files);
});

// Auto-detach when the store clears the active run (cancel, next-batch, logout).
useStore.subscribe((state, prev) => {
  if (prev.activeRun && !state.activeRun) detachStreamingRun();
});
