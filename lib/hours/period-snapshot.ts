// lib/hours/period-snapshot.ts
//
// What a pay period held at the moment it was closed.
//
// ── WHY THE FIGURE IS TAKEN AND KEPT ─────────────────────────────────────────────────────────────
//
// A closed period does not stop moving. Admins are exempt from locks by design, so hours get
// adjusted, pay decisions get revised, and since 2026-08-12 the office can add whole days on
// somebody's behalf. Re-totalling the week later answers "what does it hold now" — and there is no
// way at all to recover what it held when a person decided it was finished, which is the figure a
// payment was made against.
//
// ── THE THREE RULES IT MUST NOT GET WRONG ────────────────────────────────────────────────────────
//
// These are the same three that `lib/hours/summarise.ts` documents, and they are restated here
// rather than shared because the two answer different questions and would drift into a shared
// abstraction that fits neither. Getting any of them wrong puts a wrong number in a permanent record:
//
//   1. **Adjusted hours win.** A 10h claim an approver cut to 8h is worth 8. Summing `hours` records
//      the claim as though it had been agreed.
//   2. **A person's pay decision outranks the rules' figure**, matching `COALESCE(d.total_pay,
//      l.total_pay)` in the `time_log_pay` view.
//   3. **Rejected hours are not in the period.** They are not owed and were never going to be paid.
//
// And one more that only matters because this is a permanent record: an hour with **no rate** adds
// nothing to the money rather than zero. Recording it as $0 would freeze "worked for free" into a
// snapshot nobody can correct afterwards.

import { effectiveHours } from './hours-flags';

/** A time log, narrowed to what the snapshot needs. */
export interface SnapshotEntry {
  user_email?: string | null;
  hours: number;
  adjusted_hours?: number | null;
  status: string;
  total_pay?: number | null;
  pay_decision?: { total_pay?: number | null } | null;
}

export interface PeriodSnapshot {
  /** Hours the period held, excluding rejected ones. */
  closed_hours: number;
  /** What those hours were priced at, in CENTS — the column is BIGINT and dollars are a float. */
  closed_pay_cents: number;
  /** Entries counted, including rejected ones: the count answers "has anything been ADDED since". */
  closed_entry_count: number;
  /** Distinct people with hours in the period. */
  closed_people: number;
}

/**
 * Total a period for the record.
 *
 * Pure, so the figure that gets frozen into a lock row can be checked without a database.
 */
export function snapshotPeriod(entries: readonly SnapshotEntry[]): PeriodSnapshot {
  let hours = 0;
  let cents = 0;
  const people = new Set<string>();

  for (const e of entries) {
    if (e.user_email) people.add(e.user_email.toLowerCase());

    // Rejected hours are not owed and were never going to be paid — but the entry still EXISTS, so
    // it counts toward the entry total. Otherwise rejecting a day after the close would look
    // identical to somebody adding one.
    if (e.status === 'rejected') continue;

    hours += effectiveHours(e);

    const decided = e.pay_decision?.total_pay;
    const dollars = typeof decided === 'number' && Number.isFinite(decided)
      ? decided
      : (typeof e.total_pay === 'number' && Number.isFinite(e.total_pay) ? e.total_pay : null);
    // null, not 0 — see the header.
    if (dollars !== null) cents += Math.round(dollars * 100);
  }

  return {
    closed_hours: Math.round(hours * 100) / 100,
    closed_pay_cents: cents,
    closed_entry_count: entries.length,
    closed_people: people.size,
  };
}

/** One line for the lock banner. Null when the period was closed before snapshots were recorded —
 *  saying nothing is right there, because inventing a figure is the thing this whole record exists
 *  to prevent. */
export function describeSnapshot(
  // Every field is `number | null | undefined` rather than `Partial<PeriodSnapshot>`, because that
  // is the shape the row actually has: the columns are nullable, and NULL — "closed before snapshots
  // were recorded" — is the exact case this function exists to answer. Narrowing the parameter and
  // casting at the call site would move the null somewhere it is not handled.
  snapshot: { [K in keyof PeriodSnapshot]?: number | null } | null | undefined,
  liveEntryCount: number,
): string | null {
  if (!snapshot || typeof snapshot.closed_hours !== 'number') return null;

  const money = `$${((snapshot.closed_pay_cents ?? 0) / 100).toFixed(2)}`;
  const base = `Closed at ${snapshot.closed_hours.toFixed(1)}h · ${money}`
    + (snapshot.closed_people ? ` across ${snapshot.closed_people} ${snapshot.closed_people === 1 ? 'person' : 'people'}` : '');

  const added = liveEntryCount - (snapshot.closed_entry_count ?? 0);
  if (added <= 0) return `${base}.`;
  return `${base} — ${added} ${added === 1 ? 'entry has' : 'entries have'} arrived since.`;
}
