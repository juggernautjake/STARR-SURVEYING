// lib/hours/hours-flags.ts
//
// Pure, dependency-free reconciliation helper for the hours-approval
// review queue (slice H5 of the hours-correction plan). Given an
// employee's time-log rows for a period it surfaces the conflicts an
// admin most needs to catch before approving:
//
//   - duplicate   — the same day, the same hours and the same description, twice. The footprint
//                   of one submission that arrived twice, not of two shifts.
//   - long_day    — a single day's hours exceed LONG_DAY_THRESHOLD,
//                   the classic "forgot to clock out" footprint.
//   - high_total  — the period total exceeds HIGH_PERIOD_THRESHOLD.
//   - needs_review — count of still-pending / disputed entries.
//
// Kept side-effect-free so it's trivially unit-testable; the page maps
// each flag to a chip.

export interface HoursFlagInput {
  log_date?: string | null;
  hours?: number | null;
  adjusted_hours?: number | null;
  status?: string | null;
  description?: string | null;
  job_id?: string | null;
}

export interface HoursFlag {
  kind: 'duplicate' | 'long_day' | 'high_total' | 'needs_review';
  message: string;
}

/** Hours on a single day above this read as a likely missed clock-out. */
export const LONG_DAY_THRESHOLD = 14;
/** Period total above this is worth an explicit verify. */
export const HIGH_PERIOD_THRESHOLD = 60;

/**
 * The hours that COUNT for one entry: the approver's adjustment when there is one, otherwise what the
 * employee submitted.
 *
 * Exported 2026-08-12 rather than copied a fourth time. This rule already existed here, in
 * `lib/payroll/week-summary.ts`, in `lib/payroll/owed-loader.ts` and in `lib/notifications/hours-decision.ts`
 * — and the hours-approval page, the one screen where the adjustment is actually MADE, was still summing
 * raw `hours`. So a manager who cut a ten-hour day to eight saw the page keep reporting ten, while the
 * employee's own week summary (already fixed) reported eight. Two numbers for one question, disagreeing
 * across the very decision that created them.
 *
 * One definition, used by the flags, the totals and the row.
 */
export function effectiveHours(l: HoursFlagInput): number {
  if (typeof l.adjusted_hours === 'number' && Number.isFinite(l.adjusted_hours)) return l.adjusted_hours;
  if (typeof l.hours === 'number' && Number.isFinite(l.hours)) return l.hours;
  return 0;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeHoursFlags(logs: readonly HoursFlagInput[]): HoursFlag[] {
  const byDay = new Map<string, number>();
  let total = 0;
  let needsReview = 0;

  for (const l of logs) {
    const h = effectiveHours(l);
    total += h;
    if (l.log_date) byDay.set(l.log_date, (byDay.get(l.log_date) ?? 0) + h);
    if (l.status === 'pending' || l.status === 'disputed') needsReview += 1;
  }

  const flags: HoursFlag[] = [];

  // ── THE SAME DAY, SUBMITTED TWICE ────────────────────────────────────────────────────────────
  //
  // Found in live data on 2026-08-24: two identical 7.56-hour rows for one person and one Monday,
  // created 3.2 seconds apart, both from the clock-out button. The cause is fixed in the modal and
  // in the route, and this is what makes an existing one VISIBLE to the person deciding on it.
  //
  // `long_day` had already noticed something was wrong with that Monday — 15.12h in one day — but
  // it said "check for a missed clock-out", which is the wrong instruction for this. One is an
  // entry to correct; the other is an entry to delete. The approver should be told which.
  //
  // Deliberately narrow. Two one-hour site visits with the same note on the same day is a real
  // timesheet, so a repeat only reads as a duplicate when the ENTRY is identical — same day, same
  // hours, same words, same job. Anything looser turns a warning people act on into one they
  // dismiss.
  const seen = new Map<string, number>();
  for (const l of logs) {
    if (!l.log_date) continue;
    const key = [l.log_date, effectiveHours(l), (l.description ?? '').trim(), l.job_id ?? ''].join('|');
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, n] of [...seen.entries()].sort()) {
    if (n < 2) continue;
    const [date, hours, description] = key.split('|');
    const label = description ? `"${description.slice(0, 40)}"` : `${hours}h`;
    flags.push({
      kind: 'duplicate',
      message: `${date}: ${label} appears ${n} times — looks like one submission logged twice`,
    });
  }

  // Stable, ascending-by-date order for the long-day flags.
  for (const date of [...byDay.keys()].sort()) {
    const h = byDay.get(date) ?? 0;
    if (h > LONG_DAY_THRESHOLD) {
      flags.push({ kind: 'long_day', message: `${date}: ${round(h)}h in one day — check for a missed clock-out` });
    }
  }
  if (total > HIGH_PERIOD_THRESHOLD) {
    flags.push({ kind: 'high_total', message: `${round(total)}h this period — verify the total` });
  }
  if (needsReview > 0) {
    flags.push({ kind: 'needs_review', message: `${needsReview} ${needsReview === 1 ? 'entry needs' : 'entries need'} review` });
  }

  return flags;
}
