// lib/surveying/traverse.ts — traverse computations for the Work Mode surveying calculator (owner 2026-07-18).
//
// The point-level primitives already exist in `lib/cad/geometry/bearing.ts` — `forwardPoint` (station +
// azimuth + distance → next point) and `inverseBearingDistance` (two points → azimuth + distance). What a
// surveyor also needs, and the app lacked, are the TRAVERSE-level quantities built on them: a course's
// latitude/departure (its N–S and E–W components), a closed traverse's misclosure + precision ratio, and
// parcel AREA by coordinates (the shoelace method). Pure + framework-free + fully tested; azimuths are DEGREES
// measured from North, clockwise (the same convention as `inverseBearingDistance`).
import type { Point2D } from '@/lib/cad/types';

const toRad = (deg: number) => (deg * Math.PI) / 180;
const round = (n: number, dp = 6) => { const f = 10 ** dp; return Math.round(n * f) / f; };

/** A single traverse course: a direction (azimuth, degrees from North) and a length. */
export interface Course { azimuth: number; distance: number }

/**
 * The latitude (N–S component, +north/−south) and departure (E–W component, +east/−west) of a course:
 * latitude = distance·cos(azimuth), departure = distance·sin(azimuth). Returns null for a non-finite input.
 */
export function latitudeDeparture(azimuth: number, distance: number): { latitude: number; departure: number } | null {
  if (!Number.isFinite(azimuth) || !Number.isFinite(distance)) return null;
  const az = toRad(azimuth);
  return { latitude: round(distance * Math.cos(az)), departure: round(distance * Math.sin(az)) };
}

export interface TraverseMisclosure {
  /** Sum of the courses' latitudes (0 for a perfectly closed traverse). */
  latError: number;
  /** Sum of the courses' departures (0 for a perfectly closed traverse). */
  depError: number;
  /** The linear misclosure — the straight-line gap between the computed and true closing point. */
  linearError: number;
  /** Total length of the traverse. */
  perimeter: number;
  /** Precision as the denominator N of a 1:N ratio (perimeter / linearError), rounded; 0 when the traverse
   *  closes exactly (no error) — the UI shows "exact". */
  precisionDenominator: number;
}

/**
 * The misclosure of a closed traverse: sum the latitudes and departures (each should net to zero for a closed
 * loop), the linear error √(ΣlatΒ² + Σdep²), the perimeter, and the precision ratio 1:(perimeter/linearError).
 * Returns null for an empty/invalid set. A perfectly-closing traverse reports `linearError: 0` and
 * `precisionDenominator: 0` (interpreted as "exact").
 */
export function traverseMisclosure(courses: Course[]): TraverseMisclosure | null {
  if (!Array.isArray(courses) || courses.length === 0) return null;
  let latError = 0, depError = 0, perimeter = 0;
  for (const cse of courses) {
    const ld = latitudeDeparture(cse.azimuth, cse.distance);
    if (!ld) return null;
    latError += ld.latitude;
    depError += ld.departure;
    perimeter += cse.distance;
  }
  latError = round(latError);
  depError = round(depError);
  const linearError = round(Math.hypot(latError, depError));
  const precisionDenominator = linearError > 0 ? Math.round(perimeter / linearError) : 0;
  return { latError, depError, linearError, perimeter: round(perimeter), precisionDenominator };
}

/**
 * Parcel area from boundary coordinates via the shoelace (coordinate) method:
 * A = ½ |Σ (x_i·y_{i+1} − x_{i+1}·y_i)|. The polygon is treated as closed (the last point connects to the
 * first), so the caller need not repeat the first point. Returns null for fewer than 3 points or a non-finite
 * coordinate. Always non-negative (orientation-independent) — the magnitude of the enclosed area.
 */
export function areaByCoordinates(points: Point2D[]): number | null {
  if (!Array.isArray(points) || points.length < 3) return null;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!Number.isFinite(a?.x) || !Number.isFinite(a?.y) || !Number.isFinite(b?.x) || !Number.isFinite(b?.y)) return null;
    sum += a.x * b.y - b.x * a.y;
  }
  return round(Math.abs(sum) / 2);
}

/** Square feet → acres (43,560 ft² per acre) — surveyors report parcel area both ways. Returns null for a
 *  non-finite input. */
export function squareFeetToAcres(sqft: number): number | null {
  if (!Number.isFinite(sqft)) return null;
  return round(sqft / 43560, 4);
}
