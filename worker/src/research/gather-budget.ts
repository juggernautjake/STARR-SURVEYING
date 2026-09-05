// worker/src/research/gather-budget.ts — the Gather-run budget model (plan B2, rewrite of G2)
//
// ── THE MODEL (owner, 2026-09-05 final) ──────────────────────────────────────────────────────────
//
// A Gather run has TWO independent, METERED budgets the operator sets, both raisable:
//
//   • TexasFile budget — minimum $10. TexasFile bills $1/page; this is only the CEILING. You pay for
//     the pages actually bought, nothing more. (This replaces the earlier flat/refundable $10
//     earmark — there is no flat fee and no refund; spend is simply what was spent.)
//   • Other-sources budget — minimum $2. Covers county-site / GIS / free capture work.
//
// The two are tracked separately so a run's paid spend and its everything-else spend never draw on
// each other. This module is the single source of the caps and the "may I buy this" gate; it is pure
// so the mins and the gating are unit-tested without a run.

/** No Gather run's TexasFile budget is set below this (when TexasFile is on). */
export const MIN_TEXASFILE_BUDGET_USD = 10;

/** No Gather run's other-sources budget is set below this. */
export const MIN_OTHER_BUDGET_USD = 2;

export interface GatherBudget {
  texasfileOn: boolean;
  /** The TexasFile spend ceiling in USD ($1/page). 0 when TexasFile is off, else ≥ $10. */
  texasfileBudgetUsd: number;
  /** The other-sources spend ceiling in USD, ≥ $2. */
  otherBudgetUsd: number;
}

/** Build the two-budget plan from the run's requested caps + the TexasFile toggle. Mins are enforced;
 *  a request below a minimum is raised to it (not rejected). */
export function gatherBudget(input: {
  texasfileOn: boolean;
  texasfileBudgetUsd?: number;
  otherBudgetUsd?: number;
}): GatherBudget {
  const other = round2(Math.max(finiteOr(input.otherBudgetUsd, MIN_OTHER_BUDGET_USD), MIN_OTHER_BUDGET_USD));
  const texasfileBudgetUsd = input.texasfileOn
    ? round2(Math.max(finiteOr(input.texasfileBudgetUsd, MIN_TEXASFILE_BUDGET_USD), MIN_TEXASFILE_BUDGET_USD))
    : 0;
  return { texasfileOn: !!input.texasfileOn, texasfileBudgetUsd, otherBudgetUsd: other };
}

/** How much of the TexasFile budget remains, given what TexasFile has already spent this run. */
export function remainingTexasfileAllowance(budget: GatherBudget, spentOnTexasfile: number): number {
  return Math.max(0, round2(budget.texasfileBudgetUsd - finiteOr(spentOnTexasfile, 0)));
}

/** How much of the other-sources budget remains, given what has already been spent on it. */
export function remainingOtherAllowance(budget: GatherBudget, spentOnOther: number): number {
  return Math.max(0, round2(budget.otherBudgetUsd - finiteOr(spentOnOther, 0)));
}

/** Would buying a `docCostUsd` TexasFile document stay within the remaining TexasFile budget? */
export function mayBuyFromTexasFile(budget: GatherBudget, spentOnTexasfile: number, docCostUsd: number): boolean {
  if (!budget.texasfileOn) return false;
  const cost = finiteOr(docCostUsd, Infinity);
  if (!(cost > 0)) return false;
  return cost <= remainingTexasfileAllowance(budget, spentOnTexasfile);
}

function finiteOr(n: number | undefined, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
