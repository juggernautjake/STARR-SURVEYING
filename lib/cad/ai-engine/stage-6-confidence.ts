// lib/cad/ai-engine/stage-6-confidence.ts
//
// Phase 6 Stage 6 — confidence scoring. Six weighted factors
// roll up into a 0-100 score; the score lands in one of five
// tiers that drive the §11 visual treatment + the review
// queue's accept/review/manual buckets.
//
// Pure function. Reads classification flags from Stage 1, the
// per-feature confidence adjustments + per-call comparisons
// from Stage 3, the point-group calc/field intelligence from
// Phase 2, and the field closure from the Phase 4 closure
// helper.
//
// Weights (per spec §10):
//   codeClarity            0.25
//   coordinateValidity     0.20
//   deedRecordMatch        0.25
//   contextualConsistency  0.15
//   closureQuality         0.10
//   curveDataCompleteness  0.05
//
// Tier thresholds (per §11):
//   95-100 → 5  (auto-accept, green glow)
//   80-94  → 4  (auto-place, confirm in review)
//   60-79  → 3  (review required, orange glow)
//   40-59  → 2  (must decide, red glow)
//   0-39   → 1  (not placed, manual queue)

import type {
  ClosureResult,
  Feature,
  PointGroup,
} from '../types';

import type {
  ClassificationResult,
  ConfidenceFactors,
  ConfidenceScore,
  ReconciliationResult,
} from './types';

/**
 * Pure weighted-sum confidence score in 0-100.
 */
export function computeConfidence(factors: ConfidenceFactors): number {
  return Math.round(
    factors.codeClarity * 25 +
      factors.coordinateValidity * 20 +
      factors.deedRecordMatch * 25 +
      factors.contextualConsistency * 15 +
      factors.closureQuality * 10 +
      factors.curveDataCompleteness * 5
  );
}

/**
 * Map a 0-100 score to its tier per §11. Higher is better.
 */
export function getTier(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score >= 95) return 5;
  if (score >= 80) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  return 1;
}

/**
 * Score every Stage 2 feature using the inputs from earlier
 * stages. Returns a Map keyed by feature.id with the full
 * score breakdown so the review queue + canvas glow can read
 * the raw factors.
 */
export function scoreAllElements(
  features: Feature[],
  classified: ClassificationResult[],
  reconciliation: ReconciliationResult | null,
  pointGroups: Map<number, PointGroup>,
  closure: ClosureResult | null
): Map<string, ConfidenceScore> {
  const scores = new Map<string, ConfidenceScore>();

  for (const feature of features) {
    const factors: ConfidenceFactors = {
      codeClarity: 1.0,
      coordinateValidity: 1.0,
      // Default mid when no deed; Stage 3 inputs override below.
      deedRecordMatch: reconciliation ? 0.5 : 0.7,
      contextualConsistency: 1.0,
      closureQuality: 0.5,
      curveDataCompleteness: 1.0,
    };
    const flags: string[] = [];

    const pointIds = getFeaturePointIds(feature);
    const relatedPoints =
      pointIds.length > 0
        ? classified.filter((c) => pointIds.includes(c.point.id))
        : [];

    // ── Code clarity ──
    for (const cp of relatedPoints) {
      if (cp.flags.includes('UNRECOGNIZED_CODE')) {
        factors.codeClarity -= 0.4;
        flags.push('Unrecognized code');
      }
      if (cp.flags.includes('AMBIGUOUS_CODE')) {
        factors.codeClarity -= 0.2;
        flags.push('Ambiguous code');
      }
      if (cp.flags.includes('NAME_SUFFIX_AMBIGUOUS')) {
        factors.codeClarity -= 0.15;
        flags.push('Ambiguous name suffix');
      }
      if (cp.flags.includes('MONUMENT_NO_ACTION')) {
        factors.codeClarity -= 0.1;
        flags.push('Monument without action indicator');
      }
    }
    factors.codeClarity = clamp01(factors.codeClarity);

    // ── Coordinate validity ──
    for (const cp of relatedPoints) {
      if (cp.flags.includes('ZERO_COORDINATES')) {
        factors.coordinateValidity = 0;
        flags.push('Zero coordinates');
      }
      if (cp.flags.includes('COORDINATE_OUTLIER')) {
        factors.coordinateValidity -= 0.5;
        flags.push('Coordinate outlier');
      }
      if (cp.flags.includes('DUPLICATE_POINT_NUMBER')) {
        factors.coordinateValidity -= 0.2;
        flags.push('Duplicate point number');
      }
    }
    factors.coordinateValidity = clamp01(factors.coordinateValidity);

    // ── Deed record match ──
    if (reconciliation) {
      const adj = reconciliation.confidenceAdjustments.get(feature.id);
      if (adj !== undefined) {
        factors.deedRecordMatch = clamp01(0.5 + adj / 100);
      }
      const fromIdsForLegs = reconciliation.callComparisons
        .map((c) =>
          reconciliation.fieldTraverse.legs[c.fieldLegIndex]?.fromPointId
        )
        .filter((id): id is string => !!id);
      const relatedComps = reconciliation.callComparisons.filter((c) => {
        const fromId =
          reconciliation.fieldTraverse.legs[c.fieldLegIndex]?.fromPointId;
        return fromId !== undefined && pointIds.includes(fromId);
      });
      // Reference fromIdsForLegs to keep the audit trail readable
      // when the reconciler logs which feature consumed which leg.
      void fromIdsForLegs;
      if (relatedComps.length > 0) {
        const avgMatch =
          relatedComps.reduce((s, c) => s + c.confidenceContribution, 0) /
          relatedComps.length;
        factors.deedRecordMatch = clamp01(avgMatch);
        if (avgMatch < 0.5) flags.push('Poor deed/field match');
      }
    }

    // ── Contextual consistency ──
    for (const cp of relatedPoints) {
      const baseNumber = cp.point.parsedName?.baseNumber;
      if (baseNumber === undefined) continue;
      const group = pointGroups.get(baseNumber);
      if (!group) continue;
      if (group.hasBothCalcAndField) {
        factors.contextualConsistency = clamp01(
          factors.contextualConsistency + 0.15
        );
      }
      if (
        !group.found &&
        !group.set &&
        group.calculated.length > 0
      ) {
        factors.contextualConsistency -= 0.2;
        flags.push('Only calculated position (no field verification)');
      }
      if (group.deltaWarning) {
        factors.contextualConsistency -= 0.1;
        flags.push(
          `Calc-to-field delta > 0.10' (${group.calcSetDelta?.toFixed(3) ?? '?'}')`
        );
      }
    }
    factors.contextualConsistency = clamp01(factors.contextualConsistency);

    // ── Closure quality ──
    if (closure) {
      if (closure.precisionDenominator >= 15000) factors.closureQuality = 1.0;
      else if (closure.precisionDenominator >= 10000) factors.closureQuality = 0.8;
      else if (closure.precisionDenominator >= 5000) factors.closureQuality = 0.5;
      else factors.closureQuality = 0.2;
    }

    // ── Curve data completeness ──
    if (
      feature.geometry.type === 'ARC' ||
      feature.geometry.type === 'MIXED_GEOMETRY'
    ) {
      // Default for fitted arcs (not deed-specified). The deed-
      // anchored arcs raise this in a follow-up slice once Stage
      // 3 surfaces per-curve match info.
      factors.curveDataCompleteness = 0.7;
    }

    const score = computeConfidence(factors);
    scores.set(feature.id, {
      score,
      tier: getTier(score),
      factors,
      flags,
    });
  }

  return scores;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Stage 2 emits its provenance via `feature.properties.aiPointIds`
 * (comma-separated point ids) — see lib/cad/ai-engine/stage-2-
 * assemble.ts. Stage 6 reads that string back out so it can map
 * each feature to its source classification rows.
 */
function getFeaturePointIds(feature: Feature): string[] {
  const raw = feature.properties?.aiPointIds;
  if (typeof raw !== 'string' || raw.length === 0) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}
