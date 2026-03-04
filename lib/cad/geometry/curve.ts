// lib/cad/geometry/curve.ts — Circular curve calculator
import type { Point2D } from '../types';
import type { CurveParameters } from '../types';
import { inverseBearingDistance } from './bearing';
import { lineLineIntersection } from './intersection';

const DEG = Math.PI / 180;

export interface CurveInput {
  R?: number;                  // Radius
  delta?: number;              // Central angle (degrees)
  L?: number;                  // Arc length
  C?: number;                  // Chord length
  T?: number;                  // Tangent distance
  E?: number;                  // External distance
  M?: number;                  // Mid-ordinate
  D?: number;                  // Degree of curve (arc definition, based on 100' arc)
  direction?: 'LEFT' | 'RIGHT';

  // Location anchors (at least one required to place the curve in space)
  pc?: Point2D;
  pt?: Point2D;
  pi?: Point2D;
  tangentInBearing?: number;   // Azimuth in degrees
  tangentOutBearing?: number;

  // 3-point method
  point1?: Point2D;
  point2?: Point2D;
  point3?: Point2D;
}

export interface CurveValidation {
  isValid: boolean;
  maxError: number;
  checks: CurveCheck[];
}

export interface CurveCheck {
  parameter: string;
  provided: number;
  computed: number;
  error: number;
  tolerance: number;
  passed: boolean;
}

export function circleThrough3Points(p1: Point2D, p2: Point2D, p3: Point2D): { center: Point2D; radius: number } | null {
  const ax = p1.x, ay = p1.y;
  const bx = p2.x, by = p2.y;
  const cx = p3.x, cy = p3.y;

  const D_val = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D_val) < 1e-10) return null; // Collinear

  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D_val;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D_val;

  const center = { x: ux, y: uy };
  const radius = Math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2);

  return { center, radius };
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function computeCurve(input: CurveInput): CurveParameters | null {
  let R: number | undefined = input.R;
  let delta: number | undefined = input.delta ? input.delta * DEG : undefined;

  // From Degree of Curve: D = 5729.578 / R (arc definition)
  if (input.D && !R) R = 5729.578 / input.D;

  // From R + L: Δ = L / R
  if (R && input.L && !delta) delta = input.L / R;

  // From R + C: Δ = 2 × arcsin(C / 2R)
  if (R && input.C && !delta) delta = 2 * Math.asin(Math.min(1, input.C / (2 * R)));

  // From R + T: Δ = 2 × arctan(T / R)
  if (R && input.T && !delta) delta = 2 * Math.atan(input.T / R);

  // From R + E: Δ = 2 × arccos(R / (R + E))
  if (R && input.E && !delta) delta = 2 * Math.acos(Math.min(1, R / (R + input.E)));

  // From R + M: Δ = 2 × arccos((R - M) / R)
  if (R && input.M && !delta) delta = 2 * Math.acos(Math.min(1, (R - input.M) / R));

  // From 3 points: fit circle through 3 points
  if (input.point1 && input.point2 && input.point3 && !R) {
    const circle = circleThrough3Points(input.point1, input.point2, input.point3);
    if (!circle) return null;
    R = circle.radius;
    const a1 = Math.atan2(input.point1.y - circle.center.y, input.point1.x - circle.center.x);
    const a3 = Math.atan2(input.point3.y - circle.center.y, input.point3.x - circle.center.x);
    delta = Math.abs(normalizeAngle(a3 - a1));
  }

  // From two tangent bearings: Δ = difference of bearings
  if (input.tangentInBearing !== undefined && input.tangentOutBearing !== undefined && !delta) {
    let diff = input.tangentOutBearing - input.tangentInBearing;
    if (diff < -180) diff += 360;
    if (diff > 180) diff -= 360;
    delta = Math.abs(diff) * DEG;
    if (!input.direction) input.direction = diff > 0 ? 'RIGHT' : 'LEFT';
  }

  if (!R || !delta || R <= 0 || delta <= 0) return null;
  const direction = input.direction ?? 'RIGHT';

  // Compute all derived parameters
  const L = R * delta;
  const C = 2 * R * Math.sin(delta / 2);
  const T = R * Math.tan(delta / 2);
  const E = R * (1 / Math.cos(delta / 2) - 1);
  const M_val = R * (1 - Math.cos(delta / 2));
  const D = 5729.578 / R;

  let pc: Point2D | undefined;
  let pt: Point2D | undefined;
  let pi: Point2D | undefined;
  let rp: Point2D | undefined;
  let mpc: Point2D | undefined;
  let tangentIn: number;

  if (input.pc && input.tangentInBearing !== undefined) {
    tangentIn = input.tangentInBearing * DEG;
    pc = input.pc;
    pi = {
      x: pc.x + T * Math.sin(tangentIn),
      y: pc.y + T * Math.cos(tangentIn),
    };
  } else if (input.pi && input.tangentInBearing !== undefined) {
    tangentIn = input.tangentInBearing * DEG;
    pi = input.pi;
    pc = {
      x: pi.x - T * Math.sin(tangentIn),
      y: pi.y - T * Math.cos(tangentIn),
    };
  } else if (input.pc && input.pt) {
    pc = input.pc;
    pt = input.pt;
    const chordAz = Math.atan2(pt.x - pc.x, pt.y - pc.y);
    tangentIn = chordAz - (direction === 'RIGHT' ? delta / 2 : -delta / 2);
    pi = {
      x: pc.x + T * Math.sin(tangentIn),
      y: pc.y + T * Math.cos(tangentIn),
    };
  } else if (input.point1 && input.point2 && input.point3) {
    pc = input.point1;
    pt = input.point3;
    const circle = circleThrough3Points(input.point1, input.point2, input.point3)!;
    rp = circle.center;
    const a1 = Math.atan2(pc.y - rp.y, pc.x - rp.x);
    tangentIn = a1 + (direction === 'RIGHT' ? Math.PI / 2 : -Math.PI / 2);
    pi = {
      x: pc.x + T * Math.sin(tangentIn),
      y: pc.y + T * Math.cos(tangentIn),
    };
    const ptAngle3 = Math.atan2(pt.y - rp.y, pt.x - rp.x);
    mpc = {
      x: rp.x + R * Math.cos((a1 + ptAngle3) / 2),
      y: rp.y + R * Math.sin((a1 + ptAngle3) / 2),
    };
  } else {
    tangentIn = 0;
    pc = { x: 0, y: 0 };
    pi = { x: T * Math.sin(tangentIn), y: T * Math.cos(tangentIn) };
  }

  // Compute radius point (center)
  const perpAngle = tangentIn + (direction === 'RIGHT' ? Math.PI / 2 : -Math.PI / 2);
  if (!rp) {
    rp = {
      x: pc!.x + R * Math.sin(perpAngle),
      y: pc!.y + R * Math.cos(perpAngle),
    };
  }

  // Compute PT from center for accuracy
  const pcAngle = Math.atan2(pc!.x - rp.x, pc!.y - rp.y);
  const ptAngle = pcAngle + (direction === 'RIGHT' ? -delta : delta);
  if (!pt) {
    pt = {
      x: rp.x + R * Math.sin(ptAngle),
      y: rp.y + R * Math.cos(ptAngle),
    };
  }

  // MPC
  const mpcAngle = pcAngle + (direction === 'RIGHT' ? -delta / 2 : delta / 2);
  if (!mpc) {
    mpc = {
      x: rp.x + R * Math.sin(mpcAngle),
      y: rp.y + R * Math.cos(mpcAngle),
    };
  }

  const CB_az = inverseBearingDistance(pc!, pt).azimuth;

  return {
    R, delta, L, C, CB: CB_az * DEG, T, E, M: M_val, D, direction,
    pc: pc!, pt, pi: pi!, rp, mpc,
    tangentInBearing: tangentIn,
    tangentOutBearing: tangentIn + (direction === 'RIGHT' ? delta : -delta),
  };
}

export function crossValidateCurve(input: CurveInput, computed: CurveParameters): CurveValidation {
  const checks: CurveCheck[] = [];

  const pairs: [string, number | undefined, number, number][] = [
    ['R',     input.R,     computed.R,                         0.01],
    ['delta', input.delta, computed.delta * 180 / Math.PI,     1/3600],
    ['L',     input.L,     computed.L,                         0.01],
    ['C',     input.C,     computed.C,                         0.01],
    ['T',     input.T,     computed.T,                         0.01],
    ['E',     input.E,     computed.E,                         0.01],
    ['M',     input.M,     computed.M,                         0.01],
  ];

  for (const [name, provided, computedVal, tolerance] of pairs) {
    if (provided !== undefined) {
      const error = Math.abs(provided - computedVal);
      checks.push({
        parameter: name,
        provided,
        computed: computedVal,
        error,
        tolerance,
        passed: error <= tolerance,
      });
    }
  }

  const maxError = Math.max(0, ...checks.map(c => c.error));
  return {
    isValid: checks.every(c => c.passed),
    maxError,
    checks,
  };
}
