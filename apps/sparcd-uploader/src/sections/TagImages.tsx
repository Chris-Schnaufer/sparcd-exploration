import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { useSpecies } from '../lib/useSpecies';
import { SpeciesPanel } from '../components/SpeciesPanel';
import { AppliedSpecies } from '../components/AppliedSpecies';

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

  // Object URLs for image display — created once per file, revoked on unmount.
  const urlMap = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const map = urlMap.current;
    for (const f of files) {
      if (!map.has(f.id)) {
        const src = f.thumbnail ? URL.createObjectURL(f.thumbnail) : URL.createObjectURL(f.file);
        map.set(f.id, src);
      }
    }
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, [files]);

  const [filter, setFilter] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>([]);

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
  const focusedUrl = focusedId ? (urlMap.current.get(focusedId) ?? null) : null;

  return (
    <div className="flex flex-col">
      <div className="flex gap-0" style={{ height: 'calc(100dvh - 220px)' }}>
        {/* Left: image area */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 gap-3 pr-3 overflow-y-auto">
          {/* Focus view */}
          <div className="border border-rule bg-paperHover flex items-center justify-center overflow-hidden" style={{ height: '360px' }}>
            {focusedUrl ? (
              <img
                src={focusedUrl}
                alt={focusedFile?.fileName ?? ''}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-inkMute font-body text-[13px]">Select an image</span>
            )}
          </div>

          {/* Thumbnail strip */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {files.map((f) => {
              const url = urlMap.current.get(f.id);
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
