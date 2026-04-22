// worker/src/lib/closure-tolerance.ts
//
// Shared closure-tolerance constants and classifier for the boundary survey
// pipeline. Single source of truth for "is this closure acceptable?" — all
// other modules (traverse-closure, confidence-scoring-engine, the closure
// gate in the Phase B intelligence layer, and the report renderer) import
// from here so changing a threshold changes it everywhere.
//
// See docs/CLOSURE_TOLERANCE.md for the standards background.
//
// Tier semantics (linear closure ratio, perimeter / error_distance):
//   excellent   ratio >= 10_000      → silent pass
//   acceptable  5_000 <= ratio < 10_000 → pass with `closure_warn`
//   marginal    2_500 <= ratio < 5_000  → soft fail; reviewer click-through
//   poor        ratio < 2_500           → hard fail; block from final report
//
// Counties may override the thresholds via county-config-registry, but they
// can only LOOSEN within sane bounds (see clamp logic below). They cannot
// loosen beyond `MIN_ACCEPTABLE_FLOOR_RATIO`.

export type ClosureTier = 'excellent' | 'acceptable' | 'marginal' | 'poor';

export interface ClosureThresholds {
  /** Ratio at or above which closure is silently excellent. */
  excellent: number;
  /** Ratio at or above which closure is acceptable (warn but pass). */
  acceptable: number;
  /** Ratio at or above which closure is marginal (soft fail, requires review). */
  marginal: number;
  /** Below `marginal`, closure is `poor` (hard fail). */
}

export const DEFAULT_CLOSURE_THRESHOLDS: ClosureThresholds = {
  excellent: 10_000,
  acceptable: 5_000,
  marginal:   2_500,
};

/** A county may not loosen the acceptable floor below this ratio under any circumstance. */
export const MIN_ACCEPTABLE_FLOOR_RATIO = 2_500;

export interface ClosureClassification {
  tier: ClosureTier;
  ratio: number | null;          // null when perimeter or error is zero
  ratioLabel: string;            // human-readable, e.g. "1:12,345" or "1:∞"
  passes: boolean;               // tier === 'excellent' || 'acceptable'
  requiresReview: boolean;       // tier === 'marginal'
  blocksReport: boolean;         // tier === 'poor'
  warnNote: string | null;       // null when no note needed
}

/**
 * Classify a closure given perimeter length and residual error distance.
 *
 * @param perimeterFt   Sum of all call distances in feet.
 * @param errorFt       Linear residual after closing the traverse, in feet.
 * @param thresholds    Optional county-specific overrides; defaults applied per-field.
 */
export function classifyClosure(
  perimeterFt: number,
  errorFt: number,
  thresholds: Partial<ClosureThresholds> = {},
): ClosureClassification {
  const t = mergeThresholds(thresholds);

  // Degenerate cases: zero error or zero perimeter both produce an "infinite" ratio.
  // We treat zero error on a non-zero perimeter as the best possible closure.
  if (perimeterFt <= 0) {
    return {
      tier: 'poor',
      ratio: null,
      ratioLabel: 'n/a',
      passes: false,
      requiresReview: false,
      blocksReport: true,
      warnNote: 'Perimeter is zero; closure cannot be evaluated.',
    };
  }

  if (errorFt <= 0) {
    return {
      tier: 'excellent',
      ratio: Infinity,
      ratioLabel: '1:∞',
      passes: true,
      requiresReview: false,
      blocksReport: false,
      warnNote: null,
    };
  }

  const ratio = perimeterFt / errorFt;
  const tier  = tierForRatio(ratio, t);

  return {
    tier,
    ratio,
    ratioLabel: formatRatio(ratio),
    passes:         tier === 'excellent' || tier === 'acceptable',
    requiresReview: tier === 'marginal',
    blocksReport:   tier === 'poor',
    warnNote: warnNoteForTier(tier, ratio, t),
  };
}

/**
 * Apply county-specific thresholds with safety clamps. Counties may LOOSEN
 * the acceptable threshold (e.g. rural counties with old survey records)
 * but never below MIN_ACCEPTABLE_FLOOR_RATIO. They may not relax the
 * marginal floor below that same hard floor either.
 */
export function mergeThresholds(
  overrides: Partial<ClosureThresholds>,
): ClosureThresholds {
  const merged: ClosureThresholds = {
    excellent:  overrides.excellent  ?? DEFAULT_CLOSURE_THRESHOLDS.excellent,
    acceptable: overrides.acceptable ?? DEFAULT_CLOSURE_THRESHOLDS.acceptable,
    marginal:   overrides.marginal   ?? DEFAULT_CLOSURE_THRESHOLDS.marginal,
  };

  // Clamp: cannot loosen marginal below the absolute floor.
  if (merged.marginal < MIN_ACCEPTABLE_FLOOR_RATIO) {
    merged.marginal = MIN_ACCEPTABLE_FLOOR_RATIO;
  }
  // Clamp: acceptable cannot be below marginal, excellent cannot be below acceptable.
  if (merged.acceptable < merged.marginal) {
    merged.acceptable = merged.marginal;
  }
  if (merged.excellent < merged.acceptable) {
    merged.excellent = merged.acceptable;
  }

  return merged;
}

function tierForRatio(ratio: number, t: ClosureThresholds): ClosureTier {
  if (ratio >= t.excellent)  return 'excellent';
  if (ratio >= t.acceptable) return 'acceptable';
  if (ratio >= t.marginal)   return 'marginal';
  return 'poor';
}

function warnNoteForTier(
  tier: ClosureTier,
  ratio: number,
  t: ClosureThresholds,
): string | null {
  switch (tier) {
    case 'excellent':
      return null;
    case 'acceptable':
      return `Closure ${formatRatio(ratio)} is below the urban-survey ` +
             `silent-pass floor (1:${t.excellent.toLocaleString()}); ` +
             `verify in the field if signing for an urban-class boundary.`;
    case 'marginal':
      return `Closure ${formatRatio(ratio)} is below the ordinary-boundary ` +
             `floor (1:${t.acceptable.toLocaleString()}). Soft fail — ` +
             `reviewer must accept before publishing. Likely cause: an ` +
             `extraction error in one or more bearings/distances, or an ` +
             `unfound supersession (replat / corrected deed).`;
    case 'poor':
      return `Closure ${formatRatio(ratio)} is below the marginal floor ` +
             `(1:${t.marginal.toLocaleString()}). Hard fail — blocked from ` +
             `final report. Manual reconciliation required.`;
  }
}

export function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return '1:∞';
  if (ratio <= 0) return 'n/a';
  return `1:${Math.round(ratio).toLocaleString()}`;
}
