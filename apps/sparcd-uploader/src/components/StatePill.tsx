import { useId } from 'react';

export type UploadState =
  | 'ready'
  | 'uploading'
  | 'publishing'
  | 'complete'
  | 'failed'
  | 'dry-run';

// Distinct by shape + glyph, not color alone (design requirement).
export const STATE_PILL_CONFIG: Record<
  UploadState,
  { label: string; glyph: string; cls: string; description: string }
> = {
  ready: {
    label: 'ready',
    glyph: '○',
    cls: 'border-rule text-inkSoft',
    description: 'Ready to start an upload; no upload is currently in progress',
  },
  uploading: {
    label: 'uploading…',
    glyph: '↑',
    cls: 'border-accent text-accent',
    description: 'Upload in progress',
  },
  publishing: {
    label: 'publishing…',
    glyph: '⇡',
    cls: 'border-accent text-accent',
    description: 'Publishing upload metadata',
  },
  complete: { label: 'complete', glyph: '●', cls: 'border-ok text-ok', description: 'Upload complete' },
  failed: { label: 'failed', glyph: '✕', cls: 'border-warn text-warn', description: 'Upload failed' },
  'dry-run': {
    label: 'dry-run',
    glyph: '◇',
    cls: 'border-warn text-warn',
    description: 'Dry run — nothing was written',
  },
};

export function StatePill({ state }: { state: UploadState }) {
  const c = STATE_PILL_CONFIG[state];
  const tooltipId = useId();
  return (
    <span className="group relative inline-flex">
      <span
        className={`inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[12px] leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${c.cls}`}
        role="status"
        tabIndex={0}
        aria-label={`Upload status: ${c.label}`}
        aria-describedby={tooltipId}
      >
        <span aria-hidden>{c.glyph}</span>
        {c.label}
      </span>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none invisible absolute right-0 top-full z-50 mt-2 w-72 border border-rule bg-ink px-3 py-2 font-body text-[12px] leading-snug text-paper opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {c.description}
      </span>
    </span>
  );
}
