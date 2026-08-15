// __tests__/mileage/fuel.test.ts
//
// C0b2 — the fuel-cost half of a manual trip.
//
// What is locked here: that an UNKNOWN input yields null rather than zero (the day-one case, where
// no vehicle has an MPG on file yet — a $0.00 fuel cost would read as "this trip was free"), that
// the money is computed in cents and rounded once, and that the sanity ceilings catch the typos
// that would otherwise become a plausible-looking expense figure.

import { describe, it, expect } from 'vitest';
import {
  MAX_REASONABLE_FUEL_PRICE_CENTS,
  MAX_REASONABLE_MPG,
  estimateTripFuel,
  fuelCostCents,
  gallonsUsed,
  validateFuelPriceCents,
  validateMpg,
} from '@/lib/mileage/fuel';

describe('gallonsUsed', () => {
  it('divides miles by mpg', () => {
    expect(gallonsUsed(100, 20)).toBe(5);
    expect(gallonsUsed(45, 18)).toBe(2.5);
  });

  it('is 0 gallons for a 0-mile trip, which is a real entry', () => {
    expect(gallonsUsed(0, 20)).toBe(0);
  });

  it('rejects an mpg of zero rather than treating it as infinite consumption', () => {
    // 0 mpg is a data-entry failure. Dividing by it yields Infinity, which would render as a
    // spectacular fuel cost rather than as the mistake it is.
    expect(gallonsUsed(100, 0)).toBeNull();
    expect(gallonsUsed(100, -5)).toBeNull();
  });

  it('rejects impossible inputs', () => {
    expect(gallonsUsed(-1, 20)).toBeNull();
    expect(gallonsUsed(NaN, 20)).toBeNull();
    expect(gallonsUsed(100, MAX_REASONABLE_MPG + 1)).toBeNull();
  });
});

describe('fuelCostCents', () => {
  it('computes cost in whole cents', () => {
    // 100 miles / 20 mpg = 5 gallons at $3.89 = $19.45
    expect(fuelCostCents(100, 20, 389)).toBe(1945);
  });

  it('rounds only at the end, so the cent is right', () => {
    // 33 / 17 = 1.94117… gallons at 389¢ = 755.1…¢. Rounding gallons first (1.94) would give 754.
    expect(fuelCostCents(33, 17, 389)).toBe(755);
  });

  it('is 0 for a 0-mile trip and for a 0 price', () => {
    expect(fuelCostCents(0, 20, 389)).toBe(0);
    expect(fuelCostCents(100, 20, 0)).toBe(0);
  });

  it('rejects the typos the ceilings exist for', () => {
    expect(fuelCostCents(100, 20, MAX_REASONABLE_FUEL_PRICE_CENTS + 1)).toBeNull();
    expect(fuelCostCents(100, MAX_REASONABLE_MPG + 1, 389)).toBeNull();
    expect(fuelCostCents(100, 20, -1)).toBeNull();
  });
});

describe('estimateTripFuel', () => {
  it('returns the whole fuel side in one call', () => {
    expect(estimateTripFuel(100, 20, 389)).toEqual({
      gallons: 5,
      fuelCostCents: 1945,
      mpg: 20,
      fuelPriceCents: 389,
    });
  });

  it('returns null — NOT a zero cost — when the vehicle has no mpg on file', () => {
    // The day-one case: seed 592 adds vehicles.mpg nullable because the fleet's figures are not
    // known yet. "Cannot estimate" and "cost nothing" must not render identically.
    expect(estimateTripFuel(100, null, 389)).toBeNull();
    expect(estimateTripFuel(100, undefined, 389)).toBeNull();
  });

  it('returns null when no fuel price is configured', () => {
    expect(estimateTripFuel(100, 20, null)).toBeNull();
  });

  it('returns null rather than a partial estimate when an input is out of range', () => {
    expect(estimateTripFuel(100, 0, 389)).toBeNull();
    expect(estimateTripFuel(-5, 20, 389)).toBeNull();
  });

  it('snapshots the mpg and price it used, so a later fleet edit cannot rewrite history', () => {
    const est = estimateTripFuel(60, 15, 402);
    expect(est?.mpg).toBe(15);
    expect(est?.fuelPriceCents).toBe(402);
  });
});

describe('validation messages', () => {
  it('accepts good figures', () => {
    expect(validateMpg(22.5)).toBeNull();
    expect(validateFuelPriceCents(389)).toBeNull();
    expect(validateFuelPriceCents(0)).toBeNull();
  });

  it('explains what is wrong rather than just failing', () => {
    expect(validateMpg(0)).toMatch(/greater than zero/i);
    expect(validateMpg(NaN)).toMatch(/miles per gallon/i);
    expect(validateMpg(MAX_REASONABLE_MPG + 1)).toMatch(/typo/i);
    expect(validateFuelPriceCents(-1)).toMatch(/negative/i);
    expect(validateFuelPriceCents(MAX_REASONABLE_FUEL_PRICE_CENTS + 1)).toMatch(/typo/i);
  });
});
