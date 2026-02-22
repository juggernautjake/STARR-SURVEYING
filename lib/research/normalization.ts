// lib/research/normalization.ts — Deterministic data normalization for surveying values
// All functions are pure code (no AI calls) — they must produce identical output for identical input.

// ── Normalized Types ────────────────────────────────────────────────────────

export interface NormalizedBearing {
  quadrant: 'NE' | 'NW' | 'SE' | 'SW';
  degrees: number;
  minutes: number;
  seconds: number;
  decimal_degrees: number;   // degrees + minutes/60 + seconds/3600
  azimuth: number;           // 0-360 from north clockwise
  raw_text: string;
}

export interface NormalizedDistance {
  value: number;
  unit: 'feet' | 'meters' | 'chains' | 'varas' | 'rods';
  value_in_feet: number;
  raw_text: string;
}

export interface NormalizedCurveData {
  radius: number;            // in feet
  arc_length: number;        // in feet
  chord_bearing: NormalizedBearing;
  chord_distance: NormalizedDistance;
  delta_angle: { degrees: number; minutes: number; seconds: number; decimal_degrees: number };
  direction: 'left' | 'right';
  tangent_length?: number;
}

export interface NormalizedMonument {
  type: string;              // e.g., 'iron_rod', 'iron_pipe', 'concrete', 'pk_nail', 'mag_nail'
  size?: string;             // e.g., '1/2 inch', '5/8 inch'
  cap?: string;              // e.g., 'RPLS 12345'
  condition: 'found' | 'set' | 'called_for' | 'missing' | 'unknown';
  description: string;
}

export interface NormalizedCall {
  type: 'line' | 'curve';
  bearing?: NormalizedBearing;
  distance?: NormalizedDistance;
  curve?: NormalizedCurveData;
  monument_at_end?: NormalizedMonument;
  to_description?: string;
}

// ── Conversion Constants ────────────────────────────────────────────────────

const VARAS_TO_FEET = 2.777778;
const CHAINS_TO_FEET = 66.0;
const RODS_TO_FEET = 16.5;
const METERS_TO_FEET = 3.28084;

// ── Error Class ─────────────────────────────────────────────────────────────

export class NormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NormalizationError';
  }
}

// ── Bearing Normalization ───────────────────────────────────────────────────

/**
 * Parse bearing strings into a normalized form.
 * Handles formats like:
 *   "N 45° 30' 15" E"
 *   "N45-30-15E"
 *   "N 45 30 15 E"
 *   "S89°59'30"W"
 *   "N 45°30'15.5" E"
 */
export function normalizeBearing(raw: string): NormalizedBearing {
  const cleaned = raw.trim();

  // Main regex: [NS] degrees minutes seconds [EW]
  // Supports degree symbol, dash, space separators; optional decimal on seconds
  const regex = /([NS])\s*(\d+)\s*[°\s\-]+\s*(\d+)\s*['\s\-]+\s*(\d+(?:\.\d+)?)\s*["″]?\s*([EW])/i;
  const match = cleaned.match(regex);

  if (!match) {
    throw new NormalizationError(`Cannot parse bearing: "${raw}"`);
  }

  const [, ns, degStr, minStr, secStr, ew] = match;
  const degrees = parseInt(degStr, 10);
  const minutes = parseInt(minStr, 10);
  const seconds = parseFloat(secStr);

  // Validate ranges
  if (degrees > 90) throw new NormalizationError(`Bearing degrees out of range (${degrees}): "${raw}"`);
  if (minutes > 59) throw new NormalizationError(`Bearing minutes out of range (${minutes}): "${raw}"`);
  if (seconds >= 60) throw new NormalizationError(`Bearing seconds out of range (${seconds}): "${raw}"`);

  const decimal_degrees = degrees + minutes / 60 + seconds / 3600;
  const quadrant = `${ns.toUpperCase()}${ew.toUpperCase()}` as 'NE' | 'NW' | 'SE' | 'SW';

  let azimuth: number;
  switch (quadrant) {
    case 'NE': azimuth = decimal_degrees; break;
    case 'SE': azimuth = 180 - decimal_degrees; break;
    case 'SW': azimuth = 180 + decimal_degrees; break;
    case 'NW': azimuth = 360 - decimal_degrees; break;
  }

  return { quadrant, degrees, minutes, seconds, decimal_degrees, azimuth, raw_text: raw };
}

/**
 * Format a bearing back to standard notation: N 45° 30' 15" E
 */
export function formatBearing(b: NormalizedBearing): string {
  const sec = Number.isInteger(b.seconds) ? `${b.seconds}` : b.seconds.toFixed(1);
  return `${b.quadrant[0]} ${b.degrees}° ${String(b.minutes).padStart(2, '0')}' ${sec.padStart(2, '0')}" ${b.quadrant[1]}`;
}

// ── Distance Normalization ──────────────────────────────────────────────────

/**
 * Parse distance strings: "150.00 feet", "150.00'", "150 ft", "45.5 varas", "2.5 chains"
 */
export function normalizeDistance(raw: string): NormalizedDistance {
  const cleaned = raw.trim();

  // Try to match value + unit
  const regex = /(\d+(?:\.\d+)?)\s*(feet|foot|ft|'|meters|m|chains|ch|varas|vara|vrs|rods|rd)/i;
  const match = cleaned.match(regex);

  if (!match) {
    // Try bare number (assume feet)
    const numMatch = cleaned.match(/^(\d+(?:\.\d+)?)$/);
    if (numMatch) {
      const value = parseFloat(numMatch[1]);
      return { value, unit: 'feet', value_in_feet: value, raw_text: raw };
    }
    throw new NormalizationError(`Cannot parse distance: "${raw}"`);
  }

  const value = parseFloat(match[1]);
  const unitRaw = match[2].toLowerCase();

  let unit: NormalizedDistance['unit'];
  let value_in_feet: number;

  if (['feet', 'foot', 'ft', "'"].includes(unitRaw)) {
    unit = 'feet';
    value_in_feet = value;
  } else if (['meters', 'm'].includes(unitRaw)) {
    unit = 'meters';
    value_in_feet = value * METERS_TO_FEET;
  } else if (['chains', 'ch'].includes(unitRaw)) {
    unit = 'chains';
    value_in_feet = value * CHAINS_TO_FEET;
  } else if (['varas', 'vara', 'vrs'].includes(unitRaw)) {
    unit = 'varas';
    value_in_feet = value * VARAS_TO_FEET;
  } else if (['rods', 'rd'].includes(unitRaw)) {
    unit = 'rods';
    value_in_feet = value * RODS_TO_FEET;
  } else {
    unit = 'feet';
    value_in_feet = value;
  }

  return { value, unit, value_in_feet, raw_text: raw };
}

/**
 * Format distance back to readable form.
 */
export function formatDistance(d: NormalizedDistance): string {
  return `${d.value.toFixed(2)} ${d.unit}`;
}

// ── DMS (Degrees-Minutes-Seconds) Helpers ───────────────────────────────────

export function parseDMS(raw: string): { degrees: number; minutes: number; seconds: number; decimal_degrees: number } {
  const regex = /(\d+)\s*[°\s\-]+\s*(\d+)\s*['\s\-]+\s*(\d+(?:\.\d+)?)/;
  const match = raw.trim().match(regex);
  if (!match) throw new NormalizationError(`Cannot parse DMS: "${raw}"`);

  const degrees = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseFloat(match[3]);
  const decimal_degrees = degrees + minutes / 60 + seconds / 3600;

  return { degrees, minutes, seconds, decimal_degrees };
}

export function formatDMS(d: { degrees: number; minutes: number; seconds: number }): string {
  const sec = Number.isInteger(d.seconds) ? `${d.seconds}` : d.seconds.toFixed(1);
  return `${d.degrees}° ${String(d.minutes).padStart(2, '0')}' ${sec}"`;
}

// ── Traverse Geometry ───────────────────────────────────────────────────────

export interface TraversePoint {
  x: number;  // easting (feet)
  y: number;  // northing (feet)
}

/**
 * Given a starting point and a bearing+distance call, compute the next point.
 * Uses standard survey convention: azimuth is clockwise from north.
 */
export function computeNextPoint(
  start: TraversePoint,
  azimuth: number,
  distanceFeet: number
): TraversePoint {
  const azRad = (azimuth * Math.PI) / 180;
  return {
    x: start.x + distanceFeet * Math.sin(azRad),
    y: start.y + distanceFeet * Math.cos(azRad),
  };
}

/**
 * Compute a point on a curve given the curve parameters.
 */
export function computeCurveEndpoint(
  start: TraversePoint,
  curve: NormalizedCurveData
): TraversePoint {
  // Use chord bearing and chord distance for endpoint calculation
  const chordAzimuth = curve.chord_bearing.azimuth;
  const chordDist = curve.chord_distance.value_in_feet;
  return computeNextPoint(start, chordAzimuth, chordDist);
}

/**
 * Compute traverse closure — how far the ending point is from the starting point.
 * Returns misclosure distance and precision ratio (1:N).
 */
export function calculateTraverseClosure(
  calls: NormalizedCall[],
  startPoint: TraversePoint = { x: 0, y: 0 }
): { misclosure: number; ratio: number; totalDistance: number; endPoint: TraversePoint } {
  let current = { ...startPoint };
  let totalDistance = 0;

  for (const call of calls) {
    if (call.type === 'line' && call.bearing && call.distance) {
      const dist = call.distance.value_in_feet;
      current = computeNextPoint(current, call.bearing.azimuth, dist);
      totalDistance += dist;
    } else if (call.type === 'curve' && call.curve) {
      const chordDist = call.curve.chord_distance.value_in_feet;
      current = computeCurveEndpoint(current, call.curve);
      totalDistance += call.curve.arc_length;
      // Use arc length for total distance but chord for position
      void chordDist; // position already computed above
    }
  }

  // Misclosure = distance from end point back to start
  const dx = current.x - startPoint.x;
  const dy = current.y - startPoint.y;
  const misclosure = Math.sqrt(dx * dx + dy * dy);
  const ratio = misclosure > 0 ? totalDistance / misclosure : Infinity;

  return { misclosure, ratio, totalDistance, endPoint: current };
}

/**
 * Compute area from a set of traverse points using the Shoelace formula.
 * Returns area in square feet.
 */
export function computeAreaSqFt(points: TraversePoint[]): number {
  if (points.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }

  return Math.abs(area) / 2;
}

/**
 * Convert square feet to acres.
 */
export function sqFtToAcres(sqFt: number): number {
  return sqFt / 43560;
}

/**
 * Validate curve data consistency: arc_length should approximately equal radius * delta_angle.
 * Returns the discrepancy in feet.
 */
export function validateCurveData(curve: NormalizedCurveData): {
  valid: boolean;
  computedArc: number;
  discrepancy: number;
} {
  const deltaRad = (curve.delta_angle.decimal_degrees * Math.PI) / 180;
  const computedArc = curve.radius * deltaRad;
  const discrepancy = Math.abs(computedArc - curve.arc_length);

  return {
    valid: discrepancy < 0.05, // 0.05 feet tolerance
    computedArc,
    discrepancy,
  };
}

// ── Bearing Comparison ──────────────────────────────────────────────────────

/**
 * Compare two bearings and return the difference in arc-seconds.
 */
export function bearingDifferenceArcSeconds(a: NormalizedBearing, b: NormalizedBearing): number {
  const diffDeg = Math.abs(a.decimal_degrees - b.decimal_degrees);
  return diffDeg * 3600;
}

/**
 * Determine if two bearings are in opposite directions (E vs W or N vs S flip).
 */
export function bearingsOpposite(a: NormalizedBearing, b: NormalizedBearing): boolean {
  // Same degrees/minutes/seconds but different quadrant
  if (Math.abs(a.decimal_degrees - b.decimal_degrees) < 0.01) {
    return a.quadrant !== b.quadrant;
  }
  return false;
}

// ── Area Comparison ─────────────────────────────────────────────────────────

/**
 * Parse area from text: "1.234 acres", "53,780 sq ft", etc.
 */
export function parseArea(raw: string): { value: number; unit: 'acres' | 'sq_ft'; value_in_acres: number } {
  const cleaned = raw.trim().replace(/,/g, '');

  const acresMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*acres?/i);
  if (acresMatch) {
    const value = parseFloat(acresMatch[1]);
    return { value, unit: 'acres', value_in_acres: value };
  }

  const sqFtMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:sq\.?\s*(?:ft\.?|feet)|square\s*feet)/i);
  if (sqFtMatch) {
    const value = parseFloat(sqFtMatch[1]);
    return { value, unit: 'sq_ft', value_in_acres: sqFtToAcres(value) };
  }

  throw new NormalizationError(`Cannot parse area: "${raw}"`);
}
