// __tests__/cad/geometry/solver.test.ts — point-from-constraints
import { describe, it, expect } from 'vitest';
import {
  calcFourthParallelogramCorner,
  calcPointFromBearingDistance,
  calcPointFromTwoBearings,
  calcPointFromBearingAndLine,
  calcPointParallelToLine,
} from '@/lib/cad/geometry/solver';

const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('calcFourthParallelogramCorner', () => {
  it('completes a unit square', () => {
    // Corners (0,0), (1,0), (1,1), (0,1); missing is (0,1).
    // Adjacent corners: (0,0) and (1,1). Opposite to missing: (1,0).
    const r = calcFourthParallelogramCorner({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      close(r.point.x, 0);
      close(r.point.y, 1);
    }
  });

  it('completes a slanted parallelogram', () => {
    // Corners (0,0), (5,0), (6,3), (1,3). Missing (1,3).
    // Adjacent: (0,0) and (6,3). Opposite to missing: (5,0).
    const r = calcFourthParallelogramCorner({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      close(r.point.x, 1);
      close(r.point.y, 3);
    }
  });

  it('rejects coincident corners', () => {
    const r = calcFourthParallelogramCorner({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 });
    expect(r.ok).toBe(false);
  });
});

describe('calcPointFromBearingDistance', () => {
  it('north 100 ft from origin', () => {
    const r = calcPointFromBearingDistance({ x: 0, y: 0 }, 0, 100);
    expect(r.ok).toBe(true);
    if (r.ok) {
      close(r.point.x, 0);
      close(r.point.y, 100);
    }
  });

  it('east 50 ft from origin', () => {
    const r = calcPointFromBearingDistance({ x: 0, y: 0 }, 90, 50);
    expect(r.ok).toBe(true);
    if (r.ok) {
      close(r.point.x, 50);
      close(r.point.y, 0);
    }
  });

  it('rejects negative distance', () => {
    const r = calcPointFromBearingDistance({ x: 0, y: 0 }, 0, -1);
    expect(r.ok).toBe(false);
  });

  it('rejects NaN bearing', () => {
    const r = calcPointFromBearingDistance({ x: 0, y: 0 }, NaN, 1);
    expect(r.ok).toBe(false);
  });
});

describe('calcPointFromTwoBearings', () => {
  it('finds the intersection of two perpendicular rays', () => {
    // Origin A at (0,0) heading East (azimuth 90), origin B at
    // (0,10) heading South (azimuth 180). Intersect at (0,?) — wait,
    // azimuth 90 from (0,0) is along y=0 going east, azimuth 180
    // from (0,10) goes south along x=0 — they meet at (0,0).
    // Use less degenerate setup: A (0,0) east, B (10,5) south →
    // meet at (10,0).
    const r = calcPointFromTwoBearings(
      { x: 0, y: 0 }, 90,
      { x: 10, y: 5 }, 180,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      close(r.point.x, 10);
      close(r.point.y, 0);
    }
  });

  it('rejects parallel bearings', () => {
    const r = calcPointFromTwoBearings(
      { x: 0, y: 0 }, 45,
      { x: 5, y: 5 }, 45,
    );
    expect(r.ok).toBe(false);
  });
});

describe('calcPointFromBearingAndLine', () => {
  it('intersects ray with reference line', () => {
    // Ray from (0,0) heading NE (azimuth 45°); reference line
    // from (10,0) to (10,10). Should hit at (10,10).
    const r = calcPointFromBearingAndLine(
      { x: 0, y: 0 }, 45,
      { x: 10, y: 0 }, { x: 10, y: 10 },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      close(r.point.x, 10);
      close(r.point.y, 10);
    }
  });

  it('rejects bearing parallel to line', () => {
    const r = calcPointFromBearingAndLine(
      { x: 0, y: 0 }, 0, // due North
      { x: 5, y: 0 }, { x: 5, y: 10 }, // also due North
    );
    expect(r.ok).toBe(false);
  });

  it('rejects zero-length reference line', () => {
    const r = calcPointFromBearingAndLine(
      { x: 0, y: 0 }, 45,
      { x: 5, y: 5 }, { x: 5, y: 5 },
    );
    expect(r.ok).toBe(false);
  });
});

describe('calcPointParallelToLine', () => {
  it('right-offset of an east-heading reference is south', () => {
    // Reference (0,0) → (10,0) heads East. Right is South.
    // Origin at (5,0), perpendicular distance 3, along 0.
    // Expected: (5, -3).
    const r = calcPointParallelToLine(
      { x: 5, y: 0 },
      { x: 0, y: 0 }, { x: 10, y: 0 },
      3, 'RIGHT',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      close(r.point.x, 5);
      close(r.point.y, -3);
    }
  });

  it('left-offset of a north-heading reference is west', () => {
    // Reference (0,0) → (0,10) heads North. Left is West.
    // Origin at (0,5), perpendicular distance 3, along 0.
    // Expected: (-3, 5).
    const r = calcPointParallelToLine(
      { x: 0, y: 5 },
      { x: 0, y: 0 }, { x: 0, y: 10 },
      3, 'LEFT',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      close(r.point.x, -3);
      close(r.point.y, 5);
    }
  });

  it('along-distance shifts the result down the parallel', () => {
    // Reference east; right offset 0; along distance 4 from origin
    // (0,0) means we slide 4 units east.
    const r = calcPointParallelToLine(
      { x: 0, y: 0 },
      { x: 0, y: 0 }, { x: 10, y: 0 },
      0, 'RIGHT', 4,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      close(r.point.x, 4);
      close(r.point.y, 0);
    }
  });

  it('rejects degenerate reference line', () => {
    const r = calcPointParallelToLine(
      { x: 0, y: 0 },
      { x: 5, y: 5 }, { x: 5, y: 5 },
      1, 'RIGHT',
    );
    expect(r.ok).toBe(false);
  });
});
