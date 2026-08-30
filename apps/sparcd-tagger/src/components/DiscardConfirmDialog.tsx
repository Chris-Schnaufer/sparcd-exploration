import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { DraftRecord } from '../lib/db';

function filename(mediaPath: string): string {
  return mediaPath.split('/').pop() ?? mediaPath;
}

function recordLabel(rec: DraftRecord): string {
  if (rec.observations.length > 0) {
    return rec.observations
      .map((o) => `${o.commonName || o.scientificName}${o.count > 1 ? ` ×${o.count}` : ''}`)
      .join(', ');
  }
  if (rec.timeOverride) return 'timestamp adjusted';
  return 'questionable flag';
}

export function DiscardConfirmDialog({
  dirtyRecords,
  onConfirm,
  onClose,
}: {
  dirtyRecords: DraftRecord[];
  onConfirm: () => void;
  onClose: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    prevFocusRef.current = document.activeElement;
    confirmRef.current?.focus();
    return () => {
      (prevFocusRef.current as HTMLElement | null)?.focus();
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-6"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm discard"
    >
      <div
        className="w-full max-w-[520px] max-h-[80dvh] flex flex-col bg-paper border border-rule shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-rule px-5 py-3 shrink-0">
          <h2 className="font-display text-[18px] font-[600] text-ink">Discard local changes?</h2>
          <button
            onClick={onClose}
            className="w-11 h-11 grid place-items-center md:w-7 md:h-7 border border-rule text-inkSoft hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-5 flex-1 min-h-0">
          <p className="text-[13px] text-inkSoft font-body mb-4">
            The following unsaved edits will be permanently removed:
          </p>
          <ul className="space-y-1.5">
            {dirtyRecords.map((rec) => (
              <li
                key={rec.id}
                className="text-[13px] font-mono border border-rule px-3 py-2 flex gap-2 flex-wrap"
              >
                <span className="text-ink font-[500] shrink-0">{filename(rec.mediaPath)}</span>
                <span className="text-inkSoft">{recordLabel(rec)}</span>
                {rec.observations.length > 0 && rec.timeOverride && (
                  <span className="text-inkMute text-[11px] self-center">+ timestamp adjusted</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-3 border-t border-rule px-5 py-3 shrink-0">
          <button
            onClick={onClose}
            className="text-[13px] font-mono border border-rule px-3 py-1.5 text-inkSoft hover:text-ink hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="text-[13px] font-mono border border-warn px-3 py-1.5 text-warn hover:bg-warn/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Discard
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
