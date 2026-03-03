// worker/src/services/validation.ts — Stage 4: Validation
// Closure check, area computation (shoelace), bearing/distance sanity,
// reference completeness, and quality rating.

import type { ExtractedBoundaryData, BoundaryCall, ValidationResult } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';

// ── Unit Conversions ───────────────────────────────────────────────────────

const SQFT_PER_ACRE = 43_560;

function toFeet(value: number, unit: string): number {
  switch (unit) {
    case 'feet': return value;
    case 'varas': return value * 2.7778; // 1 vara = 33⅓ inches
    case 'chains': return value * 66;     // 1 chain = 66 feet
    case 'meters': return value * 3.28084;
    default: return value;
  }
}

// ── Bearing Conversion ─────────────────────────────────────────────────────

/**
 * Convert a quadrant bearing (decimal degrees within quadrant) + quadrant
 * to a full azimuth (0° = North, clockwise).
 *
 * NE: azimuth = degrees
 * SE: azimuth = 180 - degrees
 * SW: azimuth = 180 + degrees
 * NW: azimuth = 360 - degrees
 */
function bearingToAzimuth(decimalDegrees: number, quadrant: string): number {
  const q = quadrant.toUpperCase().replace(/\s/g, '');
  switch (q) {
    case 'NE': return decimalDegrees;
    case 'SE': return 180 - decimalDegrees;
    case 'SW': return 180 + decimalDegrees;
    case 'NW': return 360 - decimalDegrees;
    default: return decimalDegrees;
  }
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// ── 4A: Closure Check ──────────────────────────────────────────────────────

interface TraversePoint {
  x: number;
  y: number;
}

function computeTraverse(calls: BoundaryCall[]): {
  points: TraversePoint[];
  totalPerimeter_ft: number;
  closureError_ft: number;
} {
  const points: TraversePoint[] = [{ x: 0, y: 0 }]; // Start at origin (POB)
  let totalPerimeter = 0;

  for (const call of calls) {
    const lastPoint = points[points.length - 1];

    if (call.curve) {
      // For curves, use chord bearing and chord distance for traverse
      if (call.curve.chordBearing && call.curve.chordDistance) {
        const azimuth = bearingToAzimuth(call.curve.chordBearing.decimalDegrees, 'NE'); // Chord bearing is already full
        const dist = call.curve.chordDistance.value;
        const azRad = degreesToRadians(azimuth);

        const dx = dist * Math.sin(azRad);
        const dy = dist * Math.cos(azRad);

        points.push({ x: lastPoint.x + dx, y: lastPoint.y + dy });
        totalPerimeter += call.curve.arcLength?.value ?? dist;
      } else if (call.curve.arcLength && call.curve.radius.value) {
        // Can't traverse without chord info — skip but note the arc length
        totalPerimeter += call.curve.arcLength.value;
        // Keep same position (will cause closure error — intentional flag)
      }
    } else if (call.bearing && call.distance) {
      const azimuth = bearingToAzimuth(call.bearing.decimalDegrees, call.bearing.quadrant);
      const dist_ft = toFeet(call.distance.value, call.distance.unit);
      const azRad = degreesToRadians(azimuth);

      const dx = dist_ft * Math.sin(azRad);
      const dy = dist_ft * Math.cos(azRad);

      points.push({ x: lastPoint.x + dx, y: lastPoint.y + dy });
      totalPerimeter += dist_ft;
    }
  }

  // Closure error = distance from last point back to origin
  const lastPoint = points[points.length - 1];
  const closureError = Math.sqrt(lastPoint.x ** 2 + lastPoint.y ** 2);

  return { points, totalPerimeter_ft: totalPerimeter, closureError_ft: closureError };
}

// ── 4B: Area Computation (Shoelace Formula) ────────────────────────────────

function computeAreaShoelace(points: TraversePoint[]): number {
  if (points.length < 3) return 0;

  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    sum += points[i].x * points[j].y;
    sum -= points[j].x * points[i].y;
  }

  return Math.abs(sum) / 2; // square feet
}

// ── 4C: Bearing Sanity ─────────────────────────────────────────────────────

function checkBearingSanity(calls: BoundaryCall[]): { sane: boolean; flags: string[] } {
  const flags: string[] = [];

  for (const call of calls) {
    if (call.bearing) {
      // Quadrant bearings should be 0°–90°
      if (call.bearing.decimalDegrees < 0 || call.bearing.decimalDegrees > 90) {
        flags.push(`Call ${call.sequence}: Bearing ${call.bearing.raw} (${call.bearing.decimalDegrees}°) is outside 0°-90° range for quadrant bearing`);
      }

      // Quadrant should be valid
      const validQuadrants = ['NE', 'NW', 'SE', 'SW'];
      if (!validQuadrants.includes(call.bearing.quadrant.toUpperCase())) {
        flags.push(`Call ${call.sequence}: Invalid quadrant "${call.bearing.quadrant}"`);
      }
    }
  }

  return { sane: flags.length === 0, flags };
}

// ── 4D: Distance Sanity ────────────────────────────────────────────────────

function checkDistanceSanity(calls: BoundaryCall[]): { sane: boolean; flags: string[] } {
  const flags: string[] = [];

  const distances = calls
    .filter((c) => c.distance)
    .map((c) => toFeet(c.distance!.value, c.distance!.unit));

  if (distances.length < 2) return { sane: true, flags: [] };

  const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    if (call.distance) {
      const dist_ft = toFeet(call.distance.value, call.distance.unit);

      // Flag distances >10x the average
      if (dist_ft > avgDist * 10) {
        flags.push(`Call ${call.sequence}: Distance ${call.distance.raw} (${dist_ft.toFixed(1)} ft) is >10x the average (${avgDist.toFixed(1)} ft) — possible OCR/transcription error`);
      }

      // Flag zero or negative distances
      if (dist_ft <= 0) {
        flags.push(`Call ${call.sequence}: Distance ${call.distance.raw} is zero or negative`);
      }
    }
  }

  return { sane: flags.length === 0, flags };
}

// ── 4E: Reference Completeness ─────────────────────────────────────────────

function checkReferenceCompleteness(boundary: ExtractedBoundaryData): { complete: boolean; flags: string[] } {
  const flags: string[] = [];

  // Check for low-confidence calls
  for (const call of boundary.calls) {
    if (call.confidence < 0.85) {
      flags.push(`Call ${call.sequence}: Low confidence (${(call.confidence * 100).toFixed(0)}%) — needs verification`);
    }
  }

  // Check for references that need chain-of-title following
  for (const ref of boundary.references) {
    if (ref.type === 'deed' && ref.volume && ref.page) {
      flags.push(`Deed reference Vol. ${ref.volume}, Pg. ${ref.page} — needs chain-of-title verification`);
    }
    if (ref.type === 'plat' && ref.cabinetSlide) {
      flags.push(`Plat reference ${ref.cabinetSlide} — should be retrieved and cross-referenced`);
    }
  }

  // Check for missing POB
  if (!boundary.pointOfBeginning.description && boundary.type === 'metes_and_bounds') {
    flags.push('No Point of Beginning described — critical for metes & bounds');
  }

  return { complete: flags.length === 0, flags };
}

// ── 4F: Quality Rating ─────────────────────────────────────────────────────

function computeQualityRating(
  precisionRatio: number | null,
  bearingSane: boolean,
  distanceSane: boolean,
  hasCallsToValidate: boolean,
): ValidationResult['overallQuality'] {
  if (!hasCallsToValidate) return 'failed';

  if (precisionRatio === null) return 'fair'; // Couldn't compute closure

  if (precisionRatio >= 25_000 && bearingSane && distanceSane) return 'excellent';
  if (precisionRatio >= 10_000 && bearingSane) return 'good';
  if (precisionRatio >= 5_000) return 'fair';
  if (precisionRatio >= 1_000) return 'poor';
  return 'failed';
}

// ── Main Validation Function ───────────────────────────────────────────────

/**
 * Validate extracted boundary data through closure check, area computation,
 * bearing/distance sanity checks, and reference completeness analysis.
 */
export function validateBoundary(
  boundary: ExtractedBoundaryData | null,
  cadAcreage: number | null,
  logger: PipelineLogger,
): ValidationResult {
  logger.info('Stage4', 'Starting validation');

  if (!boundary || boundary.calls.length === 0) {
    logger.info('Stage4', 'No boundary calls to validate');
    return {
      closureError_ft: null,
      precisionRatio: null,
      computedArea_sqft: null,
      computedArea_acres: null,
      cadAcreage,
      areaDiscrepancy_pct: null,
      bearingSanity: true,
      distanceSanity: true,
      referenceComplete: true,
      overallQuality: boundary?.type === 'lot_and_block' ? 'good' : 'failed',
      flags: boundary?.type === 'lot_and_block'
        ? ['Lot & block description — no metes & bounds to validate']
        : ['No boundary calls found'],
    };
  }

  const allFlags: string[] = [];

  // 4A: Closure check
  const { points, totalPerimeter_ft, closureError_ft } = computeTraverse(boundary.calls);
  let precisionRatioNum: number | null = null;
  let precisionRatioStr: string | null = null;

  if (totalPerimeter_ft > 0 && closureError_ft > 0) {
    precisionRatioNum = Math.round(totalPerimeter_ft / closureError_ft);
    precisionRatioStr = `1:${precisionRatioNum.toLocaleString()}`;
    logger.info('Stage4A', `Closure: error=${closureError_ft.toFixed(3)} ft, perimeter=${totalPerimeter_ft.toFixed(1)} ft, precision=${precisionRatioStr}`);
  } else if (closureError_ft === 0 && totalPerimeter_ft > 0) {
    precisionRatioStr = 'perfect';
    precisionRatioNum = Infinity;
    logger.info('Stage4A', 'Perfect closure (no error)');
  } else {
    logger.warn('Stage4A', 'Could not compute closure — insufficient data');
    allFlags.push('Could not compute closure check');
  }

  // 4B: Area computation
  const computedArea_sqft = computeAreaShoelace(points);
  const computedArea_acres = computedArea_sqft / SQFT_PER_ACRE;
  logger.info('Stage4B', `Computed area: ${computedArea_sqft.toFixed(1)} sqft = ${computedArea_acres.toFixed(4)} acres`);

  let areaDiscrepancy_pct: number | null = null;
  if (cadAcreage && cadAcreage > 0 && computedArea_acres > 0) {
    areaDiscrepancy_pct = Math.abs(computedArea_acres - cadAcreage) / cadAcreage * 100;
    if (areaDiscrepancy_pct > 10) {
      allFlags.push(`Area discrepancy: computed ${computedArea_acres.toFixed(4)} acres vs CAD ${cadAcreage} acres (${areaDiscrepancy_pct.toFixed(1)}% difference)`);
    }
    logger.info('Stage4B', `CAD acreage: ${cadAcreage}, discrepancy: ${areaDiscrepancy_pct.toFixed(1)}%`);
  }

  // 4C: Bearing sanity
  const { sane: bearingSane, flags: bearingFlags } = checkBearingSanity(boundary.calls);
  allFlags.push(...bearingFlags);
  logger.info('Stage4C', `Bearing sanity: ${bearingSane ? 'PASS' : `FAIL (${bearingFlags.length} issues)`}`);

  // 4D: Distance sanity
  const { sane: distanceSane, flags: distanceFlags } = checkDistanceSanity(boundary.calls);
  allFlags.push(...distanceFlags);
  logger.info('Stage4D', `Distance sanity: ${distanceSane ? 'PASS' : `FAIL (${distanceFlags.length} issues)`}`);

  // 4E: Reference completeness
  const { complete: refComplete, flags: refFlags } = checkReferenceCompleteness(boundary);
  allFlags.push(...refFlags);
  logger.info('Stage4E', `Reference completeness: ${refComplete ? 'PASS' : `${refFlags.length} items need follow-up`}`);

  // 4F: Quality rating
  const quality = computeQualityRating(precisionRatioNum, bearingSane, distanceSane, true);
  logger.info('Stage4F', `Overall quality: ${quality.toUpperCase()}`);

  return {
    closureError_ft: closureError_ft,
    precisionRatio: precisionRatioStr,
    computedArea_sqft,
    computedArea_acres,
    cadAcreage,
    areaDiscrepancy_pct,
    bearingSanity: bearingSane,
    distanceSanity: distanceSane,
    referenceComplete: refComplete,
    overallQuality: quality,
    flags: allFlags,
  };
}
