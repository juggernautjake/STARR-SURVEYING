// lib/cad/ai-engine/stage-3-reconcile.ts
//
// Phase 6 Stage 3 — deed reconciliation. Compares the field
// traverse against the parsed deed call list and produces a
// per-call comparison + discrepancy list + per-feature
// confidence adjustments. The orientation-correction step
// (5.0 in the spec) is its own slice — this file does the
// post-orientation per-call math.
//
// Pure function: no I/O. Reads from the existing geometry
// helpers (computeClosure, formatBearing) shipped in Phase 4.
//
// Tolerances follow the §5.12.10 surveyor convention:
//   * bearing match within 60 arc-seconds
//   * distance match within 0.50 feet
//
// The output drives:
//   * Stage 6 confidence scoring (per-feature adjustments
//     surface as boosts / penalties).
//   * Review queue UI (discrepancies render as inline rows so
//     the surveyor sees "call 4: bearing differs by 142" "
//     before accepting the drawing).

import { computeClosure } from '../geometry/closure';
import { formatBearing } from '../geometry/bearing';
import type {
  ClosureResult,
  PointGroup,
  SurveyPoint,
  Traverse,
} from '../types';

import type {
  CallComparison,
  DeedData,
  Discrepancy,
  ReconciliationResult,
} from './types';

const BEARING_TOLERANCE_SECONDS = 60;
const DISTANCE_TOLERANCE_FEET = 0.5;

/**
 * Reconcile a field traverse against the parsed deed data.
 *
 * Algorithm:
 *   1. Locate the beginning monument in the field points
 *      (best-effort substring match against
 *      deedData.beginningMonument).
 *   2. Compare deed call count vs traverse leg count → flag
 *      a CALL_COUNT_MISMATCH discrepancy when they differ.
 *   3. For each matched (call, leg) pair, compute bearing +
 *      distance deltas; emit BEARING_MISMATCH /
 *      DISTANCE_MISMATCH discrepancies and accumulate per-
 *      leg confidence contributions.
 *   4. Apply per-feature confidence adjustments
 *      (overall match → +15; partial → 0; both bad → -20).
 *   5. Boost rows where the point group has both calc and
 *      field-verified positions (calcSetDelta defined) by +10
 *      — independent corroboration is high-signal.
 *   6. Compute field closure via the Phase 4 helper; record
 *      closure remains null in v1 (full record traverse
 *      assembly lands in a follow-up).
 *
 * Returns a ReconciliationResult with the per-call comparisons,
 * discrepancy list, both closures, and the confidence
 * adjustments map.
 */
export function reconcileDeed(
  fieldTraverse: Traverse,
  deedData: DeedData,
  points: SurveyPoint[],
  pointGroups: Map<number, PointGroup>
): ReconciliationResult {
  const comparisons: CallComparison[] = [];
  const discrepancies: Discrepancy[] = [];
  const adjustments = new Map<string, number>();

  // ── Step 1: Beginning monument check ────────────────────────
  const beginPt = findBeginningMonument(deedData, points);
  if (deedData.beginningMonument && !beginPt) {
    discrepancies.push({
      type: 'BEGINNING_MONUMENT_NOT_FOUND',
      severity: 'HIGH',
      callIndex: null,
      message:
        `Could not locate beginning monument: "${deedData.beginningMonument}".`,
      fieldValue: 'Not found',
      recordValue: deedData.beginningMonument,
      difference: 'N/A',
    });
  }

  // ── Step 2: Call count mismatch ────────────────────────────
  if (deedData.calls.length !== fieldTraverse.legs.length) {
    discrepancies.push({
      type: 'CALL_COUNT_MISMATCH',
      severity: 'MEDIUM',
      callIndex: null,
      message:
        `Deed has ${deedData.calls.length} calls but field traverse has ` +
        `${fieldTraverse.legs.length} legs.`,
      fieldValue: `${fieldTraverse.legs.length} legs`,
      recordValue: `${deedData.calls.length} calls`,
      difference: `${Math.abs(
        deedData.calls.length - fieldTraverse.legs.length
      )} difference`,
    });
  }

  // ── Step 3: Per-pair comparison ────────────────────────────
  const matchCount = Math.min(
    deedData.calls.length,
    fieldTraverse.legs.length
  );
  for (let i = 0; i < matchCount; i++) {
    const call = deedData.calls[i];
    const leg = fieldTraverse.legs[i];

    const bearingDiff =
      call.bearing !== null && leg.bearing !== undefined
        ? Math.abs(call.bearing - leg.bearing) * 3600
        : null;
    const distanceDiff =
      call.distance !== null
        ? Math.abs(call.distance - leg.distance)
        : null;

    const bearingOk =
      bearingDiff !== null
        ? bearingDiff <= BEARING_TOLERANCE_SECONDS
        : true;
    const distanceOk =
      distanceDiff !== null
        ? distanceDiff <= DISTANCE_TOLERANCE_FEET
        : true;

    comparisons.push({
      deedCallIndex: i,
      fieldLegIndex: i,
      fieldBearing: leg.bearing,
      fieldDistance: leg.distance,
      recordBearing: call.bearing,
      recordDistance: call.distance,
      bearingDiff,
      distanceDiff,
      bearingOk,
      distanceOk,
      overallMatch: bearingOk && distanceOk,
      confidenceContribution:
        (bearingOk ? 0.5 : 0) + (distanceOk ? 0.5 : 0),
    });

    if (!bearingOk && bearingDiff !== null) {
      discrepancies.push({
        type: 'BEARING_MISMATCH',
        severity: bearingDiff > 300 ? 'HIGH' : 'MEDIUM',
        callIndex: i,
        message:
          `Call ${i + 1}: bearing differs by ${bearingDiff.toFixed(0)}".`,
        fieldValue: formatBearing(leg.bearing, 'SECOND'),
        recordValue:
          call.bearing !== null
            ? formatBearing(call.bearing, 'SECOND')
            : 'N/A',
        difference: `${bearingDiff.toFixed(0)} seconds`,
      });
    }
    if (!distanceOk && distanceDiff !== null) {
      discrepancies.push({
        type: 'DISTANCE_MISMATCH',
        severity: distanceDiff > 2.0 ? 'HIGH' : 'MEDIUM',
        callIndex: i,
        message:
          `Call ${i + 1}: distance differs by ${distanceDiff.toFixed(2)}'.`,
        fieldValue: `${leg.distance.toFixed(2)}'`,
        recordValue:
          call.distance !== null ? `${call.distance.toFixed(2)}'` : 'N/A',
        difference: `${distanceDiff.toFixed(2)} feet`,
      });
    }
  }

  // ── Step 4: Per-feature confidence adjustments ─────────────
  for (const comp of comparisons) {
    const featureId = fieldTraverse.legs[comp.fieldLegIndex]?.fromPointId;
    if (!featureId) continue;
    const adj = comp.overallMatch
      ? +15
      : comp.bearingOk || comp.distanceOk
      ? 0
      : -20;
    adjustments.set(
      featureId,
      (adjustments.get(featureId) ?? 0) + adj
    );
  }

  // ── Step 5: Point-group corroboration boost ────────────────
  for (const group of pointGroups.values()) {
    if (
      group.hasBothCalcAndField &&
      group.calcSetDelta !== undefined &&
      group.calcSetDelta !== null
    ) {
      const pointId = group.finalPoint?.id;
      if (pointId) {
        adjustments.set(
          pointId,
          (adjustments.get(pointId) ?? 0) + 10
        );
      }
    }
  }

  // ── Step 6: Closures ───────────────────────────────────────
  const fieldClosure: ClosureResult = computeClosure(fieldTraverse);
  // Full record-traverse assembly (computing leg-by-leg latitudes
  // / departures from deedData.calls + closing back to the
  // beginning monument) lands in a follow-up slice.
  const recordClosure: ClosureResult | null = null;

  // ── Overall match score ────────────────────────────────────
  const matchingCalls = comparisons.filter((c) => c.overallMatch).length;
  const overallMatchScore =
    comparisons.length > 0
      ? Math.round((matchingCalls / comparisons.length) * 100)
      : 50;

  return {
    fieldTraverse,
    recordTraverse: fieldTraverse, // placeholder; real record traverse lands later
    callComparisons: comparisons,
    fieldClosure,
    recordClosure,
    discrepancies,
    overallMatchScore,
    confidenceAdjustments: adjustments,
  };
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Best-effort substring match against the deed&apos;s
 * `beginningMonument` text. The Phase 6 spec says &ldquo;Could
 * not locate beginning monument&rdquo; is HIGH severity, so any
 * partial match (e.g. deed says &ldquo;1/2&quot; iron rod found
 * at NE corner&rdquo;, point description is &ldquo;1/2 IR FND
 * NE&rdquo;) should pass; the substring check on lower-cased,
 * whitespace-collapsed strings handles common variations.
 *
 * Returns null when no point&apos;s description sufficiently
 * matches OR when deedData.beginningMonument is empty.
 */
function findBeginningMonument(
  deedData: DeedData,
  points: SurveyPoint[]
): SurveyPoint | null {
  const target = deedData.beginningMonument?.trim().toLowerCase();
  if (!target) return null;
  const tokens = normalizeMonumentTokens(target);
  if (tokens.length === 0) return null;

  for (const pt of points) {
    const desc = (pt.description ?? '').trim().toLowerCase();
    if (!desc) continue;
    const ptTokens = normalizeMonumentTokens(desc);
    // Match when at least 2 distinguishing tokens overlap (e.g.
    // both contain "iron rod" + "found" / "fnd"). Single-token
    // match would be too aggressive ("rod" would catch every
    // utility-pole call too).
    const overlap = tokens.filter((t) => ptTokens.includes(t));
    if (overlap.length >= 2) return pt;
  }
  return null;
}

/**
 * Strip punctuation, collapse whitespace, expand common
 * surveying abbreviations so substring matches catch typical
 * operator shorthand (FND/found, IR/iron rod, etc.).
 */
function normalizeMonumentTokens(text: string): string[] {
  const expanded = text
    .replace(/['"]/g, '')
    .replace(/\bfnd\b/g, 'found')
    .replace(/\bir\b/g, 'iron rod')
    .replace(/\bip\b/g, 'iron pipe')
    .replace(/\bcm\b/g, 'concrete monument')
    .replace(/\bpk\b/g, 'pk nail')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return expanded.split(' ').filter((t) => t.length > 1);
}
