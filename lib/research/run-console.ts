// lib/research/run-console.ts — what this run is doing, and what it has spent (plan R22).
//
// ── THE GAP ─────────────────────────────────────────────────────────────────────────────────────
//
// The pieces exist and none of them reach the operator. R4 writes every model call and paid page to
// `research_usage_events`. R5 gives each run a wall-clock ceiling and records what the ceiling made
// it skip. R3 keeps `research_runs` with the phase, heartbeat and spend. The run panel shows a
// progress list and a cancel button — and no cost, no elapsed-versus-budget, and no sight of the
// work a budget quietly dropped.
//
// So an operator watching a 25-minute run cannot answer either of the two questions that matter:
// how much has this cost, and is it going to finish.
//
// ── WHY $0.00 IS THE DANGEROUS NUMBER ───────────────────────────────────────────────────────────
//
// R4 was built because `research_usage_events` had zero rows while everybody assumed spend was being
// tracked. A console that renders "$0.00" cannot distinguish a genuinely free run from a run whose
// usage writer is broken again — and the second one is the reason R4 exists. So "no usage events
// recorded" is a distinct state from "$0.00 spent", and it says which.

export type RunStatus = 'running' | 'complete' | 'failed' | 'interrupted' | 'cancelled';

export interface RunRow {
  id: string;
  status: RunStatus;
  phase: string | null;
  message: string | null;
  started_at: string;
  heartbeat_at: string;
  finished_at: string | null;
  cost_usd: number | string;
  paid_pages: number;
  /**
   * The run budget, as the WORKER writes it.
   *
   * `maxWallClockMs` / `maxCostUsd` / `maxPaidPages` are the field names in
   * `worker/src/infra/run-budget.ts`. This used to read `maxMinutes` and `maxUsd` — keys nothing
   * has ever written — so `budgetMinutes` was permanently `undefined` and every run console said
   * "no time limit is configured for this run" while the limit was configured AND enforced.
   *
   * The old names are kept as tolerated aliases rather than deleted: no row is known to carry
   * them, but removing them is a guess about data this session cannot see, and one `??` is cheap.
   */
  limits: {
    maxWallClockMs?: number;
    maxCostUsd?: number;
    maxPaidPages?: number;
    /** Legacy aliases; nothing is known to write these. See above. */
    maxMinutes?: number;
    maxUsd?: number;
  } | null;
  skipped_work: Array<{ step?: string; what?: string; reason?: string }> | null;
  budget_summary: string | null;
  failure_reason: string | null;
}

export interface UsageRow {
  event_type: string;
  cost_usd: number | string;
  model: string | null;
  created_at: string;
}

export interface SpendBreakdown {
  totalUsd: number;
  byType: Record<string, { count: number; usd: number }>;
  /** No events at all. NOT the same as zero spend — see the header. */
  noEventsRecorded: boolean;
  headline: string;
}

export function summariseSpend(events: UsageRow[]): SpendBreakdown {
  const byType: SpendBreakdown['byType'] = {};
  let total = 0;
  for (const e of events) {
    const usd = Number(e.cost_usd) || 0;
    total += usd;
    const b = byType[e.event_type] ?? (byType[e.event_type] = { count: 0, usd: 0 });
    b.count++;
    b.usd += usd;
  }
  total = Number(total.toFixed(4));

  const noEventsRecorded = events.length === 0;
  const headline = noEventsRecorded
    ? 'No usage events have been recorded for this run. That is not the same as it having cost nothing — it may mean spend is not being tracked.'
    : `$${total.toFixed(2)} spent so far across ${events.length} recorded event(s).`;

  return { totalUsd: total, byType, noEventsRecorded, headline };
}

// ── Time against the ceiling ────────────────────────────────────────────────────────────────────

export interface TimeStatus {
  elapsedMs: number;
  /** Null when no ceiling was configured — rendered as "no limit set", never as a full bar. */
  budgetMs: number | null;
  fractionUsed: number | null;
  /** How long since the worker last said anything. */
  sinceHeartbeatMs: number;
  /** A `running` row whose heartbeat has gone quiet is the R3 signal that its process is gone. */
  looksStalled: boolean;
  headline: string;
}

/** A run is treated as stalled when nothing has been heard for this long. Matches the worker's own
 *  `STALE_HEARTBEAT_MS`, because two different definitions of "stalled" is how a run shows as alive
 *  on one screen and dead on another. */
export const STALE_HEARTBEAT_MS = 10 * 60_000;

export function timeStatus(run: RunRow, now: number): TimeStatus {
  const started = Date.parse(run.started_at);
  const end = run.finished_at ? Date.parse(run.finished_at) : now;
  const elapsedMs = Math.max(0, end - started);

  // The worker persists a wall-clock ceiling in MILLISECONDS (`maxWallClockMs`). Reading
  // `maxMinutes` — which nothing writes — made this permanently undefined, so `budgetMs` was
  // always null, `fractionUsed` always null, and the headline always claimed no limit existed.
  const budgetMs = run.limits?.maxWallClockMs && run.limits.maxWallClockMs > 0
    ? run.limits.maxWallClockMs
    : (run.limits?.maxMinutes && run.limits.maxMinutes > 0 ? run.limits.maxMinutes * 60_000 : null);
  const fractionUsed = budgetMs ? Math.min(elapsedMs / budgetMs, 1) : null;

  const sinceHeartbeatMs = Math.max(0, now - Date.parse(run.heartbeat_at));
  const looksStalled = run.status === 'running' && sinceHeartbeatMs > STALE_HEARTBEAT_MS;

  const mins = (ms: number) => Math.round(ms / 60_000);

  const headline = looksStalled
    ? `Nothing has been heard from this run for ${mins(sinceHeartbeatMs)} minutes. Its process has probably stopped — it will be marked interrupted on the next worker restart.`
    : budgetMs
      ? `${mins(elapsedMs)} of ${mins(budgetMs)} minutes used.`
      : `${mins(elapsedMs)} minutes elapsed — no time limit is configured for this run.`;

  return { elapsedMs, budgetMs, fractionUsed, sinceHeartbeatMs, looksStalled, headline };
}

// ── What it is doing right now ──────────────────────────────────────────────────────────────────

export interface RunConsole {
  status: RunStatus;
  phase: string;
  activity: string;
  spend: SpendBreakdown;
  time: TimeStatus;
  /** Work a ceiling caused the run to drop. Shown because a run that finished "successfully" having
   *  skipped the deed chain is not a run that finished. */
  skipped: Array<{ what: string; reason: string }>;
  budgetSummary: string | null;
  canCancel: boolean;
  headline: string;
}

export function buildConsole(run: RunRow, events: UsageRow[], now: number): RunConsole {
  const spend = summariseSpend(events);
  const time = timeStatus(run, now);

  const skipped = (run.skipped_work ?? []).map((s) => ({
    what: s.step ?? s.what ?? 'unnamed work',
    reason: s.reason ?? 'no reason recorded',
  }));

  const phase = run.phase ?? 'starting';
  const activity = run.message ?? (run.status === 'running' ? 'Working…' : '');

  // The one line. Leads with whatever is most wrong, because on a screen an operator glances at, the
  // headline is the only part reliably read.
  const headline = time.looksStalled
    ? time.headline
    : run.status === 'interrupted'
      ? `This run was interrupted by a restart after spending $${Number(run.cost_usd).toFixed(2)}. It did not fail — the process holding it stopped.`
      : run.status === 'cancelled'
        ? `Cancelled after ${Math.round(time.elapsedMs / 60_000)} minutes and $${Number(run.cost_usd).toFixed(2)}.`
        : run.status === 'failed'
          ? `Failed: ${run.failure_reason ?? 'no reason recorded'}`
          : run.status === 'complete'
            ? skipped.length > 0
              ? `Finished, but ${skipped.length} piece(s) of work were skipped to stay inside the budget — see below before treating this as complete.`
              : `Finished in ${Math.round(time.elapsedMs / 60_000)} minutes for $${spend.totalUsd.toFixed(2)}.`
            : `${phase} — ${time.headline} ${spend.headline}`;

  return {
    status: run.status,
    phase,
    activity,
    spend,
    time,
    skipped,
    budgetSummary: run.budget_summary,
    // Cancelling anything else is a no-op the worker answers with a 404, and offering a button that
    // cannot work is how an operator learns to distrust the console.
    canCancel: run.status === 'running',
    headline,
  };
}
