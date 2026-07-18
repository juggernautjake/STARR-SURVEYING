import { describe, it, expect } from 'vitest';
import { backoffMsForRetry, BACKOFF_MS } from '../../mobile/lib/uploadBackoff';

// workmode Area C — the retry cadence for the resilient upload queue. recordFailure sets
// next_attempt_at = now + backoffMsForRetry(retry_count); isEligible then holds the row until then. This
// pins the schedule (previously computed inline in the DB-writing recordFailure and untested).
describe('backoffMsForRetry', () => {
  it('follows the doubling schedule from the first failure (retry_count 0)', () => {
    expect(backoffMsForRetry(0)).toBe(5_000);   // first failure → 5s
    expect(backoffMsForRetry(1)).toBe(10_000);
    expect(backoffMsForRetry(2)).toBe(20_000);
    expect(backoffMsForRetry(3)).toBe(40_000);
    expect(backoffMsForRetry(4)).toBe(80_000);
    expect(backoffMsForRetry(5)).toBe(160_000);
    expect(backoffMsForRetry(6)).toBe(300_000);
  });

  it('clamps to the 5-minute ceiling for any retry at or past the end of the table', () => {
    expect(backoffMsForRetry(7)).toBe(300_000);   // last entry
    expect(backoffMsForRetry(8)).toBe(300_000);   // past the end (MAX_RETRIES) — no over-index
    expect(backoffMsForRetry(99)).toBe(300_000);
    // The old inline `BACKOFF_MS[Math.min(n, len-1)]` also clamped the top, so this stays intact.
    expect(backoffMsForRetry(BACKOFF_MS.length)).toBe(BACKOFF_MS[BACKOFF_MS.length - 1]);
  });

  it('floors a negative / NaN / fractional retry_count to a real delay (never BACKOFF_MS[-1] = undefined)', () => {
    expect(backoffMsForRetry(-1)).toBe(5_000);      // defensive floor — the old code read undefined → NaN
    expect(backoffMsForRetry(Number.NaN)).toBe(5_000);
    expect(backoffMsForRetry(2.9)).toBe(20_000);    // floors the index, not the delay
  });

  it('every scheduled delay is a positive, finite number (no NaN next_attempt_at can ever be set)', () => {
    for (let n = -2; n <= 20; n++) {
      const ms = backoffMsForRetry(n);
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeGreaterThan(0);
    }
  });
});
