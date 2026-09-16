import { describe, expect, it } from 'vitest';
import { changedRecordCount, discardBlankDraft, retireItem, updateItem } from '../src/RegistryEditor';
import { validationError } from '../src/validation';

describe('registry mutation', () => {
  it('replaces only the selected species record', () => {
    const before = [{ scientificName: 'Canis latrans', name: 'Coyote' }, { scientificName: 'Puma concolor', name: 'Mountain Lion' }];
    expect(updateItem(before, 1, { scientificName: 'Puma concolor', name: 'Puma' })).toEqual([
      before[0], { scientificName: 'Puma concolor', name: 'Puma' },
    ]);
  });
});

it('retires a species without removing its historical identity', () => {
  expect(retireItem([{ scientificName: 'Canis latrans', name: 'Coyote' }], 0)).toEqual([
    { scientificName: 'Canis latrans', name: 'Coyote', retired: true },
  ]);
});

it('rejects duplicate official location IDs', () => {
  expect(validationError('Locations', [{ idProperty: 'A', nameProperty: 'One' }, { idProperty: 'A', nameProperty: 'Two' }], 1)).toMatch(/already used/);
});


it('discards an empty added record when an existing record is selected', () => {
  const existing = [{ name: 'Coyote' }, { name: 'Puma' }];
  expect(discardBlankDraft([...existing, {}], 2)).toEqual(existing);
});

it('keeps a newly added record once it contains a value', () => {
  const records = [{ name: 'Coyote' }, { name: 'Puma' }, { name: 'Jaguar' }];
  expect(discardBlankDraft(records, 2)).toEqual(records);
});


it('counts added and changed registry records for the save label', () => {
  const before = [{ name: 'Coyote' }, { name: 'Puma' }];
  expect(changedRecordCount([{ name: 'Coyote' }, { name: 'Mountain lion' }, { name: 'Jaguar' }], before)).toBe(2);
});
