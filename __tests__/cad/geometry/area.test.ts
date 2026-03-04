// __tests__/cad/geometry/area.test.ts — Unit tests for area computation
import { describe, it, expect } from 'vitest';
import { computeArea, computeAreaFromPoints2D } from '@/lib/cad/geometry/area';
import type { SurveyPoint } from '@/lib/cad/types';

// ── computeAreaFromPoints2D ───────────────────────────────────────────────────

describe('computeAreaFromPoints2D', () => {
  it('100\' × 100\' square → 10,000 sq ft', () => {
    const square = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 100 },
      { x: 0,   y: 100 },
    ];
    const result = computeAreaFromPoints2D(square);
    expect(result.squareFeet).toBeCloseTo(10000, 2);
  });

  it('100\' × 100\' square → ~0.2296 acres', () => {
    const square = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 100 },
      { x: 0,   y: 100 },
    ];
    const result = computeAreaFromPoints2D(square);
    expect(result.acres).toBeCloseTo(10000 / 43560, 4);
  });

  it('irregular triangle: area = 0.5 × base × height', () => {
    // Triangle: (0,0), (10,0), (0,10) → area = 50
    const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    const result = computeAreaFromPoints2D(tri);
    expect(result.squareFeet).toBeCloseTo(50, 5);
  });

  it('irregular polygon matches manual shoelace calculation', () => {
    // Known polygon: (0,0),(4,0),(4,3),(2,5),(0,3) → area = 16
    const polygon = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 2, y: 5 },
      { x: 0, y: 3 },
    ];
    const result = computeAreaFromPoints2D(polygon);
    expect(result.squareFeet).toBeCloseTo(16, 5);
  });

  it('empty array returns 0', () => {
    const result = computeAreaFromPoints2D([]);
    expect(result.squareFeet).toBe(0);
    expect(result.acres).toBe(0);
  });

  it('2-point array returns 0', () => {
    const result = computeAreaFromPoints2D([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(result.squareFeet).toBe(0);
  });

  it('method is always COORDINATE', () => {
    const result = computeAreaFromPoints2D([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]);
    expect(result.method).toBe('COORDINATE');
  });
});

// ── computeArea (SurveyPoint) ─────────────────────────────────────────────────

function makeSurveyPoint(easting: number, northing: number): SurveyPoint {
  return { easting, northing } as SurveyPoint;
}

describe('computeArea', () => {
  it('100\' × 100\' square using SurveyPoints → 10,000 sq ft', () => {
    const pts = [
      makeSurveyPoint(0,   0),
      makeSurveyPoint(100, 0),
      makeSurveyPoint(100, 100),
      makeSurveyPoint(0,   100),
    ];
    const result = computeArea(pts);
    expect(result.squareFeet).toBeCloseTo(10000, 2);
  });

  it('triangle using SurveyPoints', () => {
    const pts = [
      makeSurveyPoint(0,  0),
      makeSurveyPoint(10, 0),
      makeSurveyPoint(0,  10),
    ];
    const result = computeArea(pts);
    expect(result.squareFeet).toBeCloseTo(50, 5);
  });

  it('fewer than 3 points returns 0', () => {
    expect(computeArea([makeSurveyPoint(0, 0), makeSurveyPoint(10, 0)]).squareFeet).toBe(0);
    expect(computeArea([]).squareFeet).toBe(0);
  });

  it('acres = squareFeet / 43560', () => {
    const pts = [
      makeSurveyPoint(0,   0),
      makeSurveyPoint(100, 0),
      makeSurveyPoint(100, 100),
      makeSurveyPoint(0,   100),
    ];
    const result = computeArea(pts);
    expect(result.acres).toBeCloseTo(result.squareFeet / 43560, 8);
  });
});
