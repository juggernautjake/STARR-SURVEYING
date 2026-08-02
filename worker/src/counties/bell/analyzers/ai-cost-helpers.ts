/**
 * Shared AI cost-tracking helpers for Bell County analyzers.
 *
 * Centralises the `accumulateUsage` aggregator so the analyzers do not duplicate it, and routes
 * every price through `infra/usage.ts` — the one module that knows what a model costs.
 *
 * ── WHAT CHANGED, AND WHY IT MATTERED (research plan R4) ────────────────────────────────────────
 *
 * This file used to carry its own constants:
 *
 *     COST_PER_INPUT_TOKEN  = 3  / 1_000_000   // "claude-sonnet-4 pricing as of March 2026"
 *     COST_PER_OUTPUT_TOKEN = 15 / 1_000_000
 *
 * — a single flat pair applied to every call regardless of which model made it. A Haiku
 * classification and an Opus synthesis were billed identically, so the one number the owner asked
 * to minimise ("as cheap as possible per run") could not distinguish the cheap path from the
 * expensive one. Pricing now comes from the model id.
 *
 * The usage numbers were also purely in-memory: they rolled up into the result object and were
 * never written anywhere. `recordAiUsage` persists them to `research_usage_events`, which had 0
 * rows.
 */

import type { AiUsageSummary } from '../types/research-result.js';
import { priceCall, recordAiCall } from '../../../infra/usage.js';

/** Add a partial usage snapshot into a running accumulator in-place. */
export function accumulateUsage(acc: AiUsageSummary, delta: Partial<AiUsageSummary>): void {
  acc.totalCalls        += delta.totalCalls        ?? 0;
  acc.totalInputTokens  += delta.totalInputTokens  ?? 0;
  acc.totalOutputTokens += delta.totalOutputTokens ?? 0;
  acc.estimatedCostUsd  += delta.estimatedCostUsd  ?? 0;
}

/** Build a usage record from raw Anthropic token counts.
 *
 *  `model` is optional only because the callers are being migrated one at a time; omitting it
 *  prices at the Sonnet fallback, which is what the old constants did for everything. */
export function buildUsageFromTokens(
  inputTokens: number,
  outputTokens: number,
  model?: string,
): Partial<AiUsageSummary> {
  return {
    totalCalls: 1,
    totalInputTokens:  inputTokens,
    totalOutputTokens: outputTokens,
    estimatedCostUsd:  priceCall(model, { input: inputTokens, output: outputTokens }),
  };
}

/** Build the usage record AND persist it (plan R4).
 *
 *  Deliberately not folded into `buildUsageFromTokens`: that one is pure and called in places that
 *  have no project id. This one requires the project, because a cost that cannot be attributed to a
 *  run is not much use to somebody asking what a run costs.
 *
 *  Fire-and-forget by design — see infra/usage.ts. An analyzer must not await a metrics insert in
 *  the middle of a page loop. */
export function recordAiUsage(
  projectId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  metadata?: Record<string, unknown>,
): Partial<AiUsageSummary> {
  void recordAiCall(projectId, model, { input: inputTokens, output: outputTokens }, metadata);
  return buildUsageFromTokens(inputTokens, outputTokens, model);
}

/** Return a zeroed AiUsageSummary for initialisation. */
export function zeroUsage(): AiUsageSummary {
  return { totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0, estimatedCostUsd: 0 };
}
