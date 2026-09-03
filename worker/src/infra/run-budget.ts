// worker/src/infra/run-budget.ts — a run that stops on time, with what it has (plan R5).
//
// ── WHAT THE OWNER ASKED FOR, AND WHY IT NEEDS A CEILING AT ALL ─────────────────────────────────
//
// *"The request is sent to the server, it starts the research process and continues to work on the
// research for 20–30 minutes until it is complete. I want each research run to be as cheap but as
// effective as possible."*
//
// Both halves of that are ceilings. Without a clock, a run that finds an interesting chain of title
// will follow it for an hour; without a dollar limit, a county whose plats are 60 pages of scanned
// handwriting will spend whatever the vision model asks. Neither failure announces itself — the run
// just takes longer and costs more than the last one, and nobody can say why.
//
// ── STOPPING IS NOT FAILING ─────────────────────────────────────────────────────────────────────
//
// The single most important behaviour here: when a ceiling is reached the run **finishes cleanly
// with what it has** and records what it did not do. It does not throw, it does not mark itself
// failed, and it does not discard the documents it already paid for.
//
// A run that dies at its limit is worse than useless — the money is spent, the time is gone, and
// there is nothing to show. A run that stops and says *"I did the deed chain and the plat; I
// skipped adjoiners and ROW because the budget ran out"* is a usable answer plus a decision for a
// person: raise the ceiling, or accept it.
//
// ── AND THE SKIPPED LIST IS THE PRODUCT ─────────────────────────────────────────────────────────
//
// Anything not done is recorded with the reason. A partial result that does not say what is missing
// is indistinguishable from a complete one, and a surveyor cannot tell whether "no easements found"
// means there are none or that we stopped looking.

export interface BudgetLimits {
  /** Wall-clock ceiling. The owner's 20–30 minutes. */
  maxWallClockMs: number;
  /** Total spend for this run, USD — AI, paid pages, captcha solves. */
  maxCostUsd: number;
  /** Paid document pages. A separate ceiling because one $50 plat set can pass the dollar limit in
   *  a single purchase, and that decision deserves its own bound. */
  maxPaidPages: number;
}

export const DEFAULT_LIMITS: BudgetLimits = {
  maxWallClockMs: 25 * 60_000,
  maxCostUsd: 2.0,
  maxPaidPages: 20,
};

/** The most a single run may spend, whatever the caller or the environment asks for.
 *
 *  The owner's number. $2.00 is the right DEFAULT — most runs are Bell/Coryell/Milam/Lampasas/Bosque
 *  and cost nothing but AI time — but a McLennan chain of title behind TexasFile can legitimately
 *  need more, and until now the only way to get it was to edit code.
 *
 *  A ceiling and a default are different things and both are needed. Without the ceiling, "per-run
 *  limit" is not a limit: a typo of 1000 instead of 10.00, or a caller that forwards a number from a
 *  form, becomes a thousand-dollar run with no second opinion. The clamp is silent on purpose —
 *  a request for more is satisfied AT the maximum rather than rejected, because failing a run
 *  outright over a too-large budget helps nobody. `limitsFor` reports what it actually applied. */
export const MAX_COST_CEILING_USD = 10;

export type ExceededReason = 'wall_clock' | 'cost' | 'paid_pages';

export interface SkippedWork {
  step: string;
  reason: string;
  at: string;
}

export interface BudgetState {
  projectId: string;
  limits: BudgetLimits;
  startedAt: number;
  paidPages: number;
  skipped: SkippedWork[];
  /** Set once a ceiling is hit; the run then winds down rather than starting new work. */
  exceeded: ExceededReason | null;
}

export interface BudgetStatus {
  ok: boolean;
  exceeded: ExceededReason | null;
  elapsedMs: number;
  remainingMs: number;
  /** The limits themselves. Present because `reasonText` used to report ELAPSED time as though it
   *  were the limit — a 149-minute run announced "its 149-minute time limit" when the limit was 25.
   *  A message cannot name a number it was never given. */
  limitMs: number;
  limitUsd: number;
  limitPaidPages: number;
  spentUsd: number;
  remainingUsd: number;
  paidPages: number;
  skipped: SkippedWork[];
}

const runs = new Map<string, BudgetState>();

/** Read the per-run limits from the request and the environment.
 *
 *  A caller's `maxResearchTimeMinutes` is honoured but clamped: a request asking for four hours is
 *  either a mistake or somebody working around a problem that should be fixed properly, and a
 *  worker that accepts it ties up a slot the whole time. */
export function limitsFor(
  requested?: { maxResearchTimeMinutes?: number; maxCostUsd?: number },
  env: NodeJS.ProcessEnv = process.env,
): BudgetLimits {
  const envMinutes = Number(env.RUN_MAX_MINUTES);
  const envCost = Number(env.RUN_MAX_COST_USD);
  const envPages = Number(env.RUN_MAX_PAID_PAGES);

  const minutes = requested?.maxResearchTimeMinutes
    ?? (Number.isFinite(envMinutes) && envMinutes > 0 ? envMinutes : DEFAULT_LIMITS.maxWallClockMs / 60_000);

  // A requested cost of 0 is meaningful — "spend nothing, free sources only" — so it must survive,
  // which `||` would not: `0 || fallback` is the fallback. Only a missing or unusable number falls
  // through to the environment, and only then to the default.
  const requestedCost = requested?.maxCostUsd;
  const cost = Number.isFinite(requestedCost) && (requestedCost as number) >= 0
    ? (requestedCost as number)
    : (Number.isFinite(envCost) && envCost > 0 ? envCost : DEFAULT_LIMITS.maxCostUsd);

  return {
    maxWallClockMs: clamp(minutes, 1, 60) * 60_000,
    // Clamped like the clock, and for the same reason: a per-run limit that any caller can raise
    // without bound is not a limit. See MAX_COST_CEILING_USD.
    maxCostUsd: clamp(cost, 0, MAX_COST_CEILING_USD),
    maxPaidPages: Number.isFinite(envPages) && envPages > 0 ? envPages : DEFAULT_LIMITS.maxPaidPages,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function startRun(projectId: string, limits: BudgetLimits, now = Date.now()): BudgetState {
  const state: BudgetState = { projectId, limits, startedAt: now, paidPages: 0, skipped: [], exceeded: null };
  runs.set(projectId, state);
  return state;
}

export function endRun(projectId: string): SkippedWork[] {
  const skipped = runs.get(projectId)?.skipped ?? [];
  runs.delete(projectId);
  return skipped;
}

export function budgetFor(projectId: string): BudgetState | undefined {
  return runs.get(projectId);
}

/** Where the run stands.
 *
 *  `spendSoFar` is injected rather than imported so this module stays pure and testable — the real
 *  caller passes `spendForRun()` from the usage recorder. */
export function checkBudget(projectId: string, spendSoFar: number, now = Date.now()): BudgetStatus {
  const state = runs.get(projectId);
  if (!state) {
    // No budget registered — an ad-hoc call, or a run started before this shipped. Reporting `ok`
    // is right: an unbudgeted run is not an over-budget one, and refusing work because nobody set
    // a limit would break every path that does not go through the pipeline.
    return {
      ok: true, exceeded: null, elapsedMs: 0, remainingMs: Infinity,
      limitMs: Infinity, limitUsd: Infinity, limitPaidPages: Infinity,
      spentUsd: spendSoFar, remainingUsd: Infinity, paidPages: 0, skipped: [],
    };
  }

  const elapsedMs = now - state.startedAt;
  const exceeded: ExceededReason | null =
    elapsedMs >= state.limits.maxWallClockMs ? 'wall_clock'
    : spendSoFar >= state.limits.maxCostUsd ? 'cost'
    : state.paidPages >= state.limits.maxPaidPages ? 'paid_pages'
    : null;

  // Latch it. A run that dips back under the line — the clock cannot, but a cost estimate revised
  // downward could — must not resume starting new work; the wind-down has already begun and
  // half-finishing a phase twice is worse than skipping it once.
  if (exceeded && !state.exceeded) state.exceeded = exceeded;

  return {
    ok: state.exceeded === null,
    exceeded: state.exceeded,
    elapsedMs,
    remainingMs: Math.max(0, state.limits.maxWallClockMs - elapsedMs),
    limitMs: state.limits.maxWallClockMs,
    limitUsd: state.limits.maxCostUsd,
    limitPaidPages: state.limits.maxPaidPages,
    spentUsd: spendSoFar,
    remainingUsd: Math.max(0, state.limits.maxCostUsd - spendSoFar),
    paidPages: state.paidPages,
    skipped: state.skipped,
  };
}

/** Record work the run did not do, and why. This is what turns a partial result into an honest one. */
export function recordSkipped(projectId: string, step: string, reason: string, now = new Date()): void {
  const state = runs.get(projectId);
  if (!state) return;
  // De-duplicated: a wind-down often trips the same guard several times as each phase checks in,
  // and a skipped list with "adjoiners" in it six times reads like six failures.
  if (state.skipped.some((s) => s.step === step)) return;
  state.skipped.push({ step, reason, at: now.toISOString() });
}

export function notePaidPages(projectId: string, pages: number): void {
  const state = runs.get(projectId);
  if (state) state.paidPages += pages;
}

/** Should this step run? Records the skip when the answer is no.
 *
 *  The phrasing matters: callers ask `mayRun(...)` before starting expensive work, rather than
 *  being interrupted mid-step. Stopping between phases leaves a coherent partial result; stopping
 *  inside one leaves half a chain of title. */
export function mayRun(projectId: string, step: string, spendSoFar: number, now = Date.now()): boolean {
  const status = checkBudget(projectId, spendSoFar, now);
  if (status.ok) return true;
  recordSkipped(projectId, step, reasonText(status.exceeded!, status), new Date(now));
  return false;
}

/** Why the run wound down, naming the LIMIT and what was actually reached.
 *
 *  ── THE 149-MINUTE LIMIT THAT DID NOT EXIST ────────────────────────────────────────────────────
 *
 *  This read `${Math.round(status.elapsedMs / 60_000)}-minute time limit` — the ELAPSED time,
 *  presented as the limit. On 2026-09-03 the owner's screen said "Finished early because the run
 *  reached its 149-minute time limit" beside another line saying "its 25-minute time limit", for a
 *  run whose limit was 25 minutes and whose duration was 163. Two different numbers, neither of
 *  them the limit, on one screen.
 *
 *  The message could not name the limit because `BudgetStatus` was never given it. It carries
 *  `limitMs`, `limitUsd` and `limitPaidPages` now, and each sentence states the ceiling AND the
 *  figure that crossed it — a wind-down message whose only number is the one you already knew is
 *  no use for deciding whether to raise the ceiling or fix the run. */
export function reasonText(reason: ExceededReason, status: BudgetStatus): string {
  switch (reason) {
    case 'wall_clock': {
      const limit = Math.round(status.limitMs / 60_000);
      const took = Math.round(status.elapsedMs / 60_000);
      return `the run hit its ${limit}-minute time limit (${took} minutes elapsed)`;
    }
    case 'cost':
      return `the run hit its $${status.limitUsd.toFixed(2)} spending limit ` +
             `($${status.spentUsd.toFixed(2)} spent)`;
    case 'paid_pages':
      return `the run hit its ${status.limitPaidPages}-page paid-document limit ` +
             `(${status.paidPages} pages bought)`;
  }
}

/** The sentence that goes on the finished run. Says what was done, what was not, and what to do
 *  about it — because "partial" on its own is not actionable. */
export function windDownSummary(status: BudgetStatus): string | null {
  if (!status.exceeded) return null;
  const skipped = status.skipped.map((s) => s.step).join(', ');
  const because = reasonText(status.exceeded, status);
  return skipped
    ? `Finished early because ${because}. Not attempted: ${skipped}. Re-run with a higher limit to continue.`
    : `Finished early because ${because}.`;
}
