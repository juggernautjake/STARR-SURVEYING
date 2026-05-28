// __tests__/schedule/pto-hours.test.ts
//
// Unit tests for the canonical PTO-hours calculator used by:
//   - app/admin/time-off/page.tsx — preview the deduction against the
//     requester's balance before they submit.
//   - app/api/admin/time-off/route.ts — write the actual transaction
//     when an admin approves a request.
//
// Both sides MUST agree; this module is shared between them and these
// tests pin the contract so a future change can't silently make one
// side over-count or under-count.

import { describe, it, expect } from 'vitest';
import { ptoHoursForRequest, HOURS_PER_WORKDAY } from '@/lib/schedule/pto-hours';

// Helpers — Slice 27 stores all-day requests as `start_date T00:00 → end_date T23:59`.
// The 23:59 end-time on the last day is the critical contractual detail: a raw
// (endMs - startMs)/3_600_000 over a Mon-Mon all-day request would yield ~24×7 hours.
const allDay = (startDate: string, endDate: string) => ({
  startTime: `${startDate}T00:00:00.000Z`,
  endTime: `${endDate}T23:59:00.000Z`,
  allDay: true,
});

describe('ptoHoursForRequest — partial-day requests', () => {
  it('charges the minute-accurate difference for a same-day window', () => {
    // 14:00 → 16:00 → 2 hours
    expect(
      ptoHoursForRequest({
        startTime: '2026-05-28T14:00:00.000Z',
        endTime: '2026-05-28T16:00:00.000Z',
        allDay: false,
      })
    ).toBe(2);
  });

  it('handles fractional hours (15-minute increments)', () => {
    // 14:00 → 14:45 → 0.75 hours
    expect(
      ptoHoursForRequest({
        startTime: '2026-05-28T14:00:00.000Z',
        endTime: '2026-05-28T14:45:00.000Z',
        allDay: false,
      })
    ).toBe(0.75);
  });

  it('returns 0 hours when end is before start (defensive)', () => {
    // Approving a malformed range shouldn't write a NEGATIVE pto transaction.
    expect(
      ptoHoursForRequest({
        startTime: '2026-05-28T16:00:00.000Z',
        endTime: '2026-05-28T14:00:00.000Z',
        allDay: false,
      })
    ).toBe(0);
  });
});

describe('ptoHoursForRequest — all-day requests (Slice 33 contract)', () => {
  it('charges 8 hours for a single weekday', () => {
    // 2026-05-28 is a Thursday.
    expect(ptoHoursForRequest(allDay('2026-05-28', '2026-05-28'))).toBe(HOURS_PER_WORKDAY);
  });

  it('charges 0 hours for a single Saturday', () => {
    // 2026-05-30 is a Saturday — weekend, no deduction.
    expect(ptoHoursForRequest(allDay('2026-05-30', '2026-05-30'))).toBe(0);
  });

  it('charges 0 hours for a single Sunday', () => {
    // 2026-05-31 is a Sunday.
    expect(ptoHoursForRequest(allDay('2026-05-31', '2026-05-31'))).toBe(0);
  });

  it('charges 40 hours for a full Mon-Fri week', () => {
    // 2026-06-01 Mon → 2026-06-05 Fri → 5 weekdays × 8h
    expect(ptoHoursForRequest(allDay('2026-06-01', '2026-06-05'))).toBe(40);
  });

  it('charges 16 hours for a Fri-Mon span (skips the weekend)', () => {
    // 2026-05-29 Fri → 2026-06-01 Mon — 4 calendar days, 2 weekdays × 8h.
    // The Slice 33 bug would have charged ~96h here ((endMs-startMs)/3_600_000).
    expect(ptoHoursForRequest(allDay('2026-05-29', '2026-06-01'))).toBe(16);
  });

  it('charges 0 hours when the entire span is the weekend', () => {
    // 2026-05-30 Sat → 2026-05-31 Sun
    expect(ptoHoursForRequest(allDay('2026-05-30', '2026-05-31'))).toBe(0);
  });

  it('charges 8 hours when only one weekday falls inside a Sat-Mon span', () => {
    // 2026-05-30 Sat → 2026-06-01 Mon — only Mon counts.
    expect(ptoHoursForRequest(allDay('2026-05-30', '2026-06-01'))).toBe(8);
  });

  it('charges 80 hours for a full two-week vacation', () => {
    // 2026-06-01 Mon → 2026-06-12 Fri — 10 weekdays.
    expect(ptoHoursForRequest(allDay('2026-06-01', '2026-06-12'))).toBe(80);
  });
});

describe('ptoHoursForRequest — the bug Slice 33 fixed', () => {
  it('does NOT charge 24h per calendar day for an all-day request', () => {
    // The pre-Slice-33 formula was (endMs - startMs) / 3_600_000 unconditionally.
    // An all-day single-weekday request stored as `00:00 → 23:59` would have
    // produced 23.983… (≈24) hours. Slice 33 deducts 8.
    const hours = ptoHoursForRequest(allDay('2026-05-28', '2026-05-28'));
    expect(hours).toBe(8);
    expect(hours).not.toBe(23.983333333333334);
  });

  it('does NOT charge weekend days inside a multi-day span', () => {
    // Fri → Tue inclusive. Pre-Slice-33 would have charged ~96h (4 calendar days
    // × 24h). Slice 33 charges 24h (Fri + Mon + Tue = 3 weekdays × 8h).
    expect(ptoHoursForRequest(allDay('2026-05-29', '2026-06-02'))).toBe(24);
  });
});
