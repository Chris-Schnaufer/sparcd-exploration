export type Rect = { left: number; right: number; top: number; width: number; height: number };

export function adjustmentPopupPosition(media: Rect, panel: Rect, viewport: { width: number; height: number }) {
  const gutter = 8;
  const top = Math.max(gutter, Math.min(media.top, viewport.height - panel.height - gutter));
  const left = media.left - panel.width - 12;
  if (left >= gutter) return { left, top };
  const right = media.right + 12;
  if (right + panel.width <= viewport.width - gutter) return { left: right, top };
  return { left: gutter, top };
}
