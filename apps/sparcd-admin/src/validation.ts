export type Entry = Record<string, unknown>;

export function validationError(kind: 'Species' | 'Locations', items: Entry[], index: number): string | null {
  const item = items[index] ?? {};
  if (kind === 'Species') {
    const name = String(item.name ?? '').trim();
    const scientificName = String(item.scientificName ?? '').trim();
    const keyBinding = String(item.keyBinding ?? '').trim();
    if (!name || !scientificName || !keyBinding) return 'Common name, scientific name, and shortcut key are required.';
    if (items.some((entry, i) => i !== index && entry.scientificName === scientificName))
      return 'Scientific name is already used by another official species.';
  } else {
    const locationId = String(item.idProperty ?? '').trim();
    const requiredLocationFields = ['nameProperty', 'idProperty', 'latProperty', 'lngProperty', 'elevationProperty'];
    if (requiredLocationFields.some((field) => String(item[field] ?? '').trim() === ''))
      return 'Name, Location ID, latitude, longitude, and elevation are required.';
    if (items.some((entry, i) => i !== index && entry.idProperty === locationId))
      return 'Location ID is already used by another official location.';
  }
  return null;
}

/**
 * Validate records that this editor would write. Existing legacy records are
 * deliberately skipped unless the administrator has changed them.
 */
export function changedRecordsValidationError(
  kind: 'Species' | 'Locations',
  items: Entry[],
  initial: unknown[],
): string | null {
  for (let index = 0; index < items.length; index += 1) {
    if (JSON.stringify(items[index]) === JSON.stringify(initial[index])) continue
    const error = validationError(kind, items, index)
    if (error) {
      const item = items[index]
      const name = kind === 'Species'
        ? (String(item.name ?? '').trim() || String(item.scientificName ?? '').trim())
        : (String(item.nameProperty ?? '').trim() || String(item.idProperty ?? '').trim())
      const fallback = `${kind === 'Species' ? 'Species' : 'Location'} ${index + 1}`
      return `${kind === 'Species' ? 'Species' : 'Location'} “${name || fallback}”: ${error}`
    }
  }
  return null
}
