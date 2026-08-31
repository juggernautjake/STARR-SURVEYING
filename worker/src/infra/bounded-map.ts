// worker/src/infra/bounded-map.ts — do several things at once, but never many.
//
// ── POLITENESS IS THE CONSTRAINT, NOT THE CPU ───────────────────────────────────────────────────
//
// `capacity.ts` caps concurrent RUNS for a reason it states plainly: *"these are small government
// servers, and the fastest way to lose access to a county portal is to look like a load test."*
// That judgement applies inside a run too. Capturing eleven documents one at a time is slow; firing
// eleven at a county clerk simultaneously is a way to stop being able to capture any.
//
// **A run that gets the firm banned from Bell County is not a faster run.** So the limit here is
// small by policy, clamped in code rather than merely defaulted, and cannot be raised past 4 by
// setting an environment variable — a config mistake should cost latency, not access.
//
// ── WHY NOT `Promise.all` ───────────────────────────────────────────────────────────────────────
//
// `Promise.all(docs.map(capture))` is one line and starts every request at once. It is the exact
// thing this file exists to prevent, and it is what somebody writes when the helper is not obvious
// to reach for.
//
// ── ORDER AND ERRORS ARE PRESERVED DELIBERATELY ─────────────────────────────────────────────────
//
// Results come back in INPUT order, not completion order: the callers push documents into a list a
// surveyor reads, and "plats before deeds, oldest first" is meaningful. Completion order would
// silently reshuffle a report by which county page happened to answer first.
//
// And one failure does not fail the batch. The sequential loops this replaces each wrapped their
// capture in `try/catch` and carried on with the other documents, because a document that cannot be
// captured is a gap in a report, not a reason to abandon the other ten. `Promise.all` rejects on the
// first error and abandons the rest — swapping it in without this would turn a one-document problem
// into a no-documents problem.

/** The outcome of one item. `ok: false` carries the error rather than throwing it. */
export type BoundedResult<R> =
  | { ok: true; value: R }
  | { ok: false; error: unknown };

/** The politeness ceiling. Not a suggestion — `mapBounded` clamps to it. */
export const MAX_CONCURRENCY = 4;

/** Used when nothing is configured. Three is the doc's recommendation. */
export const DEFAULT_CONCURRENCY = 3;

/**
 * Read the configured limit, clamped into `[1, MAX_CONCURRENCY]`.
 *
 * Clamped rather than trusted: `RESEARCH_CAPTURE_CONCURRENCY=50` is a plausible typo and an
 * expensive one, and the failure it would cause — losing access to a county portal — is not one
 * that shows up in a test run. A non-numeric or missing value falls back to the default rather than
 * to `NaN`, which would make `slice(0, NaN)` return nothing and capture zero documents.
 */
export function configuredConcurrency(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = Number(env.RESEARCH_CAPTURE_CONCURRENCY);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_CONCURRENCY;
  return Math.min(Math.floor(raw), MAX_CONCURRENCY);
}

/**
 * Map `items` through `fn`, at most `limit` at a time.
 *
 * Results are in input order and every item gets one, successful or not.
 */
export async function mapBounded<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number = configuredConcurrency(),
): Promise<Array<BoundedResult<R>>> {
  const width = Math.max(1, Math.min(Math.floor(limit) || 1, MAX_CONCURRENCY));
  const out = new Array<BoundedResult<R>>(items.length);

  // A shared cursor rather than fixed slices. Fixed slices ("worker 1 takes items 0-3") stall the
  // whole batch behind its slowest slice — and these items are county documents whose durations
  // differ by an order of magnitude, so one 90-second scan would idle the other workers completely.
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        out[i] = { ok: true, value: await fn(items[i], i) };
      } catch (error) {
        out[i] = { ok: false, error };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
  return out;
}
