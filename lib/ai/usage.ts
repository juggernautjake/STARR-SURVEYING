// lib/ai/usage.ts — what every AI call cost, in one place (audit §5, Phase 3 item 13).
//
// §5 asks for *"one cost/usage log"* among the pieces a central `lib/ai/` should have, and Q52 asks
// the owner what an acceptable monthly AI spend is. Neither question can be answered while six
// surfaces each call the Anthropic client directly and none of them records anything.
//
// ── LOGGING MUST NEVER BREAK THE CALL IT IS MEASURING ───────────────────────────────────────────
//
// Every write here is fire-and-forget and every failure is swallowed after being logged to the
// console. An observability layer that can fail a customer's request is worse than no observability
// layer — and this one runs on the AI path, which is already the slowest thing in the app.

import { supabaseAdmin } from '@/lib/supabase';
import type { AiRole } from './models';

export interface AiUsageRecord {
  role: AiRole;
  model: string;
  /** Which surface made the call — 'research', 'cad', 'assistant', 'lead-draft'… */
  surface: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  latencyMs: number;
  /** Null on success; the error category otherwise. */
  error?: string | null;
  userEmail?: string | null;
}

/** Published per-million-token prices, in cents, for cost estimation.
 *
 *  A local table rather than a lookup: a cost estimate that requires a network call is one nobody
 *  computes. It is deliberately approximate and labelled as such — the authoritative number is the
 *  invoice, and this exists to answer "which surface is expensive" rather than "what do we owe". */
const PRICE_CENTS_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 500, output: 2500 },
  'claude-sonnet-5': { input: 300, output: 1500 },
  'claude-haiku-4-5': { input: 100, output: 500 },
};

/** Approximate cost in cents. Unknown models return null rather than guessing — a made-up number in
 *  a cost report is worse than a gap, because nobody questions a number. */
export function estimateCostCents(record: Pick<AiUsageRecord, 'model' | 'inputTokens' | 'outputTokens' | 'cacheReadTokens'>): number | null {
  const price = PRICE_CENTS_PER_MTOK[record.model];
  if (!price) return null;
  // Cache reads bill at roughly a tenth of input. Counted separately so a caching win is visible
  // rather than hidden inside the input total.
  const cached = record.cacheReadTokens ?? 0;
  const inputCost = ((record.inputTokens - cached) * price.input + cached * price.input * 0.1) / 1_000_000;
  const outputCost = (record.outputTokens * price.output) / 1_000_000;
  return Math.round((inputCost + outputCost) * 100) / 100;
}

/** Record one call. Never throws, never awaited on the critical path. */
export function recordAiUsage(record: AiUsageRecord): void {
  const row = {
    role: record.role,
    model: record.model,
    surface: record.surface,
    input_tokens: record.inputTokens,
    output_tokens: record.outputTokens,
    cache_read_tokens: record.cacheReadTokens ?? 0,
    cache_write_tokens: record.cacheWriteTokens ?? 0,
    estimated_cost_cents: estimateCostCents(record),
    latency_ms: record.latencyMs,
    error: record.error ?? null,
    user_email: record.userEmail ?? null,
  };

  void supabaseAdmin
    .from('ai_usage_log')
    .insert(row)
    .then((res: { error: { message: string } | null }) => {
      const error = res.error;
      if (error) {
        // Named, not silent — a usage log that has been failing for a month looks exactly like a
        // month with no AI usage, which is the most misleading possible reading of an empty table.
        console.error('[ai-usage] could not record usage:', error.message);
      }
    });
}

/** Token usage as the SDK reports it, normalised. The field names have changed across SDK versions,
 *  so this reads defensively rather than assuming a shape. */
export function readUsage(usage: unknown): { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } {
  const u = (usage ?? {}) as Record<string, number | undefined>;
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}
