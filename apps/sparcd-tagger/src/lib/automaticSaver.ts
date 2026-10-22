import { S3ReadError, readErrorDetails } from '@sparcd/s3-safe';
import { db, uploadId } from './db';
import { canonicalValue, undoMatches, type AutomaticRecord, type EditAction } from './automaticModel';
import type { TagImage } from './workspace';
import type { Deployment } from '@sparcd/camtrap';

export type SavePhase = 'loading' | 'saved' | 'saving' | 'pending' | 'failed' | 'conflict' | 'recovery';
export type SaveView = { phase: SavePhase; message: string; pending: boolean; undoReason: string; canEdit: boolean };
export type RemoteView = { images: TagImage[]; location: Deployment | null; writtenFields?: import('./automaticModel').ValueChange['field'][]; canonical?: import('./sync').CanonicalState };
export class SaveConflict extends Error {}
export type SaveServices = {
  save: (record: AutomaticRecord) => Promise<RemoteView>;
  current: () => Promise<RemoteView>;
  prepareUndo?: (action: EditAction, result: RemoteView) => Promise<EditAction>;
  validateUndo?: (action: EditAction, result: RemoteView) => boolean;
  reverse: (action: EditAction, remote: RemoteView) => Promise<{ action: EditAction; drafts?: import('./db').DraftRecord[] }>;
  resolve: (record: AutomaticRecord, remote: RemoteView, reapply: boolean) => Promise<EditAction[] | void>;
  changed: (view: SaveView) => void;
};

/** Timers control network coalescing only. Every accepted action is persisted
 * immediately, with its own durable Undo boundary, before a write can start. */
export class AutomaticSaver {
  record: AutomaticRecord;
  view: SaveView = { phase: 'loading', message: 'Opening save recovery…', pending: false, undoReason: 'Opening upload', canEdit: false };
  private version = 0;
  private readonly branchId = crypto.randomUUID();
  private writes: Promise<void> = Promise.resolve();
  private persistenceError: unknown;
  private running: Promise<boolean> | null = null;
  private idle?: ReturnType<typeof setTimeout>;
  private maximum?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private online = true;
  private disposed = false;
  private undoing = false;
  private retryDelay = 1000;

  constructor(record: AutomaticRecord, private services: SaveServices) { this.record = record; }
  async open(): Promise<void> {
    const stored = await db.automatic.get(this.record.id);
    if (stored) { this.record = stored; this.version = stored.version ?? 0; }
    if (this.record.recoveryBranches?.length) this.publish('conflict', 'Pending edits from another tab were retained. Reload and review all retained changes before continuing.');
    else if (this.record.adoptionRequired) this.publish('recovery', 'Existing pending work needs recovery confirmation for this account and destination.');
    else if (this.record.actions.length || this.record.flight) { this.publish('saving', 'Saving…'); this.schedule(); }
    else this.publish('saved', 'Saved');
  }
  private publish(phase: SavePhase, message: string): void {
    const pending = !!this.record.actions.length || !!this.record.flight || !!this.record.adoptionRequired || !!this.persistenceError;
    const reason = !this.online ? 'Undo requires an online connection.' : phase !== 'saved' || pending
      ? 'Undo is unavailable while saving or recovering pending work.' : this.record.undoReason ?? (!this.record.undo ? 'No completed action to undo for this account and upload.' : '');
    this.view = { phase, message, pending, undoReason: reason, canEdit: this.online && !['loading', 'pending', 'conflict', 'recovery', 'failed'].includes(phase) && !this.persistenceError && !this.undoing };
    if (!this.disposed) this.services.changed(this.view);
  }
  private persist(clearJournal = false, drafts: import('./db').DraftRecord[] = []): Promise<void> {
    const snapshot = structuredClone(this.record);
    const operation = this.writes.catch(() => {}).then(async () => {
      let stale = false;
      await db.transaction('rw', db.automatic, db.syncJournals, db.drafts, db.uploads, async () => {
        const current = await db.automatic.get(snapshot.id);
        if ((current?.version ?? 0) !== this.version) {
          if (current) {
            const known = new Set([...current.actions, ...(current.recoveryBranches ?? []).flatMap(branch => branch.actions)].map(action => action.id));
            const actions = snapshot.actions.filter(action => !known.has(action.id));
            if (actions.length) await db.automatic.put({ ...current, version: (current.version ?? 0) + 1,
              recoveryBranches: [...(current.recoveryBranches ?? []), { ...snapshot, id: this.branchId, actions, flight: undefined, recoveryBranches: undefined }] });
          }
          stale = true;
          return;
        }
        await db.automatic.put({ ...snapshot, version: this.version + 1 });
        if (drafts.length) await db.drafts.bulkPut(drafts);
        const location = snapshot.actions.flatMap(a => a.changes).filter(c => c.field === 'location').at(-1);
        if (location) await db.uploads.update(uploadId(snapshot.bucket, snapshot.uploadPrefix), { pendingLocation: location.after as Deployment | null });
        if (clearJournal) await db.syncJournals.delete(uploadId(snapshot.bucket, snapshot.uploadPrefix));
      });
      if (stale) throw new SaveConflict('Another tab changed save recovery. This tab’s pending actions were retained separately. Reload to review them.');
      this.version++;
      this.persistenceError = undefined;
    });
    this.writes = operation;
    void operation.catch(error => { this.persistenceError = error; this.publish(error instanceof SaveConflict ? 'conflict' : 'failed', error instanceof SaveConflict ? error.message : `Could not retain pending work: ${String(error)}. Keep this tab open and retry.`); });
    return operation;
  }
  accept(action: EditAction, drafts: import('./db').DraftRecord[] = []): void {
    if (!action.changes.length) return;
    action = { ...action, records: Object.fromEntries(drafts.map(d => [d.mediaPath, d])) };
    this.record = { ...this.record, actions: [...this.record.actions, action], undo: action.undoOf ? this.record.undo : action, undoReason: undefined, pendingDrafts: { ...this.record.pendingDrafts, ...Object.fromEntries(drafts.map(d => [d.mediaPath, d])) } };
    void this.persist(false, drafts);
    this.publish(this.online ? 'saving' : 'pending', this.online ? 'Saving…' : 'Pending/reconnecting — editing is paused.');
    this.schedule();
  }
  private schedule(): void {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => void this.flush(), 250);
    this.maximum ??= setTimeout(() => { this.maximum = undefined; void this.flush(); }, 1000);
  }
  setOnline(online: boolean): void {
    this.online = online;
    if (!online) this.publish('pending', 'Pending/reconnecting — editing is paused.');
    else if (this.view.phase === 'pending') { this.publish('saving', 'Reconnected — saving pending work…'); void this.flush(); }
  }
  private async locked<T>(operation: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks) throw new Error('This browser cannot protect save recovery across tabs. Use a browser with Web Locks support.');
    return locks.request(`sparcd-save:${this.record.id}`, operation);
  }
  flush(): Promise<boolean> {
    clearTimeout(this.idle); clearTimeout(this.maximum); this.maximum = undefined;
    if (this.running) return this.running;
    if (!this.online || ['conflict', 'recovery', 'loading'].includes(this.view.phase)) return Promise.resolve(false);
    const operation = this.locked(async () => {
      if (this.persistenceError) await this.persist(false, Object.values(this.record.pendingDrafts ?? {}));
      await this.writes;
      const latest = await db.automatic.get(this.record.id);
      if ((latest?.version ?? 0) !== this.version) throw new SaveConflict('Recovery changed in another tab. Reload before continuing.');
      while (this.record.actions.length || this.record.flight) {
        if (!this.online) return false;
        this.publish('saving', 'Saving…');
        if (!this.record.flight) {
          const undoIndex = this.record.actions.findIndex(action => action.undoOf);
          const actions = undoIndex < 0 ? this.record.actions : this.record.actions.slice(0, undoIndex + 1);
          this.record = { ...this.record, flight: { ids: actions.map(a => a.id), user: actions[0].user, undoOf: actions.find(a => a.undoOf)?.undoOf } };
          await this.persist();
        }
        const flight = this.record.flight!;
        const result = await this.services.save(structuredClone(this.record));
        // Later edits may have arrived while the write or refresh was running.
        await this.writes;
        let undo = this.record.undo;
        if (flight.undoOf && undo?.id === flight.undoOf) undo = null;
        else if (undo && flight.ids.includes(undo.id)) undo = { ...undo, changes: undo.changes.map(field => ({ ...field, after: result.writtenFields && !result.writtenFields.includes(field.field) ? field.after : canonicalValue(field, result.images, result.location) })) };
        if (undo && flight.ids.includes(undo.id) && this.services.prepareUndo) {
          undo = await this.services.prepareUndo(undo, result);
          if (this.record.undo?.id !== undo.id) undo = this.record.undo;
        }
        this.record = { ...this.record, actions: this.record.actions.filter(a => !flight.ids.includes(a.id)), flight: undefined, undo, pendingDrafts: this.record.actions.some(a => !flight.ids.includes(a.id)) ? this.record.pendingDrafts : {} };
        const reviewLegacy = this.record.reviewLegacyAfterFlight;
        this.record = { ...this.record, reviewLegacyAfterFlight: false };
        await this.persist(true);
        if (reviewLegacy && this.record.actions.length) {
          this.publish('conflict', 'The interrupted legacy write is recovered. Review the retained pending changes before reapplying or discarding them.');
          return false;
        }
      }
      this.retryDelay = 1000;
      this.publish('saved', 'Saved');
      return true;
    }).catch(error => {
      if (error instanceof SaveConflict) this.publish('conflict', `Save conflict — ${error.message}`);
      else if (!this.online || retryableTransport(error)) {
        this.publish('pending', 'Pending/reconnecting — editing is paused.');
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => { if (this.online && !this.disposed) void this.retry(); }, this.retryDelay);
        this.retryDelay = Math.min(30_000, this.retryDelay * 2);
      } else this.publish('failed', `Save failed — ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }).finally(() => { if (this.running === operation) this.running = null; });
    this.running = operation;
    return operation;
  }
  retry(): Promise<boolean> {
    if (this.view.phase === 'conflict' || this.record.adoptionRequired) return Promise.resolve(false);
    this.publish('saving', 'Retrying save…');
    return this.flush();
  }
  async undo(): Promise<boolean> {
    if (this.view.undoReason || this.running || this.undoing) return false;
    this.undoing = true;
    this.publish('saving', 'Checking Undo…');
    try {
      await this.locked(async () => {
        const persisted = await db.automatic.get(this.record.id);
        if (!persisted?.undo || persisted.undo.id !== this.record.undo?.id || persisted.actions.length || persisted.flight) throw new Error('Undo changed in another tab. Reload to use the current Undo record.');
        const current = await this.services.current();
        if (!undoMatches(persisted.undo, current.images, current.location) || this.services.validateUndo && !this.services.validateUndo(persisted.undo, current)) {
          this.record = { ...this.record, undoReason: 'Undo is unavailable because the affected data changed in storage.' };
          await this.persist();
          this.publish('saved', 'Saved — Undo unavailable because affected data changed.');
          return;
        }
        const reversal = await this.services.reverse(persisted.undo, current);
        this.accept(reversal.action, reversal.drafts);
        await this.writes;
      });
    } catch (error) { this.publish('failed', error instanceof Error ? error.message : String(error)); return false; }
    finally { this.undoing = false; }
    return this.record.actions.length ? this.flush() : false;
  }
  async adopt(): Promise<void> {
    this.record = { ...this.record, adoptionRequired: false };
    await this.persist(false, Object.values(this.record.pendingDrafts ?? {}));
    this.publish('saving', 'Recovering existing pending work…');
    await this.flush();
  }
  async resolve(reapply: boolean): Promise<void> {
    if (!this.online || this.running) return;
    await this.locked(async () => {
      const stored = await db.automatic.get(this.record.id);
      if ((stored?.version ?? 0) !== this.version) throw new SaveConflict('Reload first to review the pending work retained by both tabs.');
      const actions = [...this.record.actions, ...(this.record.recoveryBranches ?? []).flatMap(branch => branch.actions)]
        .sort((a, b) => a.at.localeCompare(b.at));
      this.record = { ...this.record, actions };
      const current = await this.services.current();
      const journal = await db.syncJournals.get(uploadId(this.record.bucket, this.record.uploadPrefix));
      const resolved = await this.services.resolve(this.record, current, reapply);
      const actionsToSave = resolved ?? this.record.actions;
      const latest = actionsToSave.filter(action => !action.undoOf && action.changes.length).at(-1);
      this.record = { ...this.record, recoveryBranches: undefined, flight: undefined,
        actions: reapply ? actionsToSave.filter(action => action.changes.length) : [],
        pendingDrafts: reapply ? this.record.pendingDrafts : {},
        undo: reapply ? latest ?? this.record.undo : null,
        undoReason: reapply && latest ? undefined : this.record.undoReason,
        archivedJournals: journal ? [...(this.record.archivedJournals ?? []), journal] : this.record.archivedJournals };
      await this.persist(true);
      this.publish(reapply ? 'saving' : 'saved', reapply ? 'Saving the explicitly reapplied changes…' : 'Using current stored data.');
    }).catch(error => { this.publish('conflict', error instanceof Error ? error.message : String(error)); });
    if (reapply && this.view.phase !== 'conflict') await this.flush();
  }
  dispose(): void { this.disposed = true; clearTimeout(this.idle); clearTimeout(this.maximum); clearTimeout(this.retryTimer); }
}

/** Read translation retains the original transport error in `cause`. Keep
 * authentication/permission failures actionable instead of retrying them. */
function retryableTransport(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const details = error instanceof S3ReadError ? error : readErrorDetails(error);
  if (details.status === 429 || details.status && details.status >= 500) return true;
  if (['AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch'].includes(details.code ?? '')) return false;
  const cause = error instanceof Error ? error.cause : undefined;
  return !!cause && cause !== error && retryableTransport(cause);
}
