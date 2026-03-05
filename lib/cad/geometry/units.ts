// lib/cad/geometry/units.ts — Unit conversion and display-formatting utilities
// Internal world coordinates are always in US Survey Feet (easting, northing).
// All display formatting reads a DisplayPreferences object to produce the
// user-facing string representations used in the HUD, status bar, and overlays.

import type { DisplayPreferences } from '../types';
import { azimuthToQuadrant, decimalToDMS, formatBearing, formatAzimuth } from './bearing';

// ─────────────────────────────────────────────────────────────────────────────
// Conversion factors (all relative to US Survey Feet)
// ─────────────────────────────────────────────────────────────────────────────
const FT_TO_IN   = 12;
const FT_TO_MILE = 1 / 5280;
const FT_TO_M    = 0.3048;          // 1 US survey foot = 0.3048 m (exact)
const FT_TO_CM   = FT_TO_M * 100;
const FT_TO_MM   = FT_TO_M * 1000;

// Area conversions (from sq ft)
const SQFT_TO_ACRES  = 1 / 43560;
const SQFT_TO_SQM    = FT_TO_M * FT_TO_M;
const SQFT_TO_HECTARES = SQFT_TO_SQM / 10000;

// ─────────────────────────────────────────────────────────────────────────────
// Linear distance — world feet → display value
// ─────────────────────────────────────────────────────────────────────────────

/** Convert a world-space distance (feet) to the user's preferred linear unit. */
export function feetToLinearUnit(feet: number, prefs: DisplayPreferences): number {
  switch (prefs.linearUnit) {
    case 'IN':   return feet * FT_TO_IN;
    case 'MILE': return feet * FT_TO_MILE;
    case 'M':    return feet * FT_TO_M;
    case 'CM':   return feet * FT_TO_CM;
    case 'MM':   return feet * FT_TO_MM;
    default:     return feet; // FT
  }
}

/** Abbreviated unit label (e.g. "ft", "m") */
export function linearUnitLabel(prefs: DisplayPreferences): string {
  switch (prefs.linearUnit) {
    case 'IN':   return 'in';
    case 'MILE': return 'mi';
    case 'M':    return 'm';
    case 'CM':   return 'cm';
    case 'MM':   return 'mm';
    default:     return 'ft';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fraction formatting
// ─────────────────────────────────────────────────────────────────────────────
const FRACTION_DENOMS = [2, 4, 8, 16, 32, 64, 128] as const;

/** Greatest common divisor (iterative Euclidean) */
function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) { const t = b; b = a % b; a = t; }
  return a;
}

/**
 * Format a positive number as a mixed-number fraction.
 * The denominator is chosen from a fixed set: 2, 4, 8, 16, 32, 64.
 * Examples: 1.5 → "1 1/2", 0.25 → "1/4", 3.0 → "3"
 */
function formatAsFraction(value: number, maxDenom = 64): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const whole = Math.floor(abs);
  const frac = abs - whole;

  if (frac < 0.0001) return `${sign}${whole}`;

  // Find best power-of-2 denominator
  const denom = FRACTION_DENOMS.find((d) => d <= maxDenom) ?? 64;
  // Try each denominator in increasing order, pick the one with least remainder
  let bestNum = 0;
  let bestDen = 1;
  let bestErr = Infinity;
  for (const d of FRACTION_DENOMS) {
    if (d > maxDenom) break;
    const num = Math.round(frac * d);
    const err = Math.abs(frac - num / d);
    if (err < bestErr) { bestErr = err; bestNum = num; bestDen = d; }
  }
  if (bestErr > 0.5 / denom) {
    // Frac rounds to zero at this precision — just return whole
    return `${sign}${whole}`;
  }
  const g = gcd(bestNum, bestDen);
  const n = bestNum / g;
  const d2 = bestDen / g;
  if (n === d2) return `${sign}${whole + 1}`;
  if (n === 0)  return `${sign}${whole}`;
  return whole > 0 ? `${sign}${whole} ${n}/${d2}` : `${sign}${n}/${d2}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: format a linear distance value
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a world-space distance (feet) for display per user preferences.
 * Returns a string like "123.456 ft", "1 3/4 in", "37.62 m".
 */
export function formatDistance(feet: number, prefs: DisplayPreferences): string {
  const val = feetToLinearUnit(feet, prefs);
  const unit = linearUnitLabel(prefs);
  if (prefs.linearFormat === 'FRACTION') {
    return `${formatAsFraction(val)} ${unit}`;
  }
  return `${val.toFixed(prefs.linearDecimalPlaces)} ${unit}`;
}

/**
 * Format a raw delta (already in world feet) as a signed distance string.
 * e.g.  "+12.340 ft"  or  "-3 1/4 in"
 */
export function formatDelta(feet: number, prefs: DisplayPreferences): string {
  const val = feetToLinearUnit(feet, prefs);
  const unit = linearUnitLabel(prefs);
  const sign = feet >= 0 ? '+' : '';
  if (prefs.linearFormat === 'FRACTION') {
    return `${sign}${formatAsFraction(val)} ${unit}`;
  }
  return `${sign}${val.toFixed(prefs.linearDecimalPlaces)} ${unit}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bearing / Angle formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a math angle (radians, measured counter-clockwise from east) as a
 * survey bearing or azimuth per user preferences.
 *
 * Survey azimuth = 0 at North, clockwise.
 * Math angle → azimuth: az = 90° - (angle_in_deg)
 */
export function formatAngle(
  mathAngleRad: number,
  prefs: DisplayPreferences,
  mode: 'BEARING' | 'ANGLE' = 'BEARING',
): string {
  if (mode === 'ANGLE') {
    // Plain angle in degrees (not bearing-style)
    const deg = mathAngleRad * (180 / Math.PI);
    if (prefs.angleFormat === 'DECIMAL_DEG') return `${deg.toFixed(4)}°`;
    const { degrees, minutes, seconds } = decimalToDMS(Math.abs(deg));
    const sign = deg < 0 ? '-' : '';
    return `${sign}${degrees}°${String(minutes).padStart(2, '0')}'${String(seconds).padStart(2, '0')}"`;
  }

  // Bearing: convert math angle to survey azimuth
  const mathDeg = mathAngleRad * (180 / Math.PI);
  let azimuth = 90 - mathDeg;
  azimuth = ((azimuth % 360) + 360) % 360;

  if (prefs.bearingFormat === 'AZIMUTH') {
    if (prefs.angleFormat === 'DECIMAL_DEG') return `${azimuth.toFixed(4)}°`;
    return formatAzimuth(azimuth);
  }
  // QUADRANT
  if (prefs.angleFormat === 'DECIMAL_DEG') {
    const qb = azimuthToQuadrant(azimuth);
    const angle = qb.degrees + qb.minutes / 60 + (qb.seconds + qb.tenthSeconds / 10) / 3600;
    return `${qb.direction1} ${angle.toFixed(6)}° ${qb.direction2}`;
  }
  return formatBearing(azimuth, 'SECOND');
}

/**
 * Format a survey azimuth (0 = North, clockwise) per user preferences.
 */
export function formatSurveyAngle(azimuthDeg: number, prefs: DisplayPreferences): string {
  const az = ((azimuthDeg % 360) + 360) % 360;
  if (prefs.bearingFormat === 'AZIMUTH') {
    if (prefs.angleFormat === 'DECIMAL_DEG') return `${az.toFixed(4)}°`;
    return formatAzimuth(az);
  }
  if (prefs.angleFormat === 'DECIMAL_DEG') {
    const qb = azimuthToQuadrant(az);
    const angle = qb.degrees + qb.minutes / 60 + (qb.seconds + qb.tenthSeconds / 10) / 3600;
    return `${qb.direction1} ${angle.toFixed(6)}° ${qb.direction2}`;
  }
  return formatBearing(az, 'SECOND');
}

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate display (with optional origin offset)
// ─────────────────────────────────────────────────────────────────────────────

export interface DisplayCoords {
  label1: string; // "N" or "X"
  value1: string; // formatted Northing or X
  label2: string; // "E" or "Y"
  value2: string; // formatted Easting or Y
}

/**
 * Convert world coordinates (x = Easting, y = Northing) to display strings.
 * Applies origin offset and formats per preferences.
 * Precision for coordinates uses linearDecimalPlaces + 1 (one extra digit for coords).
 */
export function formatCoordinates(
  worldX: number,
  worldY: number,
  prefs: DisplayPreferences,
): DisplayCoords {
  // Apply origin offset
  const easting  = worldX + prefs.originEasting;
  const northing = worldY + prefs.originNorthing;

  const places = prefs.linearDecimalPlaces;

  if (prefs.coordMode === 'NE') {
    // Convert from world feet to display unit
    const n = feetToLinearUnit(northing, prefs);
    const e = feetToLinearUnit(easting, prefs);
    const unit = linearUnitLabel(prefs);
    return {
      label1: 'N',
      value1: `${n.toFixed(places)} ${unit}`,
      label2: 'E',
      value2: `${e.toFixed(places)} ${unit}`,
    };
  }
  // XY mode
  const xVal = feetToLinearUnit(easting, prefs);
  const yVal = feetToLinearUnit(northing, prefs);
  const unit = linearUnitLabel(prefs);
  return {
    label1: 'X',
    value1: `${xVal.toFixed(places)} ${unit}`,
    label2: 'Y',
    value2: `${yVal.toFixed(places)} ${unit}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Area formatting
// ─────────────────────────────────────────────────────────────────────────────

/** Convert sq-ft to user's preferred area unit. */
export function sqFtToAreaUnit(sqFt: number, prefs: DisplayPreferences): number {
  switch (prefs.areaUnit) {
    case 'ACRES':    return sqFt * SQFT_TO_ACRES;
    case 'SQ_M':     return sqFt * SQFT_TO_SQM;
    case 'HECTARES': return sqFt * SQFT_TO_HECTARES;
    default:         return sqFt; // SQ_FT
  }
}

/** Abbreviated area unit label */
export function areaUnitLabel(prefs: DisplayPreferences): string {
  switch (prefs.areaUnit) {
    case 'ACRES':    return 'ac';
    case 'SQ_M':     return 'm²';
    case 'HECTARES': return 'ha';
    default:         return 'sf';
  }
}

/** Format an area (sq ft) for display. */
export function formatArea(sqFt: number, prefs: DisplayPreferences): string {
  const val = sqFtToAreaUnit(sqFt, prefs);
  const unit = areaUnitLabel(prefs);
  // Use 2 extra decimal places for area
  const places = Math.min(prefs.linearDecimalPlaces + 2, 6);
  return `${val.toFixed(places)} ${unit}`;
}
