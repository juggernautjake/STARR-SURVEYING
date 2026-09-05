// worker/src/infra/usage.ts — what a research run actually costs (research plan R4).
//
// ── THE MEASUREMENT THAT DID NOT EXIST ──────────────────────────────────────────────────────────
//
// `research_usage_events` has a model column, token columns and a cost column. Measured 2026-08-02:
// **0 rows.** The only code touching it was the billing page, which reads. So "as cheap as possible
// per run" — the owner's constraint — could not be evaluated, compared between two runs, or
// regressed against. Every optimisation in the plan is unmeasurable until something writes.
//
// This is that writer, and it is the only one. A second place that prices a call is a second
// answer to "what did this cost".
//
// ── TELEMETRY NEVER FAILS A RUN ─────────────────────────────────────────────────────────────────
//
// A failed insert is logged and dropped. Twenty-five minutes of research and a paid document are
// not thrown away because a metrics row would not save. But it is logged LOUDLY rather than
// swallowed: silent telemetry loss is how a table ends up with 0 rows and everybody assumes the
// feature works.
//
// ── AND IT ACCUMULATES IN MEMORY TOO ────────────────────────────────────────────────────────────
//
// R5 has to stop a run that has spent its budget. Asking Postgres mid-run for a sum, on every call,
// would put the budget check on the critical path of a network round trip. The in-process
// accumulator is the enforcement surface; the table is the record. They can disagree only by the
// duration of one failed insert, and the accumulator is the conservative one (it counts what was
// spent even when the row did not save).

import { currentProjectId } from './run-context.js';
import { getSupabase } from '../services/pipeline.js';

// ── Pricing ─────────────────────────────────────────────────────────────────────────────────────
//
// USD per token. Anthropic publishes per-million; these are those figures divided by 1e6, kept in
// that form so a rate change is a one-line edit against the published number.
//
// Cache reads are ~10% of the input rate and cache WRITES are ~125%; both are tracked because a
// pipeline that re-sends the same 40-page deed to five prompts is the single biggest saving
// available, and it cannot be found without the numbers.

export interface ModelRate {
  /** USD per input token. */
  input: number;
  /** USD per output token. */
  output: number;
  /** USD per cached input token read. */
  cacheRead: number;
  /** USD per token written to cache. */
  cacheWrite: number;
}

const M = 1_000_000;

export const MODEL_PRICING: Record<string, ModelRate> = {
  // Current family.
  'claude-opus-5':    { input: 15 / M, output: 75 / M, cacheRead: 1.5 / M,  cacheWrite: 18.75 / M },
  'claude-sonnet-5':  { input: 3  / M, output: 15 / M, cacheRead: 0.3 / M,  cacheWrite: 3.75  / M },
  'claude-haiku-4-5': { input: 1  / M, output: 5  / M, cacheRead: 0.1 / M,  cacheWrite: 1.25  / M },
  // Ids still hard-coded across this worker (plan §2.5). Priced so today's runs are measured
  // correctly; R6 replaces the call sites and these become history rather than policy.
  'claude-sonnet-4-6': { input: 3 / M, output: 15 / M, cacheRead: 0.3 / M, cacheWrite: 3.75 / M },
  'claude-sonnet-4-5': { input: 3 / M, output: 15 / M, cacheRead: 0.3 / M, cacheWrite: 3.75 / M },
  'claude-sonnet-4':   { input: 3 / M, output: 15 / M, cacheRead: 0.3 / M, cacheWrite: 3.75 / M },
};

/** Used when a model id is not in the table.
 *
 *  Sonnet rates, NOT zero. A model nobody priced is far more likely to cost something than nothing,
 *  and a zero would make an unrecognised model look like the cheapest thing in the system — which
 *  is the exact wrong signal to hand somebody optimising spend. */
export const FALLBACK_RATE: ModelRate = MODEL_PRICING['claude-sonnet-5']!;

/** Normalise the dated ids the code uses (`claude-sonnet-4-20250514`) onto a rate key. */
export function rateFor(model: string | null | undefined): { rate: ModelRate; known: boolean } {
  if (!model) return { rate: FALLBACK_RATE, known: false };
  const exact = MODEL_PRICING[model];
  if (exact) return { rate: exact, known: true };
  // Longest matching prefix: 'claude-sonnet-4-5-20250929' → 'claude-sonnet-4-5', not 'claude-sonnet-4'.
  const keys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (model.startsWith(key)) return { rate: MODEL_PRICING[key]!, known: true };
  }
  return { rate: FALLBACK_RATE, known: false };
}

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/** Pure. What one model call cost, in USD. */
export function priceCall(model: string | null | undefined, tokens: TokenCounts): number {
  const { rate } = rateFor(model);
  return (
    tokens.input * rate.input +
    tokens.output * rate.output +
    (tokens.cacheRead ?? 0) * rate.cacheRead +
    (tokens.cacheWrite ?? 0) * rate.cacheWrite
  );
}

// ── Recording ───────────────────────────────────────────────────────────────────────────────────

export type UsageEventType = 'ai_call' | 'document_purchase' | 'captcha_solve' | 'browser_session';

export interface UsageEvent {
  projectId: string;
  eventType: UsageEventType;
  /** Required for `ai_call`; ignored otherwise. */
  model?: string | null;
  tokens?: TokenCounts;
  /** For non-AI events, the cost in USD — the vendor's price, not a computed one. */
  costUsd?: number;
  /** Who the run is for. The worker often does not know; `SYSTEM_ACTOR` is honest about that. */
  userEmail?: string;
  /** Anything worth being able to group by later: county, adapter, phase, document id. */
  metadata?: Record<string, unknown>;
}

/** `research_usage_events.user_email` is NOT NULL and the worker frequently has no user — a run
 *  triggered by a schedule or an intake webhook belongs to nobody in particular. A sentinel is
 *  honest; inventing an address is not. */
export const SYSTEM_ACTOR = 'worker@system';

/** Per-project spend so far, in USD. In-process; see the header for why it exists beside the table. */
const runSpend = new Map<string, number>();

export function spendForRun(projectId: string): number {
  return runSpend.get(projectId) ?? 0;
}

/**
 * The TRUE, all-phases spend for a project from the `research_usage_events` ledger (plan F2).
 *
 * `spendForRun` is the worker's in-process accumulator and only counts calls THIS worker process
 * made — it misses app-side analysis (`lib/ai/usage.ts` writes the same ledger without touching this
 * map) and anything from a prior process. That is exactly the gap the 2026-09-05 session found: the
 * run UI read $1.82 (worker in-memory) while the ledger held $3.13 (worker + app analysis). Reports
 * and status should read THIS so no real cost is invisible. `load` is injectable for tests; the
 * default sums `cost_usd` over the project's ledger rows.
 */
export async function ledgerSpendForRun(
  projectId: string,
  load?: (projectId: string) => Promise<Array<{ cost_usd: number | string | null }>>,
): Promise<number> {
  const rows = load ? await load(projectId) : await loadLedgerRows(projectId);
  const total = rows.reduce((sum, r) => sum + (Number(r?.cost_usd) || 0), 0);
  return Number(total.toFixed(6));
}

async function loadLedgerRows(projectId: string): Promise<Array<{ cost_usd: number | string | null }>> {
  try {
    const supabase = await getSupabase();
    if (!supabase) return [];
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: Array<{ cost_usd: number | string | null }> | null; error: { message: string } | null }> } };
    }).from('research_usage_events').select('cost_usd').eq('research_project_id', projectId);
    if (error) {
      console.warn(`[usage] ledgerSpendForRun could not read the ledger for ${projectId}: ${error.message}`);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.warn(`[usage] ledgerSpendForRun threw for ${projectId}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export function resetRunSpend(projectId: string): void {
  runSpend.delete(projectId);
}

/** Every AI call, paid page and solved captcha lands here.
 *
 *  Returns the computed cost so a caller can attribute it locally without re-deriving the price —
 *  the second-answer problem again. */
export async function recordUsage(event: UsageEvent): Promise<number> {
  const tokens = event.tokens ?? { input: 0, output: 0 };
  const cost = event.eventType === 'ai_call'
    ? priceCall(event.model, tokens)
    : (event.costUsd ?? 0);

  // Accumulate FIRST. The budget must count a call that happened even if its row does not save.
  runSpend.set(event.projectId, (runSpend.get(event.projectId) ?? 0) + cost);

  const { known } = rateFor(event.model);
  const row = {
    research_project_id: event.projectId,
    user_email: event.userEmail ?? SYSTEM_ACTOR,
    event_type: event.eventType,
    model: event.model ?? null,
    prompt_tokens: Math.round(tokens.input),
    completion_tokens: Math.round(tokens.output),
    total_tokens: Math.round(tokens.input + tokens.output + (tokens.cacheRead ?? 0) + (tokens.cacheWrite ?? 0)),
    cost_usd: Number(cost.toFixed(6)),
    metadata: {
      ...(event.metadata ?? {}),
      ...(tokens.cacheRead ? { cache_read_tokens: tokens.cacheRead } : {}),
      ...(tokens.cacheWrite ? { cache_write_tokens: tokens.cacheWrite } : {}),
      // Recorded so a mispriced run can be found later rather than quietly averaged into the total.
      ...(event.eventType === 'ai_call' && !known ? { unpriced_model: true } : {}),
    },
  };

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      // No Supabase configured — dev, or a misconfigured deploy. The accumulator above still holds
      // the number, so a budget ceiling works; only the permanent record is lost, and it says so.
      console.warn(`[usage] no Supabase client — ${event.eventType} for ${event.projectId} not persisted (${cost.toFixed(4)})`);
      return cost;
    }
    // The worker's Supabase client is typed from a schema that predates this table, so its
    // generated row type is `never`. Cast at the boundary, once, rather than weakening the client
    // everywhere — the shape is asserted by the schema test instead.
    const { error } = await (supabase as unknown as { from: (t: string) => { insert: (r: unknown) => Promise<{ error: { message: string } | null }> } })
      .from('research_usage_events').insert(row);
    if (error) {
      // Loud. A silent drop here is how the table ended up with 0 rows while everybody assumed
      // spend was being tracked.
      console.error(`[usage] FAILED to record ${event.eventType} for ${event.projectId}: ${error.message}`);
    }
  } catch (err) {
    console.error(`[usage] FAILED to record ${event.eventType} for ${event.projectId}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return cost;
}

/** Convenience for the AI call sites: price, record, and hand back the cost. */
export function recordAiCall(
  projectId: string,
  model: string | null | undefined,
  tokens: TokenCounts,
  metadata?: Record<string, unknown>,
): Promise<number> {
  return recordUsage({ projectId, eventType: 'ai_call', model, tokens, metadata });
}

/**
 * Price and record an AI call against the ambient run (plan R4b).
 *
 * The twelve unmigrated call sites have no `projectId` in scope and no sensible way to obtain one —
 * they are pure analysis functions several hops below `runPipeline`. This is the bridge: the run is
 * carried by `AsyncLocalStorage` rather than by a parameter on every function between here and there.
 *
 * ── IT REFUSES RATHER THAN GUESSES ──────────────────────────────────────────────────────────────
 *
 * With no ambient run it records **nothing** and returns 0, having warned once with the site name.
 * The alternative — attributing to "the current run" — is a silent misattribution under
 * `concurrency: 3`, and the whole point of the ceiling is that its number means something.
 *
 * A warning rather than a throw: an unattributable AI call is a bookkeeping gap, not a reason to
 * fail a survey a customer is waiting on. The gap is made loud instead of fatal.
 */
export function recordAmbientAiCall(
  site: string,
  model: string | null | undefined,
  tokens: TokenCounts,
  metadata?: Record<string, unknown>,
): Promise<number> {
  const projectId = currentProjectId();
  if (!projectId) {
    warnUnattributed(site);
    return Promise.resolve(0);
  }
  return recordAiCall(projectId, model, tokens, { site, ...metadata });
}

/**
 * Price and record an AI call that legitimately belongs to **no research run** (plan R4b, last entry).
 *
 * `receipt-extraction.ts` is the case this exists for: a CLI batch over queued receipts. Its AI cost
 * is real money and was invisible to every ledger, but it is **not run spend** — filing it against a
 * research project would put finance work inside a research ceiling and make a customer's report
 * look more expensive than it was.
 *
 * ── WHY THIS IS A DIFFERENT FUNCTION AND NOT A DEFAULT PROJECT ID ───────────────────────────────
 *
 * Two properties have to hold, and both come from the key being namespaced rather than borrowed:
 *
 *   1. **It can never reach a run's ceiling.** `spendForRun` is keyed by project id; `ops:` keys
 *      cannot collide with a UUID, so no ops call can consume a run's budget or trip its limit.
 *   2. **It can never reach a customer's bill.** The billing route filters by `user_email`, and
 *      these rows carry `SYSTEM_ACTOR` — the same sentinel used for runs nobody triggered.
 *
 * `research_usage_events.research_project_id` is TEXT with no foreign key, documented in the seed as
 * *"may be temp ID"*, so an ops key is representable without schema work. The table is the ledger of
 * what the AI cost us; the run ceiling is a different question asked of the same rows.
 */
export function recordOpsAiCall(
  site: string,
  model: string | null | undefined,
  tokens: TokenCounts,
  metadata?: Record<string, unknown>,
): Promise<number> {
  return recordUsage({
    projectId: opsAccountingKey(site),
    eventType: 'ai_call',
    model,
    tokens,
    metadata: { site, ops: true, ...metadata },
  });
}

/** `ops:receipt-extraction`. Exported so a reader of the table — or a test — can tell ops spend from
 *  run spend without pattern-matching a convention written down in only one place. */
export function opsAccountingKey(site: string): string {
  return `${OPS_KEY_PREFIX}${site}`;
}

export const OPS_KEY_PREFIX = 'ops:';

/** True for a key produced by `opsAccountingKey`. A UUID can never satisfy it, which is the whole
 *  safety property: ops spend and run spend cannot be confused for one another. */
export function isOpsAccountingKey(projectId: string): boolean {
  return projectId.startsWith(OPS_KEY_PREFIX);
}

/** One warning per site, not one per call — a deed with forty pages would otherwise bury the log. */
const warnedSites = new Set<string>();
function warnUnattributed(site: string): void {
  if (warnedSites.has(site)) return;
  warnedSites.add(site);
  console.warn(
    `[usage] ${site} made an AI call with no ambient run, so its cost is NOT counted against any ` +
    `budget ceiling. This is a gap in spend tracking, not an error in the work. If this site runs ` +
    `inside a pipeline, wrap the entry point in withRunContext(); if it legitimately runs outside ` +
    `one (a CLI batch, for example), it needs its own accounting key rather than a run.`,
  );
}

/** Test seam — the warn-once set is module state and would leak between cases. */
export function __resetUnattributedWarnings(): void {
  warnedSites.clear();
}
