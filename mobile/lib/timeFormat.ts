/**
 * Duration + date formatters for time-tracking UI.
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

export function elapsedSince(isoStartedAt: string): number {
  const t = Date.parse(isoStartedAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Date.now() - t);
}

/** YYYY-MM-DD in the local timezone for an arbitrary Date. */
export function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD for "today" in the device's local timezone. */
export function todayLocalISODate(): string {
  return localISODate(new Date());
}

/**
 * Whole minutes between two ISO-8601 timestamps. Returns null when
 * either side is missing/malformed or end is before start. Used by
 * clock-out's duration stamp and by edit-screen recomputation.
 */
export function durationMinutesBetween(
  startIso: string | null | undefined,
  endIso: string | null | undefined
): number | null {
  if (!startIso || !endIso) return null;
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.max(0, Math.round((b - a) / 60_000));
}

/**
 * Local clock time like "9:30 AM" from an ISO timestamp. Returns null
 * for missing/malformed input so callers can show a fallback ("now",
 * "—", etc.) rather than rendering "Invalid Date".
 */
export function formatLocalTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export interface ShortDateOptions {
  /** Include weekday prefix ("Mon Apr 14"). Defaults to false. */
  weekday?: boolean;
}

/**
 * Local short date from a YYYY-MM-DD string, e.g. "Apr 14" or
 * "Mon Apr 14". Parses the date as local-noon to avoid the UTC-day
 * shift that bites when the device timezone is west of GMT.
 */
export function formatLocalShortDate(
  isoYmd: string | null | undefined,
  opts: ShortDateOptions = {}
): string {
  if (!isoYmd) return '';
  const [y, m, d] = isoYmd.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return isoYmd;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString([], {
    weekday: opts.weekday ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
  });
}

/**
 * "Today" / "Yesterday" / "Mon Apr 14". Used by the timesheet day
 * headers — relative labels for the two most recent days, absolute
 * for older ones.
 */
export function formatRelativeDay(isoYmd: string | null | undefined): string {
  if (!isoYmd) return 'Unknown day';
  const today = todayLocalISODate();
  if (isoYmd === today) return 'Today';
  const [y, m, d] = today.split('-').map((s) => parseInt(s, 10));
  const yesterday = localISODate(new Date(y, m - 1, d - 1));
  if (isoYmd === yesterday) return 'Yesterday';
  return formatLocalShortDate(isoYmd, { weekday: true });
}
