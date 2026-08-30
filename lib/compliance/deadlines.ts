// lib/compliance/deadlines.ts — turns a record's cadence into actual dates.
//
// The half of the owner's ask that a markdown checklist cannot do: *"a system that keeps track of all time
// sensitive files and documents that require filing at certain times or renewals."* `records-catalogue.ts`
// says a thing recurs annually on 15 May; this says when that next falls, how many days away it is, and
// whether it is already late.
//
// ── DESIGN RULES ────────────────────────────────────────────────────────────────────────────────────
//
// **`today` is a parameter, never `Date.now()`.** Every function here is pure, so "what does the dashboard
// show on 30 December?" is a test rather than a thing you wait a year to find out. Date bugs in a compliance
// tracker are the expensive kind — a reminder that fires late is worse than no reminder, because it was
// trusted.
//
// **All arithmetic is on UTC calendar dates, not timestamps.** A filing deadline is a calendar day; running
// it through local time is how a deadline shifts by one day for half the year. Dates go in and out as
// `YYYY-MM-DD` strings and are compared as such.
//
// **A window's OPENING is a first-class event.** The RPLS licence renews between 1 November and 31
// December. Alerting only on the due date means alerting when you are nearly late, so `annual_window`
// records surface as soon as the window opens and say so.
import {
  RECORDS, type RecordDefinition, type Recurrence, type Retention,
} from './records-catalogue';

/** `YYYY-MM-DD`. The only date format that crosses this module's boundary. */
export type IsoDate = string;

const DAY_MS = 86_400_000;

/** Parse `YYYY-MM-DD` into a UTC epoch-day count. Returns null for anything malformed. */
export function toEpochDay(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, mo - 1, d);
  // Round-trip check catches 31 February and friends: Date.UTC rolls them forward silently, which would
  // make an invalid date quietly become a valid one a few days later.
  const back = new Date(ms);
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.floor(ms / DAY_MS);
}

export function fromEpochDay(day: number): IsoDate {
  const d = new Date(day * DAY_MS);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

export function daysBetween(from: IsoDate, to: IsoDate): number | null {
  const a = toEpochDay(from);
  const b = toEpochDay(to);
  return a === null || b === null ? null : b - a;
}

export function addYears(iso: IsoDate, years: number): IsoDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  return `${String(Number(m[1]) + years).padStart(4, '0')}-${m[2]}-${m[3]}`;
}

/**
 * How urgent a dated obligation is.
 *
 * The thresholds are deliberately generous at the top end: a licence renewal noticed 90 days out is a
 * calendar entry, while one noticed 5 days out is a scramble — and several items here (a D-U-N-S update, a
 * TBPELS renewal) genuinely take weeks of third-party turnaround, so "due soon" at 30 days is the point
 * where starting matters.
 */
export type Urgency = 'overdue' | 'due_soon' | 'upcoming' | 'later';

export const DUE_SOON_DAYS = 30;
export const UPCOMING_DAYS = 90;

export function urgencyFor(daysUntil: number): Urgency {
  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= DUE_SOON_DAYS) return 'due_soon';
  if (daysUntil <= UPCOMING_DAYS) return 'upcoming';
  return 'later';
}

export interface Occurrence {
  recordId: string;
  title: string;
  category: string;
  dueOn: IsoDate;
  /** Set for `annual_window` records — when you can start. */
  opensOn?: IsoDate;
  daysUntil: number;
  urgency: Urgency;
  /** True once a window has opened and the work can actually be done. */
  windowOpen?: boolean;
  feeUsd?: number;
  authority?: string;
  formNumber?: string;
  sourceUrl?: string;
  note?: string;
}

/** The next time a fixed month/day falls on or after `today`. */
function nextAnnual(today: IsoDate, month: number, day: number): IsoDate | null {
  const t = toEpochDay(today);
  if (t === null) return null;
  const year = Number(today.slice(0, 4));
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const thisYear = `${year}-${mm}-${dd}`;
  const thisYearDay = toEpochDay(thisYear);
  if (thisYearDay === null) return null;
  if (thisYearDay >= t) return thisYear;
  return `${year + 1}-${mm}-${dd}`;
}

/** Quarter ends, as the quarterly-obligation stand-in. */
const QUARTER_DUE: ReadonlyArray<[number, number]> = [[1, 15], [4, 15], [6, 15], [9, 15]];

function nextQuarterly(today: IsoDate): IsoDate | null {
  const t = toEpochDay(today);
  if (t === null) return null;
  const year = Number(today.slice(0, 4));
  for (const [m, d] of QUARTER_DUE) {
    const iso = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const day = toEpochDay(iso);
    if (day !== null && day >= t) return iso;
  }
  return `${year + 1}-01-15`;
}

function nextMonthly(today: IsoDate): IsoDate | null {
  const t = toEpochDay(today);
  if (t === null) return null;
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  // The 10th, as a books-closed-by date.
  const thisMonth = `${year}-${String(month).padStart(2, '0')}-10`;
  const thisDay = toEpochDay(thisMonth);
  if (thisDay !== null && thisDay >= t) return thisMonth;
  const ny = month === 12 ? year + 1 : year;
  const nm = month === 12 ? 1 : month + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-10`;
}

/**
 * The next date this record needs attention, or null when it has no calendar at all.
 *
 * `once`, `per_event` and `ongoing` return null BY DESIGN — they are real obligations but they are not
 * dated, and manufacturing a fake due date for them would flood the deadline list with items that can
 * never be "done on time". They belong on the checklist, not the calendar.
 *
 * An `expiresOn` in the past wins over the computed cadence: a licence that already lapsed is overdue
 * NOW, not on its next renewal window. That is the one case where the two disagree, and getting it
 * backwards would report an expired registration as comfortably nine months away.
 */
export function nextOccurrence(def: RecordDefinition, today: IsoDate): Occurrence | null {
  const t = toEpochDay(today);
  if (t === null) return null;

  const base = {
    recordId: def.id,
    title: def.title,
    category: def.category,
    ...(def.feeUsd !== undefined ? { feeUsd: def.feeUsd } : {}),
    ...(def.authority ? { authority: def.authority } : {}),
    ...(def.formNumber ? { formNumber: def.formNumber } : {}),
    ...(def.sourceUrl ? { sourceUrl: def.sourceUrl } : {}),
    ...(def.note ? { note: def.note } : {}),
  };

  // Already lapsed — surface it as overdue against its own expiry date.
  if (def.expiresOn) {
    const exp = toEpochDay(def.expiresOn);
    if (exp !== null && exp < t) {
      return { ...base, dueOn: def.expiresOn, daysUntil: exp - t, urgency: 'overdue' };
    }
  }

  const dated = nextDueDate(def.recurrence, today);
  if (!dated) return null;

  const dueDay = toEpochDay(dated.dueOn);
  if (dueDay === null) return null;
  const daysUntil = dueDay - t;

  const occ: Occurrence = {
    ...base,
    dueOn: dated.dueOn,
    daysUntil,
    urgency: urgencyFor(daysUntil),
  };
  if (dated.opensOn) {
    occ.opensOn = dated.opensOn;
    const opens = toEpochDay(dated.opensOn);
    occ.windowOpen = opens !== null && opens <= t;
    // AN OPEN WINDOW IS ACTIONABLE NOW, so it is never merely 'upcoming'. The RPLS window opens 1
    // November and closes 31 December — 60 days, which the day-count bands as 'upcoming' and would sort
    // below things that cannot yet be done at all. Modelling the window was pointless if its opening did
    // not change the priority, so opening it promotes to at least 'due_soon'. Overdue is left alone: it
    // is already worse.
    if (occ.windowOpen && (occ.urgency === 'upcoming' || occ.urgency === 'later')) {
      occ.urgency = 'due_soon';
    }
  }
  return occ;
}

function nextDueDate(r: Recurrence, today: IsoDate): { dueOn: IsoDate; opensOn?: IsoDate } | null {
  switch (r.kind) {
    case 'annual': {
      const dueOn = nextAnnual(today, r.dueMonth, r.dueDay);
      return dueOn ? { dueOn } : null;
    }
    case 'annual_window': {
      const dueOn = nextAnnual(today, r.dueMonth, r.dueDay);
      if (!dueOn) return null;
      // The window opens in the SAME cycle as that due date. When the due date rolled to next year, the
      // opening did too — otherwise a January view would report a window that opened last November as
      // currently open, and it closed on 31 December.
      const dueYear = Number(dueOn.slice(0, 4));
      const opensYear = r.opensMonth > r.dueMonth ? dueYear - 1 : dueYear;
      const opensOn = `${opensYear}-${String(r.opensMonth).padStart(2, '0')}-${String(r.opensDay).padStart(2, '0')}`;
      return { dueOn, opensOn };
    }
    case 'quarterly': {
      const dueOn = nextQuarterly(today);
      return dueOn ? { dueOn } : null;
    }
    case 'monthly': {
      const dueOn = nextMonthly(today);
      return dueOn ? { dueOn } : null;
    }
    case 'once':
    case 'per_event':
    case 'ongoing':
      return null;
  }
}

/**
 * Every dated obligation inside `horizonDays`, soonest first, overdue first of all.
 *
 * Overdue items are never dropped by the horizon — a deadline missed 200 days ago is still the most
 * urgent thing on the list, and a horizon that hid it would make the tracker actively misleading.
 */
export function upcomingDeadlines(
  today: IsoDate,
  horizonDays = UPCOMING_DAYS,
  defs: readonly RecordDefinition[] = RECORDS,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const def of defs) {
    const occ = nextOccurrence(def, today);
    if (!occ) continue;
    if (occ.urgency !== 'overdue' && occ.daysUntil > horizonDays) continue;
    out.push(occ);
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil || a.title.localeCompare(b.title));
}

/** Just the late ones. What a dashboard leads with. */
export function overdueDeadlines(
  today: IsoDate,
  defs: readonly RecordDefinition[] = RECORDS,
): Occurrence[] {
  return upcomingDeadlines(today, Number.MAX_SAFE_INTEGER, defs).filter((o) => o.urgency === 'overdue');
}

/**
 * When a record created on `from` may be destroyed — or null when never.
 *
 * Returns null for both `permanent` and `while_active`, and that conflation is deliberate: neither has a
 * computable destruction date, and the only safe answer to "can I delete this?" for either is no. A
 * caller that needs to tell them apart should read `retention.kind`.
 */
export function retentionExpiry(retention: Retention, from: IsoDate): IsoDate | null {
  if (retention.kind !== 'years') return null;
  return addYears(from, retention.years);
}

/** True when a record kept from `from` may be destroyed as of `today`. Conservative: unknown → false. */
export function mayBeDestroyed(retention: Retention, from: IsoDate, today: IsoDate): boolean {
  const expiry = retentionExpiry(retention, from);
  if (!expiry) return false;
  const days = daysBetween(expiry, today);
  return days !== null && days >= 0;
}

/** Counts for a dashboard header. */
export interface DeadlineSummary {
  overdue: number;
  dueSoon: number;
  upcoming: number;
  windowsOpen: number;
}

export function deadlineSummary(
  today: IsoDate,
  defs: readonly RecordDefinition[] = RECORDS,
): DeadlineSummary {
  const all = upcomingDeadlines(today, Number.MAX_SAFE_INTEGER, defs);
  return {
    overdue: all.filter((o) => o.urgency === 'overdue').length,
    dueSoon: all.filter((o) => o.urgency === 'due_soon').length,
    upcoming: all.filter((o) => o.urgency === 'upcoming').length,
    windowsOpen: all.filter((o) => o.windowOpen === true).length,
  };
}
