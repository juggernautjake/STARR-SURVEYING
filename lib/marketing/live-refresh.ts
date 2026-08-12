// lib/marketing/live-refresh.ts — what "in real time" has to mean to be honest. A4.
//
// Owner: *"It should just show all of that info by default in real time."*
//
// ── TWO DIFFERENT REFRESHES, AND CONFLATING THEM IS THE MISTAKE ─────────────────────────────────
//
// There are two clocks behind these numbers and they run at wildly different speeds:
//
//   READ   — our database → the page. Cheap, instant, no quota. Can run often.
//   IMPORT — Google → our database. Costs API quota, and Google's own figures only settle over
//            hours; conversions in particular are attributed days late.
//
// Polling Google every thirty seconds would burn quota to re-fetch a number that had not changed. So
// the page re-READS often and re-IMPORTS rarely, and the freshness stamp reports the *import* time,
// because that is the age of the data — not the age of the last database query, which is always a
// few seconds and would make a two-day-old figure look fresh.
//
// ── A CLOSED MONTH IS NOT LIVE, AND POLLING IT IS PURE WASTE ────────────────────────────────────
//
// "Auto-refresh on an interval" applied literally would poll July 2025 forever. A range that ended
// in the past cannot change: the import window has closed, and every request returns byte-identical
// data. `isLiveRange` is what stops the page working hard to learn nothing.
//
// ── EVERY FUNCTION TAKES THE CLOCK ──────────────────────────────────────────────────────────────
//
// Same rule as `date-range.ts`: `now` is an argument, never `Date.now()` read inside. It is what
// makes "is this stale at 23:59 on the 31st" a test rather than a thing you find out in December.

import type { DateRange } from './date-range';

/** How often the page re-reads our own database while it is visible. */
export const READ_INTERVAL_MS = 60_000;

/**
 * How often the page asks GOOGLE for new figures. Fifteen minutes, and the number is chosen from
 * what actually changes rather than from what feels responsive: Google's reporting lags real
 * activity by minutes to hours, so polling every minute would spend fifteen times the quota to
 * receive the same rows fourteen times.
 */
export const IMPORT_INTERVAL_MS = 15 * 60_000;

/**
 * Past which age the page stops presenting a figure as current.
 *
 * Two hours, not two minutes. The nightly cron is the normal source, so a stamp reading "4 hours
 * ago" at noon is completely healthy and flagging it would train everyone to ignore the flag. What
 * this catches is the failure this whole area has already had once: an import that stopped working
 * and left figures ageing quietly behind a confident-looking dashboard.
 */
export const STALE_AFTER_MS = 2 * 60 * 60_000;

/**
 * Does this range still cover time that has not finished happening?
 *
 * True for anything reaching today — the only case where new data can arrive. A closed range is
 * final, and the page should say "final" rather than pretend to be watching it.
 */
export function isLiveRange(range: Pick<DateRange, 'to'>, now: Date): boolean {
  return range.to >= isoDay(now);
}

/** Local calendar day, not UTC. A range picked in a US timezone at 8pm is "today" to the person
 *  looking at it, and `toISOString()` would have already rolled it over to tomorrow. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface Freshness {
  /** What the page prints, e.g. "updated 14:32" or "last updated 3 days ago". */
  label: string;
  /** True when the figures are old enough that presenting them as current would be misleading. */
  stale: boolean;
  /** Milliseconds since the import, or null when nothing has ever been imported. */
  ageMs: number | null;
}

/**
 * Describe how old the figures are, in words.
 *
 * **Never returns an empty label.** "Real time" that silently is not is worse than a timestamp, and
 * the way that happens in practice is a component rendering nothing when it has no timestamp — so
 * the page looks confident precisely in the case where it knows least.
 */
export function describeFreshness(lastImportedAt: string | null | undefined, now: Date): Freshness {
  if (!lastImportedAt) {
    return { label: 'never imported from Google', stale: true, ageMs: null };
  }
  const then = Date.parse(lastImportedAt);
  if (!Number.isFinite(then)) {
    // An unparseable timestamp is a bug, but rendering "Invalid Date" or nothing at all both read as
    // "no information". Saying the age is unknown is the only honest option.
    return { label: 'last updated at an unknown time', stale: true, ageMs: null };
  }

  const ageMs = Math.max(0, now.getTime() - then);
  const stale = ageMs > STALE_AFTER_MS;

  const mins = Math.floor(ageMs / 60_000);
  if (mins < 1) return { label: 'updated just now', stale, ageMs };
  if (mins < 60) return { label: `updated ${mins} min ago`, stale, ageMs };

  const hours = Math.floor(mins / 60);
  if (hours < 24) return { label: `updated ${hours} hour${hours === 1 ? '' : 's'} ago`, stale, ageMs };

  const days = Math.floor(hours / 24);
  return { label: `last updated ${days} day${days === 1 ? '' : 's'} ago`, stale, ageMs };
}

/**
 * Should the page pull from Google right now?
 *
 * Three conditions, and each one exists to prevent a specific waste or lie:
 *
 *   visible    — a backgrounded tab polling all weekend spends quota nobody is reading.
 *   live range — a closed month cannot change; see above.
 *   interval   — enough time has passed for Google to plausibly have anything new.
 */
export function shouldImport(opts: {
  visible: boolean;
  range: Pick<DateRange, 'to'>;
  lastAttemptAt: number | null;
  now: Date;
}): boolean {
  const { visible, range, lastAttemptAt, now } = opts;
  if (!visible) return false;
  if (!isLiveRange(range, now)) return false;
  // `lastAttemptAt`, not `lastImportedAt`: a failing import must not retry every tick. Keying the
  // interval on success would turn a broken connection into a request loop against Google.
  if (lastAttemptAt === null) return true;
  return now.getTime() - lastAttemptAt >= IMPORT_INTERVAL_MS;
}
