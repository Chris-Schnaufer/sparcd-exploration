import { describe, expect, it } from 'vitest';
import { changedRecordCount, discardBlankDraft, retireItem, updateItem } from '../src/RegistryEditor';
import { changedRecordsValidationError, validationError } from '../src/validation';
import { collectionHasChanges, collectionValidationError } from '../src/CollectionEditor';

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
  const locations = [
    { idProperty: 'A', nameProperty: 'One', latProperty: 1, lngProperty: 1, elevationProperty: 1 },
    { idProperty: 'A', nameProperty: 'Two', latProperty: 2, lngProperty: 2, elevationProperty: 2 },
  ];
  expect(validationError('Locations', locations, 1)).toMatch(/already used/);
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


it('validates every changed record before saving a registry', () => {
  const before = [
    { scientificName: 'Canis latrans', name: 'Coyote', keyBinding: 'C' },
    { scientificName: 'Puma concolor', name: 'Puma', keyBinding: 'P' },
  ];
  const changed = [
    { scientificName: 'Canis latrans', name: 'Coyote updated', keyBinding: 'C' },
    { scientificName: 'Puma concolor', name: '', keyBinding: 'P' },
  ];
  expect(changedRecordsValidationError('Species', changed, before)).toBe(
    'Species “Puma concolor”: Common name, scientific name, and shortcut key are required.',
  );
});

it('names an invalid location in a multi-record validation error', () => {
  const before = [{ idProperty: 'A', nameProperty: 'Alpha' }];
  const changed = [{ idProperty: '', nameProperty: 'North gate' }];
  expect(changedRecordsValidationError('Locations', changed, before)).toBe(
    'Location “North gate”: Name, Location ID, latitude, longitude, and elevation are required.',
  );
});

it('does not reject an unchanged legacy record while validating changes', () => {
  const before = [{ scientificName: '', name: '' }, { scientificName: 'Puma concolor', name: 'Puma', keyBinding: 'P' }];
  const changed = [{ scientificName: '', name: '' }, { scientificName: 'Puma concolor', name: 'Mountain lion', keyBinding: 'P' }];
  expect(changedRecordsValidationError('Species', changed, before)).toBeNull();
});

it('requires collection name, organization, and description while allowing contact blank', () => {
  expect(collectionValidationError({ nameProperty: 'Field site', organizationProperty: 'Lab', contactInfoProperty: '', descriptionProperty: '' })).toBe('Description is required.');
  expect(collectionValidationError({ nameProperty: 'Field site', organizationProperty: 'Lab', contactInfoProperty: '', descriptionProperty: 'Study' })).toBeNull();
});

it('enables collection save only when metadata changed', () => {
  const original = { nameProperty: 'Field site', organizationProperty: 'Lab', descriptionProperty: 'Study' };
  expect(collectionHasChanges({ ...original }, original)).toBe(false);
  expect(collectionHasChanges({ ...original, descriptionProperty: 'Updated study' }, original)).toBe(true);
});
