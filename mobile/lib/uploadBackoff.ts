// mobile/lib/uploadBackoff.ts — the exponential backoff SCHEDULE for a failed upload, extracted pure so
// the retry cadence (the core of the "resilient background upload" promise) is unit-testable instead of
// buried inline in the DB-writing recordFailure path. Off-device (no Expo/PowerSync), like queueOrder.
//
// After a row's Nth consecutive failure it must wait before it's eligible again. The delays double from
// 5s to a 5-minute ceiling that then holds: 5s, 10s, 20s, 40s, 80s, 160s, 300s, 300s. `isEligible`
// (queueOrder) enforces the wait via next_attempt_at = now + backoffMsForRetry(retryCount).

/** Backoff delays in ms, indexed by the pre-increment retry_count (0 = first failure). Doubles to a
 *  ~5-minute ceiling that repeats for any further retries. */
export const BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000] as const;

/**
 * The delay before a row that has failed `retryCount` times becomes eligible again. `retryCount` is the
 * count BEFORE this failure is recorded (0 on the first failure), matching recordFailure. Indices past the
 * table clamp to the last (ceiling) entry, and a negative/NaN count floors to the first — so the result is
 * always a real, finite delay (a bad index used to read BACKOFF_MS[-1] = undefined → NaN next_attempt_at).
 */
export function backoffMsForRetry(retryCount: number): number {
  const n = Number.isFinite(retryCount) ? Math.floor(retryCount) : 0;
  const i = Math.min(Math.max(0, n), BACKOFF_MS.length - 1);
  return BACKOFF_MS[i];
}
