// __tests__/cad/geometry/spline-closure.test.ts
import { describe, it, expect } from 'vitest';
import { fitPointsToBezier } from '@/lib/cad/geometry/curve-render';
import type { Point2D } from '@/lib/cad/types';

const square: Point2D[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

const norm = (p: Point2D) => {
  const l = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / l, y: p.y / l };
};

describe('fitPointsToBezier closure', () => {
  it('open fit produces n-1 segments and no wrap', () => {
    const cps = fitPointsToBezier(square, false);
    // 3 segments → 1 + 3*3 = 10 control points
    expect(cps).toHaveLength(10);
    // ends at the last fit point, not back at the start
    expect(cps[cps.length - 1]).toEqual({ x: 0, y: 10 });
  });

  it('closed fit adds the wrap-around segment back to the start', () => {
    const cps = fitPointsToBezier(square, true);
    // 4 segments → 1 + 3*4 = 13 control points
    expect(cps).toHaveLength(13);
    // last control point returns to the first fit point
    expect(cps[cps.length - 1]).toEqual({ x: 0, y: 0 });
  });

  it('is tangent-continuous (C1) across the closing joint', () => {
    const cps = fitPointsToBezier(square, true);
    const p0 = cps[0];
    const cp1First = cps[1];                 // outgoing handle at start
    const cp2Last = cps[cps.length - 2];     // incoming handle into start
    const outgoing = norm({ x: cp1First.x - p0.x, y: cp1First.y - p0.y });
    const incoming = norm({ x: p0.x - cp2Last.x, y: p0.y - cp2Last.y });
    // Same direction → smooth transition (cross ≈ 0, dot ≈ 1).
    const cross = outgoing.x * incoming.y - outgoing.y * incoming.x;
    const dot = outgoing.x * incoming.x + outgoing.y * incoming.y;
    expect(Math.abs(cross)).toBeLessThan(1e-9);
    expect(dot).toBeGreaterThan(0.999);
  });
});
