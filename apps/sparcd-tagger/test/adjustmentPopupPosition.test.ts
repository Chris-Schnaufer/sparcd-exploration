import { expect, it } from 'vitest';
import { adjustmentPopupPosition } from '../src/lib/adjustmentPopupPosition';

it('uses the right side when the left side is constrained', () => {
  expect(adjustmentPopupPosition({ left: 10, right: 250, top: 40, width: 240, height: 180 }, { left: 0, right: 224, top: 0, width: 224, height: 260 }, { width: 800, height: 600 }).left).toBe(262);
});

it('prefers the left side when it fits', () => {
  expect(adjustmentPopupPosition({ left: 400, right: 640, top: 40, width: 240, height: 180 }, { left: 0, right: 224, top: 0, width: 224, height: 260 }, { width: 800, height: 600 })).toEqual({ left: 164, top: 40 });
});

it('uses the clamped side with the least media overlap when neither side fits', () => {
  const position = adjustmentPopupPosition(
    { left: 70, right: 220, top: 40, width: 150, height: 180 },
    { left: 0, right: 224, top: 0, width: 224, height: 260 },
    { width: 320, height: 600 },
  );
  expect(position.left).toBe(88);
});

it('keeps a short viewport placement inside its gutters', () => {
  expect(adjustmentPopupPosition(
    { left: 300, right: 540, top: 120, width: 240, height: 180 },
    { left: 0, right: 224, top: 0, width: 224, height: 134 },
    { width: 800, height: 150 },
  ).top).toBe(8);
});
