// __tests__/mileage/odometer.test.ts — the Work Mode manual odometer mileage tracker (pure math).
import { describe, it, expect } from 'vitest';
import {
  odometerMiles, validateOdometerEntry, mileageReimbursement, resolveOdometerEntry,
  MAX_REASONABLE_DAILY_MILES,
} from '@/lib/mileage/odometer';
import { IRS_BUSINESS_RATE_2025 } from '@/lib/mileage/summary';

describe('odometerMiles', () => {
  it('is end − start', () => {
    expect(odometerMiles(1000, 1042.5)).toBe(42.5);
    expect(odometerMiles(1000, 1000)).toBe(0); // a legal zero-mile day
  });
  it('rejects an end below the start, negatives, and non-finite', () => {
    expect(odometerMiles(1042, 1000)).toBeNull();
    expect(odometerMiles(-1, 10)).toBeNull();
    expect(odometerMiles(Number.NaN, 10)).toBeNull();
  });
});

describe('validateOdometerEntry', () => {
  it('passes a good entry', () => {
    expect(validateOdometerEntry(1000, 1050)).toBeNull();
  });
  it('flags reversed, negative, missing, and absurd entries', () => {
    expect(validateOdometerEntry(1050, 1000)).toMatch(/lower than/i);
    expect(validateOdometerEntry(-5, 10)).toMatch(/negative/i);
    expect(validateOdometerEntry(Number.NaN, 10)).toMatch(/both/i);
    expect(validateOdometerEntry(0, MAX_REASONABLE_DAILY_MILES + 1)).toMatch(/check the readings/i);
  });
});

describe('mileageReimbursement', () => {
  it('uses the IRS business rate by default', () => {
    expect(mileageReimbursement(100)).toBe(100 * IRS_BUSINESS_RATE_2025);
    expect(mileageReimbursement(42.5, 0.7)).toBe(29.75);
  });
  it('accepts an operator rate and rejects bad inputs', () => {
    expect(mileageReimbursement(10, 1)).toBe(10);
    expect(mileageReimbursement(-1)).toBeNull();
    expect(mileageReimbursement(10, -1)).toBeNull();
  });
});

describe('resolveOdometerEntry', () => {
  it('resolves miles + reimbursement + rate for the financial line', () => {
    const r = resolveOdometerEntry(1000, 1100);
    expect('error' in r).toBe(false);
    expect(r).toEqual({ miles: 100, reimbursement: round2(100 * IRS_BUSINESS_RATE_2025), rate: IRS_BUSINESS_RATE_2025 });
  });
  it('returns an error for an invalid entry (no payout line produced)', () => {
    const r = resolveOdometerEntry(1100, 1000);
    expect(r).toHaveProperty('error');
  });
});

function round2(n: number) { return Math.round(n * 100) / 100; }
