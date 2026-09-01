// worker/src/research/run-settings.ts — the knobs a single run was given.
//
// ── WHY THESE ARE PER-RUN AND NOT ONLY PER-PROJECT ──────────────────────────────────────────────
//
// The owner's requirement is that a re-run be editable: "we need to be able to fully edit the run by
// adding or removing information, or changing the settings of the run, such as whether or not it
// uses texasfile". That is only meaningful if run 2 can differ from run 1 — and if it can, then a
// report has to stay explicable after the fact.
//
// A thinner run 2 has two possible causes and they look identical in the output: the property had
// less to find, or the operator turned paid documents off. Recording the settings ON THE RUN is
// what tells them apart six weeks later. `research_projects.allow_paid_documents` is the project's
// default; this is what a particular run was actually told.
//
// ── AND WHY THREE OF THESE WERE BEING DROPPED ENTIRELY ──────────────────────────────────────────
//
// `limitsFor()` has accepted a per-run clock and a per-run cost since it was written and no caller
// ever passed either, so every run got the defaults whatever the operator chose. `userFiles` is
// accepted by the worker's own handler and the app never sent it. And `allow_paid_documents` — a
// column with a UI, a helper (`lib/research/paid-documents.ts`) and its own test file — is read by
// the app's lite pipeline and by nothing in the worker, which is the process that actually spends
// the money.
//
// Everything below is a value the system already knew how to use and was not being told.

/** What a run was configured to do. Every field optional: absent means "use the default". */
export interface RunSettings {
  /**
   * May this run buy documents from a paid vendor (TexasFile and the other paid platforms)?
   *
   * Defaults to the project's `allow_paid_documents`, which itself defaults to `true` — today's
   * behaviour. When false the run still completes from free county sources, and the report must say
   * paid documents were skipped BY CHOICE. That must never render the same as "the county has no
   * such record": one is a decision, the other is a fact about the county.
   */
  allowPaidDocuments?: boolean;

  /** Wall-clock ceiling in minutes. The owner's stated expectation for a full run is 20–30. */
  maxResearchTimeMinutes?: number;

  /** Spend ceiling in dollars for this run. */
  maxCostUsd?: number;

  /**
   * `free` touches no paid source at all; `paid` runs the free pass first and then escalates.
   *
   * Not a synonym for `allowPaidDocuments`. Mode picks the SOURCE PLAN; the switch is a hard veto on
   * spending that applies whatever the plan says. Keeping them apart means "run the paid plan but
   * do not actually buy anything" is expressible, which is exactly what a dry run is.
   */
  mode?: 'free' | 'paid';

  /**
   * Re-capture imagery and map screenshots even when the library already holds them.
   *
   * Off by default: 19 of the 53 duplicate document rows measured in production on 2026-09-01 were
   * the same screenshot re-taken by a later run. On when the operator wants fresh imagery because
   * the point of the re-run is that something on the ground changed.
   */
  refreshImagery?: boolean;
}

/** Every key of `RunSettings`, as data.
 *
 *  Exported so a test can assert that the app's mirror of this type has not drifted. The two sides
 *  cannot import each other — different tsconfigs, different module resolution — so the compiler
 *  cannot bind them together, and a list one test can compare is the next best thing. */
export const RUN_SETTING_KEYS = [
  'allowPaidDocuments',
  'maxResearchTimeMinutes',
  'maxCostUsd',
  'mode',
  'refreshImagery',
] as const;

/** Ceilings on the ceilings.
 *
 *  A run whose clock is set to 600 minutes is not a configuration, it is a mistake — and the cost of
 *  honouring it is a worker slot held for ten hours. Clamped rather than rejected: an out-of-range
 *  number from a UI slider should start a sensible run, not a 400. */
const LIMITS = {
  minutes: { min: 1, max: 120 },
  usd: { min: 0, max: 100 },
} as const;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Read settings off an untrusted request body.
 *
 * Unknown keys are dropped and unparseable values are treated as absent, so a malformed payload
 * yields defaults rather than a run configured by accident. Absence is meaningful throughout: an
 * omitted field means "whatever the default is", never `false` and never `0`.
 */
export function normaliseRunSettings(raw: unknown): RunSettings {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: RunSettings = {};

  // `=== false` and not `!raw.x`, deliberately. `undefined` must mean "not specified" and fall
  // through to the project default; treating it as false would silently turn paid documents off for
  // every caller that has not been updated, and a thinner report with no stated reason is the worst
  // of the available failures.
  if (typeof r.allowPaidDocuments === 'boolean') out.allowPaidDocuments = r.allowPaidDocuments;

  const minutes = Number(r.maxResearchTimeMinutes);
  if (Number.isFinite(minutes) && minutes > 0) {
    out.maxResearchTimeMinutes = clamp(minutes, LIMITS.minutes.min, LIMITS.minutes.max);
  }

  const usd = Number(r.maxCostUsd);
  // `>= 0`, not `> 0`: a ceiling of exactly zero is a real and useful instruction — run everything
  // free and buy nothing — and rejecting it would quietly restore the default $2.00.
  if (Number.isFinite(usd) && usd >= 0) {
    out.maxCostUsd = clamp(usd, LIMITS.usd.min, LIMITS.usd.max);
  }

  if (r.mode === 'free' || r.mode === 'paid') out.mode = r.mode;
  if (typeof r.refreshImagery === 'boolean') out.refreshImagery = r.refreshImagery;

  return out;
}

/** May this run pay for documents?
 *
 *  Two independent vetoes, either of which is decisive: the operator's switch, and a cost ceiling of
 *  zero. The second matters because a $0 ceiling and "paid off" are the same instruction expressed
 *  two ways, and honouring only one of them would let a run spend money the operator had capped. */
export function mayRunBuyDocuments(settings: RunSettings): { allowed: boolean; reason: string } {
  if (settings.allowPaidDocuments === false) {
    return {
      allowed: false,
      reason:
        'Paid documents are switched OFF for this run. Free county sources were used; anything only ' +
        'available from a paid vendor was skipped BY CHOICE, which is not the same as the county ' +
        'having no such record.',
    };
  }
  if (settings.maxCostUsd === 0) {
    return {
      allowed: false,
      reason:
        'This run was given a spend ceiling of $0.00, which is the same instruction as switching ' +
        'paid documents off. Nothing was purchased.',
    };
  }
  if (settings.mode === 'free') {
    return {
      allowed: false,
      reason: 'This run was started in free mode, so no paid source was queried.',
    };
  }
  return { allowed: true, reason: 'Paid documents are permitted for this run.' };
}

/** A sentence for the run record and the report. */
export function describeRunSettings(settings: RunSettings): string {
  const parts: string[] = [];
  parts.push(settings.allowPaidDocuments === false ? 'paid documents OFF' : 'paid documents on');
  if (settings.maxResearchTimeMinutes !== undefined) parts.push(`${settings.maxResearchTimeMinutes} min ceiling`);
  if (settings.maxCostUsd !== undefined) parts.push(`$${settings.maxCostUsd.toFixed(2)} ceiling`);
  if (settings.mode) parts.push(`${settings.mode} mode`);
  if (settings.refreshImagery) parts.push('imagery re-captured');
  return parts.join(', ');
}
