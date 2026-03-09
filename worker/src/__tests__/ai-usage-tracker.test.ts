// worker/src/__tests__/ai-usage-tracker.test.ts
// Tests for AiUsageTracker: cost tracking, circuit breaker, and rate limiting.

import { describe, it, expect, beforeEach } from 'vitest';
import { AiUsageTracker } from '../lib/ai-usage-tracker.js';

describe('AiUsageTracker', () => {
  let tracker: AiUsageTracker;

  beforeEach(() => {
    tracker = new AiUsageTracker({
      maxCallsPerWindow: 5,
      windowMs: 10_000,          // 10s window for fast tests
      maxConsecutiveFailures: 3,
      maxCostPerWindowUsd: 0.10,
      cooldownMs: 1_000,         // 1s cooldown for fast tests
    });
  });

  // ── Basic Recording ──────────────────────────────────────────────────────

  describe('recording', () => {
    it('tracks a successful call', () => {
      tracker.record({
        service: 'variant-generation',
        address: '3779 W FM 436, Belton, TX',
        success: true,
        inputTokens: 500,
        outputTokens: 300,
      });

      const stats = tracker.getStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.successfulCalls).toBe(1);
      expect(stats.failedCalls).toBe(0);
      expect(stats.totalInputTokens).toBe(500);
      expect(stats.totalOutputTokens).toBe(300);
      expect(stats.estimatedTotalCostUsd).toBeGreaterThan(0);
    });

    it('tracks a failed call', () => {
      tracker.record({
        service: 'variant-generation',
        address: '123 Main St',
        success: false,
      });

      const stats = tracker.getStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.successfulCalls).toBe(0);
      expect(stats.failedCalls).toBe(1);
    });

    it('uses default token estimates when not provided', () => {
      tracker.record({
        service: 'variant-generation',
        address: '123 Main St',
        success: true,
      });

      const stats = tracker.getStats();
      expect(stats.totalInputTokens).toBeGreaterThan(0);
      expect(stats.totalOutputTokens).toBeGreaterThan(0);
    });
  });

  // ── Circuit Breaker: Call Rate ────────────────────────────────────────────

  describe('circuit breaker — rate limit', () => {
    it('allows calls within the rate limit', () => {
      for (let i = 0; i < 4; i++) {
        tracker.record({ service: 'variant-generation', address: `addr-${i}`, success: true });
      }

      const { allowed } = tracker.canMakeCall();
      expect(allowed).toBe(true);
    });

    it('blocks calls when rate limit is reached', () => {
      for (let i = 0; i < 5; i++) {
        tracker.record({ service: 'variant-generation', address: `addr-${i}`, success: true });
      }

      const { allowed, reason } = tracker.canMakeCall();
      expect(allowed).toBe(false);
      expect(reason).toContain('Rate limit');
    });
  });

  // ── Circuit Breaker: Consecutive Failures ────────────────────────────────

  describe('circuit breaker — consecutive failures', () => {
    it('opens circuit after max consecutive failures', () => {
      for (let i = 0; i < 3; i++) {
        tracker.record({ service: 'variant-generation', address: `addr-${i}`, success: false });
      }

      const { allowed, reason } = tracker.canMakeCall();
      expect(allowed).toBe(false);
      expect(reason).toContain('consecutive failures');
    });

    it('resets consecutive failure counter on success', () => {
      tracker.record({ service: 'variant-generation', address: 'addr-1', success: false });
      tracker.record({ service: 'variant-generation', address: 'addr-2', success: false });
      tracker.record({ service: 'variant-generation', address: 'addr-3', success: true }); // resets

      const { allowed } = tracker.canMakeCall();
      expect(allowed).toBe(true);
    });

    it('does not trip on non-consecutive failures', () => {
      tracker.record({ service: 'variant-generation', address: 'addr-1', success: false });
      tracker.record({ service: 'variant-generation', address: 'addr-2', success: true });
      tracker.record({ service: 'variant-generation', address: 'addr-3', success: false });
      tracker.record({ service: 'variant-generation', address: 'addr-4', success: true });

      const { allowed } = tracker.canMakeCall();
      expect(allowed).toBe(true);
    });
  });

  // ── Circuit Breaker: Cost Ceiling ────────────────────────────────────────

  describe('circuit breaker — cost ceiling', () => {
    it('blocks when cost ceiling is exceeded', () => {
      // Each call with 500 input + 300 output = 800 tokens ≈ $0.0048
      // We need ~21 calls to exceed $0.10
      // But we only have a window of 5 calls — so use large token counts
      tracker.record({
        service: 'variant-generation',
        address: 'addr-1',
        success: true,
        inputTokens: 10_000,
        outputTokens: 10_000,
      });

      // 20K tokens * $0.006/1K = $0.12 > $0.10 ceiling
      const { allowed, reason } = tracker.canMakeCall();
      expect(allowed).toBe(false);
      expect(reason).toContain('Cost ceiling');
    });
  });

  // ── Circuit Breaker: Cooldown ─────────────────────────────────────────────

  describe('circuit breaker — cooldown', () => {
    it('blocks during cooldown period', () => {
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        tracker.record({ service: 'variant-generation', address: `addr-${i}`, success: false });
      }

      // First check opens the circuit
      tracker.canMakeCall();

      // Should still be blocked
      const { allowed } = tracker.canMakeCall();
      expect(allowed).toBe(false);
    });

    it('allows half-open test call after cooldown expires', async () => {
      // Use a tracker with very short cooldown
      const fastTracker = new AiUsageTracker({
        maxCallsPerWindow: 100,
        windowMs: 60_000,
        maxConsecutiveFailures: 1,
        maxCostPerWindowUsd: 10,
        cooldownMs: 50,  // 50ms cooldown
      });

      fastTracker.record({ service: 'variant-generation', address: 'addr-1', success: false });
      fastTracker.canMakeCall(); // Opens circuit

      // Wait for cooldown
      await new Promise((r) => setTimeout(r, 60));

      const { allowed } = fastTracker.canMakeCall();
      expect(allowed).toBe(true);
    });
  });

  // ── Stats ────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns accurate aggregate statistics', () => {
      tracker.record({ service: 'variant-generation', address: 'addr-1', success: true, inputTokens: 100, outputTokens: 50 });
      tracker.record({ service: 'vision-ocr', address: 'addr-2', success: false, inputTokens: 200, outputTokens: 100 });
      tracker.record({ service: 'variant-generation', address: 'addr-3', success: true, inputTokens: 300, outputTokens: 150 });

      const stats = tracker.getStats();
      expect(stats.totalCalls).toBe(3);
      expect(stats.successfulCalls).toBe(2);
      expect(stats.failedCalls).toBe(1);
      expect(stats.totalInputTokens).toBe(600);
      expect(stats.totalOutputTokens).toBe(300);
      expect(stats.callsInWindow).toBe(3);
      expect(stats.circuitOpen).toBe(false);
    });
  });

  // ── Reset ────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears all state', () => {
      tracker.record({ service: 'variant-generation', address: 'addr-1', success: false });
      tracker.record({ service: 'variant-generation', address: 'addr-2', success: false });
      tracker.record({ service: 'variant-generation', address: 'addr-3', success: false });
      tracker.canMakeCall(); // Opens circuit

      tracker.reset();

      const stats = tracker.getStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.circuitOpen).toBe(false);

      const { allowed } = tracker.canMakeCall();
      expect(allowed).toBe(true);
    });
  });
});
