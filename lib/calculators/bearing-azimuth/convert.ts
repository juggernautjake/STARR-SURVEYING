// lib/calculators/bearing-azimuth/convert.ts
//
// Slice P3-ba — bearing ↔ azimuth conversion for the surveyor
// calculator suite. Pure functions; tests exercise them directly
// without rendering React.
//
// Conventions used here:
//   • Bearing is the "quadrant + acute angle" form surveyors read
//     off a chain or a vintage transit, e.g. `N 32° 15' 40" E`.
//     The angle is in [0°, 90°] and the quadrant picks which
//     180° half-plane it points into.
//   • Azimuth is the "north-clockwise" form modern total stations
//     spit out — a single angle in [0°, 360°) measured clockwise
//     from north.
//
// All angles are in decimal degrees once they leave the DMS
// parser. We deliberately do NOT clamp inputs > 360 / negative
// inputs — the UI surface them as "out of range" so a typo is
// obvious instead of getting silently wrapped.

/** The four bearing quadrants. Naming matches the way surveyors
 *  write them out: NE → "N … E", NW → "N … W", etc. */
export type Quadrant = 'NE' | 'SE' | 'SW' | 'NW';

export const QUADRANTS: readonly Quadrant[] = ['NE', 'SE', 'SW', 'NW'];

export interface Dms {
  /** Whole degrees, integer ≥ 0. */
  deg: number;
  /** Whole minutes, integer in [0, 60). */
  min: number;
  /** Decimal seconds in [0, 60). */
  sec: number;
}

/** Convert a DMS triple to decimal degrees. Negative inputs are
 *  rejected (return NaN) — DMS is unsigned by convention; sign is
 *  carried by the quadrant in bearing form. */
export function dmsToDecimal(dms: Dms): number {
  const { deg, min, sec } = dms;
  if (deg < 0 || min < 0 || sec < 0) return NaN;
  if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec)) return NaN;
  return deg + min / 60 + sec / 3600;
}

/** Convert decimal degrees back to a DMS triple. Rounds seconds to
 *  3 decimals to keep display tidy without losing real precision. */
export function decimalToDms(decimal: number): Dms {
  if (!Number.isFinite(decimal) || decimal < 0) return { deg: 0, min: 0, sec: 0 };
  const deg = Math.floor(decimal);
  const minFloat = (decimal - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60 * 1000) / 1000;
  // Guard against floating-point pushing sec to 60 exactly.
  if (sec >= 60) {
    return { deg, min: min + 1, sec: 0 };
  }
  return { deg, min, sec };
}

/** Convert a bearing (quadrant + acute angle in decimal degrees)
 *  to an azimuth in [0, 360). Angles outside [0, 90] are passed
 *  through anyway — the UI flags them; the conversion stays pure. */
export function bearingToAzimuth(quadrant: Quadrant, decimal: number): number {
  if (!Number.isFinite(decimal)) return NaN;
  let azimuth: number;
  switch (quadrant) {
    case 'NE': azimuth = decimal; break;
    case 'SE': azimuth = 180 - decimal; break;
    case 'SW': azimuth = 180 + decimal; break;
    case 'NW': azimuth = 360 - decimal; break;
  }
  // Normalize into [0, 360). 360 → 0 so "N 0° 0' 0\" W" reads as
  // due north rather than 360 (which would print weirdly).
  return ((azimuth % 360) + 360) % 360;
}

/** Convert an azimuth in [0, 360) to a bearing. Out-of-range
 *  azimuths are normalized into [0, 360) first. */
export function azimuthToBearing(azimuth: number): { quadrant: Quadrant; decimal: number } {
  if (!Number.isFinite(azimuth)) {
    return { quadrant: 'NE', decimal: NaN };
  }
  const a = ((azimuth % 360) + 360) % 360;
  if (a <= 90) {
    return { quadrant: 'NE', decimal: a };
  }
  if (a <= 180) {
    return { quadrant: 'SE', decimal: 180 - a };
  }
  if (a <= 270) {
    return { quadrant: 'SW', decimal: a - 180 };
  }
  return { quadrant: 'NW', decimal: 360 - a };
}

/** Format a DMS triple as a string. Used by the UI's output panel. */
export function formatDms(dms: Dms): string {
  const sec = dms.sec.toFixed(3).replace(/\.?0+$/, '');
  return `${dms.deg}° ${dms.min}' ${sec || '0'}"`;
}

/** Format a full bearing string in surveyor notation, e.g.
 *  `N 32° 15' 40" E`. */
export function formatBearing(quadrant: Quadrant, dms: Dms): string {
  const ns = quadrant.startsWith('N') ? 'N' : 'S';
  const ew = quadrant.endsWith('E') ? 'E' : 'W';
  return `${ns} ${formatDms(dms)} ${ew}`;
}

/** Format an azimuth string, e.g. `122° 30' 0"`. */
export function formatAzimuth(dms: Dms): string {
  return formatDms(dms);
}
