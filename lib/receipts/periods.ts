// lib/receipts/periods.ts — "a given day, week, month, year", and the arrows that step between them.
//
// Owner, 2026-08-17: *"review the receipts for a given day, week, month, year in a carousel … arrows
// for navigating forward and backward"*.
//
// The receipts page has always had a from/to pair, and a from/to pair cannot answer "show me last
// month" without the person doing calendar arithmetic in their head — including the two bits people
// reliably get wrong, which month lengths and which day the week starts on. This module owns both.
//
// ── EVERYTHING IS NOON-UTC ARITHMETIC ───────────────────────────────────────────────────────────
//
// `new Date('2026-08-17')` is parsed as UTC midnight, and `.getDate()` on it in any timezone west of
// Greenwich answers 16. Anchoring every calculation at noon UTC puts twelve hours of slack on either
// side, so no offset and no DST transition can push a date onto the wrong day. `lib/hours/summarise.ts`
// does the same for the same reason.
//
// ── THE WEEK STARTS ON MONDAY ───────────────────────────────────────────────────────────────────
//
// Not a preference — a match. This repo already has TWO week conventions: `calendar-math.ts` defaults
// to Sunday for the month grid, `lib/marketing/date-range.ts` uses Monday. Receipts are an expense
// record that gets reconciled against the timesheet week, and `lib/hours/summarise.ts` buckets that
// week Monday-to-Sunday "matching /admin/my-hours". A receipt week offset by one day from the hours
// week would put Sunday's fuel in a different week from the Sunday hours it belongs to.

/** The presets, plus the escape hatch for a hand-typed range. */
export type Period = 'day' | 'week' | 'month' | 'year' | 'custom';

/** Inclusive on both ends, `YYYY-MM-DD`, which is what the receipts API already takes. */
export interface DateRange {
  from: string;
  to: string;
}

export const PERIODS: readonly Period[] = ['day', 'week', 'month', 'year'] as const;

export const PERIOD_LABELS: Record<Period, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
  custom: 'Custom',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** `YYYY-MM-DD` → a Date pinned to noon UTC. Invalid input yields an invalid Date, never a throw. */
function at(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(at(s).getTime());
}

function addDays(isoDate: string, n: number): string {
  const d = at(isoDate);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** The Monday on or before this date. See the header for why Monday. */
export function startOfWeek(isoDate: string): string {
  const d = at(isoDate);
  const dow = d.getUTCDay();              // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;   // Sunday belongs to the week that started six days ago
  d.setUTCDate(d.getUTCDate() - back);
  return iso(d);
}

/** Today, in the browser's own calendar rather than UTC's — "today" means the user's today. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The inclusive range for the period containing `anchor`.
 *
 * `custom` has no computable range — the caller's own from/to IS the answer — so it returns the
 * single anchor day rather than inventing one. Callers never take this path in practice; it exists
 * so the function is total and cannot throw into a render.
 */
export function periodRange(period: Period, anchor: string): DateRange {
  if (!isIsoDate(anchor)) return { from: anchor, to: anchor };
  const d = at(anchor);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();

  switch (period) {
    case 'day':
      return { from: anchor, to: anchor };
    case 'week': {
      const from = startOfWeek(anchor);
      return { from, to: addDays(from, 6) };
    }
    case 'month': {
      // Day 0 of the NEXT month is the last day of this one — which is how February and the
      // thirty-day months get their right answer without a lookup table or a leap-year rule.
      const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const last = new Date(Date.UTC(y, m + 1, 0, 12));
      return { from, to: iso(last) };
    }
    case 'year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:
      return { from: anchor, to: anchor };
  }
}

/**
 * Step the anchor one whole period back (`-1`) or forward (`+1`) — the arrows.
 *
 * The anchor is normalised to the START of its period before shifting, and that is what stops the
 * classic month-arithmetic bug: adding a month to 31 January lands on 31 February, which JavaScript
 * silently rolls forward to 3 March, so pressing "next" twice from 31 January skips February
 * entirely. Shifting from the 1st cannot overflow.
 */
export function shiftPeriod(period: Period, anchor: string, delta: number): string {
  if (!isIsoDate(anchor) || period === 'custom' || delta === 0) return anchor;
  const start = periodRange(period, anchor).from;

  switch (period) {
    case 'day':
      return addDays(start, delta);
    case 'week':
      return addDays(start, delta * 7);
    case 'month': {
      const d = at(start);
      return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1, 12)));
    }
    case 'year': {
      const d = at(start);
      return iso(new Date(Date.UTC(d.getUTCFullYear() + delta, 0, 1, 12)));
    }
    default:
      return anchor;
  }
}

/**
 * Which preset — if any — the current from/to happens to be.
 *
 * Needed because from/to is the source of truth, not the button. Somebody can type dates by hand, or
 * arrive on a shared URL, and the preset row has to reflect what is actually being shown rather than
 * what was last clicked. It also means the arrows keep working after a hand-typed range that happens
 * to line up with a real month.
 */
export function detectPeriod(from: string, to: string): Period {
  if (!isIsoDate(from) || !isIsoDate(to)) return 'custom';
  for (const p of PERIODS) {
    const r = periodRange(p, from);
    if (r.from === from && r.to === to) return p;
  }
  return 'custom';
}

/** Is this range the one containing today? Drives whether "next" is worth offering. */
export function isCurrentPeriod(period: Period, anchor: string, now: Date = new Date()): boolean {
  if (period === 'custom') return false;
  return periodRange(period, anchor).from === periodRange(period, todayIso(now)).from;
}

/**
 * What to print above the arrows — "August 2026", not "2026-08-01 → 2026-08-31".
 *
 * Says "Today" and "This week" when that is what it is, because the whole point of a preset row is
 * that nobody has to read a date to know where they are.
 */
export function describePeriod(period: Period, anchor: string, now: Date = new Date()): string {
  const range = periodRange(period, anchor);
  if (!isIsoDate(range.from)) return 'Custom range';
  const d = at(range.from);
  const current = isCurrentPeriod(period, anchor, now);

  switch (period) {
    case 'day': {
      if (current) return 'Today';
      if (range.from === addDays(todayIso(now), -1)) return 'Yesterday';
      return `${DAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
    }
    case 'week': {
      const end = at(range.to);
      const sameMonth = end.getUTCMonth() === d.getUTCMonth();
      const left = `${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
      const right = sameMonth
        ? `${end.getUTCDate()}`
        : `${MONTH_NAMES[end.getUTCMonth()].slice(0, 3)} ${end.getUTCDate()}`;
      return `${current ? 'This week · ' : ''}${left}–${right}, ${end.getUTCFullYear()}`;
    }
    case 'month':
      return `${current ? 'This month · ' : ''}${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    case 'year':
      return `${current ? 'This year · ' : ''}${d.getUTCFullYear()}`;
    default:
      return 'Custom range';
  }
}
