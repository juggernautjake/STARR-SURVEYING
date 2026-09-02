// lib/research/run-state.ts — ONE answer to "what is this run doing", for every element on the
// screen (plan D1).
//
// ── FOUR COMPONENTS, FOUR ENDPOINTS, FOUR OPINIONS, ONE RUN ─────────────────────────────────────
//
// Captured verbatim from the Research & Analysis screen on 2026-09-01. Every line below is
// describing the SAME run at the SAME moment:
//
//   Stage panel      "AI analysis is running — live progress is shown below."
//   Run console bar  "Finished in 2 minutes for $0.02.  ·  2 / 25 min (9%)"
//   Run panel        "✕ Research Failed · 00:00 elapsed · Compiling Resources · 13%"
//   Failure text     "Bell County research failed: Pipeline cancelled by user"
//   Documents tile   17
//
// Running, finished, and failed — plus a cancellation nobody performed, an elapsed clock reading
// zero beside a console reading two minutes, and 13% beside 9%. Every one of those numbers was
// computed by a different component from a different source, and no two of them could ever have
// been made to agree, because agreement was never anybody's job.
//
// The consequence is not cosmetic. The complaint that started this work is an operator re-running
// research that was already working, because the screen told them it had failed.
//
// ── SO: ONE MODEL, DERIVED ONCE, RENDERED MANY TIMES ────────────────────────────────────────────
//
// This module is pure. It takes the two payloads the app can fetch — the pipeline poll and the run
// console — and returns the single object every element renders from. No component computes its own
// status, percentage, elapsed time or headline ever again; if two parts of the screen disagree
// after this, they are disagreeing about a value that came out of one function, which is a bug with
// one place to fix rather than four places to reconcile.
//
// The three rules it enforces, each of which was violated by the screen above:
//
//   1. A PAYLOAD ABOUT ANOTHER RUN IS NOT AN ANSWER ABOUT THIS ONE.  (`isPayloadForRun`)
//   2. THE SERVER'S PERCENTAGE WINS OVER ANY CLIENT INFERENCE.       (`resolvePercent`)
//   3. STOPPING IS NOT FAILING.                                       (`resolveOutcome`)

export type RunLifecycle =
  /** Nothing has run, or nothing is known yet. */
  | 'idle'
  /** Work is happening. The bar moves, the clock ticks, cancel is offered. */
  | 'active'
  /** Stopped, with a usable result. Includes a run that stopped on its own budget ceiling. */
  | 'succeeded'
  /** Stopped because a person asked it to. Not a failure and never rendered as one. */
  | 'cancelled'
  /** The process holding it went away — nearly always a deploy. Not a failure either. */
  | 'interrupted'
  /** Genuinely broke. The only lifecycle that may render as a failure. */
  | 'failed';

/**
 * Every status string either side of the wire can produce, mapped to a lifecycle.
 *
 * Listed exhaustively and deliberately. `isDoneStatus` in `pipeline-log.ts` was a denylist in one
 * component and an allowlist in another, and they agreed only by coincidence; the fix there was to
 * name both sets in one place, and this is the same fix carried up to the level that matters.
 *
 * `budget_stopped` deserves its own note. The worker reports a run that reached its own cost or time
 * ceiling as `complete` — because it IS complete, it did the work it could afford — and the older
 * worker reported it as `failed` with the reason "Pipeline cancelled by user". That single mismatch
 * produced two of the four contradictory lines quoted at the top of this file.
 */
const LIFECYCLE_BY_STATUS: Record<string, RunLifecycle> = {
  // Active
  running: 'active',
  starting: 'active',
  queued: 'active',
  retrying: 'active',
  // Stopped with a result
  complete: 'succeeded',
  success: 'succeeded',
  partial: 'succeeded',
  budget_stopped: 'succeeded',
  // Stopped for a reason that is not a fault
  cancelled: 'cancelled',
  canceled: 'cancelled',
  interrupted: 'interrupted',
  // Stopped badly
  failed: 'failed',
  error: 'failed',
};

/**
 * The lifecycle a status string means.
 *
 * An UNRECOGNISED status is `active`, not `failed`. That direction is chosen on purpose: the cost of
 * treating a stopped run as active is a poll that keeps asking, and the cost of treating an active
 * run as stopped is the bug this whole module exists to kill — the panel latches a terminal state,
 * stops polling permanently, and shows "Research Failed" over a run that goes on to retrieve
 * seventeen documents.
 */
export function lifecycleOf(status: string | null | undefined): RunLifecycle {
  if (!status) return 'idle';
  return LIFECYCLE_BY_STATUS[status.toLowerCase()] ?? 'active';
}

/** Is the run still working? */
export function isActive(lifecycle: RunLifecycle): boolean {
  return lifecycle === 'active';
}

/** Has the run stopped, whatever the outcome? `idle` is not stopped — it never started. */
export function isStopped(lifecycle: RunLifecycle): boolean {
  return lifecycle !== 'idle' && lifecycle !== 'active';
}

// ── Rule 1: a payload about another run is not an answer about this one ─────────────────────────

/**
 * May this status payload be applied to the run we are watching?
 *
 * ── THE RACE THIS CLOSES ──────────────────────────────────────────────────────────────────────
 *
 * On a re-run, the previous run's terminal result sits in the worker's `completedResults` map until
 * the new run registers. Every poll in that window answered with run 1's outcome. The panel set its
 * state from whatever arrived and then called `stopPolling()` — permanently — on a terminal status.
 * So by the time run 2 existed, nothing was still asking.
 *
 * The worker was fixed to prefer a live pipeline over any cached result, which shrinks the window.
 * It does not close it: the worker can restart mid-re-run, an older worker may still be deployed,
 * and the app's own database fallback reads "the latest run" which is run 1 until run 2's row is
 * written. A window that is small is still a window, and this one latches a permanent wrong answer.
 *
 * So the client refuses the answer instead of racing it. Once we know the id of the run we started,
 * a payload naming a DIFFERENT run is not stale data to be merged carefully — it is an answer to a
 * question nobody asked, and it is dropped whole.
 *
 * `expectedRunId == null` accepts everything: before the POST returns we do not yet know which run
 * is ours, and refusing everything would leave the screen blank. A payload with NO run id is also
 * accepted — an older worker cannot tell us, and rejecting it would black out the screen against a
 * worker that has simply not been redeployed yet.
 */
export function isPayloadForRun(
  payloadRunId: string | null | undefined,
  expectedRunId: string | null | undefined,
): boolean {
  if (!expectedRunId) return true;
  if (!payloadRunId) return true;
  return payloadRunId === expectedRunId;
}

// ── Rule 2: the server's percentage wins ────────────────────────────────────────────────────────

/**
 * How far along the run is, 0–100.
 *
 * ── WHAT THE OLD NUMBER MEASURED ──────────────────────────────────────────────────────────────
 *
 * `run-progress.ts` ran regexes over the worker's free-text status message, matched one of eight
 * labels, and turned that label's INDEX IN THE LIST into a percentage. It could not move within a
 * phase, it had never heard of the phase names a Bell County run actually emits (`GIS`, `Clerk`,
 * `Plats`, `Deed Analysis`, `FEMA`…), and it walked BACKWARDS whenever a late enrichment pass
 * re-entered an earlier stage. "13%" in the screen capture above is that number: a Bell run sitting
 * at the default rung because not one of its phase names contains the word "stage".
 *
 * The worker now computes the real thing — a weighted, monotonic ladder in
 * `worker/src/research/run-phases.ts`, where document retrieval is 30% of the bar because it is
 * roughly 30% of a run — and persists it to `research_runs.progress_percent` at every phase
 * boundary, so even a poll that cannot reach the worker gets a truthful number.
 *
 * The inference stays ONLY as a fallback for a worker that has not been redeployed yet. It is not a
 * second opinion to be blended with the server's answer; whenever the server has one, the client's
 * guess is not consulted at all.
 */
export function resolvePercent(
  serverPercent: number | null | undefined,
  inferredPercent: number | null | undefined,
  lifecycle: RunLifecycle,
): number {
  // A finished run is finished, whatever the last number in flight said. Without this a run whose
  // final poll arrived before the tracker's `finish()` renders as "complete · 96%".
  if (lifecycle === 'succeeded') return 100;

  const server = typeof serverPercent === 'number' && Number.isFinite(serverPercent)
    ? serverPercent
    : null;
  if (server !== null) return clampPercent(server, lifecycle);

  const inferred = typeof inferredPercent === 'number' && Number.isFinite(inferredPercent)
    ? inferredPercent
    : 0;
  return clampPercent(inferred, lifecycle);
}

/**
 * 0–100, and 100 ONLY for a run that succeeded.
 *
 * A bar that reads 100 while work continues is the same lie as one that reads "failed" while work
 * continues, and this module exists because of that class of lie. A stopped-but-not-succeeded run
 * keeps the number it actually reached — "it died at 68%" tells an operator roughly what they still
 * hold, and rounding that to 0 or 100 throws the information away.
 */
function clampPercent(value: number, lifecycle: RunLifecycle): number {
  const rounded = Math.round(value);
  if (rounded < 0) return 0;
  if (lifecycle === 'succeeded') return 100;
  return Math.min(99, rounded);
}

// ── Rule 3: stopping is not failing ─────────────────────────────────────────────────────────────

/** Why a run stopped. Mirrors `research_runs.stop_reason` (seed 623). */
export type StopReason =
  | 'finished'
  | 'budget_reached'
  | 'cancelled_by_user'
  | 'worker_stopped'
  | 'error'
  | null;

export interface OutcomeInput {
  lifecycle: RunLifecycle;
  stopReason?: StopReason | string | null;
  /** Only ever set for a genuine error. A budget wind-down must never populate this. */
  failureReason?: string | null;
  /** The worker's sentence about a run that stopped on its ceiling. */
  budgetSummary?: string | null;
  /** For the "stopped at N%" phrasing. */
  percent?: number;
}

export interface Outcome {
  /** The single line at the top of the run header. */
  headline: string;
  /** Longer explanation, when there is one worth showing. */
  detail: string | null;
  /** Render as a problem? False for cancelled, interrupted and budget stops. */
  isProblem: boolean;
  /** The word for the state, for a badge. */
  label: string;
}

/**
 * What to tell the operator about a run that has stopped.
 *
 * ── THE SENTENCE THIS REPLACES ────────────────────────────────────────────────────────────────
 *
 *     "Bell County research failed: Pipeline cancelled by user"
 *
 * Three claims, in a run where all three were false. It had not failed — it reached the $2.00
 * ceiling the operator themselves configured, which is the ceiling working. It was not cancelled.
 * And no user had touched it. The worker had exactly one `AbortController` per run with two callers
 * — the budget guard and the cancel button — and the status endpoint could only see
 * `signal.aborted`, so it reported the one it happened to be written for.
 *
 * The distinction now travels in `stop_reason`, and this is where it becomes English. A budget stop
 * is a SUCCESS with something to say about its shape, and it is never rendered in red.
 */
export function resolveOutcome(input: OutcomeInput): Outcome {
  const { lifecycle, failureReason, budgetSummary, percent } = input;
  const stopReason = input.stopReason ?? null;

  if (lifecycle === 'idle') {
    return { headline: 'No run has started yet.', detail: null, isProblem: false, label: 'Not started' };
  }

  if (lifecycle === 'active') {
    return { headline: 'Research is running.', detail: null, isProblem: false, label: 'Running' };
  }

  if (lifecycle === 'succeeded') {
    if (stopReason === 'budget_reached') {
      return {
        headline: 'Finished early at the ceiling you set.',
        detail:
          budgetSummary ??
          'This run stopped because it reached its configured time or cost ceiling. It is not a ' +
          'failure and nobody cancelled it — the run did the work it could afford and stopped at a ' +
          'boundary. Raise the ceiling and re-run if you want it to go further.',
        isProblem: false,
        label: 'Finished at ceiling',
      };
    }
    return {
      headline: 'Research complete.',
      detail: budgetSummary ?? null,
      isProblem: false,
      label: 'Complete',
    };
  }

  if (lifecycle === 'cancelled') {
    return {
      headline: 'Cancelled.',
      detail:
        `This run was stopped by a person${typeof percent === 'number' ? ` at about ${percent}%` : ''}. ` +
        'Everything it had already retrieved has been kept.',
      isProblem: false,
      label: 'Cancelled',
    };
  }

  if (lifecycle === 'interrupted') {
    return {
      headline: 'The worker stopped while this run was in progress.',
      detail:
        'The research did not fail — the process holding it went away, which is almost always a ' +
        'deploy. Everything retrieved before it stopped has been kept, and re-running picks up ' +
        'from the library rather than starting from nothing.',
      isProblem: false,
      label: 'Interrupted',
    };
  }

  return {
    headline: 'Research failed.',
    detail: failureReason ?? 'No reason was recorded, which is itself worth reporting.',
    isProblem: true,
    label: 'Failed',
  };
}

// ── The merged state ────────────────────────────────────────────────────────────────────────────

/** The pipeline poll's payload, as far as this module cares. */
export interface PollPayload {
  runId?: string | null;
  runNumber?: number | null;
  status?: string | null;
  percent?: number | null;
  phaseId?: string | null;
  phaseLabel?: string | null;
  message?: string | null;
  currentStage?: string | null;
  startedAt?: string | null;
  stopReason?: string | null;
  failureReason?: string | null;
  budgetSummary?: string | null;
  settings?: Record<string, unknown> | null;
  fromDatabase?: boolean;
}

/** The run-console payload, as far as this module cares. */
export interface ConsolePayload {
  status?: string | null;
  phase?: string | null;
  activity?: string | null;
  spend?: {
    totalUsd: number;
    noEventsRecorded: boolean;
    headline: string;
    /**
     * What the money went ON, per event type — B3.
     *
     * `summariseSpend` has computed this since it was written and the state layer dropped it,
     * so the screen could only ever show one number. A single total cannot be CHECKED by the
     * person paying it: $2.14 of model calls and $2.14 of purchased pages are different runs,
     * and only one of them bought anything.
     */
    byType?: Record<string, { count: number; usd: number }>;
  } | null;
  /**
   * The usage READ failed, as opposed to finding nothing.
   *
   * Sits beside `run` on the wire, not inside it, so the hook folds it in here. The route has
   * always sent it; between the four-panel rebuild and 2026-09-02 nothing read it, and a run
   * whose spend query errored displayed a confident total instead of admitting the gap.
   */
  usageFailed?: boolean;
  time?: {
    elapsedMs: number;
    budgetMs: number | null;
    fractionUsed: number | null;
    looksStalled: boolean;
    headline: string;
  } | null;
  skipped?: Array<{ what: string; reason: string }> | null;
  budgetSummary?: string | null;
}

export interface RunState {
  lifecycle: RunLifecycle;
  outcome: Outcome;
  runId: string | null;
  runNumber: number | null;
  percent: number;
  phaseLabel: string | null;
  /** The worker's latest sentence about what it is doing. */
  activity: string | null;
  /** Milliseconds since the run began. Derived from `startedAt`, never from a mount-time clock. */
  elapsedMs: number;
  /** Wall-clock ceiling, when one was configured. */
  budgetMs: number | null;
  spendUsd: number | null;
  /** What the spend was made of, per event type. Empty when nothing has been recorded. */
  spendByType: Array<{ type: string; count: number; usd: number }>;
  /** True when no usage event exists at all — NOT the same as $0.00 spent. */
  spendUnrecorded: boolean;
  /**
   * The spend figure is known to be short — the usage read errored. Distinct again from
   * `spendUnrecorded`: that one means "nothing was written", this one means "we could not look".
   * Both must outrank a confident number.
   */
  spendIncomplete: boolean;
  /**
   * Why this run could not buy documents, when it could not. Null when buying was possible.
   *
   * The `analyze` route has computed this all along; its only reader was the panel the rebuild
   * retired, so the answer to "why did TexasFile return nothing?" stopped reaching the screen.
   */
  paidDocumentsNotice: string | null;
  skipped: Array<{ what: string; reason: string }>;
  /** A `running` row nobody has heard from for ten minutes. */
  looksStalled: boolean;
  canCancel: boolean;
  settings: Record<string, unknown> | null;
}

export interface BuildRunStateInput {
  poll: PollPayload | null;
  console: ConsolePayload | null;
  /** The percentage the legacy client-side inference produced, for a worker that predates `percent`. */
  inferredPercent?: number | null;
  /** From the analyze status route, which is the only place it is computed. */
  paidDocumentsNotice?: string | null;
  now?: number;
}

/**
 * The one object the screen renders from.
 *
 * ── WHY THE POLL OUTRANKS THE CONSOLE ─────────────────────────────────────────────────────────
 *
 * They read different things and one of them is live. The poll reaches the worker process that is
 * doing the work; the console reads a `research_runs` row that the worker heartbeats at phase
 * boundaries, which can be a minute behind and — crucially — is the LATEST row for the project,
 * which during a re-run is still run 1 until run 2's row is written.
 *
 * That is exactly the pairing that put "Finished in 2 minutes for $0.02" (console, run 1) beside a
 * live run 2. So status, percentage and phase come from the poll whenever it has them, and the
 * console contributes what only it knows: spend, the ceiling, and the work a budget dropped.
 */
/**
 * The run length the operator chose, in milliseconds, from the run's own settings.
 *
 * Bounded by the same 15/60 the dialog enforces, because a settings blob is data off the wire and a
 * ceiling of 9,000 minutes would render as a progress bar that never moves. A value outside the
 * range is treated as absent rather than clamped into a number nobody chose — showing "of 60
 * minutes" for a run configured at 600 would be a confident lie, and no line at all is honest.
 */
export function chosenBudgetMs(settings: Record<string, unknown> | null | undefined): number | null {
  const raw = settings?.['maxResearchTimeMinutes'];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw < 15 || raw > 60) return null;
  return raw * 60_000;
}

export function buildRunState(input: BuildRunStateInput): RunState {
  const { poll, console: cons } = input;
  const now = input.now ?? Date.now();

  const lifecycle = poll?.status
    ? lifecycleOf(poll.status)
    : cons?.status
      ? lifecycleOf(cons.status)
      : 'idle';

  const percent = resolvePercent(poll?.percent ?? null, input.inferredPercent ?? null, lifecycle);

  // Elapsed is computed from the run's real start, not from when a component mounted. The panel's
  // clock read "00:00 elapsed" beside a console reading two minutes because it started counting at
  // mount and the run had begun before the operator opened the page.
  const startedMs = poll?.startedAt ? Date.parse(poll.startedAt) : NaN;
  const elapsedMs = Number.isFinite(startedMs)
    ? Math.max(0, now - startedMs)
    : cons?.time?.elapsedMs ?? 0;

  const outcome = resolveOutcome({
    lifecycle,
    stopReason: poll?.stopReason ?? null,
    failureReason: poll?.failureReason ?? null,
    budgetSummary: poll?.budgetSummary ?? cons?.budgetSummary ?? null,
    percent,
  });

  return {
    lifecycle,
    outcome,
    runId: poll?.runId ?? null,
    runNumber: poll?.runNumber ?? null,
    percent,
    phaseLabel: poll?.phaseLabel ?? poll?.currentStage ?? cons?.phase ?? null,
    activity: poll?.message ?? cons?.activity ?? null,
    elapsedMs,
    // D3. The console's budget is authoritative when it exists, but it only exists once the console
    // has been fetched and the run record carries a ceiling. The run's CHOSEN length is known from
    // the moment it starts — it is what the operator picked in the dialog — so it stands in until the
    // console catches up.
    //
    // Without the fallback the "N of M minutes used" line simply does not render, and "24 minutes
    // elapsed" against an invisible ceiling tells a reader nothing about whether to keep waiting.
    budgetMs: cons?.time?.budgetMs ?? chosenBudgetMs(poll?.settings),
    spendUsd: cons?.spend ? cons.spend.totalUsd : null,
    // Sorted by cost, because the first line is the one a reader checks.
    spendByType: Object.entries(cons?.spend?.byType ?? {})
      .map(([type, v]) => ({ type, count: v.count, usd: v.usd }))
      .sort((a, b) => b.usd - a.usd),
    spendUnrecorded: cons?.spend?.noEventsRecorded ?? false,
    spendIncomplete: cons?.usageFailed ?? false,
    paidDocumentsNotice: input.paidDocumentsNotice ?? null,
    skipped: cons?.skipped ?? [],
    looksStalled: cons?.time?.looksStalled ?? false,
    canCancel: lifecycle === 'active',
    settings: poll?.settings ?? null,
  };
}

/** `MM:SS`, or `H:MM:SS` past an hour. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
