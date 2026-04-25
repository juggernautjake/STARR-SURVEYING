/**
 * Duration formatters for time-tracking UI.
 *
 * Field crews glance at these on a sunlit screen — keep them tight:
 *   <60 sec    → "<1m"
 *   <60 min    → "{n}m"
 *   <10 hours  → "{h}h {m}m"
 *   ≥10 hours  → "{h}h"  (drop minutes — at this point the user is
 *                         past clock-out anyway and we want the
 *                         display to scream "go home")
 */
export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '0m';
  const totalSec = Math.floor(milliseconds / 1000);
  if (totalSec < 60) return '<1m';
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours >= 10) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Elapsed milliseconds between an ISO-8601 timestamp and now.
 * Returns 0 for malformed input (rather than NaN that would corrupt
 * the duration display).
 */
export function elapsedSince(isoStartedAt: string): number {
  const t = Date.parse(isoStartedAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Date.now() - t);
}

/** ISO-8601 date string for "today" in the device's local timezone. */
export function todayLocalISODate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
