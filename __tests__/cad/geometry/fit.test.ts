// __tests__/cad/geometry/fit.test.ts
import { describe, it, expect } from 'vitest';
import { fitOrientedRectangle, fitCircle, fitLine, convexHull } from '@/lib/cad/geometry/fit';
import type { Point2D } from '@/lib/cad/types';

const area = (c: Point2D[]) => {
  let a = 0;
  for (let i = 0; i < c.length; i++) { const p = c[i], q = c[(i + 1) % c.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
};
const sideLen = (a: Point2D, b: Point2D) => Math.hypot(b.x - a.x, b.y - a.y);

describe('fitOrientedRectangle', () => {
  it('recovers an axis-aligned square', () => {
    const c = fitOrientedRectangle([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])!;
    expect(area(c)).toBeCloseTo(100, 4);
  });

  it('recovers the true orientation of a ROTATED square (min-area, not PCA)', () => {
    // Unit square rotated 30° about origin.
    const t = (Math.PI / 180) * 30;
    const rot = (p: Point2D): Point2D => ({ x: p.x * Math.cos(t) - p.y * Math.sin(t), y: p.x * Math.sin(t) + p.y * Math.cos(t) });
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }].map(rot);
    const c = fitOrientedRectangle(sq)!;
    expect(area(c)).toBeCloseTo(100, 2);   // tight fit, not the larger AABB (~186)
    // all four sides ≈ 10 (it's a square)
    for (let i = 0; i < 4; i++) expect(sideLen(c[i], c[(i + 1) % 4])).toBeCloseTo(10, 2);
  });
});

describe('fitCircle', () => {
  it('fits a circle through points sampled on a known circle', () => {
    const cx = 5, cy = -3, r = 7;
    const pts: Point2D[] = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
    const fit = fitCircle(pts)!;
    expect(fit.center.x).toBeCloseTo(cx, 4);
    expect(fit.center.y).toBeCloseTo(cy, 4);
    expect(fit.radius).toBeCloseTo(r, 4);
  });
});

describe('fitLine', () => {
  it('fits a line through near-collinear points', () => {
    const pts: Point2D[] = [{ x: 0, y: 0 }, { x: 10, y: 10.1 }, { x: 20, y: 19.9 }, { x: 30, y: 30 }];
    const { start, end } = fitLine(pts)!;
    // direction ≈ 45°
    const ang = Math.atan2(end.y - start.y, end.x - start.x);
    expect(Math.abs(ang)).toBeCloseTo(Math.PI / 4, 1);
  });
});

describe('convexHull', () => {
  it('drops interior points', () => {
    const hull = convexHull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }]);
    expect(hull).toHaveLength(4);
  });
});
