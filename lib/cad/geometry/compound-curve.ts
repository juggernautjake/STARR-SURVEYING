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
