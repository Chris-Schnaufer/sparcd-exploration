import { useState } from 'react';
import { ConditionalReplaceConflictError, type SafeS3Client } from '@sparcd/s3-safe';
import { validationError } from './validation';

export type Registry = { key: string; value: unknown[]; etag: string; bucket: string };
const json = (value: unknown) => JSON.stringify(value, null, 2);
const id = () => crypto.randomUUID();
const fields = { Species: ['name', 'scientificName', 'genus', 'species', 'keyBinding'], Locations: ['nameProperty', 'idProperty', 'latProperty', 'lngProperty', 'elevationProperty', 'status', 'sensitive'] } as const;

export function updateItem(items: Record<string, unknown>[], at: number, next: Record<string, unknown>) {
  return items.map((value, index) => index === at ? next : value);
}

export function RegistryEditor({ title, registry, client, reload, actor }: { title: 'Species' | 'Locations'; registry: Registry; client: SafeS3Client; reload: () => void; actor: string }) {
  const [items, setItems] = useState(registry.value as Record<string, unknown>[]);
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState('');
  const item = items[selected] ?? {};
  const label = (value: Record<string, unknown>) => String(value.name ?? value.nameProperty ?? value.scientificName ?? 'New record');
  const change = (key: string, value: string) => setItems(updateItem(items, selected, { ...item, [key]: ['latProperty', 'lngProperty', 'elevationProperty'].includes(key) ? Number(value) : value }));
  const save = async () => {
    const invalid = validationError(title, items, selected); if (invalid) return setMessage(invalid);
    try { const at = new Date().toISOString(), eventId = id(), base = `Settings/audit/config/${at.slice(0, 10)}/${eventId}`, event = { schemaVersion: 1, eventId, occurredAt: at, actor, action: `${title.toLowerCase()}.updated`, target: { registryKey: registry.key }, before: registry.value, after: items };
      await client.writeImmutable(registry.bucket, `${base}.prepared.json`, json(event), { contentType: 'application/json' });
      const write = await client.replaceIfUnchanged(registry.bucket, registry.key, json(items), { etag: registry.etag, contentType: 'application/json' });
      await client.writeImmutable(registry.bucket, `${base}.applied.json`, json({ ...event, appliedAt: new Date().toISOString(), afterETag: write.etag }), { contentType: 'application/json' }); setMessage('Saved and audited.'); reload();
    } catch (error) { setMessage(error instanceof ConditionalReplaceConflictError ? 'The registry changed elsewhere. Reload and review it before saving.' : (error as Error).message); }
  };
  return <section><h2>{title}</h2>{title === 'Locations' && <p>Changed IDs apply to new uploads; Explorer retains historic IDs as legacy values (issue #189).</p>}<div className="records" role="list">{items.map((value, index) => <button role="listitem" aria-current={index === selected} onClick={() => setSelected(index)} key={index}>{label(value)}</button>)}</div><button onClick={() => { setItems([...items, {}]); setSelected(items.length); }}>Add {title.slice(0, -1)}</button><fieldset><legend>Edit {label(item)}</legend>{fields[title].map(key => <label key={key}>{key}<input aria-label={key} value={String(item[key] ?? '')} onChange={e => change(key, e.target.value)} /></label>)}</fieldset><button onClick={() => void save()}>Save {title}</button><p role="status">{message}</p></section>;
}
