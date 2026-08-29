import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

type KeyBindingStore = typeof import('../src/lib/keys').useKeyBindings;

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  },
});

let useKeyBindings: KeyBindingStore;

beforeAll(async () => {
  ({ useKeyBindings } = await import('../src/lib/keys'));
});

describe('key binding store', () => {
  beforeEach(() => {
    values.clear();
    useKeyBindings.setState({ overrides: {} });
  });

  it('persists an explicit clear in store state and local storage', () => {
    useKeyBindings.getState().clearKey('Odocoileus hemionus');
    expect(useKeyBindings.getState().overrides).toEqual({ 'Odocoileus hemionus': null });
    expect(localStorage.getItem('sparcd-tagger-keybindings')).toContain(
      '"Odocoileus hemionus":null',
    );
  });

  it('transfers a duplicate key in one store update', () => {
    useKeyBindings.getState().assignKey('Canis latrans', 'z');
    useKeyBindings.getState().assignKey('Pecari tajacu', 'z', ['Canis latrans']);
    expect(useKeyBindings.getState().overrides).toEqual({
      'Canis latrans': null,
      'Pecari tajacu': 'z',
    });
  });
});
