// worker/src/infra/run-store.ts — the run outlives the process (research plan R3).
//
// ── WHAT WAS LOST ───────────────────────────────────────────────────────────────────────────────
//
// `activePipelines`, `completedResults` and `completedLogs` are in-process `Map`s. A 25-minute run
// on a box that restarts, OOMs, or gets a deploy loses every trace of itself — including the fact
// that it had already bought documents. The app polls for status, gets nothing, and shows a run
// that was two thirds finished as though it had never been started.
//
// The documents and extracted data are safe; they go to Supabase as they are produced. What
// vanishes is the RUN: its phase, its clock, its spend, and whether it ended. That is exactly what
// somebody needs to answer "what happened to my research?".
//
// ── WHAT THIS PROMISES, AND WHAT IT DOES NOT ────────────────────────────────────────────────────
//
// It does **not** resume a half-finished pipeline. The pipeline has no checkpoints to resume from,
// and pretending otherwise would mean re-running phases whose side effects (purchases) are not
// idempotent. Moving the primary path onto the existing BullMQ queue is the real answer and a
// larger change.
//
// It promises the smaller, more urgent thing: an interrupted run is **visible as interrupted**,
// with the phase it reached, the time it burned and the money it spent, so a person can decide
// whether to re-run — instead of being told nothing at all.
//
// ── EVERY WRITE IS FIRE-AND-FORGET ──────────────────────────────────────────────────────────────
//
// A run must never fail because its bookkeeping row would not save. Failures are logged loudly, for
// the same reason as in `infra/usage.ts`: silence is how a table ends up empty while everybody
// assumes the feature works.

import { getSupabase } from '../services/pipeline.js';
import type { BudgetLimits, SkippedWork } from './run-budget.js';

export type RunStatus = 'running' | 'complete' | 'failed' | 'interrupted' | 'cancelled';

/** What ended a run, as distinct from whether its result is usable. */
export type RunStopReason = 'finished' | 'budget_reached' | 'cancelled_by_user' | 'worker_stopped' | 'error';

export interface RunStartInput {
  projectId: string;
  county?: string;
  address?: string;
  /** The run budget, as BudgetLimits — not `Record<string, unknown>`.
   *
   *  It WAS that, and index.ts wrote it through `budgetLimits as unknown as Record<string, unknown>`
   *  — a double cast that erases the type on purpose. So nothing noticed that the worker persists
   *  `{ maxWallClockMs, maxCostUsd, maxPaidPages }` while the app reads `maxMinutes` and `maxUsd`,
   *  keys nothing has ever written.
   *
   *  The visible consequence was a run console that said **"no time limit is configured for this
   *  run"** on every run ever displayed, while the limit was configured AND being enforced — the
   *  worker winds a run down when it reaches it. Second instance of this exact defect in this file:
   *  `skippedWork` was `unknown[]` and rendered every skipped step as "unnamed work". */
  limits?: BudgetLimits;
  workerBuild?: string;
  /** Why this run exists. See the seed 623 comment on `research_runs.trigger`. */
  trigger?: RunTrigger;
  /** The knobs this run was given, recorded per RUN and not only per project.
   *
   *  The whole point of an editable re-run is that run 2 may be configured differently from run 1 —
   *  paid documents off, a tighter clock. Without this, a thinner report from run 2 is
   *  indistinguishable from a property that simply had less to find. */
  settings?: Record<string, unknown>;
  /** The starting information: address, county, parcel, owner, operator notes, attached filenames. */
  inputs?: Record<string, unknown>;
  /** The run this one replaces, when it is a re-run. */
  supersedesRunId?: string | null;
}

export type RunTrigger = 'initial' | 'rerun_same' | 'rerun_edited' | 'resumed_after_interrupt';

/** What `recordRunStart` gives back, so everything downstream can name the run it belongs to. */
export interface StartedRun {
  runId: string;
  runNumber: number;
}

export interface RunFinishInput {
  projectId: string;
  status: Exclude<RunStatus, 'running'>;
  costUsd?: number;
  paidPages?: number;
  /** The worker's own SkippedWork, not `unknown[]`.
   *
   *  It WAS `unknown[]`, and that is the entire reason the app side spent its life reading
   *  `s.what` — a key nothing has ever written — while the worker wrote `s.step`. Every skipped
   *  item rendered as "unnamed work" beside a perfectly real reason, so the render looked like it
   *  was working. `unknown[]` accepts any shape by definition, so tsc could not object, and both
   *  sides had their own passing tests.
   *
   *  Typed now, so the producer and the consumer are bound together by the compiler rather than by
   *  someone remembering. */
  skippedWork?: SkippedWork[];
  budgetSummary?: string | null;
  failureReason?: string | null;
  /** The run to close. Without it the update falls back to "the running row for this project",
   *  which is ambiguous the moment a re-run overlaps its predecessor. */
  runId?: string | null;
  /** Where the bar had got to. A run that stopped at 68% should say 68%, not 0 or 100. */
  progressPercent?: number;
  /** What ended it. See the seed 623 comment on `research_runs.stop_reason` — this is the
   *  distinction that stops a budget wind-down being reported as a user cancellation. */
  stopReason?: RunStopReason;
}

/** How stale a `running` heartbeat must be before a new process calls it interrupted.
 *
 *  Ten minutes. Long enough that a genuinely slow phase — a county portal taking four minutes to
 *  answer, a 60-page plat set being read — is never mistaken for a dead process; short enough that
 *  somebody asking "did my research survive the deploy?" gets an answer in the same sitting.
 *
 *  This only matters at BOOT. A running process heartbeats at every phase boundary, so a live run
 *  never approaches this window. */
export const STALE_HEARTBEAT_MS = 10 * 60_000;

// ── WHY THIS TYPE IS HAND-WRITTEN AND WHY IT KEEPS GROWING ─────────────────────────────────────
//
// It exists so the file does not reach for `any` on every call, and it is written as the shape this
// module actually uses rather than as the whole PostgREST builder. The cost is that adding a call
// means adding a link to the chain — which is the point: a new query has to be declared before it
// can be made, so nobody quietly adds an un-awaited builder that returns a promise nobody checks.
type Filter<T> = Promise<T> & {
  eq: (c: string, v: unknown) => Filter<T>;
  lt: (c: string, v: unknown) => Filter<T>;
  is: (c: string, v: unknown) => Filter<T>;
  order: (c: string, o: unknown) => Filter<T>;
  limit: (n: number) => Filter<T>;
  maybeSingle: () => Promise<T>;
  single: () => Promise<T>;
};

type Rows = { data: Array<Record<string, unknown>> | null; error: { message: string } | null };
type Row = { data: Record<string, unknown> | null; error: { message: string } | null };

type Db = {
  from: (t: string) => {
    insert: (r: unknown) => Promise<{ error: { message: string } | null }> & {
      select: (c: string) => Filter<Row>;
    };
    update: (r: unknown) => Filter<Rows>;
    select: (c: string, o?: unknown) => Filter<Rows>;
  };
};

async function db(): Promise<Db | null> {
  const supabase = await getSupabase();
  return supabase ? (supabase as unknown as Db) : null;
}

function warn(what: string, err: unknown): void {
  console.error(`[run-store] ${what} — ${err instanceof Error ? err.message : String(err)}`);
}

/** Record that a run has started, and say which run it is.
 *
 *  ── WHY THIS NOW RETURNS SOMETHING ───────────────────────────────────────────────────────────
 *
 *  It was fire-and-forget and returned `void`, and that is the reason the report card in the app
 *  carries this disclaimer:
 *
 *      "Which run produced which fact — nothing tags a document or fact with its run, so the
 *       counts above are for the whole project, not this run alone."
 *
 *  It could not tag anything, because nothing downstream of this call knew the run's id. Every
 *  document written during a run went in unattributed, so a re-run's output was indistinguishable
 *  from the previous run's and "17 new documents" was reported for documents that already existed.
 *
 *  The write stays fire-and-forget in spirit — a failure here logs and returns `null`, and the run
 *  goes on without attribution rather than dying over bookkeeping — but the caller now gets the id
 *  when there is one. */
export async function recordRunStart(input: RunStartInput): Promise<StartedRun | null> {
  try {
    const client = await db();
    if (!client) return null;

    // The ordinal. Read-then-write rather than a sequence, because it is per project and the unique
    // index from seed 623 is what actually enforces it — a lost race fails the insert rather than
    // silently producing two run 3s.
    const { data: prior } = await client
      .from('research_runs')
      .select('run_number')
      .eq('research_project_id', input.projectId)
      .order('run_number', { ascending: false })
      .limit(1);
    const highest = Number((prior?.[0]?.run_number as number | undefined) ?? 0);
    const runNumber = Number.isFinite(highest) ? highest + 1 : 1;

    const { data, error } = await client.from('research_runs').insert({
      research_project_id: input.projectId,
      status: 'running',
      county: input.county ?? null,
      address: input.address ?? null,
      phase: 'starting',
      limits: input.limits ?? {},
      run_number: runNumber,
      trigger: input.trigger ?? (runNumber === 1 ? 'initial' : 'rerun_same'),
      settings: input.settings ?? {},
      inputs: input.inputs ?? {},
      supersedes_run_id: input.supersedesRunId ?? null,
      worker_build: input.workerBuild ?? process.env.BUILD_SHA ?? 'unknown',
    }).select('id, run_number').single();

    if (error || !data) { warn(`start ${input.projectId}`, error ?? 'no row returned'); return null; }
    return { runId: String(data.id), runNumber: Number(data.run_number ?? runNumber) };
  } catch (err) { warn(`start ${input.projectId}`, err); return null; }
}

/** Mark every run still open for a project as ended, before a new one begins.
 *
 *  A re-run must never leave the previous run's row saying `running`, because that row is what the
 *  app consults to decide whether a poll that found nothing means "still working" or "over". A
 *  stale `running` row makes an ended run look live forever; the absence of this call is why an
 *  interrupted run could be reported both ways on the same screen. */
export async function closeOpenRuns(
  projectId: string,
  status: Exclude<RunStatus, 'running' | 'complete'> = 'interrupted',
  reason = 'A new run was started for this project before this one finished.',
): Promise<void> {
  try {
    const client = await db();
    if (!client) return;
    const { error } = await client.from('research_runs')
      .update({
        status,
        finished_at: new Date().toISOString(),
        failure_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('research_project_id', projectId)
      .eq('status', 'running');
    if (error) warn(`close-open ${projectId}`, error);
  } catch (err) { warn(`close-open ${projectId}`, err); }
}

/** Heartbeat + phase, called at every phase boundary.
 *
 *  Carries the spend with it so an interrupted run's cost is known to within one phase rather than
 *  being reconstructed from the usage table afterwards. */
export async function recordRunPhase(
  projectId: string,
  phase: string,
  message: string | null,
  costUsd: number,
  paidPages = 0,
  /** The run this phase belongs to. When given, the update targets THAT run.
   *
   *  Without it the update matched `research_project_id` + `status = 'running'`, which is correct
   *  only while a project can have exactly one live run. It survives a re-run started before the
   *  previous run's row was closed by writing the new run's phase onto the old row — and the old
   *  row is what the status fallback reads. Keyed by id, that cannot happen. */
  runId?: string | null,
  /** 0–99 while running. Persisted so a poll that misses the worker can still draw the bar. */
  percent?: number,
): Promise<void> {
  try {
    const client = await db();
    if (!client) return;
    const patch = {
      phase,
      message: message?.slice(0, 500) ?? null,
      heartbeat_at: new Date().toISOString(),
      cost_usd: Number(costUsd.toFixed(6)),
      paid_pages: paidPages,
      ...(percent !== undefined ? { progress_percent: Math.round(percent) } : {}),
      updated_at: new Date().toISOString(),
    };
    const q = client.from('research_runs').update(patch);
    const { error } = runId
      ? await q.eq('id', runId)
      : await q.eq('research_project_id', projectId).eq('status', 'running');
    if (error) warn(`phase ${projectId}`, error);
  } catch (err) { warn(`phase ${projectId}`, err); }
}

/** Close the run out. */
export async function recordRunFinish(input: RunFinishInput): Promise<void> {
  try {
    const client = await db();
    if (!client) return;
    const q = client.from('research_runs')
      .update({
        status: input.status,
        finished_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        ...(input.costUsd !== undefined ? { cost_usd: Number(input.costUsd.toFixed(6)) } : {}),
        ...(input.paidPages !== undefined ? { paid_pages: input.paidPages } : {}),
        ...(input.skippedWork ? { skipped_work: input.skippedWork } : {}),
        ...(input.budgetSummary !== undefined ? { budget_summary: input.budgetSummary } : {}),
        ...(input.failureReason !== undefined ? { failure_reason: input.failureReason } : {}),
        ...(input.progressPercent !== undefined ? { progress_percent: Math.round(input.progressPercent) } : {}),
        ...(input.stopReason !== undefined ? { stop_reason: input.stopReason } : {}),
        updated_at: new Date().toISOString(),
      });
    const { error } = input.runId
      ? await q.eq('id', input.runId)
      : await q.eq('research_project_id', projectId(input)).eq('status', 'running');
    if (error) warn(`finish ${input.projectId}`, error);
  } catch (err) { warn(`finish ${input.projectId}`, err); }
}

function projectId(i: RunFinishInput): string { return i.projectId; }

export interface RecoveredRun {
  projectId: string;
  phase: string | null;
  costUsd: number;
  startedAt: string;
  workerBuild: string | null;
}

/** At boot: any run still marked `running` belonged to a process that no longer exists.
 *
 *  Marked `interrupted`, NOT `failed`. The research did not fail — the process holding it stopped,
 *  and it is usually a deploy. Somebody scanning a list of failures should not have to work out
 *  which ones were actually releases.
 *
 *  Returns what was recovered so the boot log can say it out loud: a deploy that silently orphaned
 *  three runs mid-flight is worth one line. */
export async function recoverInterruptedRuns(now = Date.now()): Promise<RecoveredRun[]> {
  try {
    const client = await db();
    if (!client) return [];
    const cutoff = new Date(now - STALE_HEARTBEAT_MS).toISOString();

    const { data, error } = await client.from('research_runs')
      .select('research_project_id, phase, cost_usd, started_at, worker_build')
      .eq('status', 'running')
      .lt('heartbeat_at', cutoff);
    if (error) { warn('recover (read)', error); return []; }
    const rows = data ?? [];
    if (rows.length === 0) return [];

    const { error: updErr } = await client.from('research_runs')
      .update({
        status: 'interrupted',
        finished_at: new Date(now).toISOString(),
        failure_reason: 'The worker process stopped while this run was in progress (restart or deploy).',
        updated_at: new Date(now).toISOString(),
      })
      .eq('status', 'running')
      .lt('heartbeat_at', cutoff);
    if (updErr) warn('recover (update)', updErr);

    return rows.map((r) => ({
      projectId: String(r.research_project_id),
      phase: (r.phase as string) ?? null,
      costUsd: Number(r.cost_usd ?? 0),
      startedAt: String(r.started_at),
      workerBuild: (r.worker_build as string) ?? null,
    }));
  } catch (err) {
    warn('recover', err);
    return [];
  }
}

/** One line for the boot log, so an orphaned run is never silent. */
export function describeRecovery(runs: RecoveredRun[]): string {
  if (runs.length === 0) return 'no interrupted runs to recover';
  const spend = runs.reduce((n, r) => n + r.costUsd, 0);
  const phases = runs.map((r) => r.phase ?? 'unknown').join(', ');
  return `${runs.length} run(s) were interrupted by a restart — $${spend.toFixed(4)} already spent, ` +
    `last phase(s): ${phases}. They are marked interrupted, not failed.`;
}
