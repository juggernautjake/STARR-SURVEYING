// __tests__/cad/geometry/closure.test.ts — Unit tests for traverse closure
import { describe, it, expect } from 'vitest';
import { computeClosure, bowditchAdjustment } from '@/lib/cad/geometry/closure';
import { createTraverse } from '@/lib/cad/geometry/traverse';
import type { SurveyPoint, Traverse } from '@/lib/cad/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSurveyPoint(id: string, easting: number, northing: number): SurveyPoint {
  return { id, easting, northing, pointNumber: 0 } as SurveyPoint;
}

/** Build a closed square traverse with vertices at the given size */
function squareTraverse(size: number) {
  const pts = [
    makeSurveyPoint('p1', 0,    0),
    makeSurveyPoint('p2', size, 0),
    makeSurveyPoint('p3', size, size),
    makeSurveyPoint('p4', 0,    size),
  ];
  const map = new Map(pts.map(p => [p.id, p]));
  return createTraverse(['p1', 'p2', 'p3', 'p4'], map, true, 'Square');
}

// ── computeClosure ────────────────────────────────────────────────────────────

describe('computeClosure: perfect square', () => {
  const traverse = squareTraverse(100);

  it('linearError is near zero for a perfect square', () => {
    expect(traverse.closure!.linearError).toBeCloseTo(0, 8);
  });

  it('errorNorth is near zero', () => {
    expect(traverse.closure!.errorNorth).toBeCloseTo(0, 8);
  });

  it('errorEast is near zero', () => {
    expect(traverse.closure!.errorEast).toBeCloseTo(0, 8);
  });

  it('totalDistance = 400', () => {
    expect(traverse.closure!.totalDistance).toBeCloseTo(400, 4);
  });

  it('precisionRatio contains ∞ for perfect traverse', () => {
    expect(traverse.closure!.precisionRatio).toContain('∞');
  });
});

describe('computeClosure: imperfect traverse', () => {
  // Manually construct a traverse whose legs don't sum to zero (1-ft error in northing)
  const badTraverse: Traverse = {
    id: 'test-imperfect',
    name: 'Imperfect',
    pointIds: ['a', 'b', 'c', 'd'],
    isClosed: true,
    legs: [
      { fromPointId: 'a', toPointId: 'b', bearing: 90,  distance: 100, deltaNorth: 0,   deltaEast: 100,  isArc: false, curveData: null },
      { fromPointId: 'b', toPointId: 'c', bearing: 0,   distance: 100, deltaNorth: 100, deltaEast: 0,    isArc: false, curveData: null },
      { fromPointId: 'c', toPointId: 'd', bearing: 270, distance: 100, deltaNorth: 0,   deltaEast: -100, isArc: false, curveData: null },
      { fromPointId: 'd', toPointId: 'a', bearing: 180, distance: 99,  deltaNorth: -99, deltaEast: 0,    isArc: false, curveData: null }, // 1-ft error
    ],
    closure: null,
    adjustedPoints: null,
    adjustmentMethod: null,
    area: null,
  };
  const closure = computeClosure(badTraverse);

  it('linearError > 0', () => {
    expect(closure.linearError).toBeGreaterThan(0);
  });

  it('precisionDenominator is a positive number', () => {
    expect(Number.isFinite(closure.precisionDenominator)).toBe(true);
    expect(closure.precisionDenominator).toBeGreaterThan(0);
  });
});

// ── createTraverse ────────────────────────────────────────────────────────────

describe('createTraverse', () => {
  it('creates correct number of legs for a closed 4-point traverse', () => {
    const traverse = squareTraverse(100);
    expect(traverse.legs).toHaveLength(4);
  });

  it('isClosed is true', () => {
    expect(squareTraverse(100).isClosed).toBe(true);
  });

  it('area is computed for closed traverse', () => {
    const traverse = squareTraverse(100);
    expect(traverse.area).not.toBeNull();
    expect(traverse.area!.squareFeet).toBeCloseTo(10000, 2);
  });

  it('closure is computed for closed traverse', () => {
    expect(squareTraverse(100).closure).not.toBeNull();
  });

  it('open traverse has null area and null closure', () => {
    const pts = [
      makeSurveyPoint('x1', 0,   0),
      makeSurveyPoint('x2', 100, 0),
      makeSurveyPoint('x3', 100, 100),
    ];
    const map = new Map(pts.map(p => [p.id, p]));
    const traverse = createTraverse(['x1', 'x2', 'x3'], map, false, 'Open');
    expect(traverse.area).toBeNull();
    expect(traverse.closure).toBeNull();
  });
});

// ── bowditchAdjustment ────────────────────────────────────────────────────────

describe('bowditchAdjustment', () => {
  it('returns n+1 correction vectors for n legs', () => {
    const traverse = squareTraverse(100);
    const adj = bowditchAdjustment(traverse);
    expect(adj).toHaveLength(traverse.legs.length + 1);
  });

  it('corrections for perfect traverse are all zero', () => {
    const traverse = squareTraverse(100);
    const adj = bowditchAdjustment(traverse);
    for (const pt of adj) {
      expect(pt.x).toBeCloseTo(0, 8);
      expect(pt.y).toBeCloseTo(0, 8);
    }
  });

  it('corrections are proportional to cumulative distance (Bowditch rule)', () => {
    // Build an imperfect traverse
    const pts = [
      makeSurveyPoint('a', 0,   0),
      makeSurveyPoint('b', 100, 0),
      makeSurveyPoint('c', 100, 100),
      makeSurveyPoint('d', 1,   100), // 1-ft error in easting
    ];
    const map = new Map(pts.map(p => [p.id, p]));
    const traverse = createTraverse(['a', 'b', 'c', 'd'], map, true, 'Bowditch');
    const adj = bowditchAdjustment(traverse);

    // Each correction magnitude should grow with cumulative distance
    const mags = adj.map(p => Math.sqrt(p.x * p.x + p.y * p.y));
    // magnitude at index 0 is 0 (starting point)
    expect(mags[0]).toBeCloseTo(0, 5);
    // each subsequent magnitude should be >= previous
    for (let i = 1; i < mags.length; i++) {
      expect(mags[i]).toBeGreaterThanOrEqual(mags[i - 1] - 1e-10);
    }
  });
});
