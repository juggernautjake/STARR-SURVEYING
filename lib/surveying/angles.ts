// lib/surveying/angles.ts — the direction-angle computations a traverse needs, for the Work Mode surveying
// calculator (owner 2026-07-18). The diagram module (`lib/diagrams/survey-diagram.ts`) RENDERS traverses but
// has no standalone angle math, and `triangle.ts` covers triangle interior angles, not directions between
// courses — so this fills that gap: back-azimuth, the clockwise angle-right, the deflection angle (L/R), and
// the interior angle at a station. Reuses `normalizeAngle` from `triangle.ts` (no re-derivation). Azimuths are
// DEGREES from North, clockwise. Pure + framework-free + tested; every function returns a finite number (or a
// tagged object) or null on a non-finite input — never NaN.
import { normalizeAngle } from '@/lib/surveying/triangle';

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** The back-azimuth (reverse direction) of a course: azimuth ± 180°, normalized to [0, 360). */
export function backAzimuth(azimuth: number): number | null {
  if (!isNum(azimuth)) return null;
  return normalizeAngle(azimuth + 180);
}

/** The clockwise ("angle right") turned from one direction to another: (to − from) normalized to [0, 360). */
export function angleRight(fromAzimuth: number, toAzimuth: number): number | null {
  if (!isNum(fromAzimuth) || !isNum(toAzimuth)) return null;
  return normalizeAngle(toAzimuth - fromAzimuth);
}

export interface Deflection { angle: number; direction: 'L' | 'R' | 'straight' }

/**
 * The deflection angle when continuing along a traverse from one course's direction to the next: the change in
 * heading, expressed as a magnitude in [0, 180] plus a turn direction — 'R' (right/clockwise), 'L'
 * (left/counter-clockwise), or 'straight' (0° or a 180° reversal). Returns null on a non-finite input.
 */
export function deflectionAngle(fromAzimuth: number, toAzimuth: number): Deflection | null {
  if (!isNum(fromAzimuth) || !isNum(toAzimuth)) return null;
  let diff = normalizeAngle(toAzimuth - fromAzimuth) as number; // [0, 360)
  if (diff > 180) diff -= 360; // → (−180, 180]
  const angle = Math.abs(diff);
  if (angle === 0 || angle === 180) return { angle, direction: 'straight' };
  return { angle, direction: diff > 0 ? 'R' : 'L' };
}

/**
 * The interior angle at a traverse station — the angle between the incoming course and the outgoing course,
 * measured through the interior of the figure. Computed as the clockwise angle from the back-azimuth of the
 * incoming course to the outgoing course. For a closed traverse walked clockwise, the interior angles sum to
 * (n − 2) × 180°. Returns null on a non-finite input.
 */
export function interiorAngle(incomingAzimuth: number, outgoingAzimuth: number): number | null {
  const back = backAzimuth(incomingAzimuth);
  if (back === null || !isNum(outgoingAzimuth)) return null;
  return angleRight(back, outgoingAzimuth);
}
