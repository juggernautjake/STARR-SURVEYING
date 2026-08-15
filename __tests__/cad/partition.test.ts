// C29 — split a parcel to a target area.
//
// C27 called this "the classic reason a surveyor opens a calculator at all" and found nothing in
// the product that could do it. "Cut me one acre off the north end" arrives on the phone, and
// answering it by hand means guessing a line, computing the area, and guessing again.
//
// ── WHAT THESE TESTS ARE REALLY CHECKING ────────────────────────────────────────────────────────
//
// Bisection is sound here **only because the area on one side of a sweeping line is monotonic in
// how far it has swept**. Without monotonicity, bisection converges on whatever root it happens to
// bracket and reports it with the same confidence. So monotonicity is asserted rather than assumed,
// and the achieved area is checked against the target on shapes where a closed-form solution would
// have quietly stopped applying: a concave parcel, and a cut crossing more than two edges.

import { describe, it, expect } from 'vitest';
import {
  polygonArea,
  clipToHalfPlane,
  partitionByDirection,
  partitionFromHinge,
} from '@/lib/cad/geometry/partition';
import type { Point2D } from '@/lib/cad/types';

/** 100 × 100 square, counter-clockwise, origin at the SW corner. 10,000 sq ft. */
const SQUARE: Point2D[] = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
];

/** An L: the NE quadrant is notched out. 10,000 − 2,500 = 7,500 sq ft. */
const ELL: Point2D[] = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 },
  { x: 50, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 100 },
];

describe('area', () => {
  it('is orientation-independent', () => {
    expect(polygonArea(SQUARE)).toBeCloseTo(10000, 9);
    expect(polygonArea([...SQUARE].reverse())).toBeCloseTo(10000, 9);
  });

  it('handles a concave ring', () => {
    expect(polygonArea(ELL)).toBeCloseTo(7500, 9);
  });

  it('is zero for something that is not a polygon', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });
});

describe('half-plane clip', () => {
  it('keeps the LEFT of the direction of travel', () => {
    // Same sign convention as `stakeout.ts`, so the two modules cannot disagree about which side
    // is which. A flipped sign returns the complement — exactly as plausible and exactly wrong.
    // Travelling EAST from (0, 50): left is NORTH, so the top half survives.
    const kept = clipToHalfPlane(SQUARE, { x: 0, y: 50 }, { x: 1, y: 0 });
    expect(polygonArea(kept)).toBeCloseTo(5000, 6);
    expect(Math.min(...kept.map((p) => p.y))).toBeCloseTo(50, 6);
  });

  it('reverses with the direction', () => {
    const kept = clipToHalfPlane(SQUARE, { x: 0, y: 50 }, { x: -1, y: 0 });
    expect(Math.max(...kept.map((p) => p.y))).toBeCloseTo(50, 6);
  });

  it('returns the whole polygon when it is entirely on the keep side', () => {
    // Travelling EAST along y = −500, the square (y 0..100) is to the NORTH, i.e. left, i.e. kept.
    expect(polygonArea(clipToHalfPlane(SQUARE, { x: 0, y: -500 }, { x: 1, y: 0 }))).toBeCloseTo(10000, 6);
  });

  it('returns nothing when it is entirely on the discard side', () => {
    // Same cut moved north of the parcel: now the square is to the RIGHT of travel.
    expect(polygonArea(clipToHalfPlane(SQUARE, { x: 0, y: 500 }, { x: 1, y: 0 }))).toBe(0);
  });
});

describe('the monotonicity bisection depends on', () => {
  it('area grows without ever reversing as the cut sweeps', () => {
    // The justification for the whole method. If this were not monotonic, bisection would converge
    // on whatever root it bracketed and report it with the same confidence as the right one.
    for (const poly of [SQUARE, ELL]) {
      let prev = -1;
      for (let d = -10; d <= 110; d += 2) {
        const kept = clipToHalfPlane(poly, { x: 0, y: d }, { x: -1, y: 0 });
        const a = polygonArea(kept);
        expect(a).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = a;
      }
      expect(prev).toBeCloseTo(polygonArea(poly), 6);
    }
  });
});

describe('partition by direction', () => {
  it('cuts a square to an exact area', () => {
    const r = partitionByDirection(SQUARE, 2500, 90)!;
    expect(r).not.toBeNull();
    expect(r.achievedArea).toBeCloseTo(2500, 5);
    expect(Math.abs(r.error)).toBeLessThan(1e-5);
  });

  it('reports the area it ACHIEVED, not the one it was asked for', () => {
    // A partition that echoes the target back is useless for the one thing it exists for. These
    // are computed from the returned polygon, independently of the solver's own bookkeeping.
    const r = partitionByDirection(SQUARE, 3333, 45)!;
    expect(polygonArea(r.keptPolygon)).toBeCloseTo(r.achievedArea, 6);
    expect(r.error).toBeCloseTo(r.achievedArea - 3333, 9);
  });

  it('works on a CONCAVE parcel, where a closed form stops applying', () => {
    const r = partitionByDirection(ELL, 2000, 90)!;
    expect(polygonArea(r.keptPolygon)).toBeCloseTo(2000, 5);
  });

  it('works when the cut crosses more than two edges', () => {
    // The other case a quadrilateral formula silently cannot handle.
    const r = partitionByDirection(ELL, 5000, 45)!;
    expect(polygonArea(r.keptPolygon)).toBeCloseTo(5000, 5);
  });

  it('handles any bearing', () => {
    for (const az of [0, 30, 90, 137.5, 180, 270, 359]) {
      const r = partitionByDirection(SQUARE, 4000, az);
      expect(r, `azimuth ${az}`).not.toBeNull();
      expect(polygonArea(r!.keptPolygon), `azimuth ${az}`).toBeCloseTo(4000, 4);
    }
  });

  it('returns a cut line that fully crosses the parcel', () => {
    // A cut that stops at the mathematical intersection is hard to snap to and impossible to
    // extend by eye.
    const r = partitionByDirection(SQUARE, 2500, 90)!;
    const len = Math.hypot(r.cutLine[1].x - r.cutLine[0].x, r.cutLine[1].y - r.cutLine[0].y);
    expect(len).toBeGreaterThan(100);
  });

  it('refuses a target the parcel cannot supply', () => {
    // Two acres out of one is a mistake, and returning the whole parcel with a quiet 1-acre error
    // would let it through into a deed.
    expect(partitionByDirection(SQUARE, 0, 90)).toBeNull();
    expect(partitionByDirection(SQUARE, -5, 90)).toBeNull();
    expect(partitionByDirection(SQUARE, 10000, 90)).toBeNull();
    expect(partitionByDirection(SQUARE, 20000, 90)).toBeNull();
  });

  it('refuses something that is not a parcel', () => {
    expect(partitionByDirection([{ x: 0, y: 0 }, { x: 1, y: 1 }], 1, 90)).toBeNull();
  });

  it('converges quickly', () => {
    // Bisection over a bounded span: ~50 halvings reaches float precision. A result needing the
    // full budget would mean the bracket or the monotonicity assumption is wrong.
    expect(partitionByDirection(SQUARE, 2500, 90)!.iterations).toBeLessThan(60);
  });

  it('the two pieces add up to the parcel', () => {
    // The check that catches a clip which drops or duplicates a vertex — the piece can be the right
    // area while the remainder is not the rest of the parcel.
    const r = partitionByDirection(ELL, 3000, 20)!;
    const other = clipToHalfPlane(
      ELL,
      r.cutLine[0],
      { x: r.cutLine[0].x - r.cutLine[1].x, y: r.cutLine[0].y - r.cutLine[1].y },
    );
    expect(r.achievedArea + polygonArea(other)).toBeCloseTo(polygonArea(ELL), 4);
  });
});

describe('partition hinged at a point', () => {
  it('cuts to an exact area from a corner', () => {
    // How the request actually arrives: "one acre off the north end, hinged at the existing corner
    // monument" — the cut has to start somewhere a crew can find.
    const r = partitionFromHinge(SQUARE, { x: 0, y: 0 }, 2500)!;
    expect(r).not.toBeNull();
    expect(polygonArea(r.keptPolygon)).toBeCloseTo(2500, 4);
  });

  it('starts the cut AT the hinge', () => {
    const hinge = { x: 0, y: 100 };
    const r = partitionFromHinge(SQUARE, hinge, 3000)!;
    expect(r.cutLine[0]).toEqual(hinge);
  });

  it('works from a hinge partway along an edge', () => {
    const r = partitionFromHinge(SQUARE, { x: 40, y: 0 }, 3500)!;
    expect(polygonArea(r.keptPolygon)).toBeCloseTo(3500, 4);
  });

  it('works on a concave parcel', () => {
    const r = partitionFromHinge(ELL, { x: 0, y: 0 }, 2500);
    expect(r).not.toBeNull();
    expect(polygonArea(r!.keptPolygon)).toBeCloseTo(2500, 4);
  });

  it('works from a hinge OUTSIDE the parcel', () => {
    // My first expectation here was that this should fail. It should not: a line through a point
    // well off the parcel still cuts it, and every area from 0 to the total remains reachable as
    // that line rotates. Asserting the truthful behaviour instead of the guess.
    const r = partitionFromHinge(SQUARE, { x: 500, y: 500 }, 2500)!;
    expect(r).not.toBeNull();
    expect(polygonArea(r.keptPolygon)).toBeCloseTo(2500, 4);
    expect(r.cutLine[0]).toEqual({ x: 500, y: 500 });
  });

  it('finds a cut a half-turn bracket would have missed', () => {
    // The bug the sweep replaced. Hinged at (40, 0): bearing 0 keeps 4,000 and bearing 180 keeps
    // 6,000, so an endpoint-only bracket declares 3,500 unreachable — while bearing 270 keeps
    // nothing and bearing 90 keeps everything, so 3,500 plainly exists.
    const r = partitionFromHinge(SQUARE, { x: 40, y: 0 }, 3500)!;
    expect(r).not.toBeNull();
    expect(polygonArea(r.keptPolygon)).toBeCloseTo(3500, 4);
  });

  it('refuses an impossible target', () => {
    expect(partitionFromHinge(SQUARE, { x: 0, y: 0 }, 0)).toBeNull();
    expect(partitionFromHinge(SQUARE, { x: 0, y: 0 }, 99999)).toBeNull();
  });
});
