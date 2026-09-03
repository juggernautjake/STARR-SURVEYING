// worker/src/research/budget-gate.ts — the ceiling, asked before expensive work.
//
// ── $29.19 AGAINST A $2.00 CAP ──────────────────────────────────────────────────────────────────
//
// Measured on the live database, 2026-09-03. A Bell County run on 11780 FM 2484:
//
//     limits    {"maxCostUsd":2, "maxPaidPages":20, "maxWallClockMs":1500000}
//     cost_usd  29.190966        paid_pages 0        ← model spend, not documents
//     started 03:58:07Z   finished 06:41:23Z         ← 163 minutes against a 25-minute limit
//
// Fourteen times the cost ceiling and six times the clock. Not because the ceilings were wrong, and
// not because the check was missing — `checkBudget` and `mayRun` were both written, tested and
// documented. Because nothing on the path that spends the money ever called them.
//
// `checkBudget` had exactly two call sites in the whole worker, both in `index.ts`, both OUTSIDE
// the county pipelines. Grepping `src/counties/` for any budget call returned nothing at all. And
// `mayRun` — whose own doc comment reads "callers ask mayRun(...) before starting expensive work" —
// had ZERO callers anywhere.
//
// So a run whose primary source was unreachable fell through to grinding the county clerk portal by
// owner name for two and three quarter hours: 224 requests to one host, one search alone taking
// 697,641 ms. The budget was consulted once, at the end, which is where `stop_reason:
// budget_reached` came from — after every dollar had been spent.
//
// ── WHY THIS FILE EXISTS RATHER THAN CALLING mayRun DIRECTLY ────────────────────────────────────
//
// `mayRun(projectId, step, spendSoFar)` needs the spend figure injected, which keeps `run-budget.ts`
// pure and testable — a good decision that also meant every would-be caller needed two imports and
// had to know that `spendForRun` was the right source. County code imported neither.
//
// One import, one call, no plumbing. The friction was small but it was the whole difference between
// a guard that exists and a guard that runs.

import { mayRun, budgetFor, checkBudget } from '../infra/run-budget.js';
import { spendForRun } from '../infra/usage.js';
import type { PipelineLogger } from '../lib/logger.js';

/**
 * Should this step run?
 *
 * Ask BEFORE starting expensive work, never in the middle of it. Stopping between steps leaves a
 * coherent partial result — a chain of title that stops at 1977 is useful; one that stops halfway
 * through parsing a single deed is not.
 *
 * A run with no registered budget returns `true`. That is deliberate: an unbudgeted run is not an
 * over-budget one, and refusing work because nobody set a limit would break every path that does
 * not go through the pipeline — the Testing Lab, the CLI, an ad-hoc call.
 *
 * The skip is recorded with its reason, so the finished run can say what it did not do instead of
 * presenting a truncated result as a complete one.
 */
export function mayStart(projectId: string, step: string): boolean {
  return mayRun(projectId, step, spendForRun(projectId));
}

/**
 * The same question, but it says so in the run log when the answer is no.
 *
 * Preferred inside a county orchestrator, where a silently skipped phase is indistinguishable from
 * a phase that ran and found nothing — the distinction this codebase keeps having to relearn.
 */
export function mayStartLogged(projectId: string, step: string, logger?: PipelineLogger): boolean {
  if (mayStart(projectId, step)) return true;
  const status = checkBudget(projectId, spendForRun(projectId));
  logger?.warn(
    'Budget',
    `Skipping ${step} — ${status.exceeded === 'wall_clock'
      ? `${Math.round(status.limitMs / 60_000)} minute limit reached (${Math.round(status.elapsedMs / 60_000)} elapsed)`
      : status.exceeded === 'cost'
      ? `$${status.limitUsd.toFixed(2)} limit reached ($${status.spentUsd.toFixed(2)} spent)`
      : `${status.limitPaidPages}-page limit reached (${status.paidPages} bought)`
    }. The run continues and the report will say this step was not attempted.`,
  );
  return false;
}

/** Is a budget registered for this run at all?
 *
 *  Used by tests and by the wind-down summary to tell "within budget" apart from "never had one" —
 *  two states that both look like `ok: true` and mean very different things. */
export function hasBudget(projectId: string): boolean {
  return budgetFor(projectId) !== undefined;
}
