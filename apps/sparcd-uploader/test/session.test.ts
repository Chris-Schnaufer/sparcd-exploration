import { beforeEach, describe, expect, it } from 'vitest';
import type { S3Config } from '@sparcd/types';

const storage = () => {
  const m = new Map<string, string>();
  return {
    map: m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
const local = storage();
const session = storage();
Object.assign(globalThis, {
  localStorage: local,
  sessionStorage: session,
  // No cross-tab relay in Node — this suite is about what the tab keeps.
  BroadcastChannel: undefined,
});

const { saveSharedConnection, clearSharedConnection, loadSessionConnection, getLiveConnection } =
  await import('../../../packages/auth-ui/src/session');

const CONFIG: S3Config = {
  endpoint: 'http://localhost:5311',
  accessKey: 'AKIATESTKEY0001',
  secretKey: 'test-secret-key',
  region: 'us-east-1',
  forcePathStyle: true,
  secure: false,
};

beforeEach(() => {
  local.map.clear();
  session.map.clear();
  clearSharedConnection();
});

describe('shared connection storage', () => {
  it('stashes the full config in sessionStorage and restores it', () => {
    saveSharedConnection(CONFIG);

    expect(loadSessionConnection()).toEqual(CONFIG);
    expect(getLiveConnection()).toEqual(CONFIG);
  });

  it('keeps the secret out of localStorage', () => {
    saveSharedConnection(CONFIG);

    const persisted = JSON.parse(local.getItem('sparcd-connection') ?? '{}');
    expect(persisted).toEqual({
      endpoint: CONFIG.endpoint,
      accessKey: CONFIG.accessKey,
      region: CONFIG.region,
      forcePathStyle: CONFIG.forcePathStyle,
      secure: CONFIG.secure,
    });
    expect(JSON.stringify(persisted)).not.toContain(CONFIG.secretKey);
  });

  it('forgets everything on clear', () => {
    saveSharedConnection(CONFIG);

    clearSharedConnection();

    expect(session.getItem('sparcd-connection-tab')).toBeNull();
    expect(local.getItem('sparcd-connection')).toBeNull();
    expect(loadSessionConnection()).toBeNull();
    expect(getLiveConnection()).toBeNull();
  });

  it('reports no session when the tab has none', () => {
    expect(loadSessionConnection()).toBeNull();
  });
});
