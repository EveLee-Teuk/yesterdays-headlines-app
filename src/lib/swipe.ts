export type SwipeDirection = -1 | 1;
export type SwipeAxis = 'pending' | 'horizontal' | 'vertical';

const INTENT_DISTANCE = 12;
const PAGE_DISTANCE = 56;
const AXIS_RATIO = 1.4;

/** Wait for a clear direction so a diagonal start remains ordinary scrolling. */
export function getSwipeAxis(dx: number, dy: number): SwipeAxis {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 'pending';
  const x = Math.abs(dx);
  const y = Math.abs(dy);
  if (x >= INTENT_DISTANCE && x > y * AXIS_RATIO) return 'horizontal';
  if (y >= INTENT_DISTANCE && y > x * AXIS_RATIO) return 'vertical';
  return 'pending';
}

/** Physical left = next page; physical right = previous page. */
export function getSwipeDirection(dx: number, dy: number): SwipeDirection | null {
  if (Math.abs(dx) < PAGE_DISTANCE || getSwipeAxis(dx, dy) !== 'horizontal') return null;
  return dx < 0 ? 1 : -1;
}
