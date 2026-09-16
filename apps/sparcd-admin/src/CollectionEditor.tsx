import { useEffect, useMemo, useState } from 'react'
import { ConditionalReplaceConflictError, type CollectionRef, type SafeS3Client } from '@sparcd/s3-safe'

export type CollectionRecord = CollectionRef & {
  etag: string
  document: Record<string, unknown>
}

const fields = [
  ['nameProperty', 'Name'],
  ['organizationProperty', 'Organization'],
  ['contactInfoProperty', 'Contact'],
  ['descriptionProperty', 'Description'],
] as const

export function collectionValidationError(collection: Record<string, unknown>) {
  const missing = fields.find(([key]) => String(collection[key] ?? '').trim() === '')
  return missing ? `${missing[1]} is required.` : null
}

export function CollectionEditor({ collections, client, actor, reload }: {
  collections: CollectionRecord[]
  client: SafeS3Client
  actor: string
  reload: () => void
}) {
  const [selectedKey, setSelectedKey] = useState(collections[0]?.key ?? '')
  const [draft, setDraft] = useState<Record<string, unknown>>(collections[0]?.document ?? {})
  const [message, setMessage] = useState('')
  const [retryApplied, setRetryApplied] = useState<(() => Promise<void>) | null>(null)
  const selected = useMemo(() => collections.find((item) => item.key === selectedKey) ?? null, [collections, selectedKey])

  useEffect(() => {
    const next = collections.find((item) => item.key === selectedKey) ?? collections[0]
    setSelectedKey(next?.key ?? '')
    setDraft(next?.document ?? {})
    setMessage('')
    setRetryApplied(null)
  }, [collections])

  if (!selected) {
    return <section className="border border-rule bg-panel p-4"><h1 className="m-0 text-lg font-semibold">Collections</h1><p className="mb-0 mt-2 text-sm text-inkSoft">No collections are visible to these credentials.</p></section>
  }

  const selectCollection = (key: string) => {
    const next = collections.find((item) => item.key === key)
    if (!next) return
    setSelectedKey(key)
    setDraft(next.document)
    setMessage('')
  }
  const change = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }))
  const save = async () => {
    const invalid = collectionValidationError(draft)
    if (invalid) {
      setMessage(invalid)
      return
    }
    const eventId = crypto.randomUUID()
    const occurredAt = new Date().toISOString()
    const base = `Settings/audit/config/${occurredAt.slice(0, 10)}/${eventId}`
    const event = {
      schemaVersion: 1,
      eventId,
      occurredAt,
      actor,
      action: 'collection.updated',
      target: { collectionKey: selected.key },
      before: selected.document,
      after: draft,
    }
    try {
      await client.writeImmutable(selected.bucket, `${base}.prepared.json`, JSON.stringify(event, null, 2), { contentType: 'application/json' })
      const write = await client.replaceIfUnchanged(selected.bucket, `Collections/${selected.uuid}/collection.json`, JSON.stringify(draft, null, 2), { etag: selected.etag, contentType: 'application/json' })
      const applied = () => client.writeImmutable(selected.bucket, `${base}.applied.json`, JSON.stringify({ ...event, appliedAt: new Date().toISOString(), afterETag: write.etag }, null, 2), { contentType: 'application/json' })
      try {
        await applied()
        setMessage('Saved and audited.')
        reload()
      } catch {
        setRetryApplied(() => applied)
        setMessage('Saved, but its applied audit record needs retrying.')
      }
    } catch (error) {
      setMessage(error instanceof ConditionalReplaceConflictError ? 'The collection changed elsewhere. Reload and review it before saving.' : (error as Error).message)
    }
  }

  return <section className="border border-rule bg-panel" aria-labelledby="collections-heading">
    <div className="border-b border-rule px-4 py-3"><h1 id="collections-heading" className="m-0 text-lg font-semibold">Collections</h1><p className="mb-0 mt-1 text-sm text-inkSoft">Update collection metadata without changing its bucket or UUID.</p></div>
    <div className="p-4">
      <label className="mb-4 grid max-w-md gap-1 text-sm font-medium">Select collection
        <select value={selectedKey} onChange={(event) => selectCollection(event.target.value)} className="min-h-10 border border-rule bg-paper px-2 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          {collections.map((item) => <option key={item.key} value={item.key}>{item.name ?? item.bucket} — {item.uuid}</option>)}
        </select>
      </label>
      <fieldset className="grid gap-3 border border-rule p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">Edit {selected.name ?? selected.uuid}</legend>
        {fields.map(([key, label]) => <label key={key} className="grid gap-1 text-sm font-medium">{label}<span aria-hidden="true" className="ml-1 text-warn">*</span><input required aria-label={label} value={String(draft[key] ?? '')} onChange={(event) => change(key, event.target.value)} className="min-h-10 border border-rule bg-paper px-2 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" /></label>)}
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void save()} className="border border-ink bg-ink px-3 py-2 text-sm font-semibold text-paper hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Save collection</button>
        {retryApplied && <button type="button" onClick={() => void retryApplied().then(() => {
          setRetryApplied(null)
          setMessage('Applied audit record recovered.')
          reload()
        }).catch((error) => setMessage((error as Error).message))} className="border border-warn px-3 py-2 text-sm text-warn focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Retry audit record</button>}
      </div>
      {message && <p role="status" className="mb-0 mt-3 text-sm text-inkSoft">{message}</p>}
    </div>
  </section>
}
