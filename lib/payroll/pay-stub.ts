// lib/payroll/pay-stub.ts
//
// TURNING APPROVED HOURS INTO A PAY STUB
// ══════════════════════════════════════
//
// The pure half of the payroll run. `app/api/admin/payroll/runs/route.ts` does the I/O; every
// number on a stub is decided here, where it can be tested.
//
// ── WHAT THIS REPLACES ──────────────────────────────────────────────────────────────────────────
//
// The run engine used to compute `emp.hourly_rate + certBump + roleAdj` — its own formula, off
// `employee_certifications.pay_bump_amount` and `role_pay_adjustments`, sharing no table with any
// other rate in the platform. It was the fourth of four implementations and the only one that
// actually cut a cheque, which is a bad combination.
//
// It also read `job_time_entries`, while every hour anybody logs is written to `daily_time_logs`.
// Those are different tables. `job_time_entries` has zero rows and always did, so a payroll run
// produced a stub of 0 hours for everybody and reported success. **An empty result read as a
// completed payroll.**
//
// ── THE RULES NOW ───────────────────────────────────────────────────────────────────────────────
//
// One hour is worth whatever the pay model said it was worth (`resolve-rate.ts`), or whatever the
// approver decided instead (`pay-decision.ts`). This module does not re-derive rates; it consumes
// the numbers already agreed and turns them into hours, gross, deductions and net.
//
// Only **approved** hours are paid. Pending, rejected and disputed hours are excluded and counted
// separately, so "your stub is short" has an answer that is not "we lost them".
//
// ── OVERTIME ON MIXED RATES ─────────────────────────────────────────────────────────────────────
//
// A week can contain hours at several rates — $25 base pay, $15 driving, a hand-set amount. There
// is no single "hourly rate" to multiply by 1.5, so the overtime premium is computed the way the
// FLSA computes it for pieceworkers and mixed rates:
//
//   regular rate = total straight-time pay ÷ total hours worked
//   overtime premium = 0.5 × regular rate × overtime hours
//
// Straight time is already paid for every hour including the overtime ones, so the extra owed is a
// **half**-time premium, not one-and-a-half. Multiplying the whole overtime hour by 1.5 on top of
// straight time would pay 2.5×.
//
// Hours with no rate set are excluded from the regular-rate average, because dividing by hours that
// contributed no pay would understate the rate and quietly shrink somebody's overtime.

/** One approved entry, already priced. */
export interface PayableHours {
  /** The hours to pay: the approver's adjustment when there is one, else what was submitted. */
  hours: number;
  /** The agreed rate for these hours, or null when nobody has set one. */
  rate: number | null;
  workType: string | null;
  jobId: string | null;
  jobName: string | null;
  logDate: string;
}

export interface DeductionRates {
  federal: number;
  state: number;
  socialSecurity: number;
  medicare: number;
}

/**
 * Payroll-tax withholding. Flat percentages, which is an estimate and is labelled as one on the
 * stub — real withholding depends on a W-4, filing status and year-to-date wages, and belongs to a
 * payroll provider rather than to this codebase.
 *
 * Texas has no state income tax, hence 0. It is a named rate rather than an omitted line so that a
 * firm operating elsewhere changes a number instead of finding the concept missing.
 */
export const DEFAULT_DEDUCTIONS: DeductionRates = {
  federal: 0.12,
  state: 0,
  socialSecurity: 0.062,
  medicare: 0.0145,
};

export interface StubInput {
  entries: PayableHours[];
  /** Hours beyond this in the period attract the overtime premium. */
  overtimeThreshold: number;
  /** 1.5 in the config; the premium applied is this minus 1, since straight time is already paid. */
  overtimeMultiplier: number;
  deductions?: DeductionRates;
}

export interface JobHours {
  job_id: string | null;
  job_name: string | null;
  hours: number;
  work_type: string | null;
}

export interface StubTotals {
  regularHours: number;
  overtimeHours: number;
  /** Hours on entries with no rate. Paid nothing, reported separately, never counted as free. */
  unpaidHours: number;
  /** Straight-time pay for every hour, including the overtime ones. */
  straightTimePay: number;
  /** The blended hourly rate the overtime premium is computed from. Null when nothing is paid. */
  regularRate: number | null;
  /** The extra owed for the overtime hours, over and above straight time. */
  overtimePremium: number;
  grossPay: number;
  federalTax: number;
  stateTax: number;
  socialSecurity: number;
  medicare: number;
  totalDeductions: number;
  netPay: number;
  jobHours: JobHours[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Build the totals for one person's stub from their approved, priced hours.
 *
 * Returns zeroed totals for an empty list rather than throwing — somebody who logged nothing this
 * period has a legitimately empty stub, and that is different from an error.
 */
export function buildStubTotals(input: StubInput): StubTotals {
  const deductionRates = input.deductions ?? DEFAULT_DEDUCTIONS;

  let paidHours = 0;
  let unpaidHours = 0;
  let straightTimePay = 0;
  const jobs = new Map<string, JobHours>();

  for (const entry of input.entries) {
    const hours = Number(entry.hours);
    if (!Number.isFinite(hours) || hours <= 0) continue;

    // Grouped by job AND work type: "8 hours on the Smith survey" is less useful than "6 field, 2
    // driving on the Smith survey" when somebody queries their stub.
    const key = `${entry.jobId ?? ''}::${entry.workType ?? ''}`;
    const existing = jobs.get(key);
    if (existing) existing.hours = round2(existing.hours + hours);
    else jobs.set(key, { job_id: entry.jobId, job_name: entry.jobName, hours: round2(hours), work_type: entry.workType });

    if (entry.rate === null || entry.rate === undefined || !Number.isFinite(entry.rate)) {
      unpaidHours += hours;
      continue;
    }
    paidHours += hours;
    straightTimePay += hours * entry.rate;
  }

  straightTimePay = round2(straightTimePay);

  // Overtime is measured against PAID hours. An hour nobody has priced has not been decided yet, so
  // letting it push somebody over the threshold would create an overtime premium out of a pending
  // decision.
  const threshold = Number.isFinite(input.overtimeThreshold) ? input.overtimeThreshold : Infinity;
  const overtimeHours = round2(Math.max(0, paidHours - threshold));
  const regularHours = round2(paidHours - overtimeHours);

  const regularRate = paidHours > 0 ? round2(straightTimePay / paidHours) : null;

  // `multiplier - 1` because straight time is already in `straightTimePay` for every hour.
  const premiumRate = Math.max(0, (Number(input.overtimeMultiplier) || 1) - 1);
  const overtimePremium = regularRate === null ? 0 : round2(regularRate * premiumRate * overtimeHours);

  const grossPay = round2(straightTimePay + overtimePremium);

  const federalTax = round2(grossPay * deductionRates.federal);
  const stateTax = round2(grossPay * deductionRates.state);
  const socialSecurity = round2(grossPay * deductionRates.socialSecurity);
  const medicare = round2(grossPay * deductionRates.medicare);
  const totalDeductions = round2(federalTax + stateTax + socialSecurity + medicare);

  return {
    regularHours,
    overtimeHours,
    unpaidHours: round2(unpaidHours),
    straightTimePay,
    regularRate,
    overtimePremium,
    grossPay,
    federalTax,
    stateTax,
    socialSecurity,
    medicare,
    totalDeductions,
    netPay: round2(grossPay - totalDeductions),
    jobHours: [...jobs.values()],
  };
}
