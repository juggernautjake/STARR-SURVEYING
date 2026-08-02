// worker/src/infra/model-router.ts — the cheapest model that can do the job (research plan R6).
//
// ── WHAT IT COSTS TO GET THIS WRONG IN EITHER DIRECTION ─────────────────────────────────────────
//
// Measured before this file: 25 hard-coded model ids across the worker, most of them a Sonnet
// pinned by date, chosen per call site by whoever wrote it. So a yes/no "is this screenshot a plat"
// ran on the same model as "read this 1890s handwritten metes-and-bounds and reconcile it against
// the plat" — and the pricing helper charged them the same too, until R4.
//
// Both directions are expensive. Over-spec every call and the owner's "as cheap as possible" is
// unreachable: Opus is 15× Haiku on input and 15× on output, and most calls in a research run are
// classification and clean-text extraction. Under-spec the hard ones and the run produces confident
// nonsense about a boundary somebody is asked to stake, which costs a site visit.
//
// So the model is chosen by TASK, and the task names describe the work rather than the model:
//
//   classify      is this a deed or a plat; is this page relevant     → cheap
//   read_text     pull fields from clean typed text                   → cheap
//   read_scan     read a scanned or handwritten page                  → mid
//   extract       structured extraction with judgement                → mid
//   reconcile     two sources disagree; which is right and why        → top
//   synthesize    the survey gameplan, the conflict narrative         → top
//
// ── ESCALATION IS THE POINT, NOT THE FALLBACK ───────────────────────────────────────────────────
//
// Starting cheap is only safe if a low-confidence answer gets retried on a better model. That is
// what makes the cheap tier the DEFAULT rather than a gamble: the pipeline pays Haiku prices for
// the 80% of pages that are clean, and Opus prices only for the ones that earn it.
//
// Every escalation is recorded (plan R4's metadata), because a task that escalates every single
// time is a task that was classified wrong, and that is invisible without the number.

export type TaskKind =
  | 'classify'
  | 'read_text'
  | 'read_scan'
  | 'extract'
  | 'reconcile'
  | 'synthesize';

export type Tier = 'cheap' | 'mid' | 'top';

/** The models behind each tier.
 *
 *  Ids, not dated pins. A dated id (`claude-sonnet-4-20250514`) freezes a call site to a model
 *  generation and is how this worker ended up two generations behind while the app had already
 *  standardised — see plan §2.5. */
export const TIER_MODELS: Record<Tier, string> = {
  cheap: 'claude-haiku-4-5',
  mid: 'claude-sonnet-5',
  top: 'claude-opus-5',
};

const TASK_TIER: Record<TaskKind, Tier> = {
  classify: 'cheap',
  read_text: 'cheap',
  read_scan: 'mid',
  extract: 'mid',
  reconcile: 'top',
  synthesize: 'top',
};

/** Confidence below which an answer is retried a tier up. */
export const ESCALATION_THRESHOLD = 0.7;

const ORDER: Tier[] = ['cheap', 'mid', 'top'];

export interface ModelChoice {
  model: string;
  tier: TaskKind extends never ? never : Tier;
  task: TaskKind;
  /** True when this choice is the result of an escalation rather than the task's default. */
  escalated: boolean;
}

export function tierFor(task: TaskKind): Tier {
  return TASK_TIER[task];
}

/** The model to use for a task. */
export function modelFor(task: TaskKind): ModelChoice {
  const tier = tierFor(task);
  return { model: TIER_MODELS[tier], tier, task, escalated: false };
}

/** The next tier up, or null at the ceiling.
 *
 *  Returning null rather than repeating the top tier matters: a caller that loops "escalate until
 *  confident" against a model that cannot do better would spend the run's whole budget on one
 *  unreadable page. */
export function escalate(choice: ModelChoice): ModelChoice | null {
  const idx = ORDER.indexOf(choice.tier as Tier);
  const next = ORDER[idx + 1];
  if (!next) return null;
  return { model: TIER_MODELS[next], tier: next, task: choice.task, escalated: true };
}

/** Should this answer be retried on a better model?
 *
 *  `null`/`undefined` confidence means the call site does not report one — treated as good enough,
 *  because escalating everything that cannot self-assess would put the whole pipeline on the top
 *  tier and quietly undo the saving. */
export function shouldEscalate(confidence: number | null | undefined, threshold = ESCALATION_THRESHOLD): boolean {
  if (confidence === null || confidence === undefined) return false;
  return confidence < threshold;
}

/** Run a task cheap-first, escalating while the result is not confident enough.
 *
 *  The caller supplies the actual API call. This module never talks to Anthropic — it decides which
 *  model to ask and when to try again, which is the part worth testing without a network.
 *
 *  `onAttempt` is where R4's usage recording hangs, so an escalation shows up in the cost data as
 *  two calls with the tier on each. A task that escalates every time is a task classified wrong. */
export async function runWithEscalation<T>(
  task: TaskKind,
  call: (choice: ModelChoice) => Promise<{ result: T; confidence?: number | null }>,
  opts: {
    threshold?: number;
    maxAttempts?: number;
    onAttempt?: (choice: ModelChoice, confidence: number | null | undefined) => void;
  } = {},
): Promise<{ result: T; choice: ModelChoice; attempts: number }> {
  const threshold = opts.threshold ?? ESCALATION_THRESHOLD;
  const maxAttempts = opts.maxAttempts ?? ORDER.length;

  let choice = modelFor(task);
  let attempts = 0;
  let last: { result: T; confidence?: number | null } | null = null;

  while (attempts < maxAttempts) {
    attempts++;
    last = await call(choice);
    opts.onAttempt?.(choice, last.confidence);
    if (!shouldEscalate(last.confidence, threshold)) break;
    const next = escalate(choice);
    if (!next) break;
    choice = next;
  }

  return { result: (last as { result: T }).result, choice, attempts };
}

/** Rough per-token cost ratio between tiers, for explaining a routing decision in a log line.
 *
 *  Deliberately approximate and derived from the pricing table's shape rather than duplicated from
 *  it: `infra/usage.ts` is the one place that prices a call, and a second table of exact rates here
 *  would be a second answer to what something cost. */
export function relativeCost(tier: Tier): number {
  return tier === 'cheap' ? 1 : tier === 'mid' ? 3 : 15;
}
