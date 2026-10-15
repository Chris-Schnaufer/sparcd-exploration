import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { registerPreviewHistory } from '../lib/inspectPreviewHistory';
import type { FileEntry } from '../store';

export function InspectPreview({ entry, onClose, opener, fallback }: {
  entry: FileEntry; onClose: () => void; opener: HTMLElement | null; fallback: HTMLElement | null;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const historyToken = useRef(crypto.randomUUID());
  const historyCleanup = useRef<ReturnType<typeof setTimeout>>();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    setStatus('loading');
    const objectUrl = URL.createObjectURL(entry.file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [entry.file]);
  useEffect(() => {
    const player = video.current;
    return () => { player?.pause(); };
  }, [url]);
  useEffect(() => {
    clearTimeout(historyCleanup.current);
    const token = historyToken.current;
    const retireHistory = registerPreviewHistory(token);
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (root) root.inert = true;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const pop = () => close.current();
    window.addEventListener('popstate', pop);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button, video[controls]') ?? []);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('popstate', pop);
      document.removeEventListener('keydown', key, true);
      if (root) root.inert = wasInert;
      document.body.style.overflow = previousOverflow;
      // React StrictMode replays effects. Allow that immediate setup to cancel
      // navigation, while a real unmount removes our temporary history entry.
      historyCleanup.current = setTimeout(() => {
        retireHistory();
        if (!document.querySelector('[data-inspect-preview]')) {
          (opener?.isConnected ? opener : fallback)?.focus({ preventScroll: true });
        }
      }, 0);
    };
  }, [opener, fallback]);
  return createPortal(
    <div ref={dialog} data-inspect-preview role="dialog" aria-modal="true" aria-label={`Preview ${entry.fileName}`}
      className="fixed inset-0 z-[100] bg-panel text-ink flex flex-col" onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3 px-3 py-2 border-b border-rule shrink-0">
        <span className="min-w-0 flex-1 break-all font-mono">{entry.fileName}</span>
        <button type="button" aria-label="Close preview" title="Close preview (Escape)" onClick={onClose}
          className="min-w-11 min-h-11 shrink-0 border border-rule hover:bg-panelHover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">✕</button>
      </div>
      <div className="flex-1 min-h-0 min-w-0 relative flex items-center justify-center p-2">
        {status !== 'ready' && <p role="status" className="absolute bg-panel p-3">{status === 'loading' ? 'Loading preview…' : 'This file cannot be previewed. Your batch is unchanged.'}</p>}
        {url && (entry.mediaKind === 'video'
          ? <video ref={video} src={url} controls tabIndex={0} aria-label={entry.fileName} onLoadedData={() => setStatus('ready')} onError={() => setStatus('error')}
              className="w-full h-full object-contain" />
          : <img src={url} alt={entry.fileName} onLoad={() => setStatus('ready')} onError={() => setStatus('error')}
              className="w-full h-full object-contain" />)}
      </div>
    </div>, document.body,
  );
}
