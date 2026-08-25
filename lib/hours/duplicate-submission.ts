// lib/hours/duplicate-submission.ts
//
// One submission that arrived twice, told apart from two shifts that happen to match.
//
// ── THE DEFECT THIS IS FOR ──────────────────────────────────────────────────────────────────────
//
// Found in live data on 2026-08-24: `daily_time_logs` held two identical 7.56-hour rows for one
// person and one Monday, created 3.2 seconds apart, both reading "Clock-out entry from top-bar
// pill". Nobody worked fifteen hours. The clock-out button stayed live for the whole round-trip and
// was pressed twice, and `POST /api/admin/time-logs` is insert-only with no unique constraint
// behind it, so the second copy was accepted exactly as the first one had been.
//
// The button is guarded now. This is the layer that matters anyway: a UI guard cannot stop a fetch
// the browser retried, a second tab, an offline queue flushing twice, or the next surface somebody
// writes. Whoever asks twice, quickly, gets one row.
//
// ── WHY IT IS A TIME WINDOW AND NOT A UNIQUE CONSTRAINT ─────────────────────────────────────────
//
// Two identical entries on one day are LEGITIMATE. Two one-hour site visits with the same note is a
// real timesheet, and a unique index on (person, date, hours, description) would refuse it forever —
// turning a data-integrity fix into a form people have to fight. Two identical entries within two
// minutes are one submission that arrived twice: nobody re-types a row that fast.
//
// Kept here rather than inline in the route so the rule can be tested without a database, and so
// the review queue's duplicate FLAG and the route's duplicate SUPPRESSION cannot drift into
// disagreeing about what a duplicate is.

/** How close together two identical entries have to be to read as one submission arriving twice. */
export const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

/** The fields that make two entries the same entry. */
export interface SubmittedEntry {
  log_date: string;
  hours: number;
  description: string;
  job_id?: string | null;
}

/** A row already in the table, with when it got there. */
export interface StoredEntry {
  id: string;
  log_date: string;
  hours: number | null;
  description: string | null;
  job_id?: string | null;
  created_at: string;
}

/**
 * Do these describe the same entry?
 *
 * Deliberately strict on all four fields. Matching on (date, hours) alone would collapse a morning
 * of control and an afternoon of topo that happened to run the same length — two different pieces
 * of work, one of them silently discarded.
 */
export function isSameEntry(row: StoredEntry, entry: SubmittedEntry): boolean {
  return row.log_date === entry.log_date
    && Number(row.hours) === Number(entry.hours)
    && (row.description ?? '') === (entry.description ?? '')
    && (row.job_id ?? null) === (entry.job_id || null);
}

/**
 * The row this submission is a repeat of, or null when it is new.
 *
 * Returns the EXISTING ROW rather than a boolean because the caller answers with it. A retry after
 * a dropped response has to look like the success it actually was — answering with an error would
 * show a failure for hours that are safely stored, and the person would submit them a third time.
 */
export function findRecentDuplicate(
  prior: readonly StoredEntry[],
  entry: SubmittedEntry,
  nowMs: number,
  windowMs: number = DUPLICATE_WINDOW_MS,
): StoredEntry | null {
  for (const row of prior) {
    if (!isSameEntry(row, entry)) continue;
    const age = nowMs - Date.parse(row.created_at);
    // A row with an unparseable timestamp is not evidence of anything; `age` is NaN and every
    // comparison against it is false, so it falls through as "not a duplicate" — the safe direction,
    // because the alternative is silently dropping somebody's hours.
    if (age >= 0 && age < windowMs) return row;
  }
  return null;
}
