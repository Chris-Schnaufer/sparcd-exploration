import { expect, it } from 'vitest';
import { adjustmentPopupPosition } from '../src/lib/adjustmentPopupPosition';

it('uses the right side when the left side is constrained', () => {
  expect(adjustmentPopupPosition({ left: 10, right: 250, top: 40, width: 240, height: 180 }, { left: 0, right: 224, top: 0, width: 224, height: 260 }, { width: 800, height: 600 }).left).toBe(262);
});
