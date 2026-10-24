import { describe, it, expect } from 'vitest';
import {
  checkLineCircleIntersect,
  isValidSliceSegment,
  canPlayerSliceItem,
} from '../CollisionEngine';

describe('CollisionEngine', () => {
  it('detects line passing straight through circle center', () => {
    const hits = checkLineCircleIntersect(0, 50, 100, 50, 50, 50, 20);
    expect(hits).toBe(true);
  });

  it('detects circle tangent touch', () => {
    const hits = checkLineCircleIntersect(0, 0, 100, 0, 50, 20, 20);
    expect(hits).toBe(true);
  });

  it('rejects line that misses circle', () => {
    const hits = checkLineCircleIntersect(0, 0, 100, 0, 50, 50, 20);
    expect(hits).toBe(false);
  });

  it('rejects points farther than MAX_POINT_CONNECT_DISTANCE to prevent rope bug', () => {
    const p1 = { x: 100, y: 100, time: 1000 };
    const p2Close = { x: 150, y: 100, time: 1016 }; // 50px
    const p2Far = { x: 350, y: 100, time: 1016 }; // 250px > 160px

    expect(isValidSliceSegment(p1, p2Close)).toBe(true);
    expect(isValidSliceSegment(p1, p2Far)).toBe(false);
  });

  it('enforces territorial rules in VERSUS mode', () => {
    expect(canPlayerSliceItem('P1', 'P1', 'VERSUS')).toBe(true);
    expect(canPlayerSliceItem('P1', 'P2', 'VERSUS')).toBe(false);
    expect(canPlayerSliceItem('P2', 'P1', 'VERSUS')).toBe(false);
    expect(canPlayerSliceItem('P2', 'P2', 'VERSUS')).toBe(true);
  });

  it('allows any slice in SOLO mode', () => {
    expect(canPlayerSliceItem('SOLO', 'SOLO', 'SOLO')).toBe(true);
    expect(canPlayerSliceItem('P1', 'P2', 'SOLO')).toBe(true);
  });
});
