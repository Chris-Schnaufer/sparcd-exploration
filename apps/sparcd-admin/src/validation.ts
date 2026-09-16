export type Entry = Record<string, unknown>;

export function validationError(kind: 'Species' | 'Locations', items: Entry[], index: number): string | null {
  const item = items[index] ?? {};
  if (kind === 'Species') {
    const name = String(item.name ?? '').trim();
    const scientificName = String(item.scientificName ?? '').trim();
    if (!name || !scientificName) return 'Common and scientific names are required.';
    if (items.some((entry, i) => i !== index && entry.scientificName === scientificName))
      return 'Scientific name is already used by another official species.';
  } else {
    const locationId = String(item.idProperty ?? '').trim();
    if (!locationId || !String(item.nameProperty ?? '').trim()) return 'Location ID and name are required.';
    if (items.some((entry, i) => i !== index && entry.idProperty === locationId))
      return 'Location ID is already used by another official location.';
  }
  return null;
}
