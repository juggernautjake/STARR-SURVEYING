import { describe, it, expect } from 'vitest';
import {
  splineSegmentCount,
  splineNodeIndices,
  insertSplineNode,
  removeSplineNode,
  closestPointOnSpline,
} from '@/lib/cad/geometry/spline-edit';
import type { SplineGeometry, Point2D } from '@/lib/cad/types';

const p = (x: number, y: number): Point2D => ({ x, y });

// 1 segment (4 control points), straight degenerate cubic 0..3 along x.
const oneSeg = (): SplineGeometry => ({
  controlPoints: [p(0, 0), p(1, 0), p(2, 0), p(3, 0)],
  isClosed: false,
});

// 2 segments (7 control points), nodes at x = 0, 3, 6 along the x axis.
const twoSeg = (): SplineGeometry => ({
  controlPoints: [p(0, 0), p(1, 0), p(2, 0), p(3, 0), p(4, 0), p(5, 0), p(6, 0)],
  isClosed: false,
});

describe('splineSegmentCount / splineNodeIndices', () => {
  it('counts open-spline segments from 3N+1 control points', () => {
    expect(splineSegmentCount(oneSeg())).toBe(1);
    expect(splineSegmentCount(twoSeg())).toBe(2);
  });
  it('returns null for closed or malformed splines', () => {
    expect(splineSegmentCount({ controlPoints: [p(0, 0), p(1, 0), p(2, 0), p(3, 0)], isClosed: true })).toBeNull();
    expect(splineSegmentCount({ controlPoints: [p(0, 0), p(1, 0)], isClosed: false })).toBeNull();
  });
  it('lists node indices at every 3rd control point', () => {
    expect(splineNodeIndices(oneSeg())).toEqual([0, 3]);
    expect(splineNodeIndices(twoSeg())).toEqual([0, 3, 6]);
  });
});

describe('insertSplineNode', () => {
  it('adds an on-curve node at the click without moving the endpoints', () => {
    const out = insertSplineNode(oneSeg(), p(1.5, 0));
    expect(out).not.toBeNull();
    // 1 segment → 2 segments: 4 → 7 control points.
    expect(out!.controlPoints.length).toBe(7);
    expect(splineNodeIndices(out!)).toEqual([0, 3, 6]);
    // Endpoints unchanged.
    expect(out!.controlPoints[0]).toEqual(p(0, 0));
    expect(out!.controlPoints[6]).toEqual(p(3, 0));
    // New middle node lands on the curve at the click point.
    expect(out!.controlPoints[3].x).toBeCloseTo(1.5);
    expect(out!.controlPoints[3].y).toBeCloseTo(0);
  });

  it('preserves the curve shape exactly (de Casteljau split)', () => {
    // Use a genuinely curved segment.
    const curved: SplineGeometry = { controlPoints: [p(0, 0), p(1, 2), p(2, 2), p(3, 0)], isClosed: false };
    const before = closestPointOnSpline(curved, p(1.5, 1.4))!;
    const out = insertSplineNode(curved, p(1.5, 1.5))!;
    // A point that was on the original curve is still on the new curve.
    const after = closestPointOnSpline(out, before.point)!;
    expect(after.dist).toBeCloseTo(0, 4);
  });

  it('is a no-op when the click is essentially on an existing node', () => {
    expect(insertSplineNode(oneSeg(), p(0, 0))).toBeNull();
    expect(insertSplineNode(oneSeg(), p(3, 0))).toBeNull();
  });

  it('returns null for closed splines', () => {
    expect(insertSplineNode({ controlPoints: twoSeg().controlPoints, isClosed: true }, p(1.5, 0))).toBeNull();
  });
});

describe('removeSplineNode', () => {
  it('removes an interior node and merges the two segments', () => {
    const out = removeSplineNode(twoSeg(), p(3, 0), 1);
    expect(out).not.toBeNull();
    // 2 segments → 1 segment: 7 → 4 control points.
    expect(out!.controlPoints.length).toBe(4);
    // Outer endpoints preserved.
    expect(out!.controlPoints[0]).toEqual(p(0, 0));
    expect(out!.controlPoints[3]).toEqual(p(6, 0));
  });

  it('removes the first endpoint node', () => {
    const out = removeSplineNode(twoSeg(), p(0, 0), 1)!;
    expect(out.controlPoints.length).toBe(4);
    expect(out.controlPoints[0]).toEqual(p(3, 0)); // old node 1 becomes the start
  });

  it('removes the last endpoint node', () => {
    const out = removeSplineNode(twoSeg(), p(6, 0), 1)!;
    expect(out.controlPoints.length).toBe(4);
    expect(out.controlPoints[3]).toEqual(p(3, 0)); // old node 1 becomes the end
  });

  it('refuses to drop below 2 nodes (a single-segment spline)', () => {
    expect(removeSplineNode(oneSeg(), p(0, 0), 1)).toBeNull();
  });

  it('returns null when no node is within the pick radius', () => {
    expect(removeSplineNode(twoSeg(), p(3, 5), 1)).toBeNull();
  });

  it('returns null for closed splines', () => {
    expect(removeSplineNode({ controlPoints: twoSeg().controlPoints, isClosed: true }, p(3, 0), 1)).toBeNull();
  });
});

describe('closestPointOnSpline', () => {
  it('returns a point on the curve near the query', () => {
    const res = closestPointOnSpline(twoSeg(), p(3, 1));
    expect(res).not.toBeNull();
    expect(res!.point.y).toBeCloseTo(0); // curve lies on the x-axis
    expect(res!.dist).toBeCloseTo(1);
  });
});
