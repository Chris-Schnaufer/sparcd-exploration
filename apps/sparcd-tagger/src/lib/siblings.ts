// Sibling-tool URLs derived from this tool's own base path, the same way
// BrandSwitcher's `siblingTools()` does it, so the same code works in dev and
// on GitHub Pages. BASE_URL '/sparcd-exploration/tagger/' → family root
// '/sparcd-exploration/' → the uploader at '/sparcd-exploration/uploader/'.

const familyRoot = (): string => (import.meta.env.BASE_URL || '/').replace(/[^/]+\/$/, '');

/** The path the uploader is served from. */
export const uploaderPath = (): string => `${familyRoot()}uploader/`;

/**
 * Where the Done button is allowed to go.
 *
 * A hand-off record is read out of a database every page on this origin can
 * write, so its `returnUrl` is not trusted input — taken at face value it would
 * turn Done into an open redirect. Anything that is not the uploader is replaced
 * by the sibling URL derived from our own base path.
 *
 * In dev the uploader runs on a different port; VITE_UPLOADER_ORIGIN pins that
 * port so root-relative return URLs resolve to the correct dev server. In
 * production the variable is absent and `origin` (shared origin) is used.
 */
export function safeReturnUrl(returnUrl: string, origin: string): string {
  const uploaderOrigin = import.meta.env.VITE_UPLOADER_ORIGIN ?? origin;
  const path = uploaderPath();
  const fallback = `${uploaderOrigin}${path}`;
  let url: URL;
  try {
    url = new URL(returnUrl, uploaderOrigin);
  } catch {
    return fallback;
  }
  if (url.origin !== uploaderOrigin) return fallback;
  if (!url.pathname.startsWith(path)) return fallback;
  return url.href;
}
