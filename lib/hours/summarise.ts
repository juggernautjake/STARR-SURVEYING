// lib/hours/summarise.ts
//
// Hours and pay, totalled by day, week, month or year.
//
// Owner, 2026-08-12: *"They will be able to review their hours by day, week, month, and year."*
//
// `/admin/my-hours` shows one week and nothing else. Every figure needed for the other three grains
// is already on the rows; what was missing is the arithmetic. Kept pure and dependency-free so the
// three things below can be tested without a database — each of them is a real way this goes wrong,
// and two of them are already live bugs elsewhere in this repo's history.
//
// ── 1. AN ADJUSTED ENTRY IS WORTH ITS ADJUSTED HOURS ─────────────────────────────────────────────
//
// When an approver corrects 10h to 8h, the row keeps BOTH: `hours` is what the employee claimed and
// `adjusted_hours` is what was allowed. Summing `hours` reports the claim as though it had been
// agreed — which is the exact defect that was fixed on the approval page's totals in August. The
// same trap sits here, so this uses `effectiveHours` from the one module that owns the rule rather
// than reimplementing it.
//
// ── 2. THE PAY ON THE ROW IS NOT ALWAYS THE PAY ──────────────────────────────────────────────────
//
// `daily_time_logs.total_pay` is what the RULES priced the day at. `time_log_pay_decisions.total_pay`
// is what a PERSON decided it was worth, and it wins — that is what the `time_log_pay` view means by
// `COALESCE(d.total_pay, l.total_pay)`. Totalling the row's own figure would quietly report the
// pre-decision number and disagree with what is actually owed.
//
// ── 3. DATES ARE STRINGS, AND MUST STAY STRINGS ──────────────────────────────────────────────────
//
// `log_date` is a DATE — '2026-08-01', with no time and no zone. Parsing it into a `Date` to find
// its month puts it at midnight UTC, and west of Greenwich that is the 31st of the previous month
// locally. A day landing in the wrong month is not a rounding error on a payroll screen. So every
// bucket key is derived by slicing the string, and the only place a `Date` appears is week
// arithmetic, which is done at noon UTC to stay clear of the boundary entirely.

import { effectiveHours } from './hours-flags';

export type Grain = 'day' | 'week' | 'month' | 'year';

/** A time log, narrowed to what totalling needs. */
export interface SummarisableLog {
  log_date: string;
  hours: number;
  adjusted_hours?: number | null;
  status: string;
  total_pay?: number | null;
  /** The decision a person made about this entry, when there is one. Outranks `total_pay`. */
  pay_decision?: { total_pay?: number | null } | null;
}

export interface HoursBucket {
  /** Sortable and stable: '2026-08-11' · '2026-08-10' (week, its Monday) · '2026-08' · '2026'. */
  key: string;
  /** First and last date the bucket covers, so a caller can fetch or link to exactly this span. */
  from: string;
  to: string;
  /** Hours that count — everything except rejected. */
  hours: number;
  /** Hours an approver turned down. Reported separately, never inside `hours`. */
  rejectedHours: number;
  /** Hours nobody has decided on yet (`pending` / `disputed`). */
  awaitingHours: number;
  /** Hours approved or adjusted. */
  settledHours: number;
  /** Dollars, from the decision when there is one. */
  pay: number;
  /**
   * Hours that count but carry no rate at all.
   *
   * Deliberately NOT folded into `pay` as zero. An hour with no rate is waiting on somebody to say
   * what it is worth; an hour priced at zero is a decision that it is worth nothing. A screen that
   * cannot tell them apart is a screen that reports unpaid work as settled.
   */
  unpricedHours: number;
  entries: number;
}

const isRejected = (s: string): boolean => s === 'rejected';
const isAwaiting = (s: string): boolean => s === 'pending' || s === 'disputed';

/** The pay a person actually decided, falling back to what the rules priced. Null means neither. */
export function decidedPay(log: SummarisableLog): number | null {
  const decided = log.pay_decision?.total_pay;
  if (typeof decided === 'number' && Number.isFinite(decided)) return decided;
  if (typeof log.total_pay === 'number' && Number.isFinite(log.total_pay)) return log.total_pay;
  return null;
}

/** '2026-08-11' → its Monday, as a string. Noon UTC keeps the arithmetic away from any boundary. */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const day = d.getUTCDay();                       // 0 = Sunday
  const back = day === 0 ? 6 : day - 1;            // Monday-based week, matching /admin/my-hours
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The last day of the month a date falls in — day 0 of the next month. */
function endOfMonth(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const d = new Date(Date.UTC(year, month, 0, 12));
  return d.toISOString().slice(0, 10);
}

function bucketFor(iso: string, grain: Grain): { key: string; from: string; to: string } {
  switch (grain) {
    case 'day':
      return { key: iso, from: iso, to: iso };
    case 'week': {
      const from = mondayOf(iso);
      return { key: from, from, to: addDaysISO(from, 6) };
    }
    case 'month': {
      const key = iso.slice(0, 7);
      return { key, from: `${key}-01`, to: endOfMonth(iso) };
    }
    case 'year':
    default: {
      const key = iso.slice(0, 4);
      return { key, from: `${key}-01-01`, to: `${key}-12-31` };
    }
  }
}

const money = (n: number): number => Math.round(n * 100) / 100;
const hoursRounded = (n: number): number => Math.round(n * 100) / 100;

/**
 * Total a set of logs into buckets, newest first.
 *
 * Rows with an unparseable `log_date` are dropped rather than bucketed under a guessed date: a day
 * appearing in the wrong period is worse than a day missing from a total that says how many entries
 * it counted.
 */
export function summariseHours(logs: readonly SummarisableLog[], grain: Grain): HoursBucket[] {
  const byKey = new Map<string, HoursBucket>();

  for (const log of logs) {
    const iso = (log.log_date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;

    const { key, from, to } = bucketFor(iso, grain);
    const bucket = byKey.get(key) ?? {
      key, from, to,
      hours: 0, rejectedHours: 0, awaitingHours: 0, settledHours: 0,
      pay: 0, unpricedHours: 0, entries: 0,
    };

    const h = effectiveHours(log);
    bucket.entries += 1;

    if (isRejected(log.status)) {
      bucket.rejectedHours += h;
    } else {
      bucket.hours += h;
      if (isAwaiting(log.status)) bucket.awaitingHours += h;
      else bucket.settledHours += h;

      const pay = decidedPay(log);
      if (pay === null) bucket.unpricedHours += h;
      else bucket.pay += pay;
    }

    byKey.set(key, bucket);
  }

  return [...byKey.values()]
    .map((b) => ({
      ...b,
      hours: hoursRounded(b.hours),
      rejectedHours: hoursRounded(b.rejectedHours),
      awaitingHours: hoursRounded(b.awaitingHours),
      settledHours: hoursRounded(b.settledHours),
      unpricedHours: hoursRounded(b.unpricedHours),
      pay: money(b.pay),
    }))
    // Newest first: the period somebody is asking about is nearly always the most recent one.
    .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

/** Everything in one line, for the top of the screen. */
export function totalOf(buckets: readonly HoursBucket[]): HoursBucket {
  return buckets.reduce<HoursBucket>(
    (acc, b) => ({
      key: 'total',
      from: acc.from && acc.from < b.from ? acc.from : b.from,
      to: acc.to > b.to ? acc.to : b.to,
      hours: hoursRounded(acc.hours + b.hours),
      rejectedHours: hoursRounded(acc.rejectedHours + b.rejectedHours),
      awaitingHours: hoursRounded(acc.awaitingHours + b.awaitingHours),
      settledHours: hoursRounded(acc.settledHours + b.settledHours),
      unpricedHours: hoursRounded(acc.unpricedHours + b.unpricedHours),
      pay: money(acc.pay + b.pay),
      entries: acc.entries + b.entries,
    }),
    {
      key: 'total', from: '', to: '',
      hours: 0, rejectedHours: 0, awaitingHours: 0, settledHours: 0, pay: 0, unpricedHours: 0, entries: 0,
    },
  );
}

/** A human label for a bucket key. Kept beside the keys so the two cannot drift apart. */
export function labelFor(bucket: Pick<HoursBucket, 'key' | 'from' | 'to'>, grain: Grain): string {
  const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    asDate(iso).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });

  switch (grain) {
    case 'day':
      return fmt(bucket.key, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    case 'week':
      return `${fmt(bucket.from, { day: 'numeric', month: 'short' })} – ${fmt(bucket.to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    case 'month':
      return fmt(`${bucket.key}-01`, { month: 'long', year: 'numeric' });
    case 'year':
    default:
      return bucket.key;
  }
}
