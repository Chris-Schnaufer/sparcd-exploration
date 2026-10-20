/**
 * A browser-local custom identity associated with one connected login.
 * The login identifier is not a credential secret; never pass secret keys to
 * this module. Each account has its own storage key so writes for one login do
 * not overwrite another login's preference.
 */
const STORAGE_PREFIX = 'sparcd-login-identity-v1:';
const RECORD_VERSION = 1;

type IdentityRecord = {
  version: typeof RECORD_VERSION;
  identity: string;
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

function getStoredCustomIdentity(loginIdentifier: string): string | null {
  try {
    const raw = localStorage.getItem(storageKey(loginIdentifier));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<IdentityRecord> | null;
    if (
      !value ||
      value.version !== RECORD_VERSION ||
      typeof value.identity !== 'string' ||
      !value.identity.trim()
    ) {
      return null;
    }
    return value.identity;
  } catch {
    // Storage may be unavailable, or an older/corrupt record may be present.
    // In either case use the login-name default rather than blocking login.
    return null;
  }
}

/** Read this login's custom identity, falling back to its login identifier. */
export function loadLoginIdentity(loginIdentifier: string | null | undefined): string {
  const login = normalizeLoginIdentifier(loginIdentifier);
  if (!login) return '';
  return getStoredCustomIdentity(login) ?? login;
}

/**
 * Save a custom identity for one login. Empty/whitespace values remove that
 * login's custom override so the UI can restore the login-name default on blur.
 * Returns false when browser storage is unavailable or cannot be updated.
 */
export function saveLoginIdentity(
  loginIdentifier: string | null | undefined,
  identity: string,
): boolean {
  const login = normalizeLoginIdentifier(loginIdentifier);
  if (!login) return false;

  try {
    const key = storageKey(login);
    if (!identity.trim()) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(
        key,
        JSON.stringify({ version: RECORD_VERSION, identity } satisfies IdentityRecord),
      );
    }
    return true;
  } catch {
    return false;
  }
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
