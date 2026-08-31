// Java KeyCode → `KeyboardEvent.key` normalization, and override-wins
// resolution. Data-compatible with the desktop app's persisted `keyBinding`.

import { describe, it, expect } from 'vitest';
import {
  normalizeJavaKeyCode,
  effectiveKey,
  withAssignedKey,
  withClearedKey,
  conflictingKeyOwners,
} from '../src/lib/keys';

describe('normalizeJavaKeyCode', () => {
  it('maps single letters to a lowercase key char', () => {
    expect(normalizeJavaKeyCode('D')).toBe('d');
  });

  it('maps DIGIT/NUMPAD codes to the digit char', () => {
    expect(normalizeJavaKeyCode('DIGIT1')).toBe('1');
    expect(normalizeJavaKeyCode('NUMPAD7')).toBe('7');
  });

  it('returns null for empty / unbindable codes', () => {
    expect(normalizeJavaKeyCode(null)).toBeNull();
    expect(normalizeJavaKeyCode('')).toBeNull();
    expect(normalizeJavaKeyCode('ENTER')).toBeNull();
  });
});

describe('effectiveKey', () => {
  it('prefers a local override over the species.json binding', () => {
    expect(effectiveKey('Canis latrans', 'D', { 'Canis latrans': 'c' })).toBe('c');
  });

  it('falls back to the normalized species.json binding', () => {
    expect(effectiveKey('Canis latrans', 'D', {})).toBe('d');
  });

  it('is null when neither source binds the species', () => {
    expect(effectiveKey('Canis latrans', null, {})).toBeNull();
  });

  it('honors an explicit unbinding instead of falling back to species.json', () => {
    expect(effectiveKey('Canis latrans', 'C', { 'Canis latrans': null })).toBeNull();
  });
});

describe('key override transitions', () => {
  it('records a persistent tombstone when a key is cleared', () => {
    expect(withClearedKey({ 'Canis latrans': 'q' }, 'Canis latrans')).toEqual({
      'Canis latrans': null,
    });
  });

  it('atomically assigns a key and unbinds every displaced owner', () => {
    expect(
      withAssignedKey({}, 'Pecari tajacu', 'd', [
        'Odocoileus hemionus',
        'Canis latrans',
      ]),
    ).toEqual({
      'Odocoileus hemionus': null,
      'Canis latrans': null,
      'Pecari tajacu': 'd',
    });
  });

  it('finds duplicate owners across vocabulary and local bindings', () => {
    const species = [
      { scientificName: 'default owner', keyBinding: 'D' },
      { scientificName: 'local owner', keyBinding: null },
      { scientificName: 'target', keyBinding: null },
    ];
    expect(
      conflictingKeyOwners(species, 'target', 'd', {
        'local owner': 'd',
      }),
    ).toEqual(['default owner', 'local owner']);
  });

  it('does not report explicitly cleared vocabulary bindings as conflicts', () => {
    const species = [
      { scientificName: 'former owner', keyBinding: 'D' },
      { scientificName: 'target', keyBinding: null },
    ];
    expect(
      conflictingKeyOwners(species, 'target', 'd', {
        'former owner': null,
      }),
    ).toEqual([]);
  });
});
