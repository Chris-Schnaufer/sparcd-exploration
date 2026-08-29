import type { SpeciesKeyConfig } from './s3';

export const KEYBINDING_STORAGE_KEY = 'sparcd-tagger-keybindings';

type SpeciesDiff = {
  added: SpeciesKeyConfig[];
  removed: SpeciesKeyConfig[];
  modified: { before: SpeciesKeyConfig; after: SpeciesKeyConfig }[];
};

type Profile = {
  overrides: Record<string, string | null>;
  acceptedSpecies?: SpeciesKeyConfig[];
  pendingSpeciesChange?: { next: SpeciesKeyConfig[]; diff: SpeciesDiff };
};

type Envelope = { state: { profiles: Record<string, Profile> }; version: number };

export function speciesKeyProfileId(endpoint: string, accessKey: string): string {
  return `${endpoint.trim()}\u0000${accessKey.trim()}`;
}

function normalize(species: SpeciesKeyConfig[]): SpeciesKeyConfig[] {
  return [...species].sort((a, b) => a.scientificName.localeCompare(b.scientificName));
}

function diffSpecies(before: SpeciesKeyConfig[], after: SpeciesKeyConfig[]): SpeciesDiff {
  const prior = new Map(before.map((entry) => [entry.scientificName, entry]));
  const current = new Map(after.map((entry) => [entry.scientificName, entry]));
  return {
    added: after.filter((entry) => !prior.has(entry.scientificName)),
    removed: before.filter((entry) => !current.has(entry.scientificName)),
    modified: after.flatMap((entry) => {
      const old = prior.get(entry.scientificName);
      return old && (old.commonName !== entry.commonName || old.keyBinding !== entry.keyBinding)
        ? [{ before: old, after: entry }]
        : [];
    }),
  };
}

function read(storage: Storage): Envelope {
  try {
    const parsed = JSON.parse(storage.getItem(KEYBINDING_STORAGE_KEY) ?? '') as {
      state?: { profiles?: Record<string, Profile>; overrides?: Record<string, string | null> };
      version?: number;
    };
    if (parsed.state?.profiles) {
      return { state: { profiles: parsed.state.profiles }, version: 2 };
    }
    return {
      state: {
        profiles: {
          __legacy__: { overrides: parsed.state?.overrides ?? {} },
        },
      },
      version: 2,
    };
  } catch {
    return { state: { profiles: {} }, version: 2 };
  }
}

function write(storage: Storage, envelope: Envelope): void {
  storage.setItem(KEYBINDING_STORAGE_KEY, JSON.stringify(envelope));
}

function profileFor(envelope: Envelope, profileId: string): Profile {
  if (!envelope.state.profiles[profileId]) {
    const legacy = envelope.state.profiles.__legacy__;
    envelope.state.profiles[profileId] = legacy ?? { overrides: {} };
    delete envelope.state.profiles.__legacy__;
  }
  return envelope.state.profiles[profileId];
}

export function stageSpeciesProfile(
  storage: Storage,
  profileId: string,
  species: SpeciesKeyConfig[],
): SpeciesDiff | null {
  const envelope = read(storage);
  const profile = profileFor(envelope, profileId);
  const next = normalize(species);
  if (!profile.acceptedSpecies) {
    profile.acceptedSpecies = next;
    write(storage, envelope);
    return null;
  }
  const diff = diffSpecies(profile.acceptedSpecies, next);
  if (diff.added.length || diff.removed.length || diff.modified.length) {
    profile.pendingSpeciesChange = { next, diff };
  } else {
    delete profile.pendingSpeciesChange;
  }
  write(storage, envelope);
  return profile.pendingSpeciesChange?.diff ?? null;
}

export function acknowledgeSpeciesProfile(storage: Storage, profileId: string): void {
  const envelope = read(storage);
  const profile = profileFor(envelope, profileId);
  const pending = profile.pendingSpeciesChange;
  if (!pending) return;
  for (const removed of pending.diff.removed) delete profile.overrides[removed.scientificName];
  profile.acceptedSpecies = pending.next;
  delete profile.pendingSpeciesChange;
  write(storage, envelope);
}
