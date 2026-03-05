// lib/research/multi-source-confidence.ts
// Multi-Source Confidence Scoring Engine — Starr Software Spec v2.0 §13
//
// Implements the spec's four-level scoring hierarchy:
//   1. Per-call (0-100)     — additive formula: base + agreement + quality - deductions
//   2. Per-lot (0-100)      — weighted average (perimeter 2×, longer lines weigh more)
//   3. Per-boundary (0-100) — component scoring: deed+adjacent+geometry+TxDOT+clarity
//   4. Overall (0-100)      — 40% lot avg + 40% boundary avg + 10% weakest lot + 10% weakest boundary
//
// This formula is designed for the multi-source paradigm (adjacent deeds, TxDOT ROW,
// geometric estimates). It supplements — not replaces — the existing 5-factor
// weighted formula in confidence.ts (which operates on the element level).

// ── Types ─────────────────────────────────────────────────────────────────────

/** Every type of data source that can inform a boundary call reading */
export type CallSourceType =
  | 'unwatermarked_plat'        // +10 quality points
  | 'deed_text'                 // +8
  | 'adjacent_deed'             // +8
  | 'txdot_row'                 // +7
  | 'watermarked_plat_clear'    // +6
  | 'geometric_estimate'        // +4
  | 'watermarked_plat_obscured'; // +2

export interface CallSource {
  type:  CallSourceType;
  /** The actual reading from this source (bearing string, distance string, or null if unreadable) */
  value: string | null;
}

export interface CallScoringInput {
  sources:                CallSource[];
  /** True when a watermark damages readability (separate from source type) */
  hasWatermarkDamage:     boolean;
  /** True when multiple OCR passes gave different readings for the same call */
  hasConflictingReads:    boolean;
  /** True when this value was deduced (e.g. geometric estimate) rather than directly read */
  isDeduced:              boolean;
  /** True when the visual geometry measurement contradicts the OCR text */
  contradictedByGeometry: boolean;
}

export interface PerCallScore {
  score:           number;  // 0-100
  base:            number;  // 10 / 25 / 40
  agreementBonus:  number;  // 0 / 15 / 30
  qualityBonus:    number;  // sum of source quality points
  deductions:      number;  // total deductions (positive number)
  sourcesUsed:     number;
  allAgree:        boolean;
  majorityAgree:   boolean;
}

export interface LotCallScore {
  sequence:     number;
  score:        number;   // 0-100 per-call score
  distance_ft:  number;   // for distance-weighted average
  /** Perimeter calls get 2× weight; interior lot-division lines get 1× */
  isPerimeter:  boolean;
}

export interface BoundaryScoreInput {
  deedMatchConfirmed:              boolean;
  adjacentPropertyMatchConfirmed:  boolean;
  geometryMatchConfirmed:          boolean;
  /** Only counted when the boundary runs along a TxDOT-maintained road */
  txdotRowMatchConfirmed:          boolean;
  isRoadBoundary:                  boolean;
  textClarity: 'clear' | 'partial' | 'obscured';
}

export interface PerBoundaryScore {
  score:              number;  // 0-100
  deedPoints:         number;  // 0 or 25
  adjacentPoints:     number;  // 0 or 25
  geometryPoints:     number;  // 0 or 15
  txdotPoints:        number;  // 0 or 20 (road boundaries only)
  clarityPoints:      number;  // 0, 8, or 15
}

export interface OverallPropertyScore {
  score:            number;  // 0-100
  lotAvg:           number;
  boundaryAvg:      number;
  weakestLot:       number;
  weakestBoundary:  number;
  rating:           'EXCELLENT' | 'GOOD' | 'FAIR' | 'LOW' | 'INSUFFICIENT';
  recommendation:   string;
}

// ── Source quality bonus table (spec §13) ─────────────────────────────────────

const SOURCE_QUALITY_POINTS: Record<CallSourceType, number> = {
  unwatermarked_plat:        10,
  deed_text:                  8,
  adjacent_deed:              8,
  txdot_row:                  7,
  watermarked_plat_clear:     6,
  geometric_estimate:         4,
  watermarked_plat_obscured:  2,
};

// ── Per-call scoring ──────────────────────────────────────────────────────────

/**
 * Compute a per-call confidence score using the spec's additive formula:
 *
 *   BASE           = 10 (1 source) | 25 (2 sources) | 40 (3+ sources)
 *   AGREEMENT      = 30 (all agree) | 15 (majority) | 0 (disagreement)
 *   SOURCE QUALITY = sum of quality points per source type
 *   DEDUCTIONS     = watermark(-10) + conflicts(-15) + deduced(-5) + contradicted(-25)
 *   RESULT         = clamped 0-100
 */
export function computePerCallScore(input: CallScoringInput): PerCallScore {
  const numSources = input.sources.length;

  // BASE SCORE
  const base = numSources >= 3 ? 40 : numSources >= 2 ? 25 : 10;

  // AGREEMENT BONUS — compare non-null readings
  const readings = input.sources.map(s => s.value?.trim().toLowerCase()).filter(Boolean) as string[];
  let agreementBonus = 0;
  let allAgree     = false;
  let majorityAgree = false;

  if (readings.length >= 2) {
    // Find the most common reading
    const freq = new Map<string, number>();
    for (const r of readings) freq.set(r, (freq.get(r) ?? 0) + 1);
    const maxCount = Math.max(...freq.values());

    allAgree     = freq.size === 1;
    majorityAgree = !allAgree && maxCount > readings.length / 2;

    agreementBonus = allAgree ? 30 : majorityAgree ? 15 : 0;
  }

  // SOURCE QUALITY BONUS
  const qualityBonus = input.sources.reduce(
    (sum, s) => sum + (SOURCE_QUALITY_POINTS[s.type] ?? 0), 0,
  );

  // DEDUCTIONS
  let deductions = 0;
  if (input.hasWatermarkDamage)         deductions += 10;
  if (input.hasConflictingReads)        deductions += 15;
  if (input.isDeduced)                  deductions += 5;
  if (input.contradictedByGeometry)     deductions += 25;

  const score = Math.max(0, Math.min(100, base + agreementBonus + qualityBonus - deductions));

  return { score, base, agreementBonus, qualityBonus, deductions, sourcesUsed: numSources, allAgree, majorityAgree };
}

// ── Per-lot scoring ──────────────────────────────────────────────────────────

/**
 * Compute per-lot confidence as a weighted average of its call scores.
 *
 * Weights:
 *   - Perimeter calls: 2× weight (more boundary-critical)
 *   - Longer lines: proportional to distance / 100 ft (more boundary affected)
 *   - Missing calls: multiply result by callsFound / callsExpected
 */
export function computePerLotScore(
  callScores:     LotCallScore[],
  callsExpected?: number | null,
): number {
  if (callScores.length === 0) return 0;

  let totalWeight  = 0;
  let weightedSum  = 0;

  for (const c of callScores) {
    const distWeight  = Math.max(1, c.distance_ft / 100);  // normalized by 100ft baseline
    const perimWeight = c.isPerimeter ? 2 : 1;
    const weight      = distWeight * perimWeight;

    totalWeight += weight;
    weightedSum += c.score * weight;
  }

  let score = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Missing-call penalty
  if (callsExpected != null && callsExpected > 0) {
    score *= callScores.length / callsExpected;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Per-boundary scoring ─────────────────────────────────────────────────────

/**
 * Compute per-boundary confidence from component matches:
 *
 *   Deed match confirmed:              25 points
 *   Adjacent property match confirmed: 25 points
 *   Geometry match confirmed:          15 points
 *   TxDOT ROW match (road boundary):   20 points
 *   Text clarity — clear:              15 points
 *                  partial:             8 points
 *                  obscured:            0 points
 *
 * Total maximum: 100 points (road boundary) or 80 points (non-road)
 * Non-road boundaries are rescaled to 0-100.
 */
export function computePerBoundaryScore(input: BoundaryScoreInput): PerBoundaryScore {
  const deedPoints      = input.deedMatchConfirmed              ? 25 : 0;
  const adjacentPoints  = input.adjacentPropertyMatchConfirmed  ? 25 : 0;
  const geometryPoints  = input.geometryMatchConfirmed          ? 15 : 0;
  const txdotPoints     = (input.isRoadBoundary && input.txdotRowMatchConfirmed) ? 20 : 0;
  const clarityPoints   =
    input.textClarity === 'clear'    ? 15 :
    input.textClarity === 'partial'  ?  8 : 0;

  const rawScore = deedPoints + adjacentPoints + geometryPoints + txdotPoints + clarityPoints;

  // For non-road boundaries the TxDOT component (20 pts) is not applicable.
  // Rescale so the maximum available is still 100.
  const maxPossible = input.isRoadBoundary ? 100 : 80;
  const score = Math.max(0, Math.min(100, Math.round((rawScore / maxPossible) * 100)));

  return { score, deedPoints, adjacentPoints, geometryPoints, txdotPoints, clarityPoints };
}

// ── Overall property scoring ─────────────────────────────────────────────────

/** Map spec threshold ranges to rating labels and recommendations */
const OVERALL_THRESHOLDS: Array<{
  min: number;
  rating: OverallPropertyScore['rating'];
  recommendation: string;
}> = [
  { min: 90, rating: 'EXCELLENT',    recommendation: 'No further action needed — survey-grade confidence.' },
  { min: 75, rating: 'GOOD',         recommendation: 'Usable for due diligence. Consider official docs for critical boundaries.' },
  { min: 60, rating: 'FAIR',         recommendation: 'Some unconfirmed calls. May want official docs for the flagged boundaries.' },
  { min: 40, rating: 'LOW',          recommendation: 'Missing data or watermark damage. Recommend purchasing official docs.' },
  { min:  0, rating: 'INSUFFICIENT', recommendation: 'Major gaps or critical discrepancies. Require official docs or field verification.' },
];

/**
 * Compute the overall property confidence score.
 *
 *   Overall = (lotAvg × 0.40)
 *           + (boundaryAvg × 0.40)
 *           + (weakestLot × 0.10)
 *           + (weakestBoundary × 0.10)
 *
 * "Penalized by weakest link" — a single bad boundary drags the overall down.
 */
export function computeOverallPropertyScore(
  lotScores:      number[],
  boundaryScores: number[],
): OverallPropertyScore {
  const lotAvg       = average(lotScores);
  const boundaryAvg  = average(boundaryScores);
  const weakestLot   = lotScores.length      > 0 ? Math.min(...lotScores)      : 0;
  const weakestBound = boundaryScores.length > 0 ? Math.min(...boundaryScores) : 0;

  const score = Math.round(
    lotAvg       * 0.40 +
    boundaryAvg  * 0.40 +
    weakestLot   * 0.10 +
    weakestBound * 0.10,
  );

  const threshold = OVERALL_THRESHOLDS.find(t => score >= t.min) ?? OVERALL_THRESHOLDS[OVERALL_THRESHOLDS.length - 1];

  return { score, lotAvg, boundaryAvg, weakestLot, weakestBoundary: weakestBound, rating: threshold.rating, recommendation: threshold.recommendation };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}

/**
 * Quick helper: build a CallScoringInput from the simplest possible info
 * (single OCR source, no conflicts) so callers can score basic cases without
 * filling out the full interface.
 */
export function buildSimpleCallInput(
  ocrConfidence: number,           // 0-1 scale
  sourceType: CallSourceType = 'watermarked_plat_clear',
  hasWatermarkDamage = false,
): CallScoringInput {
  return {
    sources:                [{ type: sourceType, value: null }],
    hasWatermarkDamage,
    hasConflictingReads:    false,
    isDeduced:              ocrConfidence < 0.70,
    contradictedByGeometry: false,
  };
}

/**
 * Build a CallScoringInput from an array of (source type, value) pairs
 * returned by the cross-validation step.
 */
export function buildMultiSourceCallInput(
  sources: Array<{ type: CallSourceType; value: string | null }>,
  options: {
    hasWatermarkDamage?:     boolean;
    hasConflictingReads?:    boolean;
    isDeduced?:              boolean;
    contradictedByGeometry?: boolean;
  } = {},
): CallScoringInput {
  return {
    sources,
    hasWatermarkDamage:     options.hasWatermarkDamage     ?? false,
    hasConflictingReads:    options.hasConflictingReads    ?? false,
    isDeduced:              options.isDeduced              ?? false,
    contradictedByGeometry: options.contradictedByGeometry ?? false,
  };
}
