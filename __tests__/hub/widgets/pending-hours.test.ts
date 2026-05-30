// __tests__/hub/widgets/pending-hours.test.ts
//
// hub-widget-excellence-11 — pending-hours R1: the widget now reads the
// real `/api/admin/time-logs?status=pending` daily rows and rolls them
// up per-submitter-per-week. Locks the pure aggregation helpers.

import { describe, it, expect } from 'vitest';
import {
  weekStartOf,
  aggregatePendingTimesheets,
} from '@/lib/hub/widgets/pending-hours';

describe('weekStartOf', () => {
  it('returns the Monday (UTC) of the log date\'s week', () => {
    expect(weekStartOf('2026-05-30')).toBe('2026-05-25'); // Sat → Mon 25th
    expect(weekStartOf('2026-05-25')).toBe('2026-05-25'); // Mon → itself
    expect(weekStartOf('2026-05-31')).toBe('2026-05-25'); // Sun → prior Mon
  });
});

describe('aggregatePendingTimesheets', () => {
  it('groups daily logs by submitter + week and sums hours', () => {
    const logs = [
      { user_email: 'a@x.com', log_date: '2026-05-25', hours: 8 }, // Mon
      { user_email: 'a@x.com', log_date: '2026-05-26', hours: 7.5 }, // Tue (same week)
      { user_email: 'b@x.com', log_date: '2026-05-26', hours: 6 },
      { user_email: 'a@x.com', log_date: '2026-06-01', hours: 8 }, // next week
    ];
    const out = aggregatePendingTimesheets(logs);
    const a1 = out.find((t) => t.id === 'a@x.com:2026-05-25')!;
    expect(a1.total_hours).toBe(15.5);
    expect(a1.user_email).toBe('a@x.com');
    const b = out.find((t) => t.user_email === 'b@x.com')!;
    expect(b.total_hours).toBe(6);
    // a@x.com has two distinct weeks
    expect(out.filter((t) => t.user_email === 'a@x.com')).toHaveLength(2);
  });

  it('sorts newest week first', () => {
    const out = aggregatePendingTimesheets([
      { user_email: 'a@x.com', log_date: '2026-05-04', hours: 8 },
      { user_email: 'a@x.com', log_date: '2026-05-25', hours: 8 },
    ]);
    expect(out.map((t) => t.week_start)).toEqual(['2026-05-25', '2026-05-04']);
  });

  it('skips rows without an email or date + tolerates bad hours', () => {
    const out = aggregatePendingTimesheets([
      { user_email: null, log_date: '2026-05-25', hours: 8 },
      { user_email: 'a@x.com', log_date: null, hours: 8 },
      { user_email: 'a@x.com', log_date: '2026-05-25', hours: null },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].total_hours).toBe(0);
  });
});
