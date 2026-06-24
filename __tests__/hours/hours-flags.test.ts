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
