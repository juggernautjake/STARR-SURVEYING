// lib/hours/late-entry.ts
//
// "This day was added after its week had already been closed off."
//
// ── THE GAP ──────────────────────────────────────────────────────────────────────────────────────
//
// Locking a pay period stops EMPLOYEES editing it. Admins are deliberately exempt — the whole point
// of a lock is that the office can still correct a week nobody else can touch — and since 2026-08-12
// the office can also CREATE entries on somebody's behalf. So an eight-hour day can be added to a
// week that was closed off last Friday, and on every screen it looks exactly like a day submitted on
// time.
//
// That matters because a closed week has usually already been paid, or is about to be. An entry that
// arrived afterwards is owed in the NEXT period, and if nobody can see which entries those are, it is
// either missed entirely or paid twice by somebody re-running the week to catch it.
//
// The running-balance model in `lib/payroll/owed.ts` means a late entry is never actually dropped —
// it is approved-minus-paid, so it surfaces in the next payout regardless. This is the other half of
// that: the balance handles the money correctly, and this makes the event VISIBLE, so a person
// looking at a closed week can tell what has moved since they closed it.
//
// ── WHY created_at AND NOT log_date ──────────────────────────────────────────────────────────────
//
// Every entry in a closed week has a `log_date` inside that week — that is what makes it part of the
// week. What distinguishes a late one is WHEN IT ARRIVED, and the only honest comparison is the
// entry's `created_at` against the lock's `locked_at`. Using the dates alone would mark every entry
// in a locked week as late, including the ones the lock was closed over.

/** A time log, narrowed to what lateness needs. */
export interface DatedEntry {
  log_date?: string | null;
  created_at?: string | null;
}

/** A lock, narrowed likewise. */
export interface PeriodLock {
  period_start: string;
  period_end: string;
  locked_at?: string | null;
}

export interface LateEntryResult {
  /** True when this entry arrived after its own period had been locked. */
  isLate: boolean;
  /** The lock it arrived after, when there is one. */
  lock: PeriodLock | null;
  /** A sentence for the row. Null when the entry is ordinary. */
  note: string | null;
}

const NOT_LATE: LateEntryResult = { isLate: false, lock: null, note: null };

/**
 * Did this entry arrive after its pay period was closed?
 *
 * Pure, so the rule is testable without a database.
 *
 * Returns "not late" whenever it cannot tell — a missing `created_at`, an unparseable timestamp, a
 * lock with no `locked_at`. Deliberate: marking an entry "added after the week was closed" is an
 * accusation about somebody's timekeeping, and guessing at one from missing data is worse than
 * saying nothing.
 */
export function detectLateEntry(
  entry: DatedEntry,
  locks: readonly PeriodLock[],
): LateEntryResult {
  const logDate = (entry.log_date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) return NOT_LATE;

  const createdMs = Date.parse(entry.created_at ?? '');
  if (!Number.isFinite(createdMs)) return NOT_LATE;

  // The entry's own period: a lock whose range covers the day worked.
  const covering = locks.filter((l) => l.period_start <= logDate && l.period_end >= logDate);

  for (const lock of covering) {
    const lockedMs = Date.parse(lock.locked_at ?? '');
    if (!Number.isFinite(lockedMs)) continue;
    if (createdMs > lockedMs) {
      return {
        isLate: true,
        lock,
        // Says what it means for the money, not just that it is late. "Added late" alone leaves
        // somebody wondering whether they need to do anything.
        note: `Added after ${lock.period_start}–${lock.period_end} was closed off — it belongs to that `
          + 'week but will be paid in the next payout.',
      };
    }
  }

  return NOT_LATE;
}

/** How many of these entries arrived after their period closed. For a summary line. */
export function countLateEntries(
  entries: readonly DatedEntry[],
  locks: readonly PeriodLock[],
): number {
  return entries.reduce((n, e) => (detectLateEntry(e, locks).isLate ? n + 1 : n), 0);
}
