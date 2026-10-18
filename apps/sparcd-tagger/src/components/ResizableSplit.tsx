import { useEffect, useRef, useState, type ReactNode } from 'react';

// A two-pane split with a draggable divider: a vertical bar sizing width on a
// wide screen, a horizontal bar sizing height once the layout stacks — the
// same width breakpoint the rest of Focus mode already switches on. `second`
// is the pane whose size is tracked and persisted (per axis, so a width and a
// height choice don't overwrite each other); `first` always gets whatever
// space is left, down to `minFirst`.

const WIDE_QUERY = '(min-width: 1024px)'; // Tailwind's `lg`
const DIVIDER = 8; // px — the bar's hit area and visual width
const STEP = 16; // px per keyboard nudge

function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

function readStored(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // Best effort — a failed write just means the size resets next visit.
  }
}

export function ResizableSplit({
  storageKey,
  defaultSize,
  minSecond = 100,
  minFirst = 240,
  first,
  second,
}: {
  storageKey: string;
  defaultSize: number;
  minSecond?: number;
  minFirst?: number;
  first: ReactNode;
  second: ReactNode;
}) {
  const wide = useWide();
  const axisKey = `${storageKey}:${wide ? 'w' : 'h'}`;
  const [size, setSize] = useState(() => readStored(axisKey, defaultSize));
  // Width and height are sized independently, so re-read on every axis flip.
  useEffect(() => {
    setSize(readStored(axisKey, defaultSize));
  }, [axisKey, defaultSize]);

  const containerRef = useRef<HTMLDivElement>(null);

  const clamp = (value: number, total: number) =>
    Math.min(Math.max(value, minSecond), Math.max(minSecond, total - DIVIDER - minFirst));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const total = wide ? rect.width : rect.height;
      const fromEdge = wide ? rect.right - ev.clientX : rect.bottom - ev.clientY;
      setSize(clamp(fromEdge, total));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setSize((current) => {
        writeStored(axisKey, current);
        return current;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const growKey = wide ? 'ArrowLeft' : 'ArrowUp';
    const shrinkKey = wide ? 'ArrowRight' : 'ArrowDown';
    if (e.key !== growKey && e.key !== shrinkKey) return;
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    const total = rect ? (wide ? rect.width : rect.height) : size + minFirst + DIVIDER;
    const next = clamp(size + (e.key === growKey ? STEP : -STEP), total);
    setSize(next);
    writeStored(axisKey, next);
  };

  return (
    <div
      ref={containerRef}
      className="h-full"
      style={
        wide
          ? { display: 'grid', gridTemplateColumns: `minmax(0,1fr) ${DIVIDER}px ${size}px` }
          : { display: 'grid', gridTemplateRows: `minmax(0,1fr) ${DIVIDER}px ${size}px` }
      }
    >
      <div className="min-w-0 min-h-0">{first}</div>
      <div
        role="separator"
        aria-orientation={wide ? 'vertical' : 'horizontal'}
        aria-label={wide ? 'Resize the species panel’s width' : 'Resize the species panel’s height'}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className={`shrink-0 bg-rule hover:bg-accent focus-visible:bg-accent outline-none ${
          wide ? 'cursor-col-resize' : 'cursor-row-resize'
        }`}
      />
      <div className="min-w-0 min-h-0">{second}</div>
    </div>
  );
}
