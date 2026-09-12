import { createPortal } from 'react-dom';
import { useLayoutEffect, useRef, useState } from 'react';
import { isNeutral, type Adjustments } from '../lib/adjustments';
import { adjustmentPopupPosition } from '../lib/adjustmentPopupPosition';

// A small, collapsible control panel that drives view-only CSS filters on the
// focused image (brightness / contrast / hue / saturation). It only edits the
// raw 0–100 values; the 0–100 → CSS mapping and the actual `filter` live next to
// the <img> in the Focus view. Nothing here persists — pure presentation.

const FIELDS: { key: keyof Adjustments; label: string }[] = [
  { key: 'brightness', label: 'Brightness' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'hue', label: 'Hue' },
  { key: 'saturation', label: 'Saturation' },
];

export function ImageAdjustments({
  value,
  onChange,
  onReset,
  getMediaRect,
}: {
  value: Adjustments;
  onChange: (next: Adjustments) => void;
  onReset: () => void;
  getMediaRect: () => DOMRect | null;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const neutral = isNeutral(value);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const media = getMediaRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!media || !panel) return;
      setPosition(adjustmentPopupPosition(media, panel, { width: window.innerWidth, height: window.innerHeight }));
    };
    place();
    window.addEventListener('resize', place);
    const observer = new ResizeObserver(place);
    const media = document.querySelector('[data-testid="focus-drop-zone"] img');
    if (media) observer.observe(media);
    return () => { window.removeEventListener('resize', place); observer.disconnect(); };
  }, [getMediaRect, open]);

  return (
    <div className="flex flex-col items-start gap-2">
      {open && createPortal(
        <div ref={panelRef} id="image-adjustments" role="region" aria-label="Image adjustments" onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); } }} style={{ position: 'fixed', left: Math.max(8, Math.min(position?.left ?? 0, window.innerWidth - 232)), top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden', zIndex: 50 }} className="w-56 bg-panel/95 border border-rule shadow-sm p-3 flex flex-col gap-2.5">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="flex items-center justify-between">
                <span className="uppercase tracking-[0.16em] text-[11px] text-inkSoft">
                  {f.label}
                </span>
                <span className="font-mono text-[11px] text-inkMute">{value[f.key]}</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={value[f.key]}
                onChange={(e) => onChange({ ...value, [f.key]: Number(e.target.value) })}
                className="w-full accent-accent py-2 sm:py-0"
                aria-label={f.label}
              />
            </label>
          ))}
          <button
            type="button"
            onClick={onReset}
            disabled={neutral}
            className="self-end text-[12px] font-mono border border-rule px-3 py-2.5 min-h-[44px] sm:px-2 sm:py-0.5 sm:min-h-0 text-inkSoft hover:text-ink hover:border-ink disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Reset
          </button>
        </div>, document.body
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-pressed={open}
        aria-expanded={open}
        aria-controls="image-adjustments"
        className="text-[12px] font-mono border border-rule bg-panel/95 px-3 py-2.5 min-h-[44px] sm:px-2 sm:py-0.5 sm:min-h-0 text-inkSoft hover:text-ink hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        title="View-only image adjustments (does not change the file)"
      >
        Adjust {open ? '▴' : '▾'}
        {!neutral && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-accent align-middle" />}
      </button>
    </div>
  );
}
