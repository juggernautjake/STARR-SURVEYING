// __tests__/hub/widgets/pending-office-mappers.test.ts
//
// hub-widget-excellence-11 — pending-receipts + pending-time-off R1:
// both widgets read the wrong field names / query from their real
// endpoints. Lock the new pure mappers that realign them.

import { describe, it, expect } from 'vitest';
import { toPendingReceipt } from '@/lib/hub/widgets/pending-receipts';
import { toPendingTimeOff } from '@/lib/hub/widgets/pending-time-off';

describe('toPendingReceipt (real receipts shape)', () => {
  it('maps vendor_name / total_cents / submitted_by_name', () => {
    expect(toPendingReceipt({
      id: 'r1', vendor_name: 'Home Depot', total_cents: 4250,
      submitted_by_name: 'Alice', submitted_by_email: 'a@x.com',
    })).toEqual({ id: 'r1', vendor: 'Home Depot', amount: 42.5, submitted_by: 'Alice' });
  });

  it('falls back to the submitter email + tolerates missing amount', () => {
    expect(toPendingReceipt({ id: 'r2', submitted_by_email: 'b@x.com' }))
      .toEqual({ id: 'r2', vendor: null, amount: 0, submitted_by: 'b@x.com' });
  });
});

describe('toPendingTimeOff (real schedule_events shape)', () => {
  it('maps assigned_to / start_time / end_time + derives timed hours', () => {
    const row = toPendingTimeOff({
      id: 't1', assigned_to: 'a@x.com',
      start_time: '2026-06-01T09:00:00Z', end_time: '2026-06-01T13:00:00Z',
      all_day: false, notes: 'doctor',
    });
    expect(row.user_email).toBe('a@x.com');
    expect(row.start_date).toBe('2026-06-01T09:00:00Z');
    expect(row.hours_requested).toBe(4);
    expect(row.reason).toBe('doctor');
  });

  it('derives all-day hours as 8h per weekday', () => {
    const row = toPendingTimeOff({
      id: 't2', assigned_to: 'a@x.com',
      start_time: '2026-06-01T00:00:00Z', end_time: '2026-06-01T23:59:00Z', // Mon
      all_day: true,
    });
    expect(row.hours_requested).toBe(8);
  });

  it('is 0 hours when there is no start', () => {
    expect(toPendingTimeOff({ id: 't3', assigned_to: 'a@x.com' }).hours_requested).toBe(0);
  });
});
