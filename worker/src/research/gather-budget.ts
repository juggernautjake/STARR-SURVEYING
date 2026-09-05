// worker/src/research/gather-budget.ts — the Gather-run budget model (plan GATHER_AND_REVIEW_SPLIT, G2)
//
// ── THE MODEL (owner, 2026-09-05) ────────────────────────────────────────────────────────────────
//
// A Gather run costs money, and the user sets a MAXIMUM BASE BUDGET for general gathering (county
// site + capture). The base budget has a floor of $7 — no gather run is set up for less.
//
// TexasFile is an OPT-IN toggle in Configure. Turning it on adds a FLAT $10 upcharge earmarked for
// TexasFile purchases — nothing else may draw on it, and TexasFile may draw on nothing else. The $10
// is CONDITIONAL:
//   · TexasFile finds and files at least one document  → the $10 is CHARGED (kept, added to cost).
//   · TexasFile finds nothing                          → the $10 is NOT spent; it is REFUNDED,
//                                                        and the run reports it as such.
//
// So the maximum a Gather run can cost is `base + (texasfileOn ? 10 : 0)`, and the actual cost is
// `base_spent + (anyTexasFileFile ? 10 : 0)`. This module is the single source of those numbers;
// it is pure so the split and the settlement can be unit-tested without a run.

/** No Gather run is configured for less than this. */
export const MIN_GATHER_BUDGET_USD = 7;

/** The flat, earmarked upcharge for enabling TexasFile on a run. */
export const TEXASFILE_ADDON_USD = 10;

export interface GatherBudget {
  /** The base budget for general gathering, floored at $7. */
  baseCap: number;
  /** The earmarked TexasFile allowance: $10 when TexasFile is on, else 0. */
  texasfileAddon: number;
  /** base + addon — the most this run can cost. */
  maxTotal: number;
  /** Whether TexasFile is enabled for this run. */
  texasfileOn: boolean;
}

/** Build the Gather-run budget from the user's requested base cap and the TexasFile toggle. */
export function gatherBudget(input: { baseCap: number; texasfileOn: boolean }): GatherBudget {
  const baseCap = round2(Math.max(finiteOr(input.baseCap, 0), MIN_GATHER_BUDGET_USD));
  const texasfileAddon = input.texasfileOn ? TEXASFILE_ADDON_USD : 0;
  return {
    baseCap,
    texasfileAddon,
    maxTotal: round2(baseCap + texasfileAddon),
    texasfileOn: !!input.texasfileOn,
  };
}

/** How much of the TexasFile add-on remains, given what TexasFile has already spent this run. */
export function remainingTexasfileAllowance(budget: GatherBudget, spentOnTexasfile: number): number {
  return Math.max(0, round2(budget.texasfileAddon - finiteOr(spentOnTexasfile, 0)));
}

/** Would buying a `docCostUsd` TexasFile document stay within the earmarked $10 add-on? */
export function mayBuyFromTexasFile(budget: GatherBudget, spentOnTexasfile: number, docCostUsd: number): boolean {
  if (!budget.texasfileOn) return false;
  if (!(finiteOr(docCostUsd, Infinity) > 0)) return false;
  return finiteOr(docCostUsd, Infinity) <= remainingTexasfileAllowance(budget, spentOnTexasfile);
}

export interface AddonSettlement {
  /** The part of the $10 that is kept and added to the run cost. */
  charged: number;
  /** The part of the $10 that is returned to the user (shown as refunded). */
  refunded: number;
}

/**
 * Settle the TexasFile add-on at run end. The upcharge is all-or-nothing on whether TexasFile
 * produced anything: any file found keeps the whole $10; nothing found refunds the whole $10.
 * (`filesFound` is a count of TexasFile documents actually obtained + filed, not attempts.)
 */
export function settleTexasfileAddon(input: { filesFound: number; addon?: number }): AddonSettlement {
  const addon = finiteOr(input.addon, TEXASFILE_ADDON_USD);
  const any = finiteOr(input.filesFound, 0) > 0;
  return any ? { charged: addon, refunded: 0 } : { charged: 0, refunded: addon };
}

function finiteOr(n: number | undefined, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
