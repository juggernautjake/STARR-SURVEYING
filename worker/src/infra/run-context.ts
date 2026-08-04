// worker/src/infra/run-context.ts — which run is this code running for?
//
// ── WHY THIS EXISTS (plan R4b) ──────────────────────────────────────────────────────────────────
//
// R5's budget ceiling reads `spendForRun(projectId)`, which sums only what `recordUsage` wrote with
// that id. Twelve AI call sites still do not report, and the measured blocker is not effort — it is
// that **none of them has `projectId` in scope**. Seventeen call sites across nine files would each
// need it threaded from a caller, sometimes several hops up, through functions that have no other
// reason to know about a run.
//
// ── WHY NOT A MODULE-LEVEL "CURRENT RUN" ────────────────────────────────────────────────────────
//
// That is the obvious cheap version and it is **wrong here**. `currentRunningRuns()` returns a LIST
// and the job queue runs `concurrency: 3`, so a single mutable global would file one run's spend
// against another whenever two runs overlap — which is the normal case, not the edge case. A ceiling
// that charges the wrong run is worse than one that under-counts: it looks correct, it stops the
// wrong job, and the numbers reconcile to nothing.
//
// `AsyncLocalStorage` is the tool built for exactly this. Each `runPipeline` call gets its own store,
// and every `await` inside it — however deep — sees that store and no other.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────────
//
// **It never guesses.** `currentProjectId()` returns `null` outside a run, and callers must handle
// that rather than falling back to "some run". Code runs outside a pipeline all the time —
// `receipt-extraction.ts` processes queued receipts from a CLI batch and has no run at all — and
// attributing that to whichever run happened to be open would be a silent misattribution, the exact
// failure this module was written to avoid.

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RunContext {
  /** The `research_projects` row this work belongs to. */
  projectId: string;
}

const storage = new AsyncLocalStorage<RunContext>();

/**
 * Run `fn` with `projectId` as the ambient run for everything it awaits.
 *
 * Nesting is allowed and the innermost wins, which is the correct behaviour for a sub-run: work
 * started inside another run belongs to the one that started it.
 */
export function withRunContext<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ projectId }, fn);
}

/** The run this code is executing for, or `null` when there is none. Never a guess. */
export function currentProjectId(): string | null {
  return storage.getStore()?.projectId ?? null;
}

// `hasRunContext()` was exported here alongside `currentProjectId`, justified as letting a call site
// "say this was not attributable out loud". Two slices later nothing had called it: every consumer
// checks `currentProjectId() === null`, which answers the same question and yields the id in the same
// breath.
//
// Deleted rather than left. It is a small thing, but it is authored-but-not-wired inside the module
// written to fix authored-but-not-wired, and an exported helper with no caller is exactly what
// `research-modules-are-reachable` exists to catch. A convenience nobody reached for is not
// convenient.
