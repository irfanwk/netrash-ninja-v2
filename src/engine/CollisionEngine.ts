import type { BladePoint, GameMode, PlayerSide } from '../types/game';

export const MAX_POINT_CONNECT_DISTANCE = 160;

/**
 * Checks if a line segment between (x1, y1) and (x2, y2) intersects a circle centered at (cx, cy) with radius r.
 */
export function checkLineCircleIntersect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  r: number
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return (cx - x1) * (cx - x1) + (cy - y1) * (cy - y1) <= r * r;
  }

  // Projection scalar t onto the segment clamped between [0, 1]
  const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / lenSq));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;

  const distSq = (cx - qx) * (cx - qx) + (cy - qy) * (cy - qy);
  return distSq <= r * r;
}

/**
 * Validates whether two consecutive pointer points can form a valid slice stroke.
 * Rejects jumps greater than MAX_POINT_CONNECT_DISTANCE to prevent cross-hand rope/tripwire bugs.
 */
export function isValidSliceSegment(p1: BladePoint, p2: BladePoint): boolean {
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  return dist > 0 && dist <= MAX_POINT_CONNECT_DISTANCE;
}

/**
 * Verifies if player is allowed to slice an item based on territorial side partition.
 */
export function canPlayerSliceItem(
  player: PlayerSide,
  itemSide: PlayerSide,
  gameMode: GameMode
): boolean {
  if (gameMode === 'SOLO') {
    return true;
  }
  return player === itemSide;
}
