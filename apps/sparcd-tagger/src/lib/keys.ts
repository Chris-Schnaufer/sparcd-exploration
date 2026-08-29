// Per-user, persistent species keybindings. Profiles are scoped by the
// connected endpoint + access key (the stable, non-secret identity available
// at initial access). Missing override → vocabulary default; string → local
// binding; null → explicitly unbound. The legacy '' sentinel is still read as
// cleared so the issue #99 prototype and PR #138 remain data-compatible.

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type KeyOverrides = Record<string, string | null>;

export type SpeciesKeyConfig = {
  scientificName: string;
  commonName: string;
  keyBinding: string | null;
};

export type SpeciesDiff = {
  added: SpeciesKeyConfig[];
  removed: SpeciesKeyConfig[];
  modified: { before: SpeciesKeyConfig; after: SpeciesKeyConfig }[];
};

type PendingSpeciesChange = { next: SpeciesKeyConfig[]; diff: SpeciesDiff };

export type KeyProfile = {
  overrides: KeyOverrides;
  acceptedSpecies?: SpeciesKeyConfig[];
  pendingSpeciesChange?: PendingSpeciesChange;
};

type KeyBindingState = {
  profiles: Record<string, KeyProfile>;
  activeProfileId: string | null;
  activateProfile: (profileId: string) => void;
  assignKey: (
    scientificName: string,
    key: string,
    displacedScientificNames?: string[],
  ) => void;
  clearKey: (scientificName: string) => void;
  stageSpecies: (current: SpeciesKeyConfig[]) => void;
  acknowledgeSpeciesChange: () => void;
};

const LEGACY_PROFILE = '__legacy__';

export function keyProfileId(endpoint: string, accessKey: string): string {
  return `${endpoint.trim()}\u0000${accessKey.trim()}`;
}

/** Normalize a Java KeyCode string (or a raw printable key) to the value used
 * by KeyboardEvent.key. Printable symbols are valid bindings. */
export function normalizeJavaKeyCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim();
  if (!trimmed) return null;
  if ([...trimmed].length === 1) return trimmed.toLocaleLowerCase();
  const upper = trimmed.toUpperCase();
  const digit = /^(?:DIGIT|NUMPAD)([0-9])$/.exec(upper);
  if (digit) return digit[1];
  const symbols: Record<string, string> = {
    BACK_QUOTE: '`',
    COMMA: ',',
    PERIOD: '.',
    SLASH: '/',
    SEMICOLON: ';',
    QUOTE: "'",
    OPEN_BRACKET: '[',
    CLOSE_BRACKET: ']',
    BACK_SLASH: '\\',
    MINUS: '-',
    EQUALS: '=',
  };
  return symbols[upper] ?? null;
}

export function normalizeEventKey(key: string): string | null {
  return [...key].length === 1 && !/^\s$/u.test(key) ? key.toLocaleLowerCase() : null;
}

export function effectiveKey(
  scientificName: string,
  jsonKeyBinding: string | null,
  overrides: KeyOverrides | Record<string, string>,
): string | null {
  if (Object.prototype.hasOwnProperty.call(overrides, scientificName)) {
    const override = overrides[scientificName];
    return override === '' ? null : override;
  }
  return normalizeJavaKeyCode(jsonKeyBinding);
}

export function conflictingKeyOwners(
  species: readonly SpeciesKeyConfig[],
  targetScientificName: string,
  key: string,
  overrides: KeyOverrides,
): string[] {
  return species
    .filter(
      (candidate) =>
        candidate.scientificName !== targetScientificName &&
        effectiveKey(candidate.scientificName, candidate.keyBinding, overrides) === key,
    )
    .map((candidate) => candidate.scientificName);
}

export function diffSpecies(
  accepted: readonly SpeciesKeyConfig[],
  current: readonly SpeciesKeyConfig[],
): SpeciesDiff {
  const before = new Map(accepted.map((species) => [species.scientificName, species]));
  const after = new Map(current.map((species) => [species.scientificName, species]));
  return {
    added: current.filter((species) => !before.has(species.scientificName)),
    removed: accepted.filter((species) => !after.has(species.scientificName)),
    modified: current.flatMap((species) => {
      const prior = before.get(species.scientificName);
      return prior &&
        (prior.commonName !== species.commonName || prior.keyBinding !== species.keyBinding)
        ? [{ before: prior, after: species }]
        : [];
    }),
  };
}

function normalizedSpecies(species: readonly SpeciesKeyConfig[]): SpeciesKeyConfig[] {
  return species
    .map((entry) => ({
      scientificName: entry.scientificName,
      commonName: entry.commonName,
      keyBinding: entry.keyBinding,
    }))
    .sort((a, b) => a.scientificName.localeCompare(b.scientificName));
}

function hasDiff(diff: SpeciesDiff): boolean {
  return !!(diff.added.length || diff.removed.length || diff.modified.length);
}

function currentProfile(state: KeyBindingState): KeyProfile | null {
  return state.activeProfileId ? state.profiles[state.activeProfileId] ?? null : null;
}

function updateCurrentProfile(
  state: KeyBindingState,
  update: (profile: KeyProfile) => KeyProfile,
): Partial<KeyBindingState> {
  if (!state.activeProfileId) return {};
  const profile = state.profiles[state.activeProfileId] ?? { overrides: {} };
  return {
    profiles: { ...state.profiles, [state.activeProfileId]: update(profile) },
  };
}

export const useKeyBindings = create<KeyBindingState>()(
  persist(
    (set) => ({
      profiles: {},
      activeProfileId: null,
      activateProfile: (profileId) =>
        set((state) => {
          if (state.activeProfileId === profileId) return state;
          let profiles = state.profiles;
          if (!profiles[profileId]) {
            const legacy = profiles[LEGACY_PROFILE];
            profiles = { ...profiles, [profileId]: legacy ?? { overrides: {} } };
            if (legacy) {
              profiles = { ...profiles };
              delete profiles[LEGACY_PROFILE];
            }
          }
          return { profiles, activeProfileId: profileId };
        }),
      assignKey: (scientificName, key, displacedScientificNames = []) =>
        set((state) =>
          updateCurrentProfile(state, (profile) => {
            const overrides = { ...profile.overrides };
            for (const displaced of displacedScientificNames) {
              if (displaced !== scientificName) overrides[displaced] = null;
            }
            overrides[scientificName] = key;
            return { ...profile, overrides };
          }),
        ),
      clearKey: (scientificName) =>
        set((state) =>
          updateCurrentProfile(state, (profile) => ({
            ...profile,
            overrides: { ...profile.overrides, [scientificName]: null },
          })),
        ),
      stageSpecies: (current) =>
        set((state) =>
          updateCurrentProfile(state, (profile) => {
            const next = normalizedSpecies(current);
            if (!profile.acceptedSpecies) return { ...profile, acceptedSpecies: next };
            if (
              profile.pendingSpeciesChange &&
              JSON.stringify(profile.pendingSpeciesChange.next) === JSON.stringify(next)
            ) {
              return profile;
            }
            const diff = diffSpecies(profile.acceptedSpecies, next);
            return hasDiff(diff)
              ? { ...profile, pendingSpeciesChange: { next, diff } }
              : { ...profile, pendingSpeciesChange: undefined };
          }),
        ),
      acknowledgeSpeciesChange: () =>
        set((state) =>
          updateCurrentProfile(state, (profile) => {
            const pending = profile.pendingSpeciesChange;
            if (!pending) return profile;
            const overrides = { ...profile.overrides };
            for (const removed of pending.diff.removed) delete overrides[removed.scientificName];
            return {
              overrides,
              acceptedSpecies: pending.next,
              pendingSpeciesChange: undefined,
            };
          }),
        ),
    }),
    {
      name: 'sparcd-tagger-keybindings',
      version: 2,
      storage: createJSONStorage(() => globalThis.localStorage),
      partialize: (state) => ({ profiles: state.profiles }),
      merge: (persisted, current) => ({
        ...current,
        ...((persisted as Partial<KeyBindingState>) ?? {}),
        activeProfileId: current.activeProfileId,
      }),
      migrate: (persisted: unknown) => {
        const prior = persisted as {
          profiles?: Record<string, KeyProfile>;
          overrides?: Record<string, string | null>;
          knownSpecies?: string[];
        };
        if (prior.profiles) return { profiles: prior.profiles };
        const acceptedSpecies = prior.knownSpecies?.map((scientificName) => ({
          scientificName,
          commonName: scientificName,
          keyBinding: null,
        }));
        return {
          profiles: {
            [LEGACY_PROFILE]: {
              overrides: Object.fromEntries(
                Object.entries(prior.overrides ?? {}).map(([name, key]) => [
                  name,
                  key === '' ? null : key,
                ]),
              ),
              acceptedSpecies,
            },
          },
        };
      },
    },
  ),
);

export function activeKeyProfile(state: KeyBindingState): KeyProfile {
  return currentProfile(state) ?? { overrides: {} };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === 'sparcd-tagger-keybindings') void useKeyBindings.persist.rehydrate();
  });
}
