// lib/hours/by-employee.ts — a timesheet queue arranged by PERSON, not by row.
//
// Owner, 2026-09-19: "I want it so that the employees with pending hours are listed first, with the
// employee with the most recently clocked hours being at the top … they will see john and jacob's
// names, and then underneath there names it will show how many hours they have clocked that are in
// need of approval. I want it to show a few stats actually. How many hours have been logged for
// that week, how many have been approved, how many have been paid."
//
// The approvals queue has always been a flat list of days. That is the right shape for "approve
// everything" and the wrong one for the question actually being asked, which is about people: whose
// hours are waiting, and how much of what they have worked has been dealt with. Forty rows from six
// people is six answers hidden in forty places.
//
// Pure. No React, no fetching, no dates beyond the strings the rows already carry. Tested in
// __tests__/admin/hours-by-employee.test.ts.

import { effectiveHours } from './hours-flags';

/** One row as this module needs it. A superset is fine — every caller passes the whole time log. */
export interface EmployeeLog {
  id: string;
  user_email: string | null;
  /** 'YYYY-MM-DD'. */
  log_date: string | null;
  hours: number | string | null;
  /** What an approver decided is payable, when they have changed it. */
  adjusted_hours?: number | string | null;
  status?: string | null;
  lunch_minutes?: number | null;
  /** When the row arrived — what "most recently clocked" is measured by. */
  created_at?: string | null;
  updated_at?: string | null;
}

export interface EmployeeGroup<T extends EmployeeLog> {
  email: string;
  logs: T[];
  /** How many rows are still waiting on somebody. */
  pendingCount: number;
  /** Hours in each state, over whatever range the caller passed in. */
  pendingHours: number;
  loggedHours: number;
  approvedHours: number;
  paidHours: number;
  /** Minutes at lunch across the range, and how many days actually reported one. */
  lunchMinutes: number;
  lunchDays: number;
  /** The most recent row, for ordering. Null when nothing in range has a usable timestamp. */
  lastClockedAt: string | null;
}

/** The hours that count for a row: what an approver decided, else what was clocked.
 *
 *  DELEGATES to `effectiveHours`, which has been the single definition of this rule since it was
 *  pulled out of four modules on 2026-08-12. Re-implementing it here would have made five, and the
 *  one that drifted would be whichever screen nobody was looking at.
 *
 *  The coercion is this module's own business: rows arrive from the API with `numeric` columns the
 *  driver hands back as STRINGS, and `effectiveHours` is typed for numbers. A silent NaN here would
 *  zero somebody's week. */
export function payableHours(log: EmployeeLog): number {
  const n = effectiveHours({
    hours: Number(log.hours),
    adjusted_hours: log.adjusted_hours === null || log.adjusted_hours === undefined
      ? null
      : Number(log.adjusted_hours),
  });
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** When this row landed, as a sortable string. */
function stamp(log: EmployeeLog): string | null {
  // `created_at` before `updated_at`: an approver touching a row weeks later must not vault that
  // person to the top of a queue ordered by who worked most recently. `log_date` last, because it
  // is the DAY worked and a backdated entry submitted this morning is recent news.
  return log.created_at ?? log.updated_at ?? log.log_date ?? null;
}

const later = (a: string | null, b: string | null): string | null => {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
};

export interface GroupOptions<T extends EmployeeLog> {
  /** Whether a row has been paid out. Injected because "paid" is not a fact this module can see —
   *  it lives in the payout side of the app — and inventing a column here would be a guess that
   *  looked like an answer. */
  isPaid?: (log: T) => boolean;
}

/**
 * Group time logs by the person who submitted them, and order them the way an approver works.
 *
 * ORDER: anybody with something pending comes first, because that is the job. Within each half,
 * most recently clocked at the top — the owner's words, and it is also the useful order: the crew
 * who were out yesterday are the ones whose day somebody still remembers.
 *
 * A person with nothing pending is still listed. Their stats are the point of the row by then
 * ("has Jacob been paid for last week?"), and dropping them would make the page unable to answer a
 * question about anybody who is up to date.
 */
export function groupByEmployee<T extends EmployeeLog>(
  logs: readonly T[],
  options: GroupOptions<T> = {},
): Array<EmployeeGroup<T>> {
  const isPaid = options.isPaid ?? (() => false);
  const byEmail = new Map<string, EmployeeGroup<T>>();

  for (const log of logs) {
    const email = (log.user_email ?? '').trim().toLowerCase();
    // A row with nobody on it cannot be shown under anybody's name. It stays in the flat list,
    // where it is still visible, rather than being filed under an invented heading.
    if (!email) continue;

    let g = byEmail.get(email);
    if (!g) {
      g = {
        email,
        logs: [],
        pendingCount: 0,
        pendingHours: 0,
        loggedHours: 0,
        approvedHours: 0,
        paidHours: 0,
        lunchMinutes: 0,
        lunchDays: 0,
        lastClockedAt: null,
      };
      byEmail.set(email, g);
    }

    g.logs.push(log);
    const hours = payableHours(log);
    const status = (log.status ?? 'pending').toLowerCase();

    g.loggedHours += hours;
    if (status === 'pending') { g.pendingCount += 1; g.pendingHours += hours; }
    // 'adjusted' counts as approved: an approver changed the number and then accepted it, which is
    // a decision, not a row still waiting for one.
    if (status === 'approved' || status === 'adjusted') g.approvedHours += hours;
    if (isPaid(log)) g.paidHours += hours;

    if (typeof log.lunch_minutes === 'number' && log.lunch_minutes >= 0) {
      g.lunchMinutes += log.lunch_minutes;
      g.lunchDays += 1;
    }

    g.lastClockedAt = later(g.lastClockedAt, stamp(log));
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const groups = [...byEmail.values()].map((g) => ({
    ...g,
    pendingHours: round(g.pendingHours),
    loggedHours: round(g.loggedHours),
    approvedHours: round(g.approvedHours),
    paidHours: round(g.paidHours),
    // Newest day first inside a person, matching the flat list this replaces.
    logs: [...g.logs].sort((a, b) => (stamp(b) ?? '').localeCompare(stamp(a) ?? '')),
  }));

  return groups.sort((a, b) => {
    const aWaiting = a.pendingCount > 0 ? 0 : 1;
    const bWaiting = b.pendingCount > 0 ? 0 : 1;
    if (aWaiting !== bWaiting) return aWaiting - bWaiting;
    const byTime = (b.lastClockedAt ?? '').localeCompare(a.lastClockedAt ?? '');
    // Alphabetical only as a tie-break, so the order is stable between renders rather than
    // depending on the order rows came back from the database.
    return byTime !== 0 ? byTime : a.email.localeCompare(b.email);
  });
}

/** "1h 45m", "45m", "—". For a lunch total, which is minutes and reads badly as a decimal. */
export function formatLunch(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** The name to show for an email, when that is all there is.
 *
 *  `john.smith@starr…` becomes "John Smith". A guess, but a readable one, and it is only ever used
 *  where no profile name is available — the alternative is a column of email addresses. */
export function nameFromEmail(email: string): string {
  const local = (email.split('@')[0] ?? '').trim();
  if (!local) return email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || email;
}
