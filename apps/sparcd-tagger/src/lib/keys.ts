// Per-species keybindings. Two sources, override-wins:
//   1. `species.json` `keyBinding` — a Java KeyCode string the SPARC'd desktop
//      app persists (e.g. "D", "DIGIT1"). Data-compatible, so a species the
//      researcher already bound in the Java app is pre-bound here.
//   2. A local override the user assigns in this tool — persisted to
//      localStorage, keyed by `scientificName`, and winning over (1).
//
// The plan is explicit: stable, user-assignable, persistent per-species keys —
// NOT rotating numeric keys. Matching is done on the normalized single
// `KeyboardEvent.key` character so the global handler stays a cheap lookup.

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Normalize a Java KeyCode string (or a raw char) to the lowercase
 *  `KeyboardEvent.key` it should match. Returns null when unbindable. */
export function normalizeJavaKeyCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (c.length === 1) return c.toLowerCase(); // already a char ("D", "1")
  const digit = /^(?:DIGIT|NUMPAD)([0-9])$/.exec(c);
  if (digit) return digit[1];
  // "A".."Z" arrive as length-1 above; spelled-out names are rare — ignore them.
  return null;
}

export type KeyOverrides = Record<string, string | null>;
export type SpeciesDiff = { added: string[]; removed: string[] };

export function withAssignedKey(
  overrides: KeyOverrides,
  scientificName: string,
  key: string,
  displacedScientificNames: string[] = [],
): KeyOverrides {
  const next = { ...overrides };
  for (const displaced of displacedScientificNames) {
    if (displaced !== scientificName) next[displaced] = null;
  }
  next[scientificName] = key;
  return next;
}

export function withClearedKey(
  overrides: KeyOverrides,
  scientificName: string,
): KeyOverrides {
  return { ...overrides, [scientificName]: null };
}

type KeyBindingState = {
  /** Missing → vocabulary default; string → local key; null → explicitly unbound. */
  overrides: KeyOverrides;
  assignKey: (
    scientificName: string,
    key: string,
    displacedScientificNames?: string[],
  ) => void;
  /** Sorted snapshot of scientificNames from the last-seen server species list.
   *  Empty on first load (no prior session). */
  knownSpecies: string[];
  clearKey: (scientificName: string) => void;
  /** Compare `current` (sorted scientificNames from species.json) to the stored
   *  snapshot. Prunes overrides for removed species, updates the snapshot, and
   *  returns the diff. Returns `null` when the snapshot was empty (first load,
   *  no meaningful "change" to surface). */
  syncSpecies: (current: string[]) => SpeciesDiff | null;
};

/** Local, persistent per-species key overrides and species-change snapshot. */
export const useKeyBindings = create<KeyBindingState>()(
  persist(
    (set, get) => ({
      overrides: {},
      knownSpecies: [],
      assignKey: (scientificName, key, displacedScientificNames = []) =>
        set((s) => ({
          overrides: withAssignedKey(
            s.overrides,
            scientificName,
            key,
            displacedScientificNames,
          ),
        })),
      clearKey: (scientificName) =>
        set((s) => ({ overrides: withClearedKey(s.overrides, scientificName) })),
      syncSpecies: (current) => {
        const known = get().knownSpecies;
        if (!known.length) {
          set({ knownSpecies: [...current].sort() });
          return null;
        }
        const knownSet = new Set(known);
        const currentSet = new Set(current);
        const added = current.filter((s) => !knownSet.has(s));
        const removed = known.filter((s) => !currentSet.has(s));
        if (!added.length && !removed.length) return { added: [], removed: [] };
        set((s) => {
          const next = { ...s.overrides };
          for (const sci of removed) next[sci] = null;
          return { overrides: next, knownSpecies: [...current].sort() };
        });
        return { added, removed };
      },
    }),
    {
      name: 'sparcd-tagger-keybindings',
      storage: createJSONStorage(() => globalThis.localStorage),
    },
  ),
);

/** Resolve the effective key for a species: local override (unless cleared), else species.json. */
export function effectiveKey(
  scientificName: string,
  jsonKeyBinding: string | null,
  overrides: KeyOverrides,
): string | null {
  return Object.prototype.hasOwnProperty.call(overrides, scientificName)
    ? overrides[scientificName]
    : normalizeJavaKeyCode(jsonKeyBinding);
}

export function conflictingKeyOwners(
  species: readonly { scientificName: string; keyBinding: string | null }[],
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
