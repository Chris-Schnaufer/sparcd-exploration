import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { readPreparation, recoverPreparation, recoverPreparationFromHandle, preparationStatus, subscribePreparation, retryPreparation, type LocalPreparation } from '../lib/preparation';
import { reselectFolder } from '../lib/resume';
import { supportsDirectoryHandle } from '../lib/scanFiles';
export function PreparationSaveStatus() {
  const message = useSyncExternalStore(subscribePreparation, preparationStatus);
  return message ? <div className="p-3 text-sm"><p role={message.includes('could not') ? 'alert' : 'status'}>{message}</p>{message.includes('could not') && <button type="button" onClick={retryPreparation} className="border px-3 py-2">Retry saving preparation</button>}</div> : null;
}
export function PreparationRecovery() {
  const [saved, setSaved] = useState<LocalPreparation | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { void readPreparation().then(setSaved).catch(e => setError(e.message)); }, []);
  async function choose(list?: FileList) {
    if (!saved) return;
    setBusy(true); setError('');
    try {
      const picked = await reselectFolder(list);
      if (picked) await recoverPreparation(saved, picked.scanned);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return saved || error ? <section aria-label="Saved local preparation" className="mb-4 border border-rule p-4 space-y-2 text-sm">
    {saved && <><h2>Resume local preparation</h2><p>{saved.files.length} {saved.files.length === 1 ? 'inspected file is' : 'inspected files are'} saved, including timestamps and any returned tags. Reselect the unchanged original folder to verify file contents before continuing.</p><p>No original image or video files are stored here.</p>
      {saved.dirHandle && <button type="button" disabled={busy} className="min-h-11 border border-ink px-3" onClick={() => {
        setBusy(true); setError('');
        void recoverPreparationFromHandle(saved).catch(e => setError(e.message)).finally(() => setBusy(false));
      }}>Reopen saved folder</button>}
      <button type="button" disabled={busy} onClick={() => supportsDirectoryHandle ? void choose() : ref.current?.click()} className="min-h-11 border border-ink px-3">{busy ? 'Verifying files…' : 'Reselect saved batch folder'}</button>
      <input ref={ref} type="file" multiple hidden {...{ webkitdirectory: '', directory: '' }} onChange={e => { if (e.target.files?.length) void choose(e.target.files); e.target.value = ''; }} />
      {saved.flipId && <a className="underline block" href={`../tagger/?batch=${encodeURIComponent(saved.flipId)}`}>Reopen saved tags using thumbnails</a>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section> : null;
}
