/**
 * A browser-local attribution preference associated with one connected login.
 * The login identifier is not a credential secret; never pass secret keys to
 * this module. Custom identity and resolved default are stored separately so
 * a refreshed account name never overwrites a user's choice.
 */
const STORAGE_PREFIX = 'sparcd-login-identity-v1:';
const RECORD_VERSION = 1;

type IdentityRecord = {
  version: typeof RECORD_VERSION;
  /** `identity` is the original v1 custom-identity field. */
  identity?: string;
  defaultIdentity?: string;
  defaultSource?: 'whoami' | 'access-key';
};

export type LoginIdentityPreference = {
  customIdentity: string | null;
  defaultIdentity: string | null;
  defaultSource: IdentityRecord['defaultSource'] | null;
};

export type LoginIdentityChange = {
  /** `null` represents `localStorage.clear()`. */
  loginIdentifier: string | null;
};

function normalizeLoginIdentifier(loginIdentifier: string | null | undefined): string {
  return loginIdentifier?.trim() ?? '';
}

function storageKey(loginIdentifier: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(loginIdentifier)}`;
}

function readRecord(loginIdentifier: string): IdentityRecord | null {
  try {
    const raw = localStorage.getItem(storageKey(loginIdentifier));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<IdentityRecord> | null;
    if (!value || value.version !== RECORD_VERSION) return null;
    return {
      version: RECORD_VERSION,
      identity: typeof value.identity === 'string' && value.identity.trim() ? value.identity : undefined,
      defaultIdentity: typeof value.defaultIdentity === 'string' && value.defaultIdentity.trim()
        ? value.defaultIdentity
        : undefined,
      defaultSource: value.defaultSource === 'whoami' || value.defaultSource === 'access-key'
        ? value.defaultSource
        : undefined,
    };
  } catch {
    // Storage may be unavailable, or an older/corrupt record may be present.
    return null;
  }
}

function writeRecord(login: string, record: IdentityRecord): boolean {
  try {
    const key = storageKey(login);
    if (!record.identity && !record.defaultIdentity) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/** Read the saved custom and resolved default values without inventing a fallback. */
export function loadLoginIdentityPreference(
  loginIdentifier: string | null | undefined,
): LoginIdentityPreference {
  const login = normalizeLoginIdentifier(loginIdentifier);
  const record = login ? readRecord(login) : null;
  return {
    customIdentity: record?.identity ?? null,
    defaultIdentity: record?.defaultIdentity ?? null,
    defaultSource: record?.defaultSource ?? null,
  };
}

/** Read this login's custom identity or resolved default; unresolved stays blank. */
export function loadLoginIdentity(loginIdentifier: string | null | undefined): string {
  const login = normalizeLoginIdentifier(loginIdentifier);
  if (!login) return '';
  const preference = loadLoginIdentityPreference(login);
  return preference.customIdentity ?? preference.defaultIdentity ?? '';
}

/**
 * Save a custom identity for one login. Empty/whitespace removes the custom
 * override but preserves the resolved default so it returns on blur.
 */
export function saveLoginIdentity(
  loginIdentifier: string | null | undefined,
  identity: string,
): boolean {
  const login = normalizeLoginIdentifier(loginIdentifier);
  if (!login) return false;
  const current = readRecord(login);
  return writeRecord(login, {
    version: RECORD_VERSION,
    identity: identity.trim() ? identity : undefined,
    defaultIdentity: current?.defaultIdentity,
    defaultSource: current?.defaultSource,
  });
}

/** Cache a default attribution name without replacing the user's custom value. */
export function saveLoginIdentityDefault(
  loginIdentifier: string | null | undefined,
  identity: string,
  source: NonNullable<IdentityRecord['defaultSource']>,
): boolean {
  const login = normalizeLoginIdentifier(loginIdentifier);
  if (!login || !identity.trim()) return false;
  const current = readRecord(login);
  return writeRecord(login, {
    version: RECORD_VERSION,
    identity: current?.identity,
    defaultIdentity: identity,
    defaultSource: source,
  });
}

/** Subscribe to identity changes made in another same-origin tab/app. */
export function subscribeLoginIdentityChanges(
  listener: (change: LoginIdentityChange) => void,
): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === null) {
      listener({ loginIdentifier: null });
      return;
    }
    if (!event.key.startsWith(STORAGE_PREFIX)) return;
    try {
      listener({ loginIdentifier: decodeURIComponent(event.key.slice(STORAGE_PREFIX.length)) });
    } catch {
      // Ignore malformed unrelated storage keys.
    }
  };

  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
