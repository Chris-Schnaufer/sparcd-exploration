export type Rect = { left: number; right: number; top: number; width: number; height: number };

export function adjustmentPopupPosition(media: Rect, panel: Rect, viewport: { width: number; height: number }) {
  const gutter = 8;
  const gap = 12;
  const maxLeft = Math.max(gutter, viewport.width - panel.width - gutter);
  const top = Math.max(gutter, Math.min(media.top, viewport.height - panel.height - gutter));
  const left = media.left - panel.width - gap;
  if (left >= gutter) return { left, top };
  const right = media.right + gap;
  if (right <= maxLeft) return { left: right, top };

  // Neither side fits. Clamp both candidates and use the one which obscures the
  // least of the focused media. Keeping the left candidate first preserves the
  // preferred left-side placement for an exact tie.
  const candidates = [Math.max(gutter, Math.min(left, maxLeft)), Math.max(gutter, Math.min(right, maxLeft))];
  const mediaBottom = media.top + media.height;
  const panelBottom = top + panel.height;
  const verticalOverlap = Math.max(0, Math.min(panelBottom, mediaBottom) - Math.max(top, media.top));
  const overlap = (candidate: number) =>
    Math.max(0, Math.min(candidate + panel.width, media.right) - Math.max(candidate, media.left)) * verticalOverlap;
  return { left: candidates.reduce((best, candidate) => overlap(candidate) < overlap(best) ? candidate : best), top };
}
