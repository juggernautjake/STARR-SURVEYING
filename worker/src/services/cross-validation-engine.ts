// worker/src/services/cross-validation-engine.ts — Phase 5 Step 3
// Call-by-call cross-validation: compares our property's shared boundary calls
// to the adjacent property's calls (reversed). Reports confirmed/close/marginal/discrepancy.
//
// Spec §5.5 — Cross-Validation Engine
//
// CRITICAL: This class imports and reuses bearing math from adjacent-research.ts.
// Do NOT reimplement parseAzimuth, reverseAzimuth, angularDiff, rateBearingDiff,
// or rateDistanceDiff — import them from adjacent-research.ts instead.
//
// Tolerance tables (per spec §12):
//   Bearing: ≤0°00'30" = CONFIRMED | ≤0°05'00" = CLOSE_MATCH | ≤0°30'00" = MARGINAL | >0°30'00" = DISCREPANCY
//   Distance: ≤0.5ft = CONFIRMED | ≤2.0ft = CLOSE_MATCH | ≤5.0ft = MARGINAL | >5.0ft = DISCREPANCY

import {
  parseAzimuth,
  reverseAzimuth,
  angularDiff,
  rateBearingDiff,
  rateDistanceDiff,
} from './adjacent-research.js';
import type { P3BoundaryCall } from '../models/property-intelligence.js';
import type { AdjacentBoundaryCall } from './adjacent-research-worker.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Result of comparing one of our calls to the adjacent property's corresponding call */
export interface CallComparison {
  callId: string;
  ourBearing: string;
  ourDistance: number;
  theirBearing: string | null;
  theirDistance: number | null;
  /** Adjacent property's bearing after reversal (N↔S E↔W) for direct comparison to ours */
  theirReversed: string | null;
  /** Bearing difference in DMS format, e.g. "0°00'03\"" */
  bearingDifference: string | null;
  /** Bearing difference in decimal degrees */
  bearingDifferenceDeg: number | null;
  distanceDifference: number | null;
  status: 'confirmed' | 'close_match' | 'marginal' | 'discrepancy' | 'unverified';
  /** Compact symbol: checkmark=confirmed, ~=close, ?=unverified/marginal, X=discrepancy */
  symbol: '✓' | '~' | '?' | '✗';
  notes: string | null;
}

/** Result of cross-validating all shared calls for one adjacent property */
export interface CrossValidationResult {
  adjacentOwner: string;
  sharedDirection: string;
  callComparisons: CallComparison[];
  sharedBoundaryConfidence: number;   // 0-100 weighted score
  confirmedCalls: number;
  closeMatchCalls: number;
  marginalCalls: number;
  unverifiedCalls: number;
  discrepancyCalls: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Maximum bearing difference (in decimal degrees) for a call to be considered
 * a plausible match during cross-validation.
 *
 * Using 45° so that calls with large bearing differences (>30 arc-min) are still
 * FOUND as potential matches and classified as 'discrepancy' instead of 'unverified'.
 *
 * Per spec: bearing diff > 30 arc-minutes = DISCREPANCY (not unverified).
 * 'unverified' is reserved for calls where NO corresponding neighbor call exists at all.
 *
 * Note: The score function (0.5 - bearingDiff) * 40 + ... produces negative scores
 * for large bearing diffs, so MIN_MATCH_SCORE (20) prevents false positives while
 * allowing genuine discrepancy calls to be matched.
 */
const MAX_BEARING_DIFF_FOR_MATCH_DEG = 45.0;

/**
 * Minimum composite match score for a candidate call to be selected as the best match.
 * Prevents false positives when no good match exists.
 *
 * Score formula: (0.5 - bearingDiff) * 40 + max(0, 50 - distanceDiff) * 2
 * At 45° bearing diff: score from bearing alone = (0.5 - 45) * 40 = -1780 → very negative
 * The distance component (max 100) is not enough to rescue a completely wrong bearing.
 * At 0.6° bearing diff (just over MARGINAL): score = (0.5-0.6)*40 + 100 = -4 + 100 = 96 → matches
 *
 * Threshold of 20: accepts matches where bearing and/or distance are close enough.
 */
const MIN_MATCH_SCORE = 20;

// ── CrossValidationEngine ─────────────────────────────────────────────────────

export class CrossValidationEngine {

  /**
   * Validate our shared boundary calls against the adjacent property's extracted calls.
   * Uses bearing reversal + tolerance tables to determine the status of each call.
   *
   * @param ourCalls      Our shared boundary calls (P3BoundaryCall from Phase 3)
   * @param theirCalls    Adjacent property's extracted calls (from AdjacentResearchWorker)
   * @param adjacentOwner Owner name of the adjacent property
   * @param sharedDirection Cardinal direction of the shared boundary
   */
  validate(
    ourCalls: P3BoundaryCall[],
    theirCalls: AdjacentBoundaryCall[],
    adjacentOwner: string,
    sharedDirection: string,
  ): CrossValidationResult {
    // Filter to calls that form the shared boundary
    const theirShared = theirCalls.filter(
      (c) => c.isSharedBoundary || c.referencesOurProperty,
    );

    // If none are explicitly marked as shared, use all calls as potential matches
    const candidateCalls = theirShared.length > 0 ? theirShared : theirCalls;

    const comparisons: CallComparison[] = [];
    for (const ourCall of ourCalls) {
      const match = this.findBestMatch(ourCall, candidateCalls);
      comparisons.push(this.buildComparison(ourCall, match));
    }

    // Tally results
    const confirmed   = comparisons.filter((c) => c.status === 'confirmed').length;
    const close       = comparisons.filter((c) => c.status === 'close_match').length;
    const marginal    = comparisons.filter((c) => c.status === 'marginal').length;
    const unverified  = comparisons.filter((c) => c.status === 'unverified').length;
    const discrepancy = comparisons.filter((c) => c.status === 'discrepancy').length;
    const total       = comparisons.length;

    // Weighted confidence: confirmed=100, close_match=75, marginal=40, unverified=25, discrepancy=0
    const confidence = total > 0
      ? Math.round(
          (confirmed * 100 + close * 75 + marginal * 40 + unverified * 25) / total,
        )
      : 0;

    return {
      adjacentOwner,
      sharedDirection,
      callComparisons:          comparisons,
      sharedBoundaryConfidence: confidence,
      confirmedCalls:           confirmed,
      closeMatchCalls:          close,
      marginalCalls:            marginal,
      unverifiedCalls:          unverified,
      discrepancyCalls:         discrepancy,
    };
  }

  // ── Private: Match finding ───────────────────────────────────────────────────

  /**
   * Find the best matching call from the adjacent property's calls for one of our calls.
   * Uses bearing reversal + angular/distance scoring. Returns null if no good match found.
   */
  private findBestMatch(
    ourCall: P3BoundaryCall,
    theirCalls: AdjacentBoundaryCall[],
  ): AdjacentBoundaryCall | null {
    if (theirCalls.length === 0) return null;

    const ourAz = parseAzimuth(ourCall.bearing ?? '');
    if (ourAz === null) return null;

    // Their bearing reversed should match ours
    const reversedAz = reverseAzimuth(ourAz);

    let bestMatch: AdjacentBoundaryCall | null = null;
    let bestScore = -Infinity;

    for (const theirs of theirCalls) {
      const theirAz = parseAzimuth(theirs.bearing ?? '');
      if (theirAz === null) continue;

      const bearingDiff = angularDiff(reversedAz, theirAz);
      // Outside MARGINAL threshold — not a plausible match
      if (bearingDiff > MAX_BEARING_DIFF_FOR_MATCH_DEG) continue;

      const distDiff = Math.abs((ourCall.distance ?? 0) - theirs.distance);

      // Scoring: smaller bearing diff + closer distance = better match
      let score = (0.5 - bearingDiff) * 40 + Math.max(0, 50 - distDiff) * 2;

      // Bonus: both calls reference each other's property in "along" field
      if (ourCall.along && theirs.along) {
        const a = ourCall.along.toUpperCase();
        const b = theirs.along.toUpperCase();
        if (a.includes(b) || b.includes(a)) score += 30;
      }

      // Bonus: same call type (straight vs curve)
      if (ourCall.type === theirs.type) score += 10;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = theirs;
      }
    }

    // Require a minimum score of MIN_MATCH_SCORE to prevent false positives
    return bestScore > MIN_MATCH_SCORE ? bestMatch : null;
  }

  // ── Private: Build comparison ────────────────────────────────────────────────

  /**
   * Build a CallComparison for one of our calls vs their matching call (or null if not found).
   */
  private buildComparison(
    ourCall: P3BoundaryCall,
    theirCall: AdjacentBoundaryCall | null,
  ): CallComparison {
    if (!theirCall) {
      return {
        callId:               ourCall.callId,
        ourBearing:           ourCall.bearing ?? '',
        ourDistance:          ourCall.distance ?? 0,
        theirBearing:         null,
        theirDistance:        null,
        theirReversed:        null,
        bearingDifference:    null,
        bearingDifferenceDeg: null,
        distanceDifference:   null,
        status:               'unverified',
        symbol:               '?',
        notes:                'No matching call found in adjacent deed',
      };
    }

    // Compute bearing difference using canonical adjacent-research.ts functions
    const ourAz      = parseAzimuth(ourCall.bearing ?? '');
    const theirAz    = parseAzimuth(theirCall.bearing ?? '');
    const theirRevAz = theirAz !== null ? reverseAzimuth(theirAz) : null;
    const bearingDiffDeg = (ourAz !== null && theirRevAz !== null)
      ? angularDiff(ourAz, theirRevAz)
      : null;
    const distDiff = Math.abs((ourCall.distance ?? 0) - theirCall.distance);

    // Apply tolerance tables from adjacent-research.ts — do not reimplement
    const bearingRating = bearingDiffDeg !== null ? rateBearingDiff(bearingDiffDeg) : 'UNKNOWN';
    const distRating    = rateDistanceDiff(distDiff);

    // Overall status = worst of bearing and distance ratings
    const ratingOrder = ['CONFIRMED', 'CLOSE_MATCH', 'MARGINAL', 'DISCREPANCY', 'UNKNOWN'];
    const worstRating = ratingOrder[
      Math.max(ratingOrder.indexOf(bearingRating), ratingOrder.indexOf(distRating))
    ];

    const statusMap: Record<string, CallComparison['status']> = {
      CONFIRMED: 'confirmed', CLOSE_MATCH: 'close_match', MARGINAL: 'marginal',
      DISCREPANCY: 'discrepancy', UNKNOWN: 'unverified',
    };
    const symbolMap: Record<CallComparison['status'], CallComparison['symbol']> = {
      confirmed: '✓', close_match: '~', marginal: '?', discrepancy: '✗', unverified: '?',
    };

    const status = statusMap[worstRating] ?? 'unverified';
    const symbol = symbolMap[status];

    // Format bearing difference as DMS string
    let bearingDiffDMS: string | null = null;
    if (bearingDiffDeg !== null) {
      const d  = Math.floor(bearingDiffDeg);
      const mf = (bearingDiffDeg - d) * 60;
      const m  = Math.floor(mf);
      const s  = Math.round((mf - m) * 60);
      bearingDiffDMS = `${d}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`;
    }

    // Format reversed bearing as DMS quadrant string
    let theirReversedStr: string | null = null;
    if (theirRevAz !== null) {
      let ns: string, ew: string, qDeg: number;
      if      (theirRevAz <= 90)  { ns = 'N'; ew = 'E'; qDeg = theirRevAz; }
      else if (theirRevAz <= 180) { ns = 'S'; ew = 'E'; qDeg = 180 - theirRevAz; }
      else if (theirRevAz <= 270) { ns = 'S'; ew = 'W'; qDeg = theirRevAz - 180; }
      else                        { ns = 'N'; ew = 'W'; qDeg = 360 - theirRevAz; }

      const d  = Math.floor(qDeg);
      const mf = (qDeg - d) * 60;
      const m  = Math.floor(mf);
      const s  = Math.round((mf - m) * 60);
      theirReversedStr =
        `${ns} ${String(d).padStart(2, '0')}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}" ${ew}`;
    }

    // Build notes for discrepancies
    const notes = status === 'discrepancy'
      ? `Bearing diff: ${bearingDiffDMS ?? 'unknown'}, Distance diff: ${distDiff.toFixed(2)}'. ` +
        `Investigate — possible causes: datum shift, re-survey, or boundary disagreement.`
      : null;

    return {
      callId:               ourCall.callId,
      ourBearing:           ourCall.bearing ?? '',
      ourDistance:          ourCall.distance ?? 0,
      theirBearing:         theirCall.bearing,
      theirDistance:        theirCall.distance,
      theirReversed:        theirReversedStr,
      bearingDifference:    bearingDiffDMS,
      bearingDifferenceDeg: bearingDiffDeg,
      distanceDifference:   distDiff,
      status,
      symbol,
      notes,
    };
  }
}
