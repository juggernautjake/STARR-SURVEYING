// lib/surveying/compass.ts — the pure formatting behind the Work Mode COMPASS (owner 2026-07-18: "a
// well-formatted compass that tells us the angle in azimuth and bearing … flawless and easy to read").
//
// No redundancy: azimuth→quadrant-bearing + the DMS string formatters already live in
// `lib/cad/geometry/bearing.ts` (`formatAzimuth`, `formatBearing`, `azimuthToQuadrant`). This adds only the
// genuinely-missing pieces the compass DISPLAY needs — a single reading object carrying BOTH representations,
// plus 16-point cardinal naming (N, NNE, NE, …) which the geometry module doesn't have. The live device
// heading (magnetometer) is the mobile-runtime source; feeding a heading in degrees to `compassReading` is
// pure and fully testable.
import { formatAzimuth, formatBearing } from '@/lib/cad/geometry/bearing';

/** The 16-point compass rose, clockwise from North. Index = round(azimuth / 22.5) mod 16. */
export const CARDINAL_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const;
export type CardinalPoint = typeof CARDINAL_POINTS[number];

/** Normalize any heading (degrees) to [0, 360). Returns null for a non-finite input. */
export function normalizeHeading(deg: number): number | null {
  if (typeof deg !== 'number' || !Number.isFinite(deg)) return null;
  return ((deg % 360) + 360) % 360;
}

/** The 16-point cardinal name for a heading, e.g. 45° → "NE", 350° → "N". */
export function cardinalPoint(azimuth: number): CardinalPoint | null {
  const norm = normalizeHeading(azimuth);
  if (norm === null) return null;
  const idx = Math.round(norm / 22.5) % 16;
  return CARDINAL_POINTS[idx];
}

export interface CompassReading {
  /** The heading normalized to [0, 360). */
  azimuth: number;
  /** Azimuth as a DMS string, e.g. `45°30'00"`. */
  azimuthText: string;
  /** Quadrant bearing string, e.g. `N 45°30'00" E`. */
  bearingText: string;
  /** 16-point cardinal name, e.g. `NE`. */
  cardinal: CardinalPoint;
}

/**
 * Turn a raw device heading (degrees, any range) into the compass DISPLAY model — both the azimuth and the
 * quadrant bearing, formatted, plus the cardinal point. Returns null for a non-finite heading so the UI shows
 * "—" rather than a broken reading. Reuses the geometry module's formatters (single source of truth).
 */
export function compassReading(headingDeg: number): CompassReading | null {
  const azimuth = normalizeHeading(headingDeg);
  if (azimuth === null) return null;
  return {
    azimuth,
    azimuthText: formatAzimuth(azimuth),
    bearingText: formatBearing(azimuth),
    cardinal: cardinalPoint(azimuth) as CardinalPoint,
  };
}
