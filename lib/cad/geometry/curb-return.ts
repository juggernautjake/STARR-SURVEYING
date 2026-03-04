// lib/cad/geometry/curb-return.ts — Fillet / curb return
import type { Point2D } from '../types';
import type { CurveParameters } from '../types';
import { inverseBearingDistance } from './bearing';
import { computeCurve } from './curve';
import { lineLineIntersection } from './intersection';

export interface CurbReturnInput {
  line1Start: Point2D;
  line1End: Point2D;
  line2Start: Point2D;
  line2End: Point2D;
  radius: number;
  trimOriginals: boolean;
}

export interface CurbReturnResult {
  curve: CurveParameters;
  trimmedLine1: { start: Point2D; end: Point2D } | null;
  trimmedLine2: { start: Point2D; end: Point2D } | null;
}

export const CURB_RETURN_PRESETS: { id: string; label: string; radius: number }[] = [
  { id: 'RES_25',  label: "Residential Standard (25')", radius: 25 },
  { id: 'RES_30',  label: "Residential Wide (30')",     radius: 30 },
  { id: 'COM_35',  label: "Commercial Standard (35')",  radius: 35 },
  { id: 'COM_40',  label: "Commercial (40')",           radius: 40 },
  { id: 'COM_50',  label: "Commercial Wide (50')",      radius: 50 },
  { id: 'CDS_40',  label: "Cul-de-sac (40')",          radius: 40 },
  { id: 'CDS_50',  label: "Cul-de-sac (50')",          radius: 50 },
  { id: 'DWY_5',   label: "Driveway Apron (5')",       radius: 5 },
  { id: 'DWY_10',  label: "Driveway Apron (10')",      radius: 10 },
  { id: 'ADA_3',   label: "ADA Ramp Flare (3')",       radius: 3 },
  { id: 'ADA_5',   label: "ADA Ramp Flare (5')",       radius: 5 },
];

export function computeCurbReturn(input: CurbReturnInput): CurbReturnResult | null {
  const pi = lineLineIntersection(input.line1Start, input.line1End, input.line2Start, input.line2End);
  if (!pi) return null; // Parallel lines

  const bearing1 = inverseBearingDistance(input.line1Start, pi).azimuth;
  const bearing2 = inverseBearingDistance(pi, input.line2End).azimuth;

  const curve = computeCurve({
    R: input.radius,
    tangentInBearing: bearing1,
    tangentOutBearing: bearing2,
    pi,
  });
  if (!curve) return null;

  let trimmedLine1 = null, trimmedLine2 = null;
  if (input.trimOriginals) {
    trimmedLine1 = { start: input.line1Start, end: curve.pc };
    trimmedLine2 = { start: curve.pt, end: input.line2End };
  }

  return { curve, trimmedLine1, trimmedLine2 };
}
