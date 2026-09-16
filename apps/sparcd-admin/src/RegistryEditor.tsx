import { useEffect, useState } from 'react'
import { ConditionalReplaceConflictError, type SafeS3Client } from '@sparcd/s3-safe'
import { validationError } from './validation'

export type Registry = { key: string; value: unknown[]; etag: string; bucket: string }

const json = (value: unknown) => JSON.stringify(value, null, 2)
const id = () => crypto.randomUUID()
const fields = {
  Species: ['name', 'scientificName', 'genus', 'species', 'keyBinding'],
  Locations: ['nameProperty', 'idProperty', 'latProperty', 'lngProperty', 'elevationProperty'],
} as const
const labels: Record<string, string> = {
  name: 'Common name', scientificName: 'Scientific name', genus: 'Genus', species: 'Species', keyBinding: 'Shortcut key',
  nameProperty: 'Name', idProperty: 'Location ID', latProperty: 'Latitude', lngProperty: 'Longitude', elevationProperty: 'Elevation',
  status: 'Status', sensitive: 'Sensitive',
}

export function updateItem(items: Record<string, unknown>[], at: number, next: Record<string, unknown>) {
  return items.map((value, index) => (index === at ? next : value))
}

export function retireItem(items: Record<string, unknown>[], at: number) {
  return updateItem(items, at, { ...items[at], retired: true })
}

export function hasRecordData(record: Record<string, unknown>) {
  return Object.values(record).some((value) => value !== '' && value !== undefined && value !== null)
}

export function discardBlankDraft(items: Record<string, unknown>[], draftIndex: number | null) {
  return draftIndex !== null && !hasRecordData(items[draftIndex])
    ? items.filter((_, index) => index !== draftIndex)
    : items
}

export function RegistryEditor({ title, registry, client, reload, actor }: {
  title: 'Species'
  registry: Registry
  client: SafeS3Client
  reload: () => void
  actor: string
} | {
  title: 'Locations'
  registry: Registry
  client: SafeS3Client
  reload: () => void
  actor: string
}) {
  const [items, setItems] = useState(registry.value as Record<string, unknown>[])
  const [selected, setSelected] = useState(0)
  const [message, setMessage] = useState('')
  const [retryApplied, setRetryApplied] = useState<(() => Promise<void>) | null>(null)
  const [draftIndex, setDraftIndex] = useState<number | null>(null)
  const [recordSearch, setRecordSearch] = useState('')

  useEffect(() => {
    setItems(registry.value as Record<string, unknown>[])
    setSelected((current) => Math.min(current, Math.max(registry.value.length - 1, 0)))
    setDraftIndex(null)
  }, [registry])

  const item = items[selected] ?? {}
  const label = (value: Record<string, unknown>) =>
    String(value.name ?? value.nameProperty ?? value.scientificName ?? 'New record')
  const recordOption = (value: Record<string, unknown>) => {
    const primary = label(value)
    const detail = value.scientificName ?? value.idProperty
    return detail && detail !== primary ? `${primary} — ${detail}` : primary
  }
  const change = (key: string, value: string) => {
    const next = {
      ...item,
      [key]: ['latProperty', 'lngProperty', 'elevationProperty'].includes(key) && value !== '' ? Number(value) : value,
    }
    setItems(updateItem(items, selected, next))
    if (draftIndex === selected && hasRecordData(next)) setDraftIndex(null)
  }
  const selectRecord = (nextSelected: number) => {
    const nextItems = discardBlankDraft(items, draftIndex)
    setItems(nextItems)
    setDraftIndex(null)
    setSelected(nextSelected)
    setRecordSearch(recordOption(nextItems[nextSelected] ?? {}))
  }


  const save = async () => {
    const invalid = validationError(title, items, selected)
    if (invalid) {
      setMessage(invalid)
      return
    }
    try {
      const occurredAt = new Date().toISOString()
      const eventId = id()
      const base = `Settings/audit/config/${occurredAt.slice(0, 10)}/${eventId}`
      const event = {
        schemaVersion: 1,
        eventId,
        occurredAt,
        actor,
        action: `${title.toLowerCase()}.updated`,
        target: { registryKey: registry.key },
        before: registry.value,
        after: items,
      }
      await client.writeImmutable(registry.bucket, `${base}.prepared.json`, json(event), { contentType: 'application/json' })
      const write = await client.replaceIfUnchanged(registry.bucket, registry.key, json(items), {
        etag: registry.etag,
        contentType: 'application/json',
      })
      const applied = () => client.writeImmutable(registry.bucket, `${base}.applied.json`, json({
        ...event,
        appliedAt: new Date().toISOString(),
        afterETag: write.etag,
      }), { contentType: 'application/json' })
      try {
        await applied()
        setMessage('Saved and audited.')
        reload()
      } catch {
        setRetryApplied(() => applied)
        setMessage('Saved, but its applied audit record needs retrying.')
      }
    } catch (error) {
      setMessage(error instanceof ConditionalReplaceConflictError
        ? 'The registry changed elsewhere. Reload and review it before saving.'
        : (error as Error).message)
    }
  }

  return (
    <section className="border border-rule bg-panel" aria-labelledby={`${title}-heading`}>
      <div className="border-b border-rule px-4 py-3">
        <h2 id={`${title}-heading`} className="m-0 text-lg font-semibold text-ink">{title}</h2>
        {title === 'Locations' && <p className="mb-0 mt-1 text-sm text-inkSoft">Changed IDs apply to new uploads; Explorer retains historic IDs as legacy values.</p>}
      </div>
      <div className="p-4">
        <label className="mb-4 grid max-w-md gap-1 text-sm font-medium text-ink">
          Select {title.slice(0, -1)}
          <input
            aria-label={`Select ${title.slice(0, -1)}`}
            list={`${title.toLowerCase()}-records`}
            value={recordSearch || recordOption(item)}
            onChange={(event) => {
              const value = event.target.value
              setRecordSearch(value)
              const found = items.findIndex((record) => recordOption(record) === value)
              if (found >= 0) selectRecord(found)
            }}
            onBlur={() => setRecordSearch('')}
            placeholder={`Type to filter ${title.toLowerCase()}`}
            className="min-h-10 border border-rule bg-paper px-2 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
          <datalist id={`${title.toLowerCase()}-records`}>
            {items.map((value, index) => <option value={recordOption(value)} key={index} />)}
          </datalist>
        </label>
        <button type="button" className="border border-rule px-3 py-2 text-sm text-ink hover:bg-paperHover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={() => {
          if (draftIndex !== null) {
            setSelected(draftIndex)
            return
          }
          setItems([...items, {}])
          setSelected(items.length)
          setDraftIndex(items.length)
          setRecordSearch('')
        }}>
          Add {title.slice(0, -1)}
        </button>
        <fieldset className="mt-4 grid gap-3 border border-rule p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold text-ink">Edit {label(item)}</legend>
          {fields[title].map((key) => (
            <label key={key} className="grid gap-1 text-sm font-medium text-ink">
              {labels[key]}
              <input
                aria-label={labels[key]}
                className="min-h-10 border border-rule bg-paper px-2 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                value={String(item[key] ?? '')}
                onChange={(event) => change(key, event.target.value)}
              />
            </label>
          ))}
        </fieldset>
        <div className="mt-4 flex flex-wrap gap-2">
          {title === 'Species' && <button type="button" className="border border-rule px-3 py-2 text-sm text-ink hover:bg-paperHover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={() => setItems(retireItem(items, selected))}>Retire species</button>}
          <button type="button" className="border border-ink bg-ink px-3 py-2 text-sm font-semibold text-paper hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2" onClick={() => void save()}>Save {title}</button>
          {retryApplied && <button type="button" className="border border-warn px-3 py-2 text-sm text-warn focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={() => void retryApplied().then(() => {
            setRetryApplied(null)
            setMessage('Applied audit record recovered.')
            reload()
          })}>Retry audit record</button>}
        </div>
        {message && <p role="status" className="mb-0 mt-3 text-sm text-inkSoft">{message}</p>}
      </div>
    </section>
  )
}
