import type { SyncState } from '../store';

// Distinct by shape + glyph, not color alone (design-prompt requirement). P0 is
// read-only so the live value is `local-only`; the full set is wired now so P4
// only has to flip the store value.
const PILLS: Record<SyncState, { label: string; glyph: string; explain: string }> = {
  'local-only': {
    label: 'local-only',
    glyph: '○',
    explain: 'Not yet synced — edits stay in this browser until you sync',
  },
  unsynced: {
    label: 'unsynced edits',
    glyph: '◔',
    explain: "This upload has edits that haven't been synced to the collection yet",
  },
  syncing: { label: 'syncing…', glyph: '◐', explain: 'Writing edits to the collection now' },
  synced: { label: 'synced', glyph: '●', explain: 'All edits are synced to the collection' },
  conflict: {
    label: 'conflict',
    glyph: '▲',
    explain: 'The collection changed elsewhere since your last sync — resolve this before syncing again',
  },
  'dry-run': {
    label: 'dry-run',
    glyph: '◇',
    explain: 'Previewed what a sync would write, without writing anything',
  },
  error: { label: 'error', glyph: '✕', explain: 'The last sync attempt failed' },
};

export function StatePill({ state }: { state: SyncState }) {
  const p = PILLS[state];
  return (
    <span
      className="inline-flex items-center gap-1.5 border border-rule px-2.5 h-7 text-[12px] font-mono text-inkSoft focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      role="status"
      tabIndex={0}
      title={p.explain}
      aria-label={`Sync status: ${p.label}`}
    >
      <span aria-hidden>{p.glyph}</span>
      {p.label}
    </span>
  );
}
