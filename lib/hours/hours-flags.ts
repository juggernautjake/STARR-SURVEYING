// lib/hours/hours-flags.ts
//
// Pure, dependency-free reconciliation helper for the hours-approval
// review queue (slice H5 of the hours-correction plan). Given an
// employee's time-log rows for a period it surfaces the conflicts an
// admin most needs to catch before approving:
//
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
}

export interface HoursFlag {
  kind: 'long_day' | 'high_total' | 'needs_review';
  message: string;
}

/** Hours on a single day above this read as a likely missed clock-out. */
export const LONG_DAY_THRESHOLD = 14;
/** Period total above this is worth an explicit verify. */
export const HIGH_PERIOD_THRESHOLD = 60;

function effectiveHours(l: HoursFlagInput): number {
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
