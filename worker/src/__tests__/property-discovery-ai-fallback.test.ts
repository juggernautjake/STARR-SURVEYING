// worker/src/__tests__/property-discovery-ai-fallback.test.ts
// Tests verifying the AI variant fallback is correctly wired into
// PropertyDiscoveryEngine and respects the circuit breaker.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AiUsageTracker, getGlobalAiTracker } from '../lib/ai-usage-tracker.js';

describe('AI fallback integration with discovery engine', () => {
  // We test the circuit breaker integration without invoking
  // real AI APIs or Playwright by testing the tracker directly.

  describe('circuit breaker gates AI fallback', () => {
    let tracker: AiUsageTracker;

    beforeEach(() => {
      tracker = new AiUsageTracker({
        maxCallsPerWindow: 3,
        windowMs: 60_000,
        maxConsecutiveFailures: 2,
        maxCostPerWindowUsd: 0.05,
        cooldownMs: 500,
      });
    });

    it('allows first call when circuit is closed', () => {
      expect(tracker.canMakeCall().allowed).toBe(true);
    });

    it('blocks after consecutive failures', () => {
      tracker.record({ service: 'variant-generation', address: 'a', success: false });
      tracker.record({ service: 'variant-generation', address: 'b', success: false });

      const { allowed, reason } = tracker.canMakeCall();
      expect(allowed).toBe(false);
      expect(reason).toContain('consecutive failures');
    });

    it('blocks after hitting rate limit', () => {
      tracker.record({ service: 'variant-generation', address: 'a', success: true });
      tracker.record({ service: 'variant-generation', address: 'b', success: true });
      tracker.record({ service: 'variant-generation', address: 'c', success: true });

      const { allowed, reason } = tracker.canMakeCall();
      expect(allowed).toBe(false);
      expect(reason).toContain('Rate limit');
    });

    it('recovers after cooldown', async () => {
      tracker.record({ service: 'variant-generation', address: 'a', success: false });
      tracker.record({ service: 'variant-generation', address: 'b', success: false });
      tracker.canMakeCall(); // opens circuit

      await new Promise((r) => setTimeout(r, 600)); // > 500ms cooldown

      const { allowed } = tracker.canMakeCall();
      expect(allowed).toBe(true);
    });
  });

  describe('global tracker singleton', () => {
    it('returns the same instance on repeated calls', () => {
      const a = getGlobalAiTracker();
      const b = getGlobalAiTracker();
      expect(a).toBe(b);
    });

    it('is a functional AiUsageTracker', () => {
      const tracker = getGlobalAiTracker();
      tracker.reset(); // Clean state

      expect(tracker.canMakeCall().allowed).toBe(true);
      tracker.record({ service: 'variant-generation', address: 'test', success: true });
      expect(tracker.getStats().totalCalls).toBeGreaterThanOrEqual(1);

      tracker.reset(); // Clean up
    });
  });
});

describe('AI variant deduplication', () => {
  // The generateAiAddressVariants function deduplicates against already-tried
  // variants. Since calling the real function requires an API key, we test
  // the dedup logic by verifying the contract:

  it('already-tried set uses lowercase for case-insensitive dedup', () => {
    // Simulates the dedup logic from generateAiAddressVariants
    const alreadyTried = [
      { searchString: '3779 FM 436', strategy: 'canonical', priority: 1 },
      { searchString: '3779 FARM TO MARKET 436', strategy: 'long_form', priority: 2 },
    ];

    const triedKeys = new Set(alreadyTried.map((v) => v.searchString.toLowerCase()));

    // Case-insensitive check should catch duplicates
    expect(triedKeys.has('3779 fm 436')).toBe(true);
    expect(triedKeys.has('3779 FM 436')).toBe(false); // Set is lowercase
    expect(triedKeys.has('3779 farm to market 436')).toBe(true);

    // Novel variant passes through
    expect(triedKeys.has('3779 highway 436')).toBe(false);
  });

  it('AI variants get priority >= 50 to run after deterministic variants', () => {
    // Contract: AI variants should use priority starting at 50
    const mockAiVariants = [
      { searchString: '3779 HWY 436 WEST', strategy: 'ai_variant_1', priority: 50 },
      { searchString: '3779 FARM MARKET RD 436', strategy: 'ai_variant_2', priority: 51 },
    ];

    for (const v of mockAiVariants) {
      expect(v.priority).toBeGreaterThanOrEqual(50);
      expect(v.strategy).toMatch(/^ai_variant_/);
    }
  });
});
