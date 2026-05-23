// lib/cad/geometry/closure.ts — Closure calculation + Bowditch adjustment
import type { Traverse, ClosureResult } from '../types';
import type { Point2D } from '../types';

export function computeClosure(traverse: Traverse): ClosureResult {
  let sumNorth = 0, sumEast = 0, totalDist = 0;

  for (const leg of traverse.legs) {
    sumNorth += leg.deltaNorth;
    sumEast += leg.deltaEast;
    totalDist += leg.distance;
  }

  const linearError = Math.sqrt(sumNorth * sumNorth + sumEast * sumEast);
  let errorBearing = Math.atan2(sumEast, sumNorth) * (180 / Math.PI);
  if (errorBearing < 0) errorBearing += 360;

  const precisionDenominator = linearError > 0 ? Math.round(totalDist / linearError) : Infinity;
  const precisionRatio = linearError > 0
    ? `1:${precisionDenominator.toLocaleString()}`
    : '1:∞ (perfect)';

  const n = traverse.legs.length;
  let angularSum = 0;
  for (let i = 0; i < n; i++) {
    const bearIn = traverse.legs[i].bearing;
    const bearOut = traverse.legs[(i + 1) % n].bearing;
    let angle = bearOut - bearIn + 180;
    if (angle < 0) angle += 360;
    if (angle > 360) angle -= 360;
    angularSum += angle;
  }
  const expectedAngular = (n - 2) * 180;
  const angularError = (angularSum - expectedAngular) * 3600;

  return {
    linearError,
    errorNorth: sumNorth,
    errorEast: sumEast,
    errorBearing,
    angularError,
    precisionRatio,
    precisionDenominator,
    totalDistance: totalDist,
  };
}

export function bowditchAdjustment(traverse: Traverse): Point2D[] {
  const closure = traverse.closure ?? computeClosure(traverse);
  const totalDist = closure.totalDistance;
  if (totalDist === 0) return traverse.legs.map(() => ({ x: 0, y: 0 }));

  const correctedPoints: Point2D[] = [];
  let cumDist = 0;

  correctedPoints.push({ x: 0, y: 0 });

  for (let i = 0; i < traverse.legs.length; i++) {
    cumDist += traverse.legs[i].distance;
    const ratio = cumDist / totalDist;

    correctedPoints.push({
      x: -closure.errorEast * ratio,
      y: -closure.errorNorth * ratio,
    });
  }

  return correctedPoints;
}

export function transitAdjustment(traverse: Traverse): Point2D[] {
  const closure = traverse.closure ?? computeClosure(traverse);
  const totalAbsN = traverse.legs.reduce((s, l) => s + Math.abs(l.deltaNorth), 0);
  const totalAbsE = traverse.legs.reduce((s, l) => s + Math.abs(l.deltaEast), 0);

  const correctedPoints: Point2D[] = [{ x: 0, y: 0 }];
  let cumAbsN = 0, cumAbsE = 0;

  for (let i = 0; i < traverse.legs.length; i++) {
    cumAbsN += Math.abs(traverse.legs[i].deltaNorth);
    cumAbsE += Math.abs(traverse.legs[i].deltaEast);

    correctedPoints.push({
      x: totalAbsE > 0 ? -closure.errorEast * (cumAbsE / totalAbsE) : 0,
      y: totalAbsN > 0 ? -closure.errorNorth * (cumAbsN / totalAbsN) : 0,
    });
  }

  return correctedPoints;
}

// ────────────────────────────────────────────────────────────
// Vertex-array adapters (for the AI tool-registry + Calc-point
// dialogue, which work in raw coordinates rather than Traverse
// objects). See docs/planning/in-progress/CAD_POINTS_AND_AI.md
// slices B and E.
// ────────────────────────────────────────────────────────────

export interface VertexClosureResult {
  linearError: number;
  errorEast: number;
  errorNorth: number;
  errorBearingDeg: number; // 0=N, clockwise
  totalDistance: number;
  precisionDenominator: number;
  precisionRatio: string;
  /** Closing leg as (last vertex → first vertex). */
  closingFrom: Point2D;
  closingTo: Point2D;
}

/**
 * Closure of a polygon described as a sequence of perimeter
 * vertices. The implied closing edge runs from the last vertex
 * back to the first; the misclosure is the gap between them.
 * Use this when the caller works in raw coordinates instead of
 * the Traverse / Leg domain object.
 */
export function vertexClosure(vertices: Point2D[]): VertexClosureResult {
  if (vertices.length < 2) {
    return {
      linearError: 0,
      errorEast: 0,
      errorNorth: 0,
      errorBearingDeg: 0,
      totalDistance: 0,
      precisionDenominator: Infinity,
      precisionRatio: '1:∞',
      closingFrom: vertices[0] ?? { x: 0, y: 0 },
      closingTo: vertices[0] ?? { x: 0, y: 0 },
    };
  }

  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  const errorEast = last.x - first.x;
  const errorNorth = last.y - first.y;
  const linearError = Math.hypot(errorEast, errorNorth);

  let totalDistance = 0;
  for (let i = 1; i < vertices.length; i++) {
    totalDistance += Math.hypot(vertices[i].x - vertices[i - 1].x, vertices[i].y - vertices[i - 1].y);
  }

  let errorBearingDeg = Math.atan2(errorEast, errorNorth) * (180 / Math.PI);
  if (errorBearingDeg < 0) errorBearingDeg += 360;

  const precisionDenominator =
    linearError > 1e-9 ? Math.round(totalDistance / linearError) : Number.POSITIVE_INFINITY;
  const precisionRatio =
    precisionDenominator === Number.POSITIVE_INFINITY
      ? '1:∞'
      : `1:${precisionDenominator.toLocaleString()}`;

  return {
    linearError,
    errorEast,
    errorNorth,
    errorBearingDeg,
    totalDistance,
    precisionDenominator,
    precisionRatio,
    closingFrom: last,
    closingTo: first,
  };
}

/**
 * Bowditch (compass-rule) adjustment of a vertex sequence. Returns
 * a new array of vertices in which the first vertex is unchanged
 * and the closure error has been distributed across the others
 * proportionally to their cumulative edge length from the start.
 * The final vertex coincides with the first.
 */
export function vertexBowditchAdjust(vertices: Point2D[]): Point2D[] {
  if (vertices.length < 2) return vertices.slice();
  const closure = vertexClosure(vertices);
  if (closure.linearError < 1e-9 || closure.totalDistance < 1e-9) return vertices.slice();

  const out: Point2D[] = [vertices[0]];
  let cum = 0;
  for (let i = 1; i < vertices.length; i++) {
    cum += Math.hypot(vertices[i].x - vertices[i - 1].x, vertices[i].y - vertices[i - 1].y);
    const r = cum / closure.totalDistance;
    out.push({
      x: vertices[i].x - closure.errorEast * r,
      y: vertices[i].y - closure.errorNorth * r,
    });
  }
  return out;
}
