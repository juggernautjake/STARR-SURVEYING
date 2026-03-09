/**
 * BOUNDARY VALIDATION SERVICE
 * ────────────────────────────
 * Mathematical closure check, area computation (Shoelace formula),
 * bearing sanity (0-90° only), distance sanity, and reference completeness.
 * Supports feet, varas, chains, meters, and rods.
 *
 * The third `_logger` argument is accepted but unused — kept for
 * backward compatibility with callers that pass a PipelineLogger.
 */

import { BoundaryCall, ValidationResult, ExtractedBoundaryData } from '../types/index.js';
import type { PipelineLogger } from '../lib/logger.js';

function bearingToAzimuth(decimalDegrees: number, quadrant: string): number {
  switch (quadrant.toUpperCase()) {
    case 'NE': return decimalDegrees;
    case 'SE': return 180 - decimalDegrees;
    case 'SW': return 180 + decimalDegrees;
    case 'NW': return 360 - decimalDegrees;
    default:   return decimalDegrees;
  }
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toFeet(value: number, unit: string): number {
  switch (unit) {
    case 'varas':  return value * 2.7778;
    case 'chains': return value * 66;
    case 'meters': return value * 3.28084;
    case 'rods':   return value * 16.5;
    case 'links':  return value * 0.66;
    default:       return value; // feet
  }
}

function computeLineEndpoint(
  x: number, y: number,
  bearing: { decimalDegrees: number; quadrant: string },
  distance: { value: number; unit: string },
): { x: number; y: number } {
  const azimuth = bearingToAzimuth(bearing.decimalDegrees, bearing.quadrant);
  const dist = toFeet(distance.value, distance.unit);
  const azRad = toRadians(azimuth);
  return {
    x: x + dist * Math.sin(azRad),
    y: y + dist * Math.cos(azRad),
  };
}

function computeCurveEndpoint(
  x: number, y: number,
  curve: NonNullable<BoundaryCall['curve']>,
): { x: number; y: number; distance: number } {
  // Prefer chord bearing + chord distance (most precise)
  if (curve.chordBearing && curve.chordDistance) {
    const dist = curve.chordDistance.value;
    const azRad = toRadians(curve.chordBearing.decimalDegrees);
    return {
      x: x + dist * Math.sin(azRad),
      y: y + dist * Math.cos(azRad),
      distance: dist,
    };
  }
  // Fallback: arc length + delta → chord approximation
  if (curve.arcLength && curve.delta) {
    const R = curve.radius.value;
    const delta = toRadians(curve.delta.decimalDegrees);
    const dist = 2 * R * Math.sin(delta / 2);
    return { x, y, distance: dist };
  }
  return { x, y, distance: 0 };
}

/**
 * Validate boundary data.
 *
 * @param data        Extracted boundary data from AI pipeline
 * @param cadAcreage  CAD-reported acreage for comparison (null if unknown)
 * @param _logger     Optional logger (accepted but unused — backward compat)
 */
export function validateBoundary(
  data: ExtractedBoundaryData | null,
  cadAcreage: number | null,
  _logger?: PipelineLogger,
): ValidationResult {
  const result: ValidationResult = {
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
    flags: [],
  };

  if (!data) {
    result.flags.push('No boundary data to validate');
    return result;
  }

  if (!data.calls || data.calls.length === 0) {
    result.flags.push('No boundary calls to validate');
    if (data.type === 'lot_and_block') {
      const li = data.lotBlock
        ? `Lot ${data.lotBlock.lot}, Block ${data.lotBlock.block}, ${data.lotBlock.subdivision}`
        : 'No lot/block info';
      result.flags.push(`Lot-and-block description (${li}) — closure check N/A`);
      result.overallQuality = 'good';
    }
    return result;
  }

  // ── 4A: Closure Check ──────────────────────────────────────────────
  let x = 0, y = 0, totalDistance = 0;
  const points: { x: number; y: number }[] = [{ x: 0, y: 0 }];

  for (const call of data.calls) {
    if (call.bearing && call.distance) {
      const ep = computeLineEndpoint(x, y, call.bearing, call.distance);
      x = ep.x; y = ep.y;
      totalDistance += toFeet(call.distance.value, call.distance.unit);
    } else if (call.curve) {
      const ep = computeCurveEndpoint(x, y, call.curve);
      x = ep.x; y = ep.y;
      totalDistance += ep.distance;
    }
    points.push({ x, y });
  }

  const closureError = Math.sqrt(x * x + y * y);
  result.closureError_ft = Math.round(closureError * 1000) / 1000;
  result.traversePoints = [...points];
  result.totalPerimeter_ft = Math.round(totalDistance * 100) / 100;

  if (totalDistance > 0 && closureError > 0) {
    result.precisionRatio = `1:${Math.round(totalDistance / closureError)}`;
  } else if (closureError < 0.001) {
    result.precisionRatio = 'perfect';
  }

  // ── 4B: Area (Shoelace formula) ────────────────────────────────────
  if (points.length >= 3) {
    let area = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    result.computedArea_sqft = Math.abs(area) / 2;
    result.computedArea_acres = result.computedArea_sqft / 43560;

    if (cadAcreage && result.computedArea_acres) {
      result.areaDiscrepancy_pct =
        Math.round(Math.abs(result.computedArea_acres - cadAcreage) / cadAcreage * 1000) / 10;
      if (result.areaDiscrepancy_pct > 10) {
        result.flags.push(
          `Area discrepancy: computed ${result.computedArea_acres.toFixed(3)} ac vs CAD ${cadAcreage} ac (${result.areaDiscrepancy_pct}%)`,
        );
      }
    }
  }

  // ── 4C: Bearing Sanity ─────────────────────────────────────────────
  for (const call of data.calls) {
    if (call.bearing && call.bearing.decimalDegrees > 90) {
      result.bearingSanity = false;
      result.flags.push(
        `Call ${call.sequence}: bearing ${call.bearing.raw} exceeds 90° (${call.bearing.decimalDegrees}°)`,
      );
    }
  }

  // ── 4D: Distance Sanity ────────────────────────────────────────────
  const distances = data.calls
    .filter(c => c.distance)
    .map(c => toFeet(c.distance!.value, c.distance!.unit));

  if (distances.length >= 3) {
    const avg = distances.reduce((a, b) => a + b, 0) / distances.length;
    for (const call of data.calls) {
      if (call.distance) {
        const d = toFeet(call.distance.value, call.distance.unit);
        if (d > avg * 10) {
          result.distanceSanity = false;
          result.flags.push(
            `Call ${call.sequence}: distance ${call.distance.raw} is >10x average (${avg.toFixed(1)} ft)`,
          );
        }
      }
    }
  }

  // ── 4E: Reference Completeness ─────────────────────────────────────
  for (const call of data.calls) {
    if (call.confidence < 0.85) {
      result.referenceComplete = false;
      result.flags.push(`Call ${call.sequence}: low confidence (${call.confidence})`);
    }
  }

  if (data.references?.length > 0) {
    result.flags.push(`${data.references.length} document reference(s) may need chain-of-title following`);
  }

  // ── Overall Quality Score ──────────────────────────────────────────
  if (!result.closureError_ft || data.calls.length === 0) {
    result.overallQuality = 'failed';
  } else if (closureError < 0.001 || (totalDistance > 0 && totalDistance / closureError > 25000)) {
    if (result.bearingSanity && result.distanceSanity) {
      result.overallQuality = 'excellent';
    } else {
      result.overallQuality = 'good';
    }
  } else if (totalDistance > 0 && totalDistance / closureError > 10000 && result.bearingSanity) {
    result.overallQuality = 'good';
  } else if (totalDistance > 0 && totalDistance / closureError > 5000) {
    result.overallQuality = 'fair';
  } else {
    result.overallQuality = 'poor';
  }

  return result;
}
