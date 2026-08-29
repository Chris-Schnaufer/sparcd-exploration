import { describe, expect, it } from 'vitest';
import {
  acknowledgeSpeciesProfile,
  speciesKeyProfileId,
  stageSpeciesProfile,
} from '../src/lib/speciesKeyProfiles';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

const before = [
  { scientificName: 'a', commonName: 'Alpha', keyBinding: 'A' },
  { scientificName: 'removed', commonName: 'Removed', keyBinding: 'R' },
];
const after = [
  { scientificName: 'a', commonName: 'Alpha updated', keyBinding: '?' },
  { scientificName: 'added', commonName: 'Added', keyBinding: 'N' },
];

describe('uploader species-keybinding preflight', () => {
  it('uses the same endpoint/user profile identity as the tagger', () => {
    expect(speciesKeyProfileId(' https://s3.example ', ' alice ')).toBe(
      'https://s3.example\u0000alice',
    );
  });

  it('keeps changes pending until acknowledgement and then prunes removed overrides', () => {
    const storage = memoryStorage();
    const profileId = speciesKeyProfileId('server', 'alice');
    expect(stageSpeciesProfile(storage, profileId, before)).toBeNull();

    const stored = JSON.parse(storage.getItem('sparcd-tagger-keybindings')!) as {
      state: { profiles: Record<string, { overrides: Record<string, string | null> }> };
    };
    stored.state.profiles[profileId].overrides.removed = '!';
    storage.setItem('sparcd-tagger-keybindings', JSON.stringify(stored));

    const diff = stageSpeciesProfile(storage, profileId, after)!;
    expect(diff.added[0].scientificName).toBe('added');
    expect(diff.removed[0].scientificName).toBe('removed');
    expect(diff.modified[0].after.commonName).toBe('Alpha updated');

    acknowledgeSpeciesProfile(storage, profileId);
    const acknowledged = JSON.parse(storage.getItem('sparcd-tagger-keybindings')!) as {
      state: {
        profiles: Record<
          string,
          { overrides: Record<string, string | null>; pendingSpeciesChange?: unknown }
        >;
      };
    };
    expect(acknowledged.state.profiles[profileId].overrides.removed).toBeUndefined();
    expect(acknowledged.state.profiles[profileId].pendingSpeciesChange).toBeUndefined();
  });
});
