// lib/marketing/compare.ts — what a KPI delta is allowed to compare itself against. A5.
//
// A stat tile's delta is the most quietly dishonest element on a dashboard. It is one number with no
// visible working, everybody reads it, and there are two ways to get it wrong that both produce a
// plausible arrow pointing the wrong way.
//
// ── TRAP 1: COMPARING A PART-MONTH AGAINST A WHOLE ONE ──────────────────────────────────────────
//
// Today is the 12th. The range says 1–31 August, and the page shows August's spend so far: $181.
// The naive "vs last month" fetches ALL of July — a full 31 days — and reports that spend is down
// 60%. It is not. Twelve days of August are being measured against thirty-one days of July, and the
// tile has invented a collapse out of the calendar.
//
// So a period still in progress compares against **the same number of elapsed days** of the previous
// period: 1–12 August against 1–12 July. That is like-for-like, and it is what the comparison is
// labelled as — "vs 1–12 Jul", never a vague "vs last month" that hides which July it means.
//
// ── TRAP 2: SHIFTING BY A DAY COUNT INSTEAD OF BY A CALENDAR ────────────────────────────────────
//
// "Previous period = subtract the range's length" works for August (31 days back from 1 Aug is
// 1 Jul) and quietly breaks everywhere else: 31 days back from 1 March is 29 January. Whole months
// step by the calendar; whole years step by the calendar; everything else — a week, five arbitrary
// days — steps by its length, which is correct for those because they have no calendar identity.
//
// ── DIRECTION IS A PROPERTY OF THE METRIC, NOT OF THE SIGN ──────────────────────────────────────
//
// More clicks is good. More cost per click is bad. **More spend is neither** — a business that
// doubled its ad budget on purpose does not want a red arrow telling it off, and a business whose
// spend collapsed because its card expired does not want a green one. `direction` below is what
// stops the page cheering for the wrong thing.

import { fromIsoDate, toIsoDate, type DateRange } from './date-range';

export interface Comparison {
  /** Inclusive start of the period to compare against, `YYYY-MM-DD`. */
  from: string;
  /** Inclusive end, `YYYY-MM-DD`. */
  to: string;
  /** What the tile says under the delta, e.g. "vs 1–12 Jul". Names the actual dates. */
  label: string;
  /** True when the current period has not finished, so only its elapsed part is compared. */
  partial: boolean;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayCount = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
const isFirstOfMonth = (d: Date) => d.getDate() === 1;
const isLastOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() === d.getDate();

/**
 * The period this range should be measured against, and what to call it.
 *
 * Returns `null` only when the range itself is unusable. Every real range has a predecessor.
 */
export function previousPeriod(range: Pick<DateRange, 'from' | 'to'>, now: Date): Comparison | null {
  const from = fromIsoDate(range.from);
  const to = fromIsoDate(range.to);
  if (!from || !to || from > to) return null;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Trap 1. Only the part that has actually happened can be compared against anything.
  const effectiveTo = to > today ? today : to;
  const partial = to > today;
  if (effectiveTo < from) {
    // The whole range is in the future. There is nothing to compare, and inventing a predecessor
    // for it would put a delta on a tile whose value is definitionally zero.
    return null;
  }

  const elapsed = dayCount(from, effectiveTo);

  // Trap 2, and the rule that governs both calendar branches below:
  //
  //   FINISHED period  → the WHOLE previous calendar period. "2025 vs 2024" means all of 2024.
  //   PART-WAY period  → the same number of elapsed days of it. See trap 1.
  //
  // Doing it by elapsed days in both cases looks tidier and is wrong for the finished case whenever
  // the two periods differ in length: a finished 365-day 2025 would take the first 365 days of the
  // 366-day leap year 2024 and silently drop 31 December, and a finished 30-day June would compare
  // against 1–30 May, quietly discarding the 31st. Neither omission shows up anywhere.

  const isWholeMonth = isFirstOfMonth(from) && isLastOfMonth(to)
    && from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();

  if (isWholeMonth) {
    const prevStart = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    const prevMonthLength = new Date(from.getFullYear(), from.getMonth(), 0).getDate();
    // `min` also guards the 31st→February case: asking February for a 31st rolls into March and
    // compares a month against part of itself.
    const lastDay = partial ? Math.min(elapsed, prevMonthLength) : prevMonthLength;
    const prevEnd = new Date(prevStart.getFullYear(), prevStart.getMonth(), lastDay);
    return { from: toIsoDate(prevStart), to: toIsoDate(prevEnd), label: labelFor(prevStart, prevEnd), partial };
  }

  const isWholeYear = isFirstOfMonth(from) && from.getMonth() === 0
    && to.getMonth() === 11 && isLastOfMonth(to) && from.getFullYear() === to.getFullYear();

  if (isWholeYear) {
    const prevStart = new Date(from.getFullYear() - 1, 0, 1);
    const prevEnd = partial ? addDays(prevStart, elapsed - 1) : new Date(from.getFullYear() - 1, 11, 31);
    return { from: toIsoDate(prevStart), to: toIsoDate(prevEnd), label: labelFor(prevStart, prevEnd), partial };
  }

  // Everything else steps by its own length — correct precisely because a week or an arbitrary run
  // of days has no calendar identity to preserve.
  const prevEnd = addDays(from, -1);
  const prevStart = addDays(prevEnd, -(elapsed - 1));
  return { from: toIsoDate(prevStart), to: toIsoDate(prevEnd), label: labelFor(prevStart, prevEnd), partial };
}

/** "vs 1–12 Jul", "vs 4 Aug", "vs 20 Dec – 2 Jan". Names dates rather than saying "last period",
 *  because a delta whose baseline is unnamed cannot be checked by the person reading it. */
function labelFor(from: Date, to: Date): string {
  const d = (x: Date) => `${x.getDate()} ${MONTH_ABBR[x.getMonth()]}`;
  if (from.getTime() === to.getTime()) return `vs ${d(from)}`;
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return `vs ${from.getDate()}–${to.getDate()} ${MONTH_ABBR[to.getMonth()]}`;
  }
  return `vs ${d(from)} – ${d(to)}`;
}

/** Whether a rise in this metric is good news, bad news, or neither. */
export type GoodDirection = 'up' | 'down' | 'neutral';

export interface Delta {
  /** Change as a fraction of the previous value. `null` when there is nothing to divide by. */
  ratio: number | null;
  /** Absolute change, always available. */
  absolute: number;
  /** How the arrow should be coloured: good, bad, or no opinion. */
  tone: 'good' | 'bad' | 'neutral';
}

/**
 * Compare two values for one metric.
 *
 * **A rise from zero has no percentage**, and this is the case that produces the silliest numbers on
 * real dashboards: last month's £0 to this month's £180 is not "+18000%", it is "up from nothing".
 * `ratio` is null and the page prints words instead.
 */
export function deltaOf(current: number, previous: number, direction: GoodDirection): Delta {
  const absolute = current - previous;
  const ratio = previous > 0 ? absolute / previous : null;

  let tone: Delta['tone'] = 'neutral';
  // A change of exactly nothing has no tone. Colouring a flat month green because `up` is good
  // would claim an improvement that did not happen.
  if (direction !== 'neutral' && absolute !== 0) {
    const rose = absolute > 0;
    tone = rose === (direction === 'up') ? 'good' : 'bad';
  }
  return { ratio, absolute, tone };
}

/**
 * Which way is up, per metric.
 *
 * **Spend is deliberately `neutral`.** Every other choice here is a judgement the dashboard is not
 * entitled to make: spending more is what happens when you scale a campaign that works, and
 * spending less is what happens when your card expires. Green and red both lie.
 */
export const METRIC_DIRECTION = {
  spend: 'neutral',
  impressions: 'up',
  clicks: 'up',
  conversions: 'up',
  ctr: 'up',
  cpc: 'down',
  costPerConversion: 'down',
} as const satisfies Record<string, GoodDirection>;
