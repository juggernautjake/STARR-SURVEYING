// lib/hours/status-view.ts — the five states a time log can be in, counted and filtered, in one place.
//
// Owner, 2026-08-16: *"We need to see all of the submitted/pending hours, the rejected hours, the
// adjusted hours, the accepted hours and the hours that were added by the boss or admin or whoever
// is in charge of hours approval/payroll."*
//
// ── WHY THIS IS A MODULE AND NOT TEN LINES IN THE PAGE ──────────────────────────────────────────
//
// Because it is already the second copy. `getMonday` lived in both `/admin/hours-approval` and
// `MyHoursPanel`, the approval copy was missing `setHours(0,0,0,0)`, and the result was a week that
// started on the wrong day after 19:00 local — which silently broke lock matching for months. The
// note left on that fix says it plainly: *"Two implementations of the same rule, and only one of
// them right — which is the argument for there being one."*
//
// Status is about to be read the same way on both screens, so it starts as one function.
//
// ── STATUS AND SOURCE ARE DIFFERENT QUESTIONS ───────────────────────────────────────────────────
//
// `status` is what was DECIDED about the hours. `entered_by` is who PUT THEM ON THE RECORD, and it
// is set only when the office entered the day on somebody's behalf (the insert in
// `/api/admin/time-logs` writes NULL for a self-submitted entry). They are deliberately separate
// filters: an office-entered day is written `approved`, so if provenance were folded in as a sixth
// status it would be indistinguishable from every other approved day — which is the exact blindness
// this was asked to fix.

/** The five values `daily_time_logs.status` may hold — the CHECK constraint in seed 000. */
export const TIME_LOG_STATUSES = ['pending', 'approved', 'rejected', 'disputed', 'adjusted'] as const;
export type TimeLogStatus = (typeof TIME_LOG_STATUSES)[number];

/** Only the two fields this module reads, so it can be used against any row shape that has them. */
export interface StatusViewLog {
  status?: string | null;
  entered_by?: string | null;
}

/** Who put the day on the record. */
export type LogSource = 'all' | 'office' | 'employee';

/**
 * The status of a row, with the column's own default applied.
 *
 * `status` is nullable in the schema (`DEFAULT 'pending'`), and a NULL is a pending row — not a
 * sixth state. Treating NULL as unknown would drop those rows out of every count and every filter
 * at once, which reads on screen as hours that were never submitted.
 */
export function statusOf(log: StatusViewLog): TimeLogStatus {
  const s = (log.status ?? 'pending') as TimeLogStatus;
  return (TIME_LOG_STATUSES as readonly string[]).includes(s) ? s : 'pending';
}

/** True when the office entered this day rather than the employee submitting it. */
export function isOfficeEntered(log: StatusViewLog): boolean {
  return Boolean(log.entered_by);
}

export interface StatusCounts extends Record<TimeLogStatus, number> {
  /** Not a status — provenance. Counted alongside so one pass produces the whole strip. */
  office: number;
  total: number;
}

/**
 * How many rows sit in each state.
 *
 * Counted over the WHOLE period, never the filtered view: a strip fed the filtered list would
 * always read "Rejected 0" while you were looking at pending, which is worse than not showing it
 * at all, because it answers the question wrongly instead of leaving it open.
 */
export function countByStatus(logs: readonly StatusViewLog[]): StatusCounts {
  const counts = {
    pending: 0, approved: 0, rejected: 0, disputed: 0, adjusted: 0,
    office: 0, total: logs.length,
  } as StatusCounts;
  for (const log of logs) {
    counts[statusOf(log)] += 1;
    if (isOfficeEntered(log)) counts.office += 1;
  }
  return counts;
}

export interface StatusFilter {
  /** `'all'`, one status, or a comma list such as `'pending,disputed'` (the review queue). */
  status?: string;
  source?: LogSource;
}

/** Apply the status + source filters. Both default to "everything". */
export function filterLogs<T extends StatusViewLog>(
  logs: readonly T[],
  { status = 'all', source = 'all' }: StatusFilter = {},
): T[] {
  const wanted = status === 'all'
    ? null
    : new Set(status.split(',').map((s) => s.trim()).filter(Boolean));
  return logs.filter((log) => {
    if (wanted && !wanted.has(statusOf(log))) return false;
    if (source === 'office' && !isOfficeEntered(log)) return false;
    if (source === 'employee' && isOfficeEntered(log)) return false;
    return true;
  });
}
