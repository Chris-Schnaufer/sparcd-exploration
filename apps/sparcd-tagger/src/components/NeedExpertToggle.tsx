/** Shared Overview/Focus action. The question mark remains legible without color. */
export function NeedExpertToggle({ pressed, disabled, onClick }: {
  pressed: boolean | 'mixed';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-need-expert-toggle
      aria-label="Toggle needing an expert's opinion"
      aria-pressed={pressed}
      title="Toggle needing an expert's opinion"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 min-w-11 grid place-items-center rounded border font-mono text-[17px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 ${
        pressed === true
          ? 'border-warn bg-warn/15 text-warn'
          : pressed === 'mixed'
            ? 'border-accent bg-mark text-ink'
            : 'border-rule text-inkSoft hover:border-ink hover:text-ink'
      }`}
    >
      <span aria-hidden="true">{pressed === 'mixed' ? '±?' : '?'}</span>
    </button>
  );
}
