// worker/src/research/gather-cost-estimate.ts — estimate the TexasFile cost before buying (plan B2.2)
//
// Confirmed behaviour: before a gather run spends, ESTIMATE what the selected paid items would cost
// and WARN if that exceeds the TexasFile budget. The user then chooses to (a) proceed within the
// current cap — the run buys in priority order until the budget runs out — or (b) raise the cap to
// the estimate and pay the full estimated price. This module is the pure estimator + the assessment;
// the choice is presented by the UI/endpoint.
//
// The estimate is a pre-buy GUESS (real cost is metered $1/page once the page counts are known), so
// it is deliberately rough and per-type. It exists to set expectations and drive the warn, never to
// charge.

export type EstimatedDocType = 'deed' | 'easement' | 'plat' | 'map';
export type EstimatedScope = 'recent' | 'all' | 'single';

/**
 * Rough typical page counts per item, for the pre-buy estimate only. A recorded deed/easement runs a
 * few pages; a plat one or two; "all X" stands in for a small batch. Free map/GIS captures cost $0.
 * These are estimates to warn against, not the charge — TexasFile bills the real pages.
 */
const TYPICAL_PAGES: Record<EstimatedDocType, { recent: number; all: number; single: number }> = {
  deed:     { recent: 4, all: 16, single: 4 },
  easement: { recent: 3, all: 12, single: 3 },
  plat:     { recent: 2, all: 6,  single: 2 },
  map:      { recent: 0, all: 0,  single: 0 }, // free capture
};

/** TexasFile price per page. */
export const TEXASFILE_USD_PER_PAGE = 1;

/** The estimated TexasFile cost of one item (0 for a free capture). */
export function estimateItemCostUsd(documentType: EstimatedDocType, scope: EstimatedScope, paid: boolean): number {
  if (!paid) return 0;
  const pages = TYPICAL_PAGES[documentType]?.[scope] ?? 0;
  return pages * TEXASFILE_USD_PER_PAGE;
}

export interface GatherCostAssessment {
  /** Total estimated TexasFile cost of the paid items, in USD. */
  estimateUsd: number;
  /** The TexasFile budget it was compared against. */
  budgetUsd: number;
  /** True when the estimate exceeds the budget — the run should warn before buying. */
  overBudget: boolean;
  /** How much the estimate exceeds the budget (0 when within). */
  overageUsd: number;
  /** How many items (walked in the given priority order) fit cumulatively within the budget. */
  coverableCount: number;
  /** Total paid items considered. */
  totalCount: number;
}

/**
 * Assess a list of per-item estimated costs (already in priority order) against the TexasFile budget.
 * `itemCostsUsd` should be the paid items only, cheapest-priority first as the run would buy them.
 */
export function assessGatherCost(itemCostsUsd: number[], budgetUsd: number): GatherCostAssessment {
  const costs = (itemCostsUsd ?? []).filter((c) => Number.isFinite(c) && c > 0);
  const estimateUsd = round2(costs.reduce((s, c) => s + c, 0));
  const budget = Number.isFinite(budgetUsd) && budgetUsd > 0 ? budgetUsd : 0;

  let running = 0;
  let coverableCount = 0;
  for (const c of costs) {
    if (running + c > budget) break;
    running += c;
    coverableCount += 1;
  }

  return {
    estimateUsd,
    budgetUsd: budget,
    overBudget: estimateUsd > budget,
    overageUsd: Math.max(0, round2(estimateUsd - budget)),
    coverableCount,
    totalCount: costs.length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
