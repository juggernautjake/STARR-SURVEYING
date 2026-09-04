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

import { mayRun, budgetFor, checkBudget, recordSkipped } from '../infra/run-budget.js';
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

/**
 * Run a step, but never for longer than the run itself has left.
 *
 * ── WHY GATING BETWEEN STEPS IS NOT ENOUGH ──────────────────────────────────────────────────────
 *
 * `mayStart` asks the ceiling BEFORE expensive work, which is the right shape — stopping between
 * steps leaves a coherent partial result, stopping inside one leaves half a chain of title. But a
 * check between steps can only hold a 25-minute total if the steps themselves are finite, and they
 * are not.
 *
 * Measured 2026-09-03: a single clerk owner search took **697,641 ms — 11.6 minutes**. Individual
 * operations inside it are bounded (page loads at 60s, image fetches at 30s, visibility probes at
 * 1s), but the step loops over owner-name variants and its only exit is a document count. Nothing
 * bounds the loop. Two such steps exhaust a 25-minute run on their own, and the gate before the
 * third one is then correct and far too late.
 *
 * The deadline is the run's OWN remaining time, not a fixed number. If four minutes are left, no
 * step gets more than four. That makes the wall-clock limit mean what it says without anyone
 * choosing a per-step figure that would be wrong for some other county.
 *
 * ── WHAT THIS DOES NOT DO, STATED PLAINLY ───────────────────────────────────────────────────────
 *
 * Losing the race does NOT cancel the underlying work. A Playwright navigation in flight keeps
 * going until its own timeout fires; this returns control to the run, it does not reach into the
 * browser and stop it. The run stops WAITING, which is what bounds the run — but the process may be
 * briefly doing work whose result nobody will read. Saying so because the alternative is a comment
 * claiming a cancellation that never happens, and a future reader trusting it.
 *
 * `fallback` is what the caller gets when the deadline passes: whatever "we did not do this step"
 * looks like for them, usually an empty result. The skip is recorded either way.
 */
/** How much of the run to hold back for reading what was found.
 *
 *  Every run on 1512 Chisholm Trail (4, 5, 6 on 2026-09-04, and the owner's 30-minute runs before
 *  them) hit its ceiling inside Phase 2, so Phase 3 — the AI reading of the deeds, the data
 *  points, the summary — never ran: 60 documents on file, none with a summary, no extracted data
 *  points. A scraping step that may spend "whatever time the run has left" will spend all of it.
 *  Thirty per cent of the ceiling, never less than three minutes nor more than eight, is kept for
 *  the reading. */
export function analysisReserveMs(projectId: string): number {
  const limitMs = checkBudget(projectId, spendForRun(projectId)).limitMs;
  if (!Number.isFinite(limitMs) || limitMs <= 0) return 0;
  return Math.max(3 * 60_000, Math.min(8 * 60_000, Math.round(limitMs * 0.3)));
}

export async function withStepDeadline<T>(
  projectId: string,
  step: string,
  fn: () => Promise<T>,
  fallback: T,
  onTimeout?: (msg: string) => void,
  opts: { reserveMs?: number; abortController?: AbortController } = {},
): Promise<T> {
  const status = checkBudget(projectId, spendForRun(projectId));

  // No budget, or an unbounded one: run it. An unbudgeted run is not an over-budget one.
  if (!Number.isFinite(status.remainingMs) || status.remainingMs <= 0) {
    if (status.remainingMs === 0 && Number.isFinite(status.limitMs)) {
      recordSkipped(projectId, step, `no time remained in the run's ${Math.round(status.limitMs / 60_000)}-minute budget`);
      onTimeout?.(`Skipping ${step} — no time left in the run's budget.`);
      return fallback;
    }
    return fn();
  }

  // The reserve is held back for the steps that read what this one finds. A step is never given
  // less than 45 seconds — enough to notice it has nothing — so a late step still says what it
  // saw rather than being skipped in silence.
  const reserveMs = Math.max(0, opts.reserveMs ?? 0);
  const deadlineMs = Math.max(45_000, status.remainingMs - reserveMs);
  if (reserveMs > 0 && status.remainingMs - reserveMs < deadlineMs) {
    onTimeout?.(`${step} has ${Math.round(deadlineMs / 1000)} s: ${Math.round(reserveMs / 60_000)} minute(s) of the run are held back for reading what it finds.`);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const TIMED_OUT = Symbol('step-deadline');

  try {
    const raced = await Promise.race([
      fn(),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), deadlineMs);
      }),
    ]);

    if (raced === TIMED_OUT) {
      const mins = Math.max(1, Math.round(deadlineMs / 60_000));
      recordSkipped(projectId, step, `it did not finish within the ${mins} minute(s) the run had left`);
      // ── STOP THE STEP, DO NOT JUST STOP WAITING FOR IT ──────────────────────────────────────
      //
      // Racing `fn()` against a timer resolves the race — but `fn()` keeps running, orphaned.
      // On 2026-09-04 run 7 the clerk scraper was left driving a browser for nine minutes past
      // the ceiling this way, one instrument at a time, holding the event loop so the run could
      // not finish. When the caller passes an AbortController, the deadline aborts it, and a step
      // that honours the signal stops itself on its next check instead of running to completion.
      opts.abortController?.abort();
      onTimeout?.(
        `⚠ ${step} was still running when the run's time ran out (${mins} minute(s) were left when ` +
        `it started). The run stopped it; the report will say this step did not finish.`,
      );
      return fallback;
    }
    return raced as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
