// lib/cad/geometry/spline-to-arc.ts — Bi-arc fitting conversion
import type { Point2D, ArcDefinition, CurveParameters } from '../types';
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
