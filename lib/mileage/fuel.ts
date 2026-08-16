// lib/mileage/fuel.ts — the pure math for a trip's FUEL COST.
//
// C0b2 of docs/planning/completed/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// Owner, 2026-08-15: *"put in the starting address and the job address and the distance will be
// calculated and then that will use the miles per gallon to calculate the cost as well."*
//
// ── THIS IS A SECOND NUMBER, NOT A REPLACEMENT FOR THE FIRST ────────────────────────────────────
//
// `odometer.ts` values a trip at `IRS_BUSINESS_RATE_2025` — that is what the firm REIMBURSES, and
// it is what `/admin/payouts/tax-report` reads. What this file computes is what the trip actually
// COST IN FUEL. They answer different questions and they are not interchangeable: swapping one for
// the other would quietly change reimbursement and tax reporting.
//
// So both travel together. Every function here is additive to the reimbursement path and none of
// them touch it. See D9 in the planning doc, and seed 592 which stores the two side by side.
//
// ── WHY EVERYTHING RETURNS null RATHER THAN 0 ───────────────────────────────────────────────────
//
// A vehicle with no recorded MPG is the normal case on day one — seed 592 adds the column nullable
// precisely because the fleet's figures are not known yet. "We cannot estimate this" and "this trip
// cost nothing" must not render the same, so an unknown input yields `null` and the UI shows the
// reimbursement alone instead of inventing a $0.00 fuel cost.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A sanity ceiling on fuel economy. Above this the figure is a typo, not a hybrid. */
export const MAX_REASONABLE_MPG = 200;

/** A sanity ceiling on the price of a gallon, in cents. $50/gal is far past any pump. */
export const MAX_REASONABLE_FUEL_PRICE_CENTS = 5000;

/**
 * Gallons burned covering `miles` at `mpg`.
 *
 * Null when either input cannot produce a real answer. `mpg` of 0 is rejected rather than treated
 * as infinite consumption — it is a data-entry failure, not a measurement.
 */
export function gallonsUsed(miles: number, mpg: number): number | null {
  if (!Number.isFinite(miles) || miles < 0) return null;
  if (!Number.isFinite(mpg) || mpg <= 0 || mpg > MAX_REASONABLE_MPG) return null;
  return round2(miles / mpg);
}

/**
 * Fuel cost in CENTS for a trip.
 *
 * Cents, and rounded only at the end, because this figure is stored in an INTEGER column
 * (`mileage_entries.fuel_cost_cents`) and money that round-trips through a float accumulates error.
 * The division happens in full precision; only the final cent is rounded.
 */
export function fuelCostCents(miles: number, mpg: number, fuelPriceCents: number): number | null {
  if (!Number.isFinite(miles) || miles < 0) return null;
  if (!Number.isFinite(mpg) || mpg <= 0 || mpg > MAX_REASONABLE_MPG) return null;
  if (!Number.isFinite(fuelPriceCents) || fuelPriceCents < 0) return null;
  if (fuelPriceCents > MAX_REASONABLE_FUEL_PRICE_CENTS) return null;
  return Math.round((miles / mpg) * fuelPriceCents);
}

/** Validate an MPG figure for a form, returning a human error or null when it is usable. */
export function validateMpg(mpg: number): string | null {
  if (!Number.isFinite(mpg)) return 'Enter the vehicle’s miles per gallon.';
  if (mpg <= 0) return 'Miles per gallon has to be greater than zero.';
  if (mpg > MAX_REASONABLE_MPG) return `${round2(mpg)} mpg looks like a typo — check the figure.`;
  return null;
}

/** Validate a fuel price in cents, returning a human error or null when it is usable. */
export function validateFuelPriceCents(cents: number): string | null {
  if (!Number.isFinite(cents)) return 'Enter the price of a gallon of fuel.';
  if (cents < 0) return 'A fuel price can’t be negative.';
  if (cents > MAX_REASONABLE_FUEL_PRICE_CENTS) return 'That fuel price looks like a typo — check the figure.';
  return null;
}

export interface TripFuelEstimate {
  /** Gallons burned, for display next to the cost. */
  gallons: number;
  /** Estimated fuel cost, in cents — the value stored on the trip. */
  fuelCostCents: number;
  /** The MPG this estimate used, snapshotted onto the trip so a later fleet edit cannot rewrite history. */
  mpg: number;
  /** The fuel price this estimate used, snapshotted for the same reason. */
  fuelPriceCents: number;
}

/**
 * The whole fuel side of a trip in one call, or null when it cannot be estimated.
 *
 * One entry point so the form's preview and the row the API writes are computed by the same code —
 * the failure mode being avoided is a screen that promises one number and a database that stores
 * another, which this repo has shipped before in the payroll surfaces.
 */
export function estimateTripFuel(
  miles: number,
  mpg: number | null | undefined,
  fuelPriceCents: number | null | undefined,
): TripFuelEstimate | null {
  if (mpg == null || fuelPriceCents == null) return null;
  const gallons = gallonsUsed(miles, mpg);
  const cost = fuelCostCents(miles, mpg, fuelPriceCents);
  if (gallons === null || cost === null) return null;
  return { gallons, fuelCostCents: cost, mpg, fuelPriceCents };
}
