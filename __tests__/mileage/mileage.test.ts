// __tests__/mileage/mileage.test.ts
//
// hub-widget-excellence-15 — mileage-tracker. Locks the pure helpers
// behind the new ?summary=1 mode of /api/admin/mileage: period→window
// math + the days[]→{miles, trips, reimbursable_amount} roll-up.

import { describe, it, expect } from 'vitest';
import { mileagePeriodWindow } from '@/lib/mileage/period';
import { summarizeMileageDays, IRS_BUSINESS_RATE_2025 } from '@/lib/mileage/summary';

describe('mileagePeriodWindow', () => {
  const now = new Date('2026-05-30T17:00:00Z');

  it('today = a single UTC day', () => {
    expect(mileagePeriodWindow('today', now)).toEqual({ from: '2026-05-30', to: '2026-05-30' });
  });

  it('week = the trailing 7 UTC days (inclusive)', () => {
    expect(mileagePeriodWindow('week', now)).toEqual({ from: '2026-05-24', to: '2026-05-30' });
  });

  it('month = the trailing 30 UTC days (inclusive)', () => {
    expect(mileagePeriodWindow('month', now)).toEqual({ from: '2026-05-01', to: '2026-05-30' });
  });
});

describe('summarizeMileageDays', () => {
  it('sums miles + counts driving days as trips', () => {
    const out = summarizeMileageDays([
      { miles: 12.5 },
      { miles: 0 }, // no-drive day → not a trip
      { miles: 7.25 },
    ]);
    expect(out.miles).toBe(19.75);
    expect(out.trips).toBe(2);
  });

  it('uses ONLY driver miles for the IRS reimbursable amount when a per-vehicle breakdown exists', () => {
    const out = summarizeMileageDays([
      {
        miles: 30, // 18 driver + 12 passenger
        by_vehicle: [
          { is_driver: true, miles: 18 },
          { is_driver: false, miles: 12 },
        ],
      },
    ]);
    expect(out.miles).toBe(30);
    expect(out.reimbursable_amount).toBeCloseTo(18 * IRS_BUSINESS_RATE_2025, 2);
  });

  it('falls back to the day total when no breakdown is available', () => {
    const out = summarizeMileageDays([{ miles: 10 }]);
    expect(out.reimbursable_amount).toBeCloseTo(10 * IRS_BUSINESS_RATE_2025, 2);
  });

  it('honors an operator-supplied rate', () => {
    const out = summarizeMileageDays([{ miles: 10 }], 0.5);
    expect(out.reimbursable_amount).toBe(5);
  });

  it('zero days yields the zero summary', () => {
    expect(summarizeMileageDays([])).toEqual({ miles: 0, trips: 0, reimbursable_amount: 0 });
  });
});
