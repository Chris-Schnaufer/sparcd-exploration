import { describe, expect, it } from 'vitest';
import { retireItem, updateItem } from '../src/RegistryEditor';
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
