// worker/src/lib/ai-usage-tracker.ts
// Tracks AI API usage for cost monitoring and implements circuit breaker
// logic to prevent runaway spend when batch searches hit the AI fallback.

// ── Cost Constants ─────────────────────────────────────────────────────────────

/** Approximate cost per 1K tokens for Sonnet (input + output averaged) */
const SONNET_COST_PER_1K_TOKENS = 0.006;

/** Default token estimate per AI variant call (~500 input + ~300 output) */
const ESTIMATED_TOKENS_PER_CALL = 800;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AiUsageEntry {
  timestamp: number;
  /** Logical AI workload buckets sharing one circuit breaker.
   *  - variant-generation / vision-ocr / ai-parse: STARR Recon
   *  - vision-ocr is also used by the Starr Field receipt extractor
   *  - whisper-transcribe: Starr Field voice-memo transcription
   *    (different vendor + per-second pricing — see record() costUsd
   *    override). */
  service:
    | 'variant-generation'
    | 'vision-ocr'
    | 'ai-parse'
    | 'whisper-transcribe';
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  /** Free-form context label — typically a property address (Recon),
   *  a receipt id, or a media id. Optional; empty string is fine. */
  address: string;
  success: boolean;
}

export interface AiUsageStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedTotalCostUsd: number;
  callsInWindow: number;
  windowStart: number;
  circuitOpen: boolean;
  circuitOpenReason: string | null;
}

export interface CircuitBreakerConfig {
  /** Max AI calls per rolling window (default: 20) */
  maxCallsPerWindow: number;
  /** Rolling window duration in ms (default: 5 minutes) */
  windowMs: number;
  /** Max consecutive failures before opening circuit (default: 5) */
  maxConsecutiveFailures: number;
  /** Max estimated cost per window in USD (default: $0.50) */
  maxCostPerWindowUsd: number;
  /** Cooldown period after circuit opens in ms (default: 60s) */
  cooldownMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  maxCallsPerWindow: 20,
  windowMs: 5 * 60 * 1000,         // 5 minutes
  maxConsecutiveFailures: 5,
  maxCostPerWindowUsd: 0.50,
  cooldownMs: 60 * 1000,            // 60 seconds
};

// ── AiUsageTracker ─────────────────────────────────────────────────────────────

export class AiUsageTracker {
  private entries: AiUsageEntry[] = [];
  private consecutiveFailures = 0;
  private circuitOpenedAt: number | null = null;
  private circuitOpenReason: string | null = null;
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Circuit Breaker ────────────────────────────────────────────────────────

  /** Check if the circuit breaker allows another AI call. */
  canMakeCall(): { allowed: boolean; reason?: string } {
    // Check cooldown
    if (this.circuitOpenedAt) {
      const elapsed = Date.now() - this.circuitOpenedAt;
      if (elapsed < this.config.cooldownMs) {
        return {
          allowed: false,
          reason: `Circuit breaker open (${this.circuitOpenReason}). Cooldown: ${Math.ceil((this.config.cooldownMs - elapsed) / 1000)}s remaining`,
        };
      }
      // Cooldown expired — half-open: allow one call to test
      this.circuitOpenedAt = null;
      this.circuitOpenReason = null;
      this.consecutiveFailures = 0;
    }

    const windowEntries = this.getWindowEntries();

    // Check call rate
    if (windowEntries.length >= this.config.maxCallsPerWindow) {
      this.openCircuit(`Rate limit: ${windowEntries.length}/${this.config.maxCallsPerWindow} calls in window`);
      return { allowed: false, reason: this.circuitOpenReason! };
    }

    // Check cost ceiling
    const windowCost = windowEntries.reduce((sum, e) => sum + e.estimatedCostUsd, 0);
    if (windowCost >= this.config.maxCostPerWindowUsd) {
      this.openCircuit(`Cost ceiling: $${windowCost.toFixed(4)} >= $${this.config.maxCostPerWindowUsd}`);
      return { allowed: false, reason: this.circuitOpenReason! };
    }

    // Check consecutive failures
    if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      this.openCircuit(`${this.consecutiveFailures} consecutive failures`);
      return { allowed: false, reason: this.circuitOpenReason! };
    }

    return { allowed: true };
  }

  // ── Recording ──────────────────────────────────────────────────────────────

  /** Record an AI API call and its outcome.
   *
   *  Cost computation:
   *  - When `costUsd` is supplied, it's used verbatim. Use this for
   *    Whisper (per-second pricing) or any non-Sonnet model.
   *  - Otherwise the cost is estimated from tokens × Sonnet rate.
   *    Approximate; circuit breaker only needs order-of-magnitude
   *    accuracy.
   */
  record(
    entry: Omit<
      AiUsageEntry,
      'timestamp' | 'estimatedCostUsd' | 'inputTokens' | 'outputTokens' | 'address'
    > & {
      inputTokens?: number;
      outputTokens?: number;
      costUsd?: number;
      address?: string;
    }
  ): void {
    const inputTokens = entry.inputTokens ?? Math.round(ESTIMATED_TOKENS_PER_CALL * 0.6);
    const outputTokens = entry.outputTokens ?? Math.round(ESTIMATED_TOKENS_PER_CALL * 0.4);
    const totalTokens = inputTokens + outputTokens;
    const estimatedCostUsd =
      entry.costUsd ?? (totalTokens / 1000) * SONNET_COST_PER_1K_TOKENS;

    const fullEntry: AiUsageEntry = {
      timestamp: Date.now(),
      service: entry.service,
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      address: entry.address ?? '',
      success: entry.success,
    };

    this.entries.push(fullEntry);

    if (entry.success) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
    }

    // Prune old entries (keep last hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.entries = this.entries.filter((e) => e.timestamp > oneHourAgo);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  /** Get current usage statistics. */
  getStats(): AiUsageStats {
    const windowEntries = this.getWindowEntries();

    return {
      totalCalls: this.entries.length,
      successfulCalls: this.entries.filter((e) => e.success).length,
      failedCalls: this.entries.filter((e) => !e.success).length,
      totalInputTokens: this.entries.reduce((sum, e) => sum + e.inputTokens, 0),
      totalOutputTokens: this.entries.reduce((sum, e) => sum + e.outputTokens, 0),
      estimatedTotalCostUsd: this.entries.reduce((sum, e) => sum + e.estimatedCostUsd, 0),
      callsInWindow: windowEntries.length,
      windowStart: Date.now() - this.config.windowMs,
      circuitOpen: this.circuitOpenedAt !== null,
      circuitOpenReason: this.circuitOpenReason,
    };
  }

  /** Reset all state (useful for testing). */
  reset(): void {
    this.entries = [];
    this.consecutiveFailures = 0;
    this.circuitOpenedAt = null;
    this.circuitOpenReason = null;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private getWindowEntries(): AiUsageEntry[] {
    const windowStart = Date.now() - this.config.windowMs;
    return this.entries.filter((e) => e.timestamp > windowStart);
  }

  private openCircuit(reason: string): void {
    this.circuitOpenedAt = Date.now();
    this.circuitOpenReason = reason;
  }
}

// ── Singleton for shared use across the worker process ───────────────────────

let _globalTracker: AiUsageTracker | null = null;

export function getGlobalAiTracker(): AiUsageTracker {
  if (!_globalTracker) {
    _globalTracker = new AiUsageTracker();
  }
  return _globalTracker;
}
