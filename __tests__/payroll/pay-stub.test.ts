// __tests__/payroll/pay-stub.test.ts
//
// Turning approved hours into a pay stub. The worked example is the owner's own week: field work at
// their $25 base pay, plus driving at the $15 set rate.

import { describe, it, expect } from 'vitest';
import { buildStubTotals, DEFAULT_DEDUCTIONS, type PayableHours } from '@/lib/payroll/pay-stub';

const entry = (over: Partial<PayableHours> = {}): PayableHours => ({
  hours: 8,
  rate: 25,
  workType: 'field_work',
  jobId: null,
  jobName: null,
  logDate: '2026-08-03',
  ...over,
});

/** A week under the threshold, so overtime never confuses the simpler assertions. */
const NO_OVERTIME = { overtimeThreshold: 40, overtimeMultiplier: 1.5 };

describe('buildStubTotals — a normal week', () => {
  it('pays each entry at its own rate', () => {
    // 35h field work at $25 + 5h driving at $15 = 875 + 75.
    const t = buildStubTotals({
      ...NO_OVERTIME,
      entries: [
        entry({ hours: 35, rate: 25 }),
        entry({ hours: 5, rate: 15, workType: 'driving' }),
      ],
    });
    expect(t.straightTimePay).toBe(950);
    expect(t.regularHours).toBe(40);
    expect(t.overtimeHours).toBe(0);
    expect(t.grossPay).toBe(950);
  });

  it('reports the blended rate the week actually ran at', () => {
    const t = buildStubTotals({
      ...NO_OVERTIME,
      entries: [entry({ hours: 35, rate: 25 }), entry({ hours: 5, rate: 15, workType: 'driving' })],
    });
    expect(t.regularRate).toBe(23.75);   // 950 / 40
  });

  it('withholds at the configured rates and nets out', () => {
    const t = buildStubTotals({ ...NO_OVERTIME, entries: [entry({ hours: 40, rate: 25 })] });
    expect(t.grossPay).toBe(1000);
    expect(t.federalTax).toBe(120);
    expect(t.stateTax).toBe(0);          // Texas — a named zero, not a missing line
    expect(t.socialSecurity).toBe(62);
    expect(t.medicare).toBe(14.5);
    expect(t.totalDeductions).toBe(196.5);
    expect(t.netPay).toBe(803.5);
  });

  it('gives somebody who logged nothing an empty stub rather than an error', () => {
    const t = buildStubTotals({ ...NO_OVERTIME, entries: [] });
    expect(t.grossPay).toBe(0);
    expect(t.netPay).toBe(0);
    expect(t.regularRate).toBeNull();
    expect(t.jobHours).toEqual([]);
  });
});

describe('buildStubTotals — overtime on mixed rates', () => {
  it('pays a HALF-time premium, because straight time is already paid', () => {
    // 45h at a flat $20 = $900 straight time. Regular rate $20, 5 overtime hours.
    // Premium = 0.5 x 20 x 5 = $50. Gross $950.
    // Paying 1.5 x on top of straight time would give $1,050 — a 2.5x overtime hour.
    const t = buildStubTotals({ ...NO_OVERTIME, entries: [entry({ hours: 45, rate: 20 })] });
    expect(t.regularHours).toBe(40);
    expect(t.overtimeHours).toBe(5);
    expect(t.regularRate).toBe(20);
    expect(t.overtimePremium).toBe(50);
    expect(t.grossPay).toBe(950);
  });

  it('blends the rates before applying the premium', () => {
    // 40h at $25 ($1,000) + 8h driving at $15 ($120) = $1,120 over 48 hours.
    // Regular rate = 1120 / 48 = $23.33. Premium = 0.5 x 23.33 x 8 = $93.32.
    const t = buildStubTotals({
      ...NO_OVERTIME,
      entries: [entry({ hours: 40, rate: 25 }), entry({ hours: 8, rate: 15, workType: 'driving' })],
    });
    expect(t.overtimeHours).toBe(8);
    expect(t.regularRate).toBe(23.33);
    expect(t.overtimePremium).toBe(93.32);
    expect(t.grossPay).toBe(1213.32);
  });

  it('pays no premium when the multiplier is 1', () => {
    const t = buildStubTotals({ overtimeThreshold: 40, overtimeMultiplier: 1, entries: [entry({ hours: 45, rate: 20 })] });
    expect(t.overtimePremium).toBe(0);
    expect(t.grossPay).toBe(900);
  });

  it('honours a biweekly threshold', () => {
    const t = buildStubTotals({ overtimeThreshold: 80, overtimeMultiplier: 1.5, entries: [entry({ hours: 85, rate: 20 })] });
    expect(t.overtimeHours).toBe(5);
    expect(t.regularHours).toBe(80);
  });
});

describe('buildStubTotals — hours with no rate', () => {
  it('pays them nothing and reports them separately', () => {
    const t = buildStubTotals({
      ...NO_OVERTIME,
      entries: [entry({ hours: 30, rate: 25 }), entry({ hours: 6, rate: null })],
    });
    expect(t.straightTimePay).toBe(750);
    expect(t.unpaidHours).toBe(6);
    expect(t.regularHours).toBe(30);
  });

  it('leaves them out of the blended rate', () => {
    // Dividing $750 by 36 hours would report $20.83 and quietly shrink any overtime premium.
    const t = buildStubTotals({
      ...NO_OVERTIME,
      entries: [entry({ hours: 30, rate: 25 }), entry({ hours: 6, rate: null })],
    });
    expect(t.regularRate).toBe(25);
  });

  it('does not let an undecided entry push somebody into overtime', () => {
    // 38 paid + 6 undecided is 44 hours worked but only 38 decided. Creating an overtime premium
    // out of a pending decision would pay for a judgement nobody has made.
    const t = buildStubTotals({
      ...NO_OVERTIME,
      entries: [entry({ hours: 38, rate: 25 }), entry({ hours: 6, rate: null })],
    });
    expect(t.overtimeHours).toBe(0);
    expect(t.unpaidHours).toBe(6);
  });

  it('still counts them in the job breakdown, because the work happened', () => {
    const t = buildStubTotals({
      ...NO_OVERTIME,
      entries: [entry({ hours: 6, rate: null, jobId: 'j1', jobName: 'Smith Boundary' })],
    });
    expect(t.jobHours).toEqual([{ job_id: 'j1', job_name: 'Smith Boundary', hours: 6, work_type: 'field_work' }]);
  });
});

describe('buildStubTotals — the job breakdown', () => {
  it('groups by job AND activity, not by job alone', () => {
    // "8 hours on the Smith survey" answers less than "6 field, 2 driving".
    const t = buildStubTotals({
      ...NO_OVERTIME,
      entries: [
        entry({ hours: 3, jobId: 'j1', jobName: 'Smith', workType: 'field_work' }),
        entry({ hours: 3, jobId: 'j1', jobName: 'Smith', workType: 'field_work' }),
        entry({ hours: 2, jobId: 'j1', jobName: 'Smith', workType: 'driving', rate: 15 }),
      ],
    });
    expect(t.jobHours).toHaveLength(2);
    expect(t.jobHours.find((j) => j.work_type === 'field_work')?.hours).toBe(6);
    expect(t.jobHours.find((j) => j.work_type === 'driving')?.hours).toBe(2);
  });

  it('keeps unassigned hours as their own row rather than dropping them', () => {
    const t = buildStubTotals({ ...NO_OVERTIME, entries: [entry({ hours: 4, jobId: null })] });
    expect(t.jobHours).toHaveLength(1);
    expect(t.jobHours[0].job_id).toBeNull();
  });
});

describe('buildStubTotals — bad input', () => {
  it('ignores zero and negative hours rather than subtracting pay', () => {
    const t = buildStubTotals({
      ...NO_OVERTIME,
      entries: [entry({ hours: 8 }), entry({ hours: 0 }), entry({ hours: -4 })],
    });
    expect(t.straightTimePay).toBe(200);
    expect(t.regularHours).toBe(8);
  });

  it('treats a NaN rate as unset rather than producing a NaN stub', () => {
    const t = buildStubTotals({ ...NO_OVERTIME, entries: [entry({ hours: 8, rate: Number.NaN })] });
    expect(t.grossPay).toBe(0);
    expect(t.unpaidHours).toBe(8);
  });

  it('uses the default deduction rates when none are passed', () => {
    const t = buildStubTotals({ ...NO_OVERTIME, entries: [entry({ hours: 1, rate: 100 })] });
    expect(t.federalTax).toBe(round(100 * DEFAULT_DEDUCTIONS.federal));
  });
});

function round(n: number) { return Math.round(n * 100) / 100; }
