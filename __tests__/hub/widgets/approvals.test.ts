// __tests__/hub/widgets/approvals.test.ts
//
// consolidation Slice 3 (2026-05-30) — locks the pure helpers that
// power the unified Approvals widget: the default-mode picker, the
// summary formatter, and the per-mode row aggregators.

import { describe, it, expect } from 'vitest';
import {
  pickDefaultMode,
  summarizeCounts,
  type ApprovalCounts,
} from '@/lib/hub/widgets/approvals/pick-mode';
import {
  aggregateHours,
  mapReceipts,
  mapTimeOff,
} from '@/lib/hub/widgets/approvals';

describe('pickDefaultMode', () => {
  it('picks the mode with the largest count', () => {
    expect(pickDefaultMode({ hours: 1, receipts: 5, timeOff: 2 })).toBe('receipts');
    expect(pickDefaultMode({ hours: 4, receipts: 1, timeOff: 8 })).toBe('time-off');
    expect(pickDefaultMode({ hours: 9, receipts: 1, timeOff: 1 })).toBe('hours');
  });

  it('breaks ties in tie-breaker order (hours > receipts > time-off)', () => {
    expect(pickDefaultMode({ hours: 3, receipts: 3, timeOff: 3 })).toBe('hours');
    expect(pickDefaultMode({ hours: 0, receipts: 2, timeOff: 2 })).toBe('receipts');
    expect(pickDefaultMode({ hours: 1, receipts: 0, timeOff: 1 })).toBe('hours');
  });

  it('returns "hours" when every count is zero', () => {
    expect(pickDefaultMode({ hours: 0, receipts: 0, timeOff: 0 })).toBe('hours');
  });

  it('clamps negative counts to zero', () => {
    expect(pickDefaultMode({ hours: -3, receipts: 1, timeOff: 0 })).toBe('receipts');
  });
});

describe('summarizeCounts', () => {
  it('formats a tiny-bucket summary string', () => {
    const counts: ApprovalCounts = { hours: 3, receipts: 1, timeOff: 0 };
    expect(summarizeCounts(counts)).toBe('3 hours · 1 receipts · 0 time-off');
  });
});

describe('aggregateHours', () => {
  it('groups daily logs by (user_email, week_start_monday)', () => {
    const rows = [
      { user_email: 'a@x.com', user_name: 'Ana', log_date: '2026-05-26', hours: 8 }, // Tue
      { user_email: 'a@x.com', user_name: 'Ana', log_date: '2026-05-27', hours: 8 }, // Wed
      { user_email: 'b@x.com', user_name: 'Bo',  log_date: '2026-05-26', hours: 4 },
    ];
    const out = aggregateHours(rows);
    // Highest first: Ana 16h, Bo 4h.
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ user_email: 'a@x.com', total_hours: 16 });
    expect(out[1]).toMatchObject({ user_email: 'b@x.com', total_hours: 4 });
  });

  it('drops rows without an email or numeric hours', () => {
    expect(aggregateHours([
      { user_email: null, log_date: '2026-05-26', hours: 8 },
      { user_email: 'a@x.com', log_date: '2026-05-26', hours: null },
      { user_email: '', log_date: '2026-05-26', hours: 8 },
    ])).toEqual([]);
  });
});

describe('mapReceipts', () => {
  it('maps the raw shape to the widget row + converts cents to dollars', () => {
    expect(mapReceipts([
      { id: 'r1', vendor_name: 'Home Depot', total_cents: 1250, submitted_by_email: 'a@x.com' },
      { id: 'r2', vendor_name: null, total_cents: null, submitted_by_name: 'Bo' },
    ])).toEqual([
      { id: 'r1', vendor: 'Home Depot', amount: 12.5, submitted_by: 'a@x.com' },
      { id: 'r2', vendor: null, amount: 0, submitted_by: 'Bo' },
    ]);
  });

  it('drops rows without an id', () => {
    expect(mapReceipts([{ id: '', vendor_name: 'X', total_cents: 100 }])).toEqual([]);
  });
});

describe('mapTimeOff', () => {
  it('maps assigned_to + slices the ISO dates to YYYY-MM-DD', () => {
    const out = mapTimeOff([
      { id: 't1', assigned_to: 'a@x.com', start_time: '2026-06-01T00:00Z', end_time: '2026-06-01T00:00Z', all_day: true, hours_requested: 8 },
    ]);
    expect(out[0]).toMatchObject({
      id: 't1', user_email: 'a@x.com',
      start_date: '2026-06-01', end_date: '2026-06-01',
      hours_requested: 8,
    });
  });

  it('estimates hours from start/end + all_day when hours_requested is missing', () => {
    const out = mapTimeOff([
      { id: 't1', assigned_to: 'a@x.com', start_time: '2026-06-01T00:00Z', end_time: '2026-06-03T00:00Z', all_day: true },
    ]);
    // 3 calendar days × 8h = 24h.
    expect(out[0].hours_requested).toBe(24);
  });

  it('drops rows without id or assigned_to', () => {
    expect(mapTimeOff([
      { id: '', assigned_to: 'a@x.com' },
      { id: 't1', assigned_to: '' },
    ])).toEqual([]);
  });
});
