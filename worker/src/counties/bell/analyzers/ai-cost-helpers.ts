/**
 * Shared AI cost-tracking helpers for Bell County analyzers.
 *
 * Centralises the token-pricing constants and the `accumulateUsage`
 * aggregator so that deed-analyzer.ts and plat-analyzer.ts do not
 * duplicate them.
 */

import type { AiUsageSummary } from '../types/research-result.js';

/** claude-sonnet-4 pricing as of March 2026 (USD per token). */
export const COST_PER_INPUT_TOKEN  = 3  / 1_000_000;  // $3  / 1M input tokens
export const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000;  // $15 / 1M output tokens

/** Add a partial usage snapshot into a running accumulator in-place. */
export function accumulateUsage(acc: AiUsageSummary, delta: Partial<AiUsageSummary>): void {
  acc.totalCalls        += delta.totalCalls        ?? 0;
  acc.totalInputTokens  += delta.totalInputTokens  ?? 0;
  acc.totalOutputTokens += delta.totalOutputTokens ?? 0;
  acc.estimatedCostUsd  += delta.estimatedCostUsd  ?? 0;
}

/** Build a usage record from raw Anthropic token counts. */
export function buildUsageFromTokens(inputTokens: number, outputTokens: number): Partial<AiUsageSummary> {
  return {
    totalCalls: 1,
    totalInputTokens:  inputTokens,
    totalOutputTokens: outputTokens,
    estimatedCostUsd:  inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN,
  };
}

/** Return a zeroed AiUsageSummary for initialisation. */
export function zeroUsage(): AiUsageSummary {
  return { totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0, estimatedCostUsd: 0 };
}
