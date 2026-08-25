// __tests__/hours/hours-flags.test.ts
//
// Locks the H5 reconciliation helper: long-day (missed clock-out)
// detection, high period totals, needs-review counting, adjusted-hours
// preference, and stable date ordering.

import { describe, it, expect } from 'vitest';
import {
  computeHoursFlags,
  LONG_DAY_THRESHOLD,
  HIGH_PERIOD_THRESHOLD,
} from '@/lib/hours/hours-flags';

describe('computeHoursFlags', () => {
  it('returns no flags for a normal week', () => {
    const flags = computeHoursFlags([
      { log_date: '2026-06-22', hours: 8, status: 'approved' },
      { log_date: '2026-06-23', hours: 7.5, status: 'approved' },
    ]);
    expect(flags).toEqual([]);
  });

  it('flags a single day over the long-day threshold (missed clock-out)', () => {
    const flags = computeHoursFlags([
      { log_date: '2026-06-22', hours: LONG_DAY_THRESHOLD + 2, status: 'approved' },
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe('long_day');
    expect(flags[0].message).toContain('2026-06-22');
    expect(flags[0].message).toContain('missed clock-out');
  });

  it('sums multiple entries on the same day before testing the threshold', () => {
    const flags = computeHoursFlags([
      { log_date: '2026-06-22', hours: 8, status: 'approved' },
      { log_date: '2026-06-22', hours: 8, status: 'approved' },
    ]);
    expect(flags.some((f) => f.kind === 'long_day')).toBe(true);
  });

  it('prefers adjusted_hours over hours', () => {
    const flags = computeHoursFlags([
      { log_date: '2026-06-22', hours: 20, adjusted_hours: 8, status: 'adjusted' },
    ]);
    // 8h after adjustment → no long-day flag.
    expect(flags.some((f) => f.kind === 'long_day')).toBe(false);
  });

  it('flags a high period total and counts entries needing review', () => {
    const logs = Array.from({ length: 9 }, (_, i) => ({
      log_date: `2026-06-${10 + i}`,
      hours: 8,
      status: i < 2 ? 'pending' : 'approved',
    }));
    // 9 * 8 = 72h > HIGH_PERIOD_THRESHOLD (60)
    const flags = computeHoursFlags(logs);
    expect(flags.some((f) => f.kind === 'high_total')).toBe(true);
    const review = flags.find((f) => f.kind === 'needs_review');
    expect(review?.message).toContain('2 entries need');
    expect(HIGH_PERIOD_THRESHOLD).toBe(60);
  });

  it('counts a single disputed entry as needing review', () => {
    const flags = computeHoursFlags([{ log_date: '2026-06-22', hours: 6, status: 'disputed' }]);
    const review = flags.find((f) => f.kind === 'needs_review');
    expect(review?.message).toContain('1 entry needs');
  });
});

// ── The same day, submitted twice ──────────────────────────────────────────────────────────────
//
// Found in live data on 2026-08-24: two identical 7.56-hour rows for one person and one Monday,
// created 3.2 seconds apart, both from the clock-out button. `long_day` had noticed something was
// off with that day — 15.12h — but told the approver to check for a missed clock-out, which is the
// wrong instruction. One is an entry to correct; the other is an entry to delete.
describe('duplicate submissions', () => {
  const dup = { log_date: '2026-08-17', hours: 7.56, status: 'pending', description: 'Clock-out entry from top-bar pill' };

  it('names a repeated entry as a duplicate, not as a long day', () => {
    const flags = computeHoursFlags([dup, { ...dup }]);
    const duplicate = flags.find((f) => f.kind === 'duplicate');
    expect(duplicate).toBeDefined();
    expect(duplicate!.message).toContain('2026-08-17');
    expect(duplicate!.message).toContain('appears 2 times');
  });

  it('counts three copies as three', () => {
    const flags = computeHoursFlags([dup, { ...dup }, { ...dup }]);
    expect(flags.find((f) => f.kind === 'duplicate')!.message).toContain('appears 3 times');
  });

  it('leaves two genuinely different entries on one day alone', () => {
    // The most important negative case. A real day is often several entries, and a warning that
    // fires on normal timesheets is one people learn to dismiss.
    const flags = computeHoursFlags([
      { log_date: '2026-08-17', hours: 3.5, status: 'pending', description: 'Drive to site' },
      { log_date: '2026-08-17', hours: 4.0, status: 'pending', description: 'Boundary survey' },
    ]);
    expect(flags.some((f) => f.kind === 'duplicate')).toBe(false);
  });

  it('does not flag the same hours on the same day when the work differs', () => {
    const flags = computeHoursFlags([
      { log_date: '2026-08-17', hours: 4, status: 'pending', description: 'Morning: control' },
      { log_date: '2026-08-17', hours: 4, status: 'pending', description: 'Afternoon: topo' },
    ]);
    expect(flags.some((f) => f.kind === 'duplicate')).toBe(false);
  });

  it('does not flag identical work on two different days', () => {
    const flags = computeHoursFlags([
      { log_date: '2026-08-17', hours: 8, status: 'pending', description: 'Boundary survey' },
      { log_date: '2026-08-18', hours: 8, status: 'pending', description: 'Boundary survey' },
    ]);
    expect(flags.some((f) => f.kind === 'duplicate')).toBe(false);
  });

  it('tells duplicates apart by job, so one crew on two jobs is not a duplicate', () => {
    const flags = computeHoursFlags([
      { log_date: '2026-08-17', hours: 4, status: 'pending', description: 'Fieldwork', job_id: 'a' },
      { log_date: '2026-08-17', hours: 4, status: 'pending', description: 'Fieldwork', job_id: 'b' },
    ]);
    expect(flags.some((f) => f.kind === 'duplicate')).toBe(false);
  });

  it("compares the hours that COUNT, so an approver's adjustment splits a pair", () => {
    // Adjusting one of two identical entries is how a duplicate gets resolved without deleting it.
    // The flag has to stop firing once that has happened, or it accuses a decision already made.
    const flags = computeHoursFlags([
      { ...dup },
      { ...dup, adjusted_hours: 0 },
    ]);
    expect(flags.some((f) => f.kind === 'duplicate')).toBe(false);
  });
});
