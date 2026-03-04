// __tests__/cad/geometry/curve.test.ts — Unit tests for circular curve calculator
import { describe, it, expect } from 'vitest';
import {
  computeCurve,
  crossValidateCurve,
  circleThrough3Points,
} from '@/lib/cad/geometry/curve';

const DEG = Math.PI / 180;

// ── computeCurve ──────────────────────────────────────────────────────────────

describe('computeCurve: R=500, Δ=30°', () => {
  const result = computeCurve({ R: 500, delta: 30 });

  it('returns a non-null result', () => {
    expect(result).not.toBeNull();
  });

  it('arc length L ≈ 261.80', () => {
    expect(result!.L).toBeCloseTo(261.80, 1);
  });

  it('chord length C ≈ 258.82', () => {
    expect(result!.C).toBeCloseTo(258.82, 1);
  });

  it('tangent T ≈ 133.97', () => {
    expect(result!.T).toBeCloseTo(133.97, 1);
  });

  it('external E ≈ 17.64', () => {
    expect(result!.E).toBeCloseTo(17.64, 1);
  });

  it('mid-ordinate M ≈ 17.04', () => {
    // M = R(1 - cos(Δ/2)) = 500(1 - cos(15°)) ≈ 17.04
    expect(result!.M).toBeCloseTo(17.04, 1);
  });
});

// ── Degree of curve ───────────────────────────────────────────────────────────

describe('computeCurve: degree of curve', () => {
  it('R=500 → D ≈ 11.459', () => {
    const result = computeCurve({ R: 500, delta: 30 });
    expect(result!.D).toBeCloseTo(11.459, 2);
  });

  it('compute from D instead of R', () => {
    const D = 5729.578 / 500;
    const result = computeCurve({ D, delta: 30 });
    expect(result).not.toBeNull();
    expect(result!.R).toBeCloseTo(500, 1);
  });
});

// ── Reverse solve: R + L → Δ ─────────────────────────────────────────────────

describe('computeCurve: reverse solve R + L', () => {
  it('R=500, L=261.80 → Δ ≈ 30°', () => {
    const result = computeCurve({ R: 500, L: 261.80 });
    expect(result).not.toBeNull();
    expect(result!.delta * (180 / Math.PI)).toBeCloseTo(30, 1);
  });

  it('R=500, L=261.80 → C ≈ 258.82', () => {
    const result = computeCurve({ R: 500, L: 261.80 });
    expect(result!.C).toBeCloseTo(258.82, 1);
  });
});

// ── returns null for insufficient input ───────────────────────────────────────

describe('computeCurve: edge cases', () => {
  it('returns null with only R and no angle/length', () => {
    expect(computeCurve({ R: 500 })).toBeNull();
  });

  it('returns null with R=0', () => {
    expect(computeCurve({ R: 0, delta: 30 })).toBeNull();
  });
});

// ── 3-point method ────────────────────────────────────────────────────────────

describe('computeCurve: 3-point method', () => {
  // Three points on a circle of radius 500 centered at origin
  const R = 500;
  const p1 = { x: R * Math.sin(-15 * DEG), y: R * Math.cos(-15 * DEG) };
  const p2 = { x: R * Math.sin(0),         y: R * Math.cos(0) };
  const p3 = { x: R * Math.sin(15 * DEG),  y: R * Math.cos(15 * DEG) };

  it('recovers radius ≈ 500', () => {
    const result = computeCurve({ point1: p1, point2: p2, point3: p3 });
    expect(result).not.toBeNull();
    expect(result!.R).toBeCloseTo(500, 0);
  });

  it('recovers central angle ≈ 30°', () => {
    const result = computeCurve({ point1: p1, point2: p2, point3: p3 });
    expect(result!.delta * (180 / Math.PI)).toBeCloseTo(30, 1);
  });
});

// ── circleThrough3Points ──────────────────────────────────────────────────────

describe('circleThrough3Points', () => {
  it('three points on a circle of R=100 centered at (0,0)', () => {
    const circle = circleThrough3Points(
      { x: 100, y: 0 },
      { x: 0, y: 100 },
      { x: -100, y: 0 },
    );
    expect(circle).not.toBeNull();
    expect(circle!.radius).toBeCloseTo(100, 3);
    expect(circle!.center.x).toBeCloseTo(0, 3);
    expect(circle!.center.y).toBeCloseTo(0, 3);
  });

  it('returns null for collinear points', () => {
    const circle = circleThrough3Points(
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    );
    expect(circle).toBeNull();
  });

  it('arbitrary circle: center=(10,20), R=50', () => {
    const cx = 10, cy = 20, r = 50;
    const circle = circleThrough3Points(
      { x: cx + r, y: cy },
      { x: cx, y: cy + r },
      { x: cx - r, y: cy },
    );
    expect(circle!.center.x).toBeCloseTo(cx, 3);
    expect(circle!.center.y).toBeCloseTo(cy, 3);
    expect(circle!.radius).toBeCloseTo(r, 3);
  });
});

// ── crossValidateCurve ────────────────────────────────────────────────────────

describe('crossValidateCurve', () => {
  it('passes when all provided values are consistent', () => {
    const input = { R: 500, delta: 30, L: 261.80, C: 258.82, T: 133.97 };
    const computed = computeCurve(input)!;
    const validation = crossValidateCurve(input, computed);
    expect(validation.isValid).toBe(true);
  });

  it('fails when L is wrong', () => {
    const input = { R: 500, delta: 30, L: 300 }; // L is wrong
    const computed = computeCurve({ R: 500, delta: 30 })!;
    const validation = crossValidateCurve(input, computed);
    expect(validation.isValid).toBe(false);
  });

  it('error check has correct parameter names', () => {
    const input = { R: 500, delta: 30, L: 300 };
    const computed = computeCurve({ R: 500, delta: 30 })!;
    const validation = crossValidateCurve(input, computed);
    const lCheck = validation.checks.find(c => c.parameter === 'L');
    expect(lCheck).toBeDefined();
    expect(lCheck!.passed).toBe(false);
  });

  it('maxError is 0 for consistent inputs', () => {
    const computed = computeCurve({ R: 500, delta: 30 })!;
    const input = {
      R: 500,
      delta: 30,
      L: computed.L,
      C: computed.C,
      T: computed.T,
    };
    const validation = crossValidateCurve(input, computed);
    expect(validation.maxError).toBeCloseTo(0, 3);
  });
});
