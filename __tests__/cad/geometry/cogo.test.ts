import { describe, it, expect } from 'vitest';
import {
  distDistPoints,
  brgDistPoints,
  brgBrgPoint,
  computeCogoSolutions,
} from '@/lib/cad/geometry/cogo';
import type { Point2D } from '@/lib/cad/types';

const p = (x: number, y: number): Point2D => ({ x, y });
const near = (a: Point2D, b: Point2D, eps = 1e-6) =>
  Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
const hasPoint = (list: Point2D[], t: Point2D) => list.some((q) => near(q, t));

describe('distDistPoints (distance–distance)', () => {
  it('returns the two circle intersections', () => {
    // A=(0,0), B=(10,0); r = √50 from each → (5, ±5).
    const r = Math.hypot(5, 5);
    const sol = distDistPoints(p(0, 0), r, p(10, 0), r);
    expect(sol).toHaveLength(2);
    expect(hasPoint(sol, p(5, 5))).toBe(true);
    expect(hasPoint(sol, p(5, -5))).toBe(true);
  });

  it('returns one point when the circles are tangent', () => {
    const sol = distDistPoints(p(0, 0), 5, p(10, 0), 5);
    expect(sol).toHaveLength(1);
    expect(near(sol[0], p(5, 0))).toBe(true);
  });

  it('returns none when the circles are too far apart', () => {
    expect(distDistPoints(p(0, 0), 2, p(10, 0), 2)).toHaveLength(0);
  });

  it('rejects non-positive distances', () => {
    expect(distDistPoints(p(0, 0), 0, p(10, 0), 5)).toHaveLength(0);
    expect(distDistPoints(p(0, 0), NaN, p(10, 0), 5)).toHaveLength(0);
  });
});

describe('brgDistPoints (bearing–distance)', () => {
  it('intersects a bearing ray with a distance circle, nearest first', () => {
    // Ray due North from origin; circle center (0,10) r=5 → (0,5) then (0,15).
    const sol = brgDistPoints(p(0, 0), 0, p(0, 10), 5);
    expect(sol).toHaveLength(2);
    expect(near(sol[0], p(0, 5))).toBe(true);
    expect(near(sol[1], p(0, 15))).toBe(true);
  });

  it('excludes hits behind the ray origin', () => {
    // Ray due North from origin; circle center (0,-10) r=5 is entirely behind.
    expect(brgDistPoints(p(0, 0), 0, p(0, -10), 5)).toHaveLength(0);
  });
});

describe('brgBrgPoint (bearing–bearing)', () => {
  it('finds the forward intersection of two bearing rays', () => {
    // A=(0,0) NE (az 45) and B=(10,0) NW (az 315) meet at (5,5).
    const sol = brgBrgPoint(p(0, 0), 45, p(10, 0), 315);
    expect(sol).toHaveLength(1);
    expect(near(sol[0], p(5, 5))).toBe(true);
  });

  it('returns none for parallel bearings', () => {
    expect(brgBrgPoint(p(0, 0), 45, p(10, 0), 45)).toHaveLength(0);
  });

  it('returns none when the rays only meet behind a station', () => {
    // Same crossing geometry but both bearings reversed → intersection is
    // behind both origins.
    expect(brgBrgPoint(p(0, 0), 225, p(10, 0), 135)).toHaveLength(0);
  });
});

describe('computeCogoSolutions dispatch', () => {
  it('routes each method and guards missing inputs', () => {
    const r = Math.hypot(5, 5);
    expect(computeCogoSolutions({ method: 'DIST_DIST', a: p(0, 0), b: p(10, 0), distA: r, distB: r })).toHaveLength(2);
    expect(computeCogoSolutions({ method: 'BRG_DIST', a: p(0, 0), b: p(0, 10), azA: 0, distB: 5 })).toHaveLength(2);
    expect(computeCogoSolutions({ method: 'BRG_BRG', a: p(0, 0), b: p(10, 0), azA: 45, azB: 315 })).toHaveLength(1);
    // Missing inputs → no solution, no throw.
    expect(computeCogoSolutions({ method: 'DIST_DIST', a: p(0, 0), b: p(10, 0) })).toHaveLength(0);
    expect(computeCogoSolutions({ method: 'BRG_BRG', a: p(0, 0), b: p(10, 0), azA: 45 })).toHaveLength(0);
  });
});
