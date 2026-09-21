import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectionChip } from '@sparcd/auth-ui';

const ACCESS_KEY = 'AKIAEXAMPLE1234567890';

vi.mock('../../../packages/auth-ui/src/session', () => ({
  getLiveConnection: () => ({
    endpoint: 'https://sparcd-quic-proxy-03.bio260073.projects.jetstream-cloud.org:9000',
    accessKey: ACCESS_KEY,
  }),
  loadPersistedConnection: () => null,
  subscribeSharedConnection: () => () => {},
}));

const markup = (identity?: string) =>
  renderToStaticMarkup(<ConnectionChip identity={identity} onDisconnect={() => {}} />);

describe('ConnectionChip', () => {
  it('never prints the raw access key when the identity is just the key', () => {
    const html = markup(ACCESS_KEY);
    expect(html).not.toContain(ACCESS_KEY);
    expect(html).toContain('AK…90');
  });

  it('shows an identity that is a real name', () => {
    expect(markup('schnaufer')).toContain('schnaufer');
  });

  it('puts the full host in a title so a truncated one stays readable', () => {
    expect(markup()).toContain(
      'title="sparcd-quic-proxy-03.bio260073.projects.jetstream-cloud.org"',
    );
  });
});
