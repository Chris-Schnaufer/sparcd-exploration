import { useEffect, useRef, type ReactNode } from 'react';
import { create } from 'zustand';
import { useQueryClient } from '@tanstack/react-query';
import tzlookup from 'tz-lookup';
import { Connection, useOnline } from '@sparcd/auth-ui';
import { correctedTimestamp, parseDeployments, type Deployment } from '@sparcd/camtrap';
import { useStore } from '../store';
import { useDraftStore, blankDraft, type UploadCtx } from '../lib/drafts';
import { db, getUpload, groundUpload, loadSyncJournal, uploadId } from '../lib/db';
import { useTagImages, useCurrentDeployment } from '../lib/queries';
import { loadCanonicalState, parseCollectionKey } from '../lib/s3';
import { performSync } from '../lib/syncRunner';
import { buildTagImages } from '../lib/workspace';
import { installEditLifecycle } from '../lib/editLifecycle';
import { installSaveNavigation } from '../lib/saveNavigation';
import { accountScope, automaticId, actionChanges, equalValue, rebaseDraft, type AutomaticRecord, type ValueChange } from '../lib/automaticModel';
import { AutomaticSaver, SaveConflict, type SaveView, type RemoteView } from '../lib/automaticSaver';
import { hasUnfinishedEditor, useEditorState } from '../lib/editorState';
import { draftRevisionOf } from '../lib/draftRevision';

const initial: SaveView = { phase: 'loading', message: 'Opening automatic saving…', pending: false, undoReason: 'Open an upload first.', canEdit: false };
export const useAutomaticSave = create<{ view: SaveView; saver: AutomaticSaver | null; repair: boolean }>(() => ({ view: initial, saver: null, repair: false }));

function withFields(fields: ValueChange[], current: RemoteView, ctx: UploadCtx, reverse: boolean, actor: string) {
  const drafts: ReturnType<typeof useDraftStore.getState>['drafts'] = {};
  let location: Deployment | null | undefined;
  for (const field of fields) {
    const value = reverse ? field.before : field.after;
    if (field.field === 'location') { location = value as Deployment | null; continue; }
    const image = current.images.find(i => i.key === field.path)!;
    const draft = drafts[field.path] ?? blankDraft(ctx, field.path, image.deploymentId, { observations: image.baseObservations, questionable: image.baseQuestionable });
    draft.dirty = true; draft.lastEdited = new Date().toISOString();
    if (field.field === 'time') draft.timeOverride = value as string;
    if (field.field === 'expert') { draft.questionable = !!value; draft.questionableEdited = true; }
    if (field.field === 'species') {
      const old = draft.observations.find(o => o.scientificName === field.species);
      draft.observations = draft.observations.filter(o => o.scientificName !== field.species);
      if (value) {
        const restored = structuredClone(value) as typeof draft.observations[number];
        // Original attribution survives restoration; the reversal is a new
        // attributed action in UploadMeta, with prior provenance retained.
        restored.reviewEvents = (old?.reviewEvents ?? restored.reviewEvents ?? []).map(event =>
          reverse && !(restored.reviewEvents ?? []).some(prior => prior.reviewedBy === event.reviewedBy && prior.reviewedAt === event.reviewedAt)
            ? { ...event, reversedBy: actor, reversedAt: new Date().toISOString() } : event);
        draft.observations.push(restored);
        draft.confirmedSpecies = [...new Set([...(draft.confirmedSpecies ?? []), restored.scientificName])];
      } else draft.removedSpecies = [...new Set([...(draft.removedSpecies ?? []), field.species!])];
    }
    drafts[field.path] = draft;
  }
  return { drafts, location };
}

export function AutomaticSaveProvider({ children }: { children: ReactNode }) {
  const cfg = useStore(s => s.s3Config);
  const connectionId = useStore(s => s.connectionId);
  const collectionKey = useStore(s => s.selectedCollectionKey);
  const prefix = useStore(s => s.selectedUploadPrefix);
  const scope = cfg ? accountScope(cfg) : '';
  const images = useTagImages(cfg, connectionId, collectionKey, prefix);
  const deployment = useCurrentDeployment(cfg, connectionId, collectionKey, prefix);
  const online = useOnline();
  const client = useQueryClient();
  const live = useRef({ cfg, connectionId, collectionKey, prefix, images: images.data ?? [], location: deployment.data ?? null });
  live.current = { cfg, connectionId, collectionKey, prefix, images: images.data ?? [], location: deployment.data ?? null };

  useEffect(() => {
    if (!cfg || !collectionKey || !prefix || !images.isSuccess || !deployment.isSuccess) return;
    let cancelled = false;
    let saver: AutomaticSaver | undefined;
    let removeEdits: (() => void) | undefined;
    let removeNavigation: (() => void) | undefined;
    const { bucket } = parseCollectionKey(collectionKey);
    const ctx = { bucket, uploadPrefix: prefix };
    const id = automaticId(scope, bucket, prefix);
    useAutomaticSave.setState({ view: initial, saver: null });
    removeEdits = installEditLifecycle({ canEdit: () => false, accept: () => {}, expandOffset: () => null });
    const fresh = async (): Promise<RemoteView> => {
      if (!live.current.cfg || accountScope(live.current.cfg) !== scope) throw new Error('Pending work belongs to a different account or destination.');
      const state = await loadCanonicalState(live.current.cfg, bucket, prefix);
      return { images: buildTagImages({ mediaCsv: state.media.text, observationsCsv: state.observations.text }), location: parseDeployments(state.deployments.text)[0] ?? null };
    };
    const commitFields = async (fields: ValueChange[], remote: RemoteView, reverse: boolean, user: string, durable = true) => {
      const patch = withFields(fields, remote, ctx, reverse, user);
      useDraftStore.setState(s => ({ drafts: { ...s.drafts, ...patch.drafts }, ...(patch.location !== undefined ? { pendingLocation: patch.location } : {}) }));
      if (durable) await db.transaction('rw', db.drafts, db.uploads, async () => {
        await db.drafts.bulkPut(Object.values(patch.drafts));
        if (patch.location !== undefined) await db.uploads.update(uploadId(bucket, prefix), { pendingLocation: patch.location });
      });
      return patch;
    };
    void (async () => {
      await useDraftStore.getState().loadUpload(ctx);
      if (cancelled) return;
      const existing = await db.automatic.get(id);
      const others = await db.automatic.where('[bucket+uploadPrefix]').equals([bucket, prefix]).toArray();
      if (others.some(r => r.id !== id && (r.actions.length || r.flight || r.adoptionRequired))) throw new Error('Pending recovery for this upload belongs to another account or destination. Reconnect with that account to recover it.');
      const legacyJournal = await loadSyncJournal(bucket, prefix);
      const state = useDraftStore.getState();
      if (existing?.pendingDrafts) {
        const restored = Object.fromEntries(Object.entries(existing.pendingDrafts).filter(([path]) => !state.drafts[path]));
        useDraftStore.setState(s => ({ drafts: { ...s.drafts, ...restored } }));
        await db.drafts.bulkPut(Object.values(restored));
      }
      const legacy = !existing && (Object.values(state.drafts).some(d => d.dirty) || state.timeOffset || state.pendingLocation || legacyJournal);
      const record: AutomaticRecord = existing ?? { id, scope, bucket, uploadPrefix: prefix, collectionKey, actions: [], undo: null, adoptionRequired: !!legacy };
      if (legacy) {
        const before = Object.fromEntries(live.current.images.map(image => [image.key, blankDraft(ctx, image.key, image.deploymentId, { observations: image.baseObservations, questionable: image.baseQuestionable })]));
        const changes = actionChanges({ ctx, before, after: Object.fromEntries(Object.entries(state.drafts).filter(([,d]) => d.dirty)), ...(state.pendingLocation ? { location: { before: null, after: state.pendingLocation } } : {}) }, live.current.images, live.current.location);
        record.actions = [{ id: crypto.randomUUID(), user: legacyJournal?.user || useStore.getState().taggerUser, at: new Date().toISOString(), changes }];
        record.undoReason = 'Recovered legacy work has no reliable pre-action Undo record.';
        record.flight = legacyJournal ? { ids: [], user: legacyJournal.user } : undefined;
      }
      saver = new AutomaticSaver(record, {
        changed: view => { if (!cancelled) useAutomaticSave.setState({ view, saver: saver! }); },
        current: fresh,
        save: async record => {
          await useDraftStore.getState().flushSaves();
          const starting = await loadCanonicalState(live.current.cfg!, bucket, prefix);
          const submitted = structuredClone(useDraftStore.getState().drafts);
          const uploadBefore = await getUpload(bucket, prefix);
          const memoryLocation = useDraftStore.getState().pendingLocation;
          const memoryOffset = useDraftStore.getState().timeOffset;
          const result = await performSync({ cfg: live.current.cfg!, bucket, uploadPrefix: prefix, user: record.flight!.user,
            images: live.current.images, drafts: submitted, dryRun: false, automatic: true,
            timeZone: live.current.location ? tzlookup(live.current.location.latitude, live.current.location.longitude) : undefined,
            auditEvents: record.actions.filter(a => record.flight!.ids.includes(a.id)) });
          if (result.status === 'conflict') throw new SaveConflict(`${result.role}: ${result.reason}. Review current stored data before choosing how to proceed.`);
          if (!['synced', 'noop'].includes(result.status)) throw new Error('This upload could not be saved automatically.');
          const journal = await loadSyncJournal(bucket, prefix);
          const written = (role: string) => journal?.objects.find(o => o.role === role)?.body;
          const expected = { images: buildTagImages({ mediaCsv: written('media') ?? starting.media.text, observationsCsv: written('observations') ?? starting.observations.text }), location: parseDeployments(written('deployments') ?? starting.deployments.text)[0] ?? null,
            writtenFields: (['species', 'time', 'expert', 'location'] as const).filter(field => !!written(field === 'species' ? 'observations' : field === 'location' ? 'deployments' : 'media')) };
          const state = await loadCanonicalState(live.current.cfg!, bucket, prefix);
          const current = { images: buildTagImages({ mediaCsv: state.media.text, observationsCsv: state.observations.text }), location: parseDeployments(state.deployments.text)[0] ?? null };
          client.setQueryData(['tagImages', live.current.connectionId, collectionKey, prefix], current.images);
          client.setQueryData(['currentDeployment', live.current.connectionId, collectionKey, prefix], current.location);
          live.current.images = current.images; live.current.location = current.location;
          if (result.status === 'synced') await useDraftStore.getState().markUploadSynced(ctx, result.receipt);
          const rebased: typeof submitted = {};
          for (const [path, draft] of Object.entries(useDraftStore.getState().drafts)) {
            const image = current.images.find(i => i.key === path);
            if (draft.dirty && submitted[path] && image) {
              rebased[path] = result.status === 'noop' && draftRevisionOf(draft) === draftRevisionOf(submitted[path])
                ? { ...draft, dirty: false } : rebaseDraft(draft, submitted[path], image);
            }
          }
          useDraftStore.setState(s => ({ drafts: { ...s.drafts, ...rebased },
            ...(s.pendingLocation === memoryLocation ? { pendingLocation: null } : {}),
            ...(s.timeOffset === memoryOffset ? { timeOffset: null } : {}) }));
          await db.transaction('rw', db.drafts, db.uploads, async () => {
            for (const draft of Object.values(rebased)) {
              const memory = useDraftStore.getState().drafts[draft.mediaPath];
              if (memory === draft) await db.drafts.put(draft);
            }
            const latest = await db.uploads.get(uploadId(bucket, prefix));
            if (latest) await db.uploads.update(latest.id, {
              ...(equalValue(latest.pendingLocation, uploadBefore?.pendingLocation) ? { pendingLocation: null } : {}),
              ...(equalValue(latest.timeOffset, uploadBefore?.timeOffset) ? { timeOffset: null } : {}),
            });
          });
          await groundUpload(bucket, prefix, state);
          void client.invalidateQueries({ queryKey: ['uploadDraftStates'] });
          return expected;
        },
        reverse: async (action, current) => {
          const patch = await commitFields(action.changes, current, true, useStore.getState().taggerUser, false);
          return { drafts: Object.values(patch.drafts), action: { id: crypto.randomUUID(), user: useStore.getState().taggerUser, at: new Date().toISOString(), changes: action.changes.map(f => ({ ...f, before: f.after, after: f.before })), undoOf: action.id } };
        },
        resolve: async (record, current, reapply) => {
          await useDraftStore.getState().discardUpload(ctx);
          const canonical = await loadCanonicalState(live.current.cfg!, bucket, prefix);
          await groundUpload(bucket, prefix, canonical);
          client.setQueryData(['tagImages', live.current.connectionId, collectionKey, prefix], current.images);
          live.current.images = current.images;
          if (reapply) await commitFields(record.actions.flatMap(a => a.changes), current, false, useStore.getState().taggerUser);
        },
      });
      useAutomaticSave.setState({ saver });
      await saver.open();
      if (cancelled) { saver.dispose(); return; }
      saver.setOnline(navigator.onLine);
      removeEdits = installEditLifecycle({
        canEdit: () => !!saver?.view.canEdit,
        accept: change => {
          if (!saver) return;
          const changes = actionChanges(change, live.current.images, live.current.location);
          saver.accept({ id: crypto.randomUUID(), at: new Date().toISOString(), user: useStore.getState().taggerUser, changes }, Object.values(change.after));
        },
        expandOffset: (_ctx, offset) => live.current.images.filter(i => i.baseTimestamp).map(i => ({ mediaPath: i.key, deploymentId: i.deploymentId,
          base: { observations: i.baseObservations, questionable: i.baseQuestionable },
          currentCorrected: correctedTimestamp(i.baseTimestamp, offset, null, live.current.location ? tzlookup(live.current.location.latitude, live.current.location.longitude) : undefined) })),
      });
      removeNavigation = installSaveNavigation({ pending: () => !!saver?.view.pending,
        flush: () => saver!.flush(),
        connectionAllowed: () => !saver?.view.pending,
      });
    })().catch(error => { if (!cancelled) useAutomaticSave.setState({ view: { ...initial, phase: 'recovery', message: String(error), pending: true } }); });
    return () => { cancelled = true; removeEdits?.(); removeNavigation?.(); saver?.dispose(); };
  // Query data updates must not replace a coordinator with an in-flight write.
  }, [scope, collectionKey, prefix, images.isSuccess, deployment.isSuccess, client]);

  useEffect(() => { useAutomaticSave.getState().saver?.setOnline(online); }, [online]);
  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => { if (useAutomaticSave.getState().view.pending || hasUnfinishedEditor()) { event.preventDefault(); event.returnValue = ''; } };
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const element = event.target instanceof HTMLElement ? event.target : null;
      const editor = element?.closest('input,textarea,[contenteditable="true"]');
      const saver = useAutomaticSave.getState().saver;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
          if (!editor.reportValidity()) return;
          editor.blur();
        } else if (editor instanceof HTMLElement) editor.blur();
        void Promise.resolve().then(() => hasUnfinishedEditor() ? false : saver?.view.phase === 'failed' || saver?.view.phase === 'pending' ? saver.retry() : saver?.flush());
      } else if (event.key.toLowerCase() === 'z' && !event.shiftKey && !editor) {
        event.preventDefault(); event.stopImmediatePropagation(); void saver?.undo();
      }
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('beforeunload', onUnload); document.removeEventListener('keydown', onKey, true); };
  }, []);
  return <>{children}</>;
}

export function AutomaticSaveStatus() {
  const { view, saver, repair } = useAutomaticSave();
  const unfinished = useEditorState(s => Object.keys(s.unfinished).length > 0);
  const cfg = useStore(s => s.s3Config);
  if (!useStore(s => s.selectedUploadPrefix)) return null;
  return <div className="border-b border-rule px-4 py-2 text-[13px] flex flex-wrap items-center gap-3" data-testid="automatic-save">
    <span role="status" aria-live="polite" aria-atomic="true">{unfinished && view.phase === 'saved' ? 'Uncommitted input — finish editing to save.' : view.message}</span>
    <button type="button" onClick={() => void saver?.undo()} disabled={!!view.undoReason || unfinished} aria-describedby="automatic-undo-help" className="min-h-11 underline disabled:opacity-50">Undo latest action</button>
    <span id="automatic-undo-help">{view.undoReason}</span>
    {['failed', 'pending'].includes(view.phase) && <>
      <button type="button" onClick={() => void saver?.retry()} className="min-h-11 underline">Retry save</button>
      <button type="button" onClick={() => useAutomaticSave.setState({ repair: !repair })} className="min-h-11 underline">Repair credentials for this account</button>
    </>}
    {view.phase === 'recovery' && saver?.record.adoptionRequired && <button type="button" onClick={() => void saver.adopt()} className="min-h-11 underline">Recover pending work for this account and upload</button>}
    {view.phase === 'conflict' && <div role="region" aria-label="Review save conflict" className="w-full space-x-3">
      <p>Your pending changes are retained. Review the latest stored data before choosing. Stored data can include part of an interrupted save.</p>
      <details><summary>Compare local changes with storage</summary><ConflictReview /></details>
      <button type="button" onClick={() => void saver?.resolve(false)} className="min-h-11 underline">Discard local changes and use current storage</button>
      <button type="button" onClick={() => void saver?.resolve(true)} className="min-h-11 underline">Reapply my affected values to current storage</button>
    </div>}
    {repair && cfg && <div role="region" aria-label="Repair credentials" className="w-full">
      <p>Use the same account and destination. Pending changes keep their original attribution.</p>
      <Connection embedded toolName="Tagger" initialConfig={cfg} onConnect={(next, remember) => {
        if (accountScope(next) !== accountScope(cfg)) return;
        // Preserve the active upload and queue while replacing only credentials.
        useStore.setState({ s3Config: next });
        void remember;
        useAutomaticSave.setState({ repair: false }); void saver?.retry();
      }} />
    </div>}
  </div>;
}
function ConflictReview() {
  const saver = useAutomaticSave(s => s.saver);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    let live = true;
    const cfg = useStore.getState().s3Config;
    if (cfg && saver) void loadCanonicalState(cfg, saver.record.bucket, saver.record.uploadPrefix).then(state => {
      if (live && ref.current) ref.current.textContent = JSON.stringify({ local: saver.record.actions.map(a => a.changes), stored: { media: state.media.text, observations: state.observations.text, deployments: state.deployments.text } }, null, 2);
    });
    return () => { live = false; };
  }, [saver]);
  return <pre ref={ref} className="whitespace-pre-wrap max-h-64 overflow-auto">Loading current stored data…</pre>;
}
