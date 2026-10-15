import { useRegisterSW } from 'virtual:pwa-register/react';

// A run can take minutes, so a new build is never swapped in silently
// underneath one — `registerType: 'prompt'` in vite.config.ts staples the
// update and waits here for the person to ask for it.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-50 flex flex-col gap-2 border border-ink bg-paper px-3 py-2.5 shadow-lg sm:inset-x-auto sm:right-3 sm:flex-row sm:items-center sm:gap-3"
    >
      <p className="font-body text-[13px] text-inkSoft">A new version of the Uploader is available.</p>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="shrink-0 min-h-[44px] sm:min-h-0 border border-ink text-ink px-3 py-2.5 sm:py-1 text-[13px] font-body hover:bg-paperHover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      >
        Reload
      </button>
    </div>
  );
}
