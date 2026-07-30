// Past and in-flight upload sessions, read from the Dexie resume store (P5).
// Completed batches are a record; open batches (no completedAt) offer Resume —
// which restores local file access (durable handle or reselect-and-reconcile)
// and then hands the prepared session to the wizard's Upload step, which owns
// the run UI. Discard drops the local session row only; it never touches remote
// state.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { formatBytes } from '../lib/scanFiles';
import {
  listBatches,
  loadSession,
  discardSession,
  fileStateCounts,
  updateBatch,
  type BatchRecord,
  type LoadedSession,
  type PersistedFileState,
} from '../lib/db';
import {
  restoreFromHandle,
  reconcileReselect,
  reselectFolder,
  type ReconcileProblem,
} from '../lib/resume';
import { scanFileList, supportsDirectoryHandle } from '../lib/scanFiles';
import { Note } from '../components/RunMonitor';
import { Spinner } from '../components/Spinner';
import { PublishedUploads } from '../components/PublishedUploads';

type Row = { batch: BatchRecord; counts: Record<PersistedFileState, number> };

const stampOf = (prefix: string) => prefix.slice(prefix.lastIndexOf('/') + 1);

function Badge({ batch }: { batch: BatchRecord }) {
  const done = !!batch.completedAt;
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5 border ${
        done ? 'border-ok/50 text-ok' : 'border-warn/50 text-warn'
      }`}
    >
      {done ? 'complete' : 'open'}
    </span>
  );
}

export function History() {
  const s3Config = useStore((s) => s.s3Config);
  const setPendingResume = useStore((s) => s.setPendingResume);
  const setSection = useStore((s) => s.setSection);
  const setStep = useStore((s) => s.setStep);
  const activeRunSessionId = useStore((s) => s.activeRunSessionId);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null); // batch id being prepared
  const [message, setMessage] = useState<string | null>(null);
  const [problems, setProblems] = useState<ReconcileProblem[]>([]);
  const reselectRef = useRef<HTMLInputElement>(null);
  const pendingReselect = useRef<BatchRecord | null>(null);

  const refresh = useCallback(async () => {
    const batches = await listBatches();
    const withCounts = await Promise.all(
      batches.map(async (batch) => ({ batch, counts: await fileStateCounts(batch.id) })),
    );
    setRows(withCounts);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const launch = useCallback(
    (session: LoadedSession, attached: Map<string, File>, probs: ReconcileProblem[]) => {
      const missingRequired = session.files.filter((f) => f.state !== 'done' && !attached.has(f.localPath));
      if (missingRequired.length > 0) {
        setProblems([
          ...probs,
          ...missingRequired.map((f) => ({
            localPath: f.localPath,
            fileName: f.fileName,
            reason: 'required for resume but not reattached',
          })),
        ]);
        setMessage(
          `${missingRequired.length} pending or failed source file${
            missingRequired.length === 1 ? '' : 's'
          } could not be reattached. Reselect the original folder before resuming.`,
        );
        return;
      }
      setProblems([]);
      setMessage(null);
      // The wizard's Upload step owns the run UI, so hand the prepared session
      // over and jump there rather than running a second monitor here.
      setPendingResume({ session, attached, problems: probs });
      setSection('new');
      setStep('upload');
    },
    [setPendingResume, setSection, setStep],
  );

  // Preparing a resume is a long async gesture (load session, revalidate the
  // handle or prompt a reselect, re-hash). `preparing` is set synchronously so
  // the button latches before the first await — otherwise a double-click starts
  // two runs.
  const beginResume = useCallback(
    async (batch: BatchRecord) => {
      setPreparing(batch.id);
      try {
        setProblems([]);
        if (!s3Config) {
          setMessage('Connect to a storage endpoint before resuming.');
          return;
        }
        const session = await loadSession(batch.id);
        if (!session) {
          setMessage('Session record is missing.');
          return;
        }
        // Durable handle: revalidate permission inside this click gesture, then
        // re-hash against the recorded files — a same-size in-place edit between
        // sessions would otherwise slip through, so mismatches surface as problems.
        if (batch.fileAccessMode === 'persistent-handle' && batch.dirHandle) {
          const restore = await restoreFromHandle(batch, session.files);
          if (restore.ok) {
            launch(session, restore.attached, restore.problems);
            return;
          }
          setMessage(restore.reason);
          // fall through to reselect
        }

        // Reselect path.
        if (supportsDirectoryHandle) {
          const picked = await reselectFolder();
          if (!picked) return; // user dismissed
          const { attached, problems: probs } = await reconcileReselect(
            session.files,
            picked.scanned,
          );
          // Opportunistically upgrade the session to a durable handle for next time.
          if (picked.handle) {
            await updateBatch(batch.id, {
              dirHandle: picked.handle,
              fileAccessMode: 'persistent-handle',
            });
          }
          launch(session, attached, probs);
        } else {
          // No durable picker — fall back to a transient <input webkitdirectory>.
          pendingReselect.current = batch;
          reselectRef.current?.click();
        }
      } finally {
        setPreparing(null);
      }
    },
    [s3Config, launch],
  );

  const onReselectInput = useCallback(
    async (list: FileList | null) => {
      const batch = pendingReselect.current;
      pendingReselect.current = null;
      if (!batch || !list || list.length === 0) return;
      setPreparing(batch.id);
      try {
        const session = await loadSession(batch.id);
        if (!session) {
          setMessage('Session record is missing.');
          return;
        }
        const { attached, problems: probs } = await reconcileReselect(
          session.files,
          scanFileList(list),
        );
        launch(session, attached, probs);
      } finally {
        setPreparing(null);
      }
    },
    [launch],
  );

  const discard = useCallback(
    async (sessionId: string) => {
      await discardSession(sessionId);
      await refresh();
    },
    [refresh],
  );

  if (rows === null) {
    return (
      <div className="px-6 py-6 max-w-2xl mx-auto">
        <p className="font-body text-[14px] text-inkSoft">Loading sessions…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-6 py-6 max-w-2xl mx-auto space-y-8">
        <div className="border border-ruleSoft bg-panel px-6 py-12 text-center">
          <p className="font-display text-[18px] text-ink mb-1">No uploads yet</p>
          <p className="font-body text-[14px] text-inkSoft">
            Normal uploads are tracked here for resume — date, collection, deployment, file count, and
            status. Dry runs write nothing, so they are not recorded.
          </p>
        </div>
        <PublishedUploads />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-2xl mx-auto space-y-5">
      <input
        ref={reselectRef}
        type="file"
        // @ts-expect-error — non-standard folder picker, widely supported
        webkitdirectory=""
        directory=""
        multiple
        hidden
        onChange={(e) => {
          void onReselectInput(e.target.files);
          e.target.value = '';
        }}
      />

      {message && <Note tone="warn" message={message} />}

      {problems.length > 0 && (
        <div className="border border-warn/40 bg-paper px-3 py-2.5 space-y-1">
          <p className="font-body text-[13px] text-warn">
            {problems.length} file{problems.length === 1 ? '' : 's'} could not be reconciled:
          </p>
          <ul className="font-mono text-[11px] text-inkSoft max-h-32 overflow-auto">
            {problems.slice(0, 50).map((p) => (
              <li key={p.localPath} className="truncate" title={`${p.localPath} — ${p.reason}`}>
                {p.fileName} — {p.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-3">
        {rows.map(({ batch, counts }) => {
          const isPreparing = preparing === batch.id;
          const isRunning = activeRunSessionId === batch.id;
          const total = batch.totalFiles;
          return (
            <li key={batch.id} className="border border-ruleSoft bg-panel px-4 py-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[13px] text-ink truncate" title={batch.uploadPrefix}>
                    {stampOf(batch.uploadPrefix)}
                  </p>
                  <p className="font-body text-[12px] text-inkSoft truncate">
                    {batch.targetBucket} · {new Date(batch.startedAt).toLocaleString()}
                  </p>
                </div>
                <Badge batch={batch} />
              </div>

              <p className="font-body text-[12px] text-inkSoft">
                <span className="font-mono text-ink">{total}</span> files ·{' '}
                <span className="font-mono text-ink">{formatBytes(batch.totalBytes)}</span> ·{' '}
                <span className="font-mono text-ok">{counts.done}</span> done
                {counts.failed > 0 && (
                  <>
                    {' · '}
                    <span className="font-mono text-warn">{counts.failed}</span> failed
                  </>
                )}
              </p>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                {!batch.completedAt && (
                  <button
                    disabled={preparing !== null || activeRunSessionId !== null}
                    onClick={() => void beginResume(batch)}
                    className={`inline-flex items-center justify-center gap-2 bg-ink text-paper border border-ink min-h-[44px] sm:min-h-0 px-4 sm:px-3 py-1 text-[13px] font-body font-[600] hover:opacity-90 ${
                      preparing !== null || activeRunSessionId !== null
                        ? 'opacity-40 cursor-not-allowed'
                        : ''
                    }`}
                  >
                    {isPreparing && <Spinner />}
                    {isPreparing ? 'Preparing…' : 'Resume'}
                  </button>
                )}
                <button
                  disabled={isRunning}
                  title={isRunning ? 'This upload is currently running' : undefined}
                  onClick={() => void discard(batch.id)}
                  className={`border border-ink text-ink min-h-[44px] sm:min-h-0 px-4 sm:px-3 py-1 text-[13px] font-body hover:bg-paperHover ${
                    isRunning ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                >
                  Discard
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="pt-3 border-t border-ruleSoft">
        <PublishedUploads />
      </div>
    </div>
  );
}
