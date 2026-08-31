import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DiscardImageSummary } from '../lib/discardSummary';

export function DiscardConfirmDialog({ summaries, onConfirm, onClose }: {
  summaries: DiscardImageSummary[];
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  onCloseRef.current = onClose;

  useEffect(() => {
    prevFocusRef.current = document.activeElement;
    cancelRef.current?.focus();
    const onDocumentKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('keydown', onDocumentKeyDown);
      (prevFocusRef.current as HTMLElement | null)?.focus();
    };
  }, []);

  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (cause) {
      busyRef.current = false;
      setBusy(false);
      setError(cause instanceof Error ? cause.message : 'Discard failed. Please try again.');
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-6"
      onMouseDown={(e) => {
        if (!busy && e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="discard-dialog-title"
      aria-busy={busy}
    >
      <div ref={dialogRef} className="w-full max-w-[520px] max-h-[80dvh] flex flex-col bg-paper border border-rule shadow-xl">
        <div className="flex items-center justify-between border-b border-rule px-5 py-3 shrink-0">
          <h2 id="discard-dialog-title" className="font-display text-[18px] font-[600] text-ink">Discard local changes?</h2>
          <button disabled={busy} onClick={onClose} className="w-11 h-11 grid place-items-center md:w-7 md:h-7 border border-rule text-inkSoft hover:text-ink disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" aria-label="Close">✕</button>
        </div>
        <div className="overflow-y-auto p-5 flex-1 min-h-0">
          <p className="text-[13px] text-inkSoft font-body mb-4">The following unsaved edits will be permanently removed:</p>
          <ul className="space-y-1.5">
            {summaries.map((summary) => (
              <li key={summary.mediaPath} className="text-[13px] font-mono border border-rule px-3 py-2">
                <span className="block text-ink font-[500] break-all">{summary.displayName}</span>
                <ul className="mt-1 text-inkSoft space-y-0.5">
                  {summary.changes.length ? summary.changes.map((change, index) => (
                    <li key={`${change.kind}-${index}`}>• {change.label}</li>
                  )) : <li>• No effective changes; local draft record only</li>}
                </ul>
              </li>
            ))}
          </ul>
          {error && <p role="alert" className="mt-4 text-[13px] text-warn font-body">Discard failed: {error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-rule px-5 py-3 shrink-0">
          <button ref={cancelRef} disabled={busy} onClick={onClose} className="text-[13px] font-mono border border-rule px-3 py-1.5 text-inkSoft hover:text-ink hover:border-ink disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Cancel</button>
          <button aria-disabled={busy} onClick={() => void confirm()} className="text-[13px] font-mono border border-warn px-3 py-1.5 text-warn hover:bg-warn/10 aria-disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{busy ? 'Discarding…' : 'Discard'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
