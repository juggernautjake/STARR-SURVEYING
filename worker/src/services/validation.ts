// worker/src/services/validation.ts — Stage 4: Validation
// Closure check, area computation (shoelace), bearing/distance sanity,
// reference completeness, and quality rating.
// Handles both quadrant bearings AND azimuth bearings.

import type { ExtractedBoundaryData, BoundaryCall, ValidationResult } from '../types/index.js';
import { PipelineLogger } from '../lib/logger.js';

// ── Unit Conversions ───────────────────────────────────────────────────────

const SQFT_PER_ACRE = 43_560;

/** Convert any distance unit to feet */
function toFeet(value: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case 'feet': case 'ft': case 'foot': return value;
    case 'varas': case 'vara': return value * 2.7778;     // 1 vara = 33⅓ inches
    case 'chains': case 'chain': case 'ch': return value * 66;
    case 'rods': case 'rod': case 'rd': return value * 16.5;
    case 'meters': case 'meter': case 'm': return value * 3.28084;
    case 'links': case 'link': case 'lk': return value * 0.66;   // 1 link = 7.92 inches
    default: return value; // Assume feet
  }
}

// ── Bearing → Azimuth Conversion ───────────────────────────────────────────

/**
 * Detect if a bearing value is in quadrant format (0-90°) or azimuth format (0-360°).
 * Quadrant format: always 0-90° with a quadrant designation (NE, SE, SW, NW).
 * Azimuth format: 0-360° measured clockwise from north.
 */
function detectBearingFormat(decimalDegrees: number, quadrant: string): 'quadrant' | 'azimuth' | 'unknown' {
  const q = quadrant.toUpperCase().replace(/\s/g, '');
  const validQuadrants = ['NE', 'NW', 'SE', 'SW', 'N', 'S', 'E', 'W'];

  if (validQuadrants.includes(q) && decimalDegrees >= 0 && decimalDegrees <= 90) {
    return 'quadrant';
  }

  // If degrees > 90 but quadrant is set, it's likely an azimuth that was tagged with quadrant
  if (decimalDegrees > 90 && decimalDegrees <= 360) {
    return 'azimuth';
  }

  // If no valid quadrant but degrees are 0-360, treat as azimuth
  if (!validQuadrants.includes(q) && decimalDegrees >= 0 && decimalDegrees <= 360) {
    return 'azimuth';
  }

  return 'unknown';
}

/**
 * Convert a quadrant bearing to azimuth (0° = North, clockwise).
 * Quadrant bearings are measured from N or S toward E or W.
 *
 * NE quadrant: azimuth = degrees  (N 45°E → 045°)
 * SE quadrant: azimuth = 180 - degrees  (S 45°E → 135°)
 * SW quadrant: azimuth = 180 + degrees  (S 45°W → 225°)
 * NW quadrant: azimuth = 360 - degrees  (N 45°W → 315°)
 */
function bearingToAzimuth(decimalDegrees: number, quadrant: string): number {
  const format = detectBearingFormat(decimalDegrees, quadrant);

  if (format === 'azimuth') {
    // Already an azimuth — normalize to 0-360
    return ((decimalDegrees % 360) + 360) % 360;
  }

  const q = quadrant.toUpperCase().replace(/\s/g, '');

  switch (q) {
    case 'NE': case 'N': return decimalDegrees;
    case 'SE': case 'E': return 180 - decimalDegrees;
    case 'SW': case 'S': return 180 + decimalDegrees;
    case 'NW': case 'W': return 360 - decimalDegrees;
    default:
      // Unknown quadrant — try to use the value as-is
      return decimalDegrees;
  }
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// ── Traverse Point ─────────────────────────────────────────────────────────

interface TraversePoint {
  x: number;
  y: number;
  callSequence: number;
}

// ── 4A: Closure Check ──────────────────────────────────────────────────────

function computeTraverse(calls: BoundaryCall[], logger: PipelineLogger): {
  points: TraversePoint[];
  totalPerimeter_ft: number;
  closureError_ft: number;
  skippedCalls: number;
} {
  const points: TraversePoint[] = [{ x: 0, y: 0, callSequence: 0 }];
  let totalPerimeter = 0;
  let skippedCalls = 0;

  for (const call of calls) {
    const lastPoint = points[points.length - 1];

    if (call.curve) {
      // For curves, use chord bearing and chord distance for traverse
      if (call.curve.chordBearing && call.curve.chordDistance && call.curve.chordDistance.value > 0) {
        const azimuth = bearingToAzimuth(call.curve.chordBearing.decimalDegrees, 'NE');
        const dist = call.curve.chordDistance.value;
        const azRad = degreesToRadians(azimuth);

        const dx = dist * Math.sin(azRad);
        const dy = dist * Math.cos(azRad);

        points.push({ x: lastPoint.x + dx, y: lastPoint.y + dy, callSequence: call.sequence });
        totalPerimeter += call.curve.arcLength?.value ?? dist;
      } else if (call.curve.arcLength && call.curve.radius.value > 0 && call.curve.delta) {
        // Compute chord from arc data: chord = 2 * R * sin(delta/2)
        const R = call.curve.radius.value;
        const delta = degreesToRadians(call.curve.delta.decimalDegrees);
        const chordLength = 2 * R * Math.sin(delta / 2);

        // Without chord bearing, we can't determine direction — skip traverse but count perimeter
        totalPerimeter += call.curve.arcLength.value;
        skippedCalls++;
        logger.info('Stage4A', `Call ${call.sequence}: Curve with arc=${call.curve.arcLength.value} but no chord bearing — skipped traverse, chord≈${chordLength.toFixed(2)}`);
      } else {
        skippedCalls++;
        logger.warn('Stage4A', `Call ${call.sequence}: Incomplete curve data — skipped`);
      }
    } else if (call.bearing && call.distance) {
      const azimuth = bearingToAzimuth(call.bearing.decimalDegrees, call.bearing.quadrant);
      const dist_ft = toFeet(call.distance.value, call.distance.unit);

      if (dist_ft <= 0) {
        logger.warn('Stage4A', `Call ${call.sequence}: Zero or negative distance (${dist_ft}) — skipped`);
        skippedCalls++;
        continue;
      }

      const azRad = degreesToRadians(azimuth);
      const dx = dist_ft * Math.sin(azRad);
      const dy = dist_ft * Math.cos(azRad);

      points.push({ x: lastPoint.x + dx, y: lastPoint.y + dy, callSequence: call.sequence });
      totalPerimeter += dist_ft;
    } else {
      skippedCalls++;
      logger.info('Stage4A', `Call ${call.sequence}: No bearing/distance — skipped`);
    }
  }

  // Closure error = distance from last point back to origin (POB)
  const lastPoint = points[points.length - 1];
  const closureError = Math.sqrt(lastPoint.x ** 2 + lastPoint.y ** 2);

  return { points, totalPerimeter_ft: totalPerimeter, closureError_ft: closureError, skippedCalls };
}

// ── 4B: Area Computation (Shoelace Formula) ────────────────────────────────

function computeAreaShoelace(points: TraversePoint[]): number {
  if (points.length < 3) return 0;

  let sum = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += points[i].x * points[j].y;
    sum -= points[j].x * points[i].y;
  }

  return Math.abs(sum) / 2; // square feet
}

// ── 4C: Bearing Sanity ─────────────────────────────────────────────────────

function checkBearingSanity(calls: BoundaryCall[]): { sane: boolean; flags: string[] } {
  const flags: string[] = [];
  const validQuadrants = new Set(['NE', 'NW', 'SE', 'SW', 'N', 'S', 'E', 'W']);

  for (const call of calls) {
    if (!call.bearing) continue;

    const format = detectBearingFormat(call.bearing.decimalDegrees, call.bearing.quadrant);

    if (format === 'quadrant') {
      // Quadrant bearings must be 0-90°
      if (call.bearing.decimalDegrees < 0 || call.bearing.decimalDegrees > 90) {
        flags.push(`Call ${call.sequence}: Quadrant bearing ${call.bearing.raw} has angle ${call.bearing.decimalDegrees}° outside 0-90° range`);
      }
    } else if (format === 'azimuth') {
      // Azimuth bearings must be 0-360°
      if (call.bearing.decimalDegrees < 0 || call.bearing.decimalDegrees > 360) {
        flags.push(`Call ${call.sequence}: Azimuth ${call.bearing.raw} has angle ${call.bearing.decimalDegrees}° outside 0-360° range`);
      }
    } else {
      flags.push(`Call ${call.sequence}: Unable to determine bearing format for ${call.bearing.raw} (${call.bearing.decimalDegrees}°, quadrant="${call.bearing.quadrant}")`);
    }

    // Check quadrant validity
    if (call.bearing.quadrant && !validQuadrants.has(call.bearing.quadrant.toUpperCase().replace(/\s/g, ''))) {
      flags.push(`Call ${call.sequence}: Invalid quadrant "${call.bearing.quadrant}" for bearing ${call.bearing.raw}`);
    }

    // Check for suspiciously round bearings that might indicate OCR errors
    if (call.bearing.decimalDegrees === 0 || call.bearing.decimalDegrees === 90 || call.bearing.decimalDegrees === 45) {
      // Not necessarily wrong, but worth noting
      if (call.confidence < 0.9) {
        flags.push(`Call ${call.sequence}: Suspiciously round bearing (${call.bearing.decimalDegrees}°) with low confidence (${(call.confidence * 100).toFixed(0)}%) — verify`);
      }
    }
  }

  return { sane: flags.length === 0, flags };
}

// ── 4D: Distance Sanity ────────────────────────────────────────────────────

function checkDistanceSanity(calls: BoundaryCall[]): { sane: boolean; flags: string[] } {
  const flags: string[] = [];

  const distances = calls
    .filter((c) => c.distance && c.distance.value > 0)
    .map((c) => ({
      seq: c.sequence,
      raw: c.distance!.raw,
      ft: toFeet(c.distance!.value, c.distance!.unit),
      confidence: c.confidence,
    }));

  if (distances.length < 2) return { sane: true, flags: [] };

  const avgDist = distances.reduce((a, b) => a + b.ft, 0) / distances.length;
  const medianDist = [...distances].sort((a, b) => a.ft - b.ft)[Math.floor(distances.length / 2)].ft;

  for (const d of distances) {
    // Flag distances >10x the median (more robust than mean)
    if (d.ft > medianDist * 10 && d.ft > 5000) {
      flags.push(`Call ${d.seq}: Distance ${d.raw} (${d.ft.toFixed(1)} ft) is >10x the median (${medianDist.toFixed(1)} ft) — possible OCR error`);
    }

    // Flag zero or very small distances
    if (d.ft < 0.01) {
      flags.push(`Call ${d.seq}: Distance ${d.raw} (${d.ft.toFixed(4)} ft) is essentially zero`);
    }

    // Flag suspiciously precise distances with low confidence
    if (d.raw.includes('.') && d.confidence < 0.8) {
      const decimalPlaces = (d.raw.split('.')[1] ?? '').replace(/[^0-9]/g, '').length;
      if (decimalPlaces > 4) {
        flags.push(`Call ${d.seq}: Distance ${d.raw} has ${decimalPlaces} decimal places with low confidence — verify`);
      }
    }
  }

  // Check for duplicate distances (copy-paste errors)
  for (let i = 0; i < distances.length; i++) {
    for (let j = i + 1; j < distances.length; j++) {
      if (Math.abs(distances[i].ft - distances[j].ft) < 0.01 && distances[i].ft > 10) {
        // Same distance appearing multiple times — could be valid (square lot) or error
        if (distances.length > 4) {
          const sameCount = distances.filter((d) => Math.abs(d.ft - distances[i].ft) < 0.01).length;
          if (sameCount > distances.length * 0.6) {
            flags.push(`Suspicious: ${sameCount}/${distances.length} calls have the same distance (${distances[i].ft.toFixed(2)} ft) — verify`);
            break;
          }
        }
      }
    }
  }

  return { sane: flags.length === 0, flags };
}

// ── 4E: Reference Completeness ─────────────────────────────────────────────

function checkReferenceCompleteness(boundary: ExtractedBoundaryData): { complete: boolean; flags: string[] } {
  const flags: string[] = [];

  // Check for low-confidence calls
  const lowConfCalls = boundary.calls.filter((c) => c.confidence < 0.85);
  if (lowConfCalls.length > 0) {
    flags.push(`${lowConfCalls.length} call(s) with confidence <85%: ${lowConfCalls.map((c) => `#${c.sequence}(${(c.confidence * 100).toFixed(0)}%)`).join(', ')}`);
  }

  // Check for chain-of-title references
  for (const ref of boundary.references) {
    if (ref.type === 'deed' && ref.volume && ref.page) {
      flags.push(`Deed ref Vol. ${ref.volume} Pg. ${ref.page} — should be retrieved for chain-of-title`);
    }
    if (ref.type === 'plat' && ref.cabinetSlide) {
      flags.push(`Plat ref ${ref.cabinetSlide} — should be retrieved and cross-referenced`);
    }
    if (ref.instrumentNumber) {
      flags.push(`Instrument #${ref.instrumentNumber} referenced — should be retrieved`);
    }
  }

  // Check for missing POB
  if (!boundary.pointOfBeginning.description && boundary.type === 'metes_and_bounds') {
    flags.push('CRITICAL: No Point of Beginning described — essential for metes & bounds');
  }

  // Check for unclosed traverse (bearing-only or distance-only calls)
  const bearingOnlyCalls = boundary.calls.filter((c) => c.bearing && !c.distance && !c.curve);
  if (bearingOnlyCalls.length > 0) {
    flags.push(`${bearingOnlyCalls.length} call(s) have bearing but no distance — boundary incomplete`);
  }

  // Check if there are any "along" references to neighbors that should be researched
  const alongRefs = boundary.calls.filter((c) => c.along).map((c) => c.along!);
  if (alongRefs.length > 0) {
    flags.push(`${alongRefs.length} boundary call(s) reference adjacent properties: ${alongRefs.slice(0, 3).join('; ')}${alongRefs.length > 3 ? '...' : ''}`);
  }

  return { complete: flags.length === 0, flags };
}

// ── 4F: Quality Rating ─────────────────────────────────────────────────────

function computeQualityRating(
  precisionRatio: number | null,
  bearingSane: boolean,
  distanceSane: boolean,
  hasCallsToValidate: boolean,
  skippedCalls: number,
  totalCalls: number,
): ValidationResult['overallQuality'] {
  if (!hasCallsToValidate) return 'failed';

  // If we skipped more than half the calls, quality is degraded
  if (totalCalls > 0 && skippedCalls > totalCalls * 0.5) return 'poor';

  if (precisionRatio === null) return 'fair';

  // Handle perfect closure (Infinity) explicitly
  if (precisionRatio === Infinity || precisionRatio > 1_000_000) {
    return bearingSane && distanceSane ? 'excellent' : 'good';
  }

  if (precisionRatio >= 25_000 && bearingSane && distanceSane) return 'excellent';
  if (precisionRatio >= 10_000 && bearingSane) return 'good';
  if (precisionRatio >= 5_000) return 'fair';
  if (precisionRatio >= 1_000) return 'poor';
  return 'failed';
}

// ── Main Validation Function ───────────────────────────────────────────────

/**
 * Validate extracted boundary data through all checks.
 * Returns validation results including traverse points (for drawing).
 */
export function validateBoundary(
  boundary: ExtractedBoundaryData | null,
  cadAcreage: number | null,
  logger: PipelineLogger,
): ValidationResult {
  logger.info('Stage4', '═══ Starting Validation ═══');

  // No boundary data at all
  if (!boundary) {
    logger.info('Stage4', 'No boundary data to validate');
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
      overallQuality: 'failed',
      flags: ['No boundary data found'],
    };
  }

  // Lot & block only — valid but no metes & bounds to validate
  if (boundary.calls.length === 0) {
    const lotBlockInfo = boundary.lotBlock
      ? `Lot ${boundary.lotBlock.lot}, Block ${boundary.lotBlock.block}, ${boundary.lotBlock.subdivision}`
      : 'No lot/block info';

    logger.info('Stage4', `No boundary calls. Type: ${boundary.type}. ${lotBlockInfo}`);

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
      overallQuality: boundary.type === 'lot_and_block' ? 'good' : 'failed',
      flags: boundary.type === 'lot_and_block'
        ? [`Lot & block description (${lotBlockInfo}) — no metes & bounds to validate`]
        : ['No boundary calls found in extracted data'],
    };
  }

  const allFlags: string[] = [];

  // ── 4A: Closure check ──────────────────────────────────
  logger.info('Stage4A', `Computing traverse from ${boundary.calls.length} calls`);
  const { points, totalPerimeter_ft, closureError_ft, skippedCalls } = computeTraverse(boundary.calls, logger);

  if (skippedCalls > 0) {
    allFlags.push(`${skippedCalls}/${boundary.calls.length} calls skipped during traverse (incomplete data)`);
  }

  let precisionRatioNum: number | null = null;
  let precisionRatioStr: string | null = null;

  if (totalPerimeter_ft > 0) {
    if (closureError_ft < 0.001) {
      precisionRatioStr = 'perfect';
      precisionRatioNum = Infinity;
      logger.info('Stage4A', `Closure: PERFECT (error < 0.001 ft), perimeter=${totalPerimeter_ft.toFixed(1)} ft`);
    } else {
      precisionRatioNum = Math.round(totalPerimeter_ft / closureError_ft);
      precisionRatioStr = `1:${precisionRatioNum.toLocaleString()}`;
      logger.info('Stage4A', `Closure: error=${closureError_ft.toFixed(3)} ft, perimeter=${totalPerimeter_ft.toFixed(1)} ft, precision=${precisionRatioStr}`);
    }
  } else {
    logger.warn('Stage4A', 'Could not compute closure — no perimeter data');
    allFlags.push('Could not compute closure check — insufficient traverse data');
  }

  // ── 4B: Area computation ───────────────────────────────
  const computedArea_sqft = computeAreaShoelace(points);
  const computedArea_acres = computedArea_sqft / SQFT_PER_ACRE;

  if (computedArea_sqft > 0) {
    logger.info('Stage4B', `Computed area: ${computedArea_sqft.toFixed(1)} sqft = ${computedArea_acres.toFixed(4)} acres`);
  } else {
    logger.warn('Stage4B', 'Computed area is zero — traverse may be incomplete');
    allFlags.push('Computed area is zero — boundary traverse may be incomplete or degenerate');
  }

  let areaDiscrepancy_pct: number | null = null;
  if (cadAcreage && cadAcreage > 0 && computedArea_acres > 0) {
    areaDiscrepancy_pct = Math.abs(computedArea_acres - cadAcreage) / cadAcreage * 100;
    logger.info('Stage4B', `CAD acreage: ${cadAcreage}, computed: ${computedArea_acres.toFixed(4)}, discrepancy: ${areaDiscrepancy_pct.toFixed(1)}%`);

    if (areaDiscrepancy_pct > 50) {
      allFlags.push(`MAJOR area discrepancy: computed ${computedArea_acres.toFixed(4)} acres vs CAD ${cadAcreage} acres (${areaDiscrepancy_pct.toFixed(1)}%) — likely data error`);
    } else if (areaDiscrepancy_pct > 10) {
      allFlags.push(`Area discrepancy: computed ${computedArea_acres.toFixed(4)} acres vs CAD ${cadAcreage} acres (${areaDiscrepancy_pct.toFixed(1)}%)`);
    }
  }

  // ── 4C: Bearing sanity ─────────────────────────────────
  const { sane: bearingSane, flags: bearingFlags } = checkBearingSanity(boundary.calls);
  allFlags.push(...bearingFlags);
  logger.info('Stage4C', `Bearing sanity: ${bearingSane ? 'PASS' : `FAIL (${bearingFlags.length} issues)`}`);

  // ── 4D: Distance sanity ────────────────────────────────
  const { sane: distanceSane, flags: distanceFlags } = checkDistanceSanity(boundary.calls);
  allFlags.push(...distanceFlags);
  logger.info('Stage4D', `Distance sanity: ${distanceSane ? 'PASS' : `FAIL (${distanceFlags.length} issues)`}`);

  // ── 4E: Reference completeness ─────────────────────────
  const { complete: refComplete, flags: refFlags } = checkReferenceCompleteness(boundary);
  allFlags.push(...refFlags);
  logger.info('Stage4E', `Reference completeness: ${refComplete ? 'PASS' : `${refFlags.length} items flagged`}`);

  // ── 4F: Quality rating ─────────────────────────────────
  const quality = computeQualityRating(
    precisionRatioNum, bearingSane, distanceSane,
    boundary.calls.length > 0, skippedCalls, boundary.calls.length,
  );
  logger.info('Stage4F', `Overall quality: ${quality.toUpperCase()}`);

  return {
    closureError_ft,
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
    traversePoints: points.map(({ x, y }) => ({ x, y })),
    totalPerimeter_ft,
  };
}
