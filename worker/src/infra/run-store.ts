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

type Db = {
  from: (t: string) => {
    insert: (r: unknown) => Promise<{ error: { message: string } | null }>;
    update: (r: unknown) => {
      eq: (c: string, v: unknown) => {
        eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }>;
        lt: (c: string, v: unknown) => Promise<{ error: { message: string } | null; count?: number | null }>;
      };
    };
    select: (c: string, o?: unknown) => {
      eq: (c: string, v: unknown) => {
        lt: (c: string, v: unknown) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
        order: (c: string, o: unknown) => { limit: (n: number) => Promise<{ data: Array<Record<string, unknown>> | null }> };
      };
    };
  };
};

async function db(): Promise<Db | null> {
  const supabase = await getSupabase();
  return supabase ? (supabase as unknown as Db) : null;
}

function warn(what: string, err: unknown): void {
  console.error(`[run-store] ${what} — ${err instanceof Error ? err.message : String(err)}`);
}

/** Record that a run has started. */
export async function recordRunStart(input: RunStartInput): Promise<void> {
  try {
    const client = await db();
    if (!client) return;
    const { error } = await client.from('research_runs').insert({
      research_project_id: input.projectId,
      status: 'running',
      county: input.county ?? null,
      address: input.address ?? null,
      phase: 'starting',
      limits: input.limits ?? {},
      worker_build: input.workerBuild ?? process.env.BUILD_SHA ?? 'unknown',
    });
    if (error) warn(`start ${input.projectId}`, error);
  } catch (err) { warn(`start ${input.projectId}`, err); }
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
): Promise<void> {
  try {
    const client = await db();
    if (!client) return;
    const { error } = await client.from('research_runs')
      .update({
        phase,
        message: message?.slice(0, 500) ?? null,
        heartbeat_at: new Date().toISOString(),
        cost_usd: Number(costUsd.toFixed(6)),
        paid_pages: paidPages,
        updated_at: new Date().toISOString(),
      })
      .eq('research_project_id', projectId)
      .eq('status', 'running');
    if (error) warn(`phase ${projectId}`, error);
  } catch (err) { warn(`phase ${projectId}`, err); }
}

/** Close the run out. */
export async function recordRunFinish(input: RunFinishInput): Promise<void> {
  try {
    const client = await db();
    if (!client) return;
    const { error } = await client.from('research_runs')
      .update({
        status: input.status,
        finished_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        ...(input.costUsd !== undefined ? { cost_usd: Number(input.costUsd.toFixed(6)) } : {}),
        ...(input.paidPages !== undefined ? { paid_pages: input.paidPages } : {}),
        ...(input.skippedWork ? { skipped_work: input.skippedWork } : {}),
        ...(input.budgetSummary !== undefined ? { budget_summary: input.budgetSummary } : {}),
        ...(input.failureReason !== undefined ? { failure_reason: input.failureReason } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('research_project_id', projectId(input))
      .eq('status', 'running');
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
