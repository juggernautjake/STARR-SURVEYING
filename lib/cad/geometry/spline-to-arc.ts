// lib/cad/geometry/spline-to-arc.ts — Bi-arc fitting conversion
//
// ── C29: WHY THIS EXISTS AND WHY IT HAD NO CALLERS ──────────────────────────────────────────────
//
// C27 found `convertSplineToArcs` exported and referenced by nothing. The need is real: a spline is
// a perfectly good curve on screen and a problem in a deliverable, because plenty of the packages a
// plat gets handed to — older survey software, some county filing systems, a few CAD readers — do
// not accept one. The fallback is a polyline with hundreds of vertices, which is accepted and is
// not the same drawing: it prints heavier, it edits worse, and every vertex is a place for a
// rounding difference to show up.
//
// Arcs are what those packages DO take, and a bi-arc fit reproduces the curve to a stated tolerance
// with a handful of entities instead of hundreds of chords.
//
// The conversion below was written; the two pieces missing were a sampler that turns this codebase's
// `SplineGeometry` into the point list it wants, and a caller. Both are here now.

import type { Point2D, ArcDefinition, CurveParameters, SplineGeometry } from '../types';
import { circleThrough3Points } from './curve';

export interface SplineToArcConfig {
  tolerance: number;       // Max deviation from spline (feet). Default: 0.01
  maxSegments: number;     // Max arcs to generate. Default: 50
  preserveEndTangents: boolean;
}

export interface ArcOrLineSegment {
  type: 'LINE' | 'ARC';
  start: Point2D;
  end: Point2D;
  center?: Point2D;
  radius?: number;
  direction?: 'CW' | 'CCW';
}

export interface SplineToArcResult {
  segments: ArcOrLineSegment[];
  maxDeviation: number;
  segmentCount: number;
}

function crossProduct(a: Point2D, b: Point2D, c: Point2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function convertSplineToArcs(
  splinePoints: Point2D[],
  tangentStart: Point2D,
  tangentEnd: Point2D,
  config: SplineToArcConfig,
): SplineToArcResult {
  const segments: ArcOrLineSegment[] = [];
  let maxDev = 0;

  function fitSegment(startIdx: number, endIdx: number, depth: number): void {
    if (depth > 20 || segments.length >= config.maxSegments) {
      segments.push({ type: 'LINE', start: splinePoints[startIdx], end: splinePoints[endIdx] });
      return;
    }

    if (startIdx >= endIdx - 1) {
      segments.push({ type: 'LINE', start: splinePoints[startIdx], end: splinePoints[endIdx] });
      return;
    }

    const pStart = splinePoints[startIdx];
    const pEnd = splinePoints[endIdx];

    const midIdx = Math.floor((startIdx + endIdx) / 2);
    const pMid = splinePoints[midIdx];

    const circle = circleThrough3Points(pStart, pMid, pEnd);

    if (!circle) {
      segments.push({ type: 'LINE', start: pStart, end: pEnd });
      return;
    }

    let segMaxDev = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      const dist = Math.abs(
        Math.sqrt(
          (splinePoints[i].x - circle.center.x) ** 2 +
          (splinePoints[i].y - circle.center.y) ** 2
        ) - circle.radius
      );
      segMaxDev = Math.max(segMaxDev, dist);
    }

    if (segMaxDev <= config.tolerance) {
      const direction = crossProduct(pStart, pMid, pEnd) > 0 ? 'CCW' : 'CW';
      segments.push({
        type: 'ARC', start: pStart, end: pEnd,
        center: circle.center, radius: circle.radius, direction,
      });
      maxDev = Math.max(maxDev, segMaxDev);
    } else {
      fitSegment(startIdx, midIdx, depth + 1);
      fitSegment(midIdx, endIdx, depth + 1);
    }
  }

  if (splinePoints.length >= 2) {
    fitSegment(0, splinePoints.length - 1, 0);
  }

  return { segments, maxDeviation: maxDev, segmentCount: segments.length };
}

// ── C29: the two pieces that made it reachable ─────────────────────────────────────────────────

/**
 * Sample a `SplineGeometry` into the dense point list `convertSplineToArcs` fits against.
 *
 * Deliberately the same walk the DXF writer already uses (`sampleBezierSpline`): control points in
 * groups of four, sharing an endpoint between segments. A second, subtly different sampler would
 * mean an exported DXF and a converted-in-place spline disagreed about where the same curve is.
 */
export function sampleSplineGeometry(
  spline: SplineGeometry,
  samplesPerCurve = 24,
): Point2D[] {
  const pts = spline.controlPoints;
  const out: Point2D[] = [];
  const n = Math.max(2, Math.floor(samplesPerCurve));
  for (let i = 0; i + 3 < pts.length; i += 3) {
    const [p0, p1, p2, p3] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
    if (out.length === 0) out.push(p0);
    for (let j = 1; j <= n; j += 1) {
      const t = j / n;
      const u = 1 - t;
      out.push({
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      });
    }
  }
  return out;
}

/**
 * End tangents of a spline, taken from its control polygon.
 *
 * The first and last control legs ARE the tangents of a cubic bezier — that is what the handles
 * mean — so this reads them rather than estimating from the sampled points, where the first chord
 * is only approximately tangent and gets worse as the sampling gets coarser.
 *
 * Returns unit vectors, and falls back to the chord when a control leg is degenerate (a handle
 * pulled onto its anchor), which is legal geometry and would otherwise divide by zero.
 */
export function splineEndTangents(
  spline: SplineGeometry,
): { start: Point2D; end: Point2D } | null {
  const p = spline.controlPoints;
  if (p.length < 4) return null;
  const unit = (a: Point2D, b: Point2D, fallbackA: Point2D, fallbackB: Point2D): Point2D => {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let len = Math.hypot(dx, dy);
    if (len < 1e-12) {
      dx = fallbackB.x - fallbackA.x;
      dy = fallbackB.y - fallbackA.y;
      len = Math.hypot(dx, dy);
    }
    if (len < 1e-12) return { x: 1, y: 0 };
    return { x: dx / len, y: dy / len };
  };
  const last = p.length - 1;
  return {
    start: unit(p[0], p[1], p[0], p[last]),
    // Pointing OUT of the curve at the far end, matching the start tangent's sense.
    end: unit(p[last - 1], p[last], p[0], p[last]),
  };
}

/**
 * Whole-spline conversion: sample, take the end tangents, fit arcs.
 *
 * Returns null when the geometry is not a fittable spline, so a caller can say why rather than
 * placing a single degenerate line where a curve used to be.
 */
export function convertSplineGeometryToArcs(
  spline: SplineGeometry,
  config: Partial<SplineToArcConfig> = {},
): SplineToArcResult | null {
  const pts = sampleSplineGeometry(spline);
  const tangents = splineEndTangents(spline);
  if (pts.length < 2 || !tangents) return null;
  return convertSplineToArcs(pts, tangents.start, tangents.end, {
    tolerance: config.tolerance ?? 0.01,
    maxSegments: config.maxSegments ?? 50,
    preserveEndTangents: config.preserveEndTangents ?? true,
  });
}
