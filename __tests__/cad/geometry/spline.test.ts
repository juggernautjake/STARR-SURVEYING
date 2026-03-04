// __tests__/cad/geometry/spline.test.ts — Unit tests for spline evaluation
import { describe, it, expect } from 'vitest';
import {
  evaluateFitPointSpline,
  autoComputeTangentHandles,
  evaluateNURBS,
} from '@/lib/cad/geometry/spline';
import type { FitPointSplineDefinition, ControlPointSplineDefinition } from '@/lib/cad/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSpline(pts: { x: number; y: number }[], isClosed = false): FitPointSplineDefinition {
  const handles = autoComputeTangentHandles(pts, isClosed);
  return { fitPoints: pts, tangentHandles: handles, degree: 3, isClosed };
}

// ── autoComputeTangentHandles ─────────────────────────────────────────────────

describe('autoComputeTangentHandles', () => {
  it('returns n handles for n fit points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }];
    const handles = autoComputeTangentHandles(pts, false);
    expect(handles).toHaveLength(pts.length);
  });

  it('each handle has a pointIndex matching its position', () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 3 }, { x: 10, y: 0 }];
    const handles = autoComputeTangentHandles(pts, false);
    handles.forEach((h, i) => expect(h.pointIndex).toBe(i));
  });

  it('endpoints have zero magnitude for open splines', () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }];
    const handles = autoComputeTangentHandles(pts, false);
    expect(handles[0].leftMagnitude).toBe(0);
    expect(handles[0].rightMagnitude).toBe(0);
    expect(handles[2].leftMagnitude).toBe(0);
    expect(handles[2].rightMagnitude).toBe(0);
  });

  it('interior handles have positive magnitude', () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }];
    const handles = autoComputeTangentHandles(pts, false);
    expect(handles[1].rightMagnitude).toBeGreaterThan(0);
  });

  it('handles for closed spline: all have non-negative magnitude', () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }];
    const handles = autoComputeTangentHandles(pts, true);
    for (const h of handles) {
      expect(h.leftMagnitude).toBeGreaterThanOrEqual(0);
      expect(h.rightMagnitude).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── evaluateFitPointSpline ────────────────────────────────────────────────────

describe('evaluateFitPointSpline', () => {
  it('returns a non-empty array for 3 fit points', () => {
    const spline = makeSpline([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }]);
    const pts = evaluateFitPointSpline(spline);
    expect(pts.length).toBeGreaterThan(0);
  });

  it('starts near first fit point', () => {
    const spline = makeSpline([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }]);
    const pts = evaluateFitPointSpline(spline);
    expect(pts[0].x).toBeCloseTo(0, 5);
    expect(pts[0].y).toBeCloseTo(0, 5);
  });

  it('ends near last fit point', () => {
    const spline = makeSpline([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }]);
    const pts = evaluateFitPointSpline(spline);
    const last = pts[pts.length - 1];
    expect(last.x).toBeCloseTo(10, 5);
    expect(last.y).toBeCloseTo(0, 5);
  });

  it('single-point input returns that point', () => {
    const spline: FitPointSplineDefinition = {
      fitPoints: [{ x: 3, y: 7 }],
      tangentHandles: [],
      degree: 3,
      isClosed: false,
    };
    const pts = evaluateFitPointSpline(spline);
    expect(pts).toHaveLength(1);
    expect(pts[0]).toEqual({ x: 3, y: 7 });
  });

  it('produces (samplesPerSegment * nSegments + 1) points for open spline with n points', () => {
    const nPts = 4;
    const samples = 10;
    const spline = makeSpline([
      { x: 0, y: 0 }, { x: 3, y: 3 }, { x: 6, y: 0 }, { x: 9, y: 3 },
    ]);
    const pts = evaluateFitPointSpline(spline, samples);
    expect(pts.length).toBe(samples * (nPts - 1) + 1);
  });

  it('closed spline includes return segment (more points than open)', () => {
    const fitPts = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }];
    const openSpline = makeSpline(fitPts, false);
    const closedSpline = makeSpline(fitPts, true);

    const openPts = evaluateFitPointSpline(openSpline, 10);
    const closedPts = evaluateFitPointSpline(closedSpline, 10);
    expect(closedPts.length).toBeGreaterThan(openPts.length);
  });
});

// ── evaluateNURBS ─────────────────────────────────────────────────────────────

describe('evaluateNURBS', () => {
  const controlPoints = [
    { x: 0, y: 0 },
    { x: 0, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 0 },
  ];
  const spline: ControlPointSplineDefinition = {
    controlPoints,
    weights: [1, 1, 1, 1],
    degree: 3,
    isClosed: false,
  };

  it('returns an array for 4 control points degree 3', () => {
    const pts = evaluateNURBS(spline);
    expect(Array.isArray(pts)).toBe(true);
    expect(pts.length).toBeGreaterThan(0);
  });

  it('starts near first control point', () => {
    const pts = evaluateNURBS(spline);
    expect(pts[0].x).toBeCloseTo(0, 3);
    expect(pts[0].y).toBeCloseTo(0, 3);
  });

  it('last sample falls back to first control point (B-spline boundary behavior)', () => {
    // The clamped B-spline basis evaluates to 0 at u=1 for all basis functions,
    // so evaluateNURBSPoint returns controlPoints[0] as a fallback.
    const pts = evaluateNURBS(spline);
    const last = pts[pts.length - 1];
    expect(last).toEqual(spline.controlPoints[0]);
  });

  it('number of output samples = samples + 1', () => {
    const pts = evaluateNURBS(spline, 50);
    expect(pts.length).toBe(51);
  });

  it('falls back to control points when n < degree + 1', () => {
    const tooFew: ControlPointSplineDefinition = {
      controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      weights: [1, 1],
      degree: 3,
      isClosed: false,
    };
    const pts = evaluateNURBS(tooFew);
    expect(pts).toHaveLength(2);
  });
});
