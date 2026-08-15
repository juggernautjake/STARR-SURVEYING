// lib/cad/geometry/compound-curve.ts — Compound, reverse, spiral curves
import type { Point2D } from '../types';
import type { CurveParameters, SpiralDefinition } from '../types';
import { computeCurve } from './curve';

export interface CompoundCurve {
  curve1: CurveParameters;
  curve2: CurveParameters;
  pcc: Point2D;  // Point of Compound Curvature
}

export interface ReverseCurve {
  curve1: CurveParameters;
  curve2: CurveParameters;
  prc: Point2D;  // Point of Reverse Curvature
}

export function computeCompoundCurve(
  R1: number, delta1: number,
  R2: number, delta2: number,
  direction: 'LEFT' | 'RIGHT',
  pc: Point2D,
  tangentInBearing: number,
): CompoundCurve {
  const curve1 = computeCurve({ R: R1, delta: delta1, direction, pc, tangentInBearing })!;
  const curve2 = computeCurve({
    R: R2, delta: delta2, direction,
    pc: curve1.pt,
    tangentInBearing: curve1.tangentOutBearing * (180 / Math.PI),
  })!;

  return { curve1, curve2, pcc: curve1.pt };
}

export function computeReverseCurve(
  R1: number, delta1: number,
  R2: number, delta2: number,
  startDirection: 'LEFT' | 'RIGHT',
  pc: Point2D,
  tangentInBearing: number,
): ReverseCurve {
  const curve1 = computeCurve({ R: R1, delta: delta1, direction: startDirection, pc, tangentInBearing })!;
  const reverseDir = startDirection === 'LEFT' ? 'RIGHT' : 'LEFT';
  const curve2 = computeCurve({
    R: R2, delta: delta2, direction: reverseDir,
    pc: curve1.pt,
    tangentInBearing: curve1.tangentOutBearing * (180 / Math.PI),
  })!;

  return { curve1, curve2, prc: curve1.pt };
}

/**
 * C29 — the spiral as drawable points.
 *
 * `computeClothoidSpiral` returns the TS and SC and nothing between them, which is enough for a
 * curve table and not enough to draw. A clothoid is not an arc and cannot be faked with one — its
 * radius varies along its length, which is the entire reason it exists — so placement needs the
 * curve sampled.
 *
 * Deliberately the SAME truncated series the solver uses, evaluated at `s ≤ L` instead of only at
 * `L`. Using a different (even a better) expansion here would put a polyline on the drawing that
 * does not end at the SC point the curve table reports, and a curve table that disagrees with the
 * geometry beside it is worse than either alone. A test pins that the last sample IS `sc`.
 *
 * `segments` is the number of chords; 32 holds a 100 ft spiral to well under a hundredth of a foot.
 */
export function spiralPolyline(
  R: number,
  spiralLength: number,
  direction: 'LEFT' | 'RIGHT',
  ts: Point2D,
  tangentBearing: number,
  segments = 32,
): Point2D[] {
  const A = Math.sqrt(R * spiralLength);
  const bearingRad = tangentBearing * (Math.PI / 180);
  const sign = direction === 'RIGHT' ? 1 : -1;
  const n = Math.max(2, Math.floor(segments));

  const out: Point2D[] = [];
  for (let i = 0; i <= n; i += 1) {
    const s = (spiralLength * i) / n;
    const X = s - (s ** 5) / (40 * A ** 4);
    const Y = (s ** 3) / (6 * A ** 2);
    out.push({
      x: ts.x + X * Math.sin(bearingRad) + sign * Y * Math.cos(bearingRad),
      y: ts.y + X * Math.cos(bearingRad) - sign * Y * Math.sin(bearingRad),
    });
  }
  return out;
}

export function computeClothoidSpiral(
  R: number,
  spiralLength: number,
  direction: 'LEFT' | 'RIGHT',
  ts: Point2D,
  tangentBearing: number,
): SpiralDefinition {
  const A = Math.sqrt(R * spiralLength);

  const X = spiralLength - (spiralLength ** 5) / (40 * A ** 4);
  const Y = (spiralLength ** 3) / (6 * A ** 2);

  const bearing_rad = tangentBearing * (Math.PI / 180);
  const sign = direction === 'RIGHT' ? 1 : -1;

  const sc: Point2D = {
    x: ts.x + X * Math.sin(bearing_rad) + sign * Y * Math.cos(bearing_rad),
    y: ts.y + X * Math.cos(bearing_rad) - sign * Y * Math.sin(bearing_rad),
  };

  return {
    type: 'CLOTHOID',
    length: spiralLength,
    radiusStart: Infinity,
    radiusEnd: R,
    A,
    ts,
    sc,
    direction,
  };
}
