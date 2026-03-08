// __tests__/cad/geometry/traverse.test.ts — Unit tests for traverse creation
import { describe, it, expect } from 'vitest';
import { createTraverse } from '@/lib/cad/geometry/traverse';
import type { SurveyPoint } from '@/lib/cad/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal SurveyPoint at (easting, northing) */
function mkPoint(id: string, n: number, e: number, num = 1): SurveyPoint {
  return {
    id,
    pointNumber: num,
    pointName: `PT${num}`,
    parsedName: {
      baseNumber: num,
      suffix: '',
      normalizedSuffix: 'NONE' as const,
      suffixVariant: '',
      suffixConfidence: 1,
      isRecalc: false,
      recalcSequence: 0,
    },
    northing: n,
    easting: e,
    elevation: null,
    rawCode: 'BND',
    parsedCode: {
      rawCode: 'BND',
      baseCode: 'BND',
      isNumeric: false,
      isAlpha: true,
      suffix: null,
      isValid: true,
      isLineCode: false,
      isAutoSpline: false,
    },
    resolvedAlphaCode: 'BND',
    resolvedNumericCode: '',
    codeSuffix: null,
    codeDefinition: null,
    monumentAction: null,
    description: '',
    rawRecord: '',
    importSource: 'test',
    layerId: 'layer-1',
    featureId: '',
    lineStringIds: [],
    validationIssues: [],
    confidence: 1,
    isAccepted: true,
  };
}

/** Build a Map<string, SurveyPoint> from an array of points */
function mkMap(pts: SurveyPoint[]): Map<string, SurveyPoint> {
  return new Map(pts.map(p => [p.id, p]));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createTraverse', () => {
  it('creates a traverse with correct number of legs for open traverse', () => {
    // 3 points → 2 legs (open)
    const pts = [
      mkPoint('a', 0, 0, 1),
      mkPoint('b', 100, 0, 2),
      mkPoint('c', 100, 100, 3),
    ];
    const t = createTraverse(['a', 'b', 'c'], mkMap(pts), false, 'Test');
    expect(t.pointIds).toHaveLength(3);
    expect(t.legs).toHaveLength(2);
    expect(t.isClosed).toBe(false);
  });

  it('adds closing leg for closed traverse', () => {
    // 4 points closed → 4 legs
    const pts = [
      mkPoint('a', 0, 0, 1),
      mkPoint('b', 100, 0, 2),
      mkPoint('c', 100, 100, 3),
      mkPoint('d', 0, 100, 4),
    ];
    const t = createTraverse(['a', 'b', 'c', 'd'], mkMap(pts), true, 'Square');
    expect(t.legs).toHaveLength(4);
    expect(t.isClosed).toBe(true);
  });

  it('computes correct leg bearing for a due-East leg', () => {
    // Point A at (N=1000, E=1000), Point B at (N=1000, E=1100) → due East, azimuth=90°
    const pts = [
      mkPoint('a', 1000, 1000, 1),
      mkPoint('b', 1000, 1100, 2),
    ];
    const t = createTraverse(['a', 'b'], mkMap(pts), false);
    expect(t.legs).toHaveLength(1);
    expect(t.legs[0].bearing).toBeCloseTo(90, 5);
    expect(t.legs[0].distance).toBeCloseTo(100, 5);
  });

  it('computes correct leg bearing for a due-North leg', () => {
    // A at (N=1000, E=1000), B at (N=1100, E=1000) → due North, azimuth=0°
    const pts = [
      mkPoint('a', 1000, 1000, 1),
      mkPoint('b', 1100, 1000, 2),
    ];
    const t = createTraverse(['a', 'b'], mkMap(pts), false);
    expect(t.legs[0].bearing).toBeCloseTo(0, 5);
    expect(t.legs[0].distance).toBeCloseTo(100, 5);
  });

  it('computes correct leg delta-North and delta-East', () => {
    const pts = [
      mkPoint('a', 1000, 2000, 1),
      mkPoint('b', 1030, 2040, 2),
    ];
    const t = createTraverse(['a', 'b'], mkMap(pts), false);
    expect(t.legs[0].deltaNorth).toBeCloseTo(30, 5);
    expect(t.legs[0].deltaEast).toBeCloseTo(40, 5);
  });

  it('computes closure for a closed traverse', () => {
    // Perfect 100×100 square: should close exactly
    const pts = [
      mkPoint('a', 0, 0, 1),
      mkPoint('b', 100, 0, 2),
      mkPoint('c', 100, 100, 3),
      mkPoint('d', 0, 100, 4),
    ];
    const t = createTraverse(['a', 'b', 'c', 'd'], mkMap(pts), true);
    expect(t.closure).not.toBeNull();
    expect(t.closure!.linearError).toBeCloseTo(0, 5);
  });

  it('computes area for a closed traverse', () => {
    // 100×100 square = 10,000 sq ft
    const pts = [
      mkPoint('a', 0, 0, 1),
      mkPoint('b', 100, 0, 2),
      mkPoint('c', 100, 100, 3),
      mkPoint('d', 0, 100, 4),
    ];
    const t = createTraverse(['a', 'b', 'c', 'd'], mkMap(pts), true);
    expect(t.area).not.toBeNull();
    expect(t.area!.squareFeet).toBeCloseTo(10000, 1);
    expect(t.area!.acres).toBeCloseTo(10000 / 43560, 4);
  });

  it('does not compute closure for open traverse', () => {
    const pts = [
      mkPoint('a', 0, 0, 1),
      mkPoint('b', 100, 100, 2),
    ];
    const t = createTraverse(['a', 'b'], mkMap(pts), false);
    expect(t.closure).toBeNull();
    expect(t.area).toBeNull();
  });

  it('uses provided name', () => {
    const pts = [mkPoint('a', 0, 0, 1), mkPoint('b', 10, 0, 2)];
    const t = createTraverse(['a', 'b'], mkMap(pts), false, 'My Traverse');
    expect(t.name).toBe('My Traverse');
  });

  it('defaults name to "Traverse 1" when not provided', () => {
    const pts = [mkPoint('a', 0, 0, 1), mkPoint('b', 10, 0, 2)];
    const t = createTraverse(['a', 'b'], mkMap(pts), false);
    expect(t.name).toBe('Traverse 1');
  });

  it('skips leg when a point is missing from the map', () => {
    const pts = [
      mkPoint('a', 0, 0, 1),
      mkPoint('b', 100, 0, 2),
    ];
    // Point 'c' is in pointIds but not in the map
    const t = createTraverse(['a', 'b', 'c'], mkMap(pts), false);
    expect(t.legs).toHaveLength(1); // only a→b; b→c skipped
  });

  it('has initialized adjustedPoints as null', () => {
    const pts = [mkPoint('a', 0, 0, 1), mkPoint('b', 10, 0, 2)];
    const t = createTraverse(['a', 'b'], mkMap(pts), false);
    expect(t.adjustedPoints).toBeNull();
    expect(t.adjustmentMethod).toBeNull();
  });
});
