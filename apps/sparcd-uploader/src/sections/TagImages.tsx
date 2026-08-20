import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useStore } from '../store';
import { useSpecies } from '../lib/useSpecies';
import { SpeciesPanel } from '../components/SpeciesPanel';
import { AppliedSpecies } from '../components/AppliedSpecies';
import { ImageAdjustments } from '../components/ImageAdjustments';
import { cssFilter, NEUTRAL, type Adjustments } from '../lib/adjustments';

export function TagImages() {
  const s3Config = useStore((s) => s.s3Config);
  const connectionId = useStore((s) => s.connectionId);
  const files = useStore((s) => s.files);
  const preTags = useStore((s) => s.preTags);
  const addPreTag = useStore((s) => s.addPreTag);
  const removePreTag = useStore((s) => s.removePreTag);
  const setPreTagCount = useStore((s) => s.setPreTagCount);
  const clearFileTags = useStore((s) => s.clearFileTags);
  const setStep = useStore((s) => s.setStep);

  const { data: speciesData } = useSpecies(s3Config, connectionId);
  const species = speciesData?.species ?? [];

  // Selection: a Set of fileIds. The "focused" image is the last one clicked.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Initialize focus to the first file.
  useEffect(() => {
    if (files.length > 0 && focusedId === null) {
      const id = files[0].id;
      setFocusedId(id);
      setSelected(new Set([id]));
    }
  }, [files, focusedId]);

  // Separate URL maps: thumbMap for the strip (thumbnail blob), fullMap for the
  // large focus view (original file). Both revoked on unmount.
  const thumbMap = useRef<Map<string, string>>(new Map());
  const fullMap = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const tm = thumbMap.current;
    const fm = fullMap.current;
    for (const f of files) {
      if (!tm.has(f.id)) {
        tm.set(f.id, URL.createObjectURL(f.thumbnail ?? f.file));
      }
      if (!fm.has(f.id)) {
        fm.set(f.id, URL.createObjectURL(f.file));
      }
    }
    return () => {
      for (const url of tm.values()) URL.revokeObjectURL(url);
      for (const url of fm.values()) URL.revokeObjectURL(url);
      tm.clear();
      fm.clear();
    };
  }, [files]);

  const [filter, setFilter] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustments>(NEUTRAL);
  useEffect(() => { setAdjustments(NEUTRAL); }, [focusedId]);
  const [imageHovered, setImageHovered] = useState(false);
  const ctrlBg = imageHovered ? 'bg-gray-200/40' : 'bg-transparent';

  const focusedObs = useMemo(
    () => (focusedId ? (preTags[focusedId] ?? []) : []),
    [preTags, focusedId],
  );

  const appliedSet = useMemo(
    () => new Set(focusedObs.map((o) => o.scientificName)),
    [focusedObs],
  );

  const handleThumbClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (e.shiftKey && focusedId) {
        // Range select from focusedId to id.
        const ids = files.map((f) => f.id);
        const a = ids.indexOf(focusedId);
        const b = ids.indexOf(id);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelected((prev) => {
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
          return next;
        });
      } else if (e.ctrlKey || e.metaKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      } else {
        setSelected(new Set([id]));
      }
      setFocusedId(id);
    },
    [files, focusedId],
  );

  const handleApply = useCallback(
    (tag: Parameters<typeof addPreTag>[1]) => {
      const targets = selected.size > 0 ? [...selected] : focusedId ? [focusedId] : [];
      for (const id of targets) addPreTag(id, tag);
      setRecent((prev) => {
        const without = prev.filter((s) => s !== tag.scientificName);
        return [tag.scientificName, ...without].slice(0, 12);
      });
    },
    [selected, focusedId, addPreTag],
  );

  const focusedFile = files.find((f) => f.id === focusedId) ?? null;
  const focusedUrl = focusedId ? (fullMap.current.get(focusedId) ?? null) : null;
  const focusedIndex = focusedId ? files.findIndex((f) => f.id === focusedId) : -1;

  const goTo = useCallback((index: number) => {
    const f = files[index];
    if (!f) return;
    setFocusedId(f.id);
    setSelected(new Set([f.id]));
  }, [files]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(focusedIndex - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(focusedIndex + 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusedIndex, goTo]);

  return (
    <div className="flex flex-col">
      <div className="flex gap-0" style={{ height: 'calc(100dvh - 220px)' }}>
        {/* Left: image area */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 gap-3 pr-3 overflow-y-auto">
          {/* Focus view */}
          <div
            className="relative border border-rule bg-paperHover flex items-center justify-center overflow-hidden"
            style={{ height: '360px' }}
            onMouseEnter={() => setImageHovered(true)}
            onMouseLeave={() => setImageHovered(false)}
          >
            {focusedUrl ? (
              <TransformWrapper key={focusedId ?? 'none'}>
                {({ zoomIn, zoomOut, resetTransform }) => (
                  <>
                    <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                      <img
                        src={focusedUrl}
                        alt={focusedFile?.fileName ?? ''}
                        className="max-h-full max-w-full object-contain"
                        style={{ filter: cssFilter(adjustments) }}
                      />
                    </TransformComponent>
                    <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => zoomIn()}
                        className={`w-7 h-7 flex items-center justify-center text-[16px] font-mono border border-rule ${ctrlBg} text-inkSoft hover:text-ink hover:bg-paperHover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
                        title="Zoom in"
                        aria-label="Zoom in"
                      >+</button>
                      <button
                        type="button"
                        onClick={() => zoomOut()}
                        className={`w-7 h-7 flex items-center justify-center text-[16px] font-mono border border-rule ${ctrlBg} text-inkSoft hover:text-ink hover:bg-paperHover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
                        title="Zoom out"
                        aria-label="Zoom out"
                      >−</button>
                      <button
                        type="button"
                        onClick={() => resetTransform()}
                        className={`w-7 h-7 flex items-center justify-center text-[11px] font-mono border border-rule ${ctrlBg} text-inkSoft hover:text-ink hover:bg-paperHover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
                        title="Reset zoom"
                        aria-label="Reset zoom"
                      >1:1</button>
                    </div>
                  </>
                )}
              </TransformWrapper>
            ) : (
              <span className="text-inkMute font-body text-[13px]">Select an image</span>
            )}
            {focusedIndex > 0 && (
              <button
                type="button"
                onClick={() => goTo(focusedIndex - 1)}
                className={`absolute left-2 top-1/2 -translate-y-1/2 z-10 w-11 h-14 flex items-center justify-center text-[28px] font-bold border border-rule ${ctrlBg} text-inkSoft hover:text-ink hover:bg-paperHover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
                title="Previous image (←)"
                aria-label="Previous image"
              >‹</button>
            )}
            {focusedIndex >= 0 && focusedIndex < files.length - 1 && (
              <button
                type="button"
                onClick={() => goTo(focusedIndex + 1)}
                className={`absolute right-2 top-1/2 -translate-y-1/2 z-10 w-11 h-14 flex items-center justify-center text-[28px] font-bold border border-rule ${ctrlBg} text-inkSoft hover:text-ink hover:bg-paperHover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
                title="Next image (→)"
                aria-label="Next image"
              >›</button>
            )}
            {focusedUrl && (
              <div className="absolute bottom-2 left-2 z-10">
                <ImageAdjustments
                  key={focusedId ?? 'none'}
                  value={adjustments}
                  onChange={setAdjustments}
                  onReset={() => setAdjustments(NEUTRAL)}
                  containerHovered={imageHovered}
                />
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {files.map((f) => {
              const url = thumbMap.current.get(f.id);
              const isFocused = f.id === focusedId;
              const isSelected = selected.has(f.id);
              const hasTag = (preTags[f.id] ?? []).length > 0;
              return (
                <button
                  key={f.id}
                  onClick={(e) => handleThumbClick(f.id, e)}
                  className={`relative shrink-0 w-20 h-20 border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    isFocused
                      ? 'border-ink'
                      : isSelected
                        ? 'border-accent'
                        : 'border-transparent hover:border-rule'
                  }`}
                  title={f.fileName}
                >
                  {url ? (
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="w-full h-full grid place-items-center bg-paperHover text-inkMute text-[10px] font-mono">
                      {f.fileName.slice(-6)}
                    </span>
                  )}
                  {hasTag && (
                    <span
                      className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-ok border border-paper"
                      title="Tagged"
                      aria-label="Tagged"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {focusedFile && (
            <p className="font-body text-[12px] text-inkSoft truncate">{focusedFile.fileName}</p>
          )}
        </div>

        {/* Right: species panel */}
        <div className="w-72 shrink-0 flex flex-col h-full min-h-0">
          <SpeciesPanel
            species={species}
            onApply={handleApply}
            filter={filter}
            onFilterChange={setFilter}
            filterRef={filterRef}
            bindingFor={() => null}
            capturingFor={null}
            onStartCapture={() => {}}
            onClearKey={() => {}}
            recent={recent}
            appliedSet={appliedSet}
            hasFocus={focusedId !== null}
            selectionCount={selected.size > 1 ? selected.size : 0}
            disabled={focusedId === null}
            headerSlot={
              focusedId ? (
                <AppliedSpecies
                  observations={focusedObs}
                  disabled={focusedId === null}
                  onSetCount={(name, count) => setPreTagCount(focusedId, name, count)}
                  onRemove={(name) => removePreTag(focusedId, name)}
                  onDetagAll={() => clearFileTags(focusedId)}
                />
              ) : undefined
            }
          />
        </div>
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between gap-4 border-t border-ruleSoft pt-4 mt-4">
        <button
          onClick={() => setStep('inspect')}
          className="border border-ink text-ink px-3.5 py-1.5 text-[14px] font-body hover:bg-paperHover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        >
          Back
        </button>
        <div className="flex items-center gap-3">
          {Object.keys(preTags).length === 0 && (
            <span className="font-body text-[12px] text-inkSoft">No species tagged yet — tagging is optional</span>
          )}
          <button
            onClick={() => setStep('assign')}
            className="bg-ink text-paper border border-ink px-3.5 py-1.5 text-[14px] font-body font-[600] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
