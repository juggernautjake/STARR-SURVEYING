// __tests__/payroll/week-summary.test.ts
//
// The week summary on My Hours. Every case below is a figure that was previously wrong on screen.

import { describe, it, expect } from 'vitest';
import { summarizeWeek, type WeekEntry } from '@/lib/payroll/week-summary';

const entry = (over: Partial<WeekEntry> = {}): WeekEntry => ({
  log_date: '2026-08-03',
  hours: 8,
  status: 'approved',
  total_pay: 200,
  ...over,
});

describe('summarizeWeek — pay', () => {
  it('counts only approved hours in the money that is coming', () => {
    // The old summary summed `total_pay` across every entry INCLUDING rejected ones, so the
    // headline figure counted work that had been explicitly refused.
    const s = summarizeWeek([
      entry({ hours: 8, total_pay: 200 }),
      entry({ hours: 8, total_pay: 200, status: 'rejected' }),
    ]);
    expect(s.approvedPay).toBe(200);
    expect(s.rejectedHours).toBe(8);
  });

  it('keeps pending pay separate rather than blending it into the total', () => {
    const s = summarizeWeek([
      entry({ hours: 8, total_pay: 200 }),
      entry({ hours: 4, total_pay: 100, status: 'pending' }),
    ]);
    expect(s.approvedPay).toBe(200);
    expect(s.pendingPay).toBe(100);
  });

  it('uses the approver’s decision, not the rate the rules set at submission', () => {
    // Once somebody sets pay by hand the original figure is no longer what is being paid. Showing
    // it is the same "two numbers for one question" the consolidation exists to end.
    const s = summarizeWeek([
      entry({ hours: 8, total_pay: 200, pay_decision: { total_pay: 160, undecided_hours: 0 } }),
    ]);
    expect(s.approvedPay).toBe(160);
    expect(s.hasDecisions).toBe(true);
  });

  it('says nothing about decisions when nobody has made one', () => {
    expect(summarizeWeek([entry()]).hasDecisions).toBe(false);
  });

  it('treats a missing rate as no money rather than as NaN', () => {
    const s = summarizeWeek([entry({ total_pay: null })]);
    expect(s.approvedPay).toBe(0);
    expect(s.approvedHours).toBe(8);
  });
});

describe('summarizeWeek — hours', () => {
  it('counts hours, not entries', () => {
    // "Approved: 3" counted ENTRIES. Three entries might be two hours or twenty-four; on a
    // timesheet the unit that matters is hours.
    const s = summarizeWeek([
      entry({ hours: 2 }),
      entry({ hours: 4 }),
      entry({ hours: 8 }),
    ]);
    expect(s.approvedHours).toBe(14);
  });

  it('honours an approver’s adjustment to the hours', () => {
    // A manager who cut a day from ten hours to eight left the employee's own summary reading ten.
    const s = summarizeWeek([entry({ hours: 10, adjusted_hours: 8 })]);
    expect(s.totalHours).toBe(8);
    expect(s.approvedHours).toBe(8);
  });

  it('does not treat an adjustment of zero as "no adjustment"', () => {
    // 0 is falsy; a truthiness check here would silently pay the original hours.
    const s = summarizeWeek([entry({ hours: 10, adjusted_hours: 0 })]);
    expect(s.totalHours).toBe(0);
  });

  it('totals every hour on the timesheet whatever its status', () => {
    const s = summarizeWeek([
      entry({ hours: 8 }),
      entry({ hours: 4, status: 'pending' }),
      entry({ hours: 2, status: 'rejected' }),
    ]);
    expect(s.totalHours).toBe(14);
    expect(s.approvedHours).toBe(8);
    expect(s.pendingHours).toBe(4);
    expect(s.rejectedHours).toBe(2);
  });
});

describe('summarizeWeek — statuses that are not settled', () => {
  it('counts disputed and adjusted hours as pending, not approved', () => {
    // Both can still change. Calling them approved tells somebody a disputed figure is final.
    const s = summarizeWeek([
      entry({ hours: 8, status: 'disputed' }),
      entry({ hours: 4, status: 'adjusted' }),
    ]);
    expect(s.pendingHours).toBe(12);
    expect(s.approvedHours).toBe(0);
  });

  it('counts cancelled hours with rejected — neither is going to be paid', () => {
    expect(summarizeWeek([entry({ hours: 8, status: 'cancelled' })]).rejectedHours).toBe(8);
  });
});

describe('summarizeWeek — hours awaiting a rate', () => {
  it('surfaces them, so a short week has a visible reason', () => {
    // They contributed $0 and appeared nowhere, so a week could show less pay than expected with
    // nothing on screen accounting for the gap.
    const s = summarizeWeek([
      entry({ hours: 8, pay_decision: { total_pay: 150, undecided_hours: 2 } }),
    ]);
    expect(s.undecidedHours).toBe(2);
    expect(s.approvedPay).toBe(150);
  });

  it('adds them up across the week', () => {
    const s = summarizeWeek([
      entry({ hours: 8, pay_decision: { total_pay: 150, undecided_hours: 2 } }),
      entry({ hours: 8, pay_decision: { total_pay: 100, undecided_hours: 4 } }),
    ]);
    expect(s.undecidedHours).toBe(6);
  });
});

describe('summarizeWeek — bad input', () => {
  it('returns zeroes for an empty week rather than throwing', () => {
    const s = summarizeWeek([]);
    expect(s.totalHours).toBe(0);
    expect(s.approvedPay).toBe(0);
    expect(s.hasDecisions).toBe(false);
  });

  it('ignores entries with no usable hours', () => {
    const s = summarizeWeek([entry({ hours: 0 }), entry({ hours: -4 }), entry({ hours: Number.NaN })]);
    expect(s.totalHours).toBe(0);
  });

  it('rounds money and hours to two places instead of leaking float noise', () => {
    const s = summarizeWeek([
      entry({ hours: 0.1, total_pay: 0.1 }),
      entry({ hours: 0.2, total_pay: 0.2 }),
    ]);
    expect(s.totalHours).toBe(0.3);
    expect(s.approvedPay).toBe(0.3);
  });
});
