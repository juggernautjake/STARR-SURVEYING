// lib/mileage/odometer.ts — the pure math for the Work Mode MANUAL mileage tracker (owner 2026-07-18: "put
// in our miles at the start of the day and at the end, and we record the vehicle used").
//
// Distinct from the existing GPS-derived mileage (`/api/admin/mileage` + `lib/mileage/summary.ts`, which sums
// Haversine distance across location pings): this is the surveyor typing the vehicle's odometer at clock-in
// and clock-out. It reuses the same IRS reimbursement rate (`IRS_BUSINESS_RATE_2025`) so a manual entry and a
// GPS day are valued identically — no second rate to drift. Pure + framework-free + fully tested.
import { IRS_BUSINESS_RATE_2025 } from '@/lib/mileage/summary';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A sanity ceiling on a single day's driving (miles). Anything above is almost certainly a typo (e.g. an
 *  extra digit) — flagged rather than silently reimbursed. */
export const MAX_REASONABLE_DAILY_MILES = 2000;

/**
 * Miles driven from a start + end odometer reading. Returns null when the entry can't be a real trip:
 * a non-finite or negative reading, or an end below the start (odometers only go up — a rollover is rare
 * enough to enter as two legs). Equal readings are a legal 0-mile day.
 */
export function odometerMiles(startReading: number, endReading: number): number | null {
  if (!Number.isFinite(startReading) || !Number.isFinite(endReading)) return null;
  if (startReading < 0 || endReading < 0) return null;
  if (endReading < startReading) return null;
  return round2(endReading - startReading);
}

/** Validate a manual odometer entry, returning a human error string or null when it's good. Drives the
 *  Work Mode form's inline validation (and the API's guard) from one place. */
export function validateOdometerEntry(startReading: number, endReading: number): string | null {
  if (!Number.isFinite(startReading) || !Number.isFinite(endReading)) return 'Enter both odometer readings.';
  if (startReading < 0 || endReading < 0) return 'Odometer readings can’t be negative.';
  if (endReading < startReading) return 'The ending reading is lower than the starting reading.';
  const miles = endReading - startReading;
  if (miles > MAX_REASONABLE_DAILY_MILES) return `That’s ${Math.round(miles)} miles in a day — check the readings.`;
  return null;
}

/**
 * Reimbursement dollars for a mileage figure at the IRS business rate (or an operator-supplied rate).
 * Returns null for a non-finite/negative mileage so a bad entry never becomes a bad payout line.
 */
export function mileageReimbursement(miles: number, ratePerMile: number = IRS_BUSINESS_RATE_2025): number | null {
  if (!Number.isFinite(miles) || miles < 0) return null;
  if (!Number.isFinite(ratePerMile) || ratePerMile < 0) return null;
  return round2(miles * ratePerMile);
}

export interface OdometerEntryResult {
  miles: number;
  reimbursement: number;
  rate: number;
}

/**
 * Resolve a complete manual odometer entry → { miles, reimbursement, rate }, or an `{ error }` when invalid —
 * the single call the Work Mode tracker + its API use, so the form preview and the saved financial line agree.
 */
export function resolveOdometerEntry(
  startReading: number,
  endReading: number,
  ratePerMile: number = IRS_BUSINESS_RATE_2025,
): OdometerEntryResult | { error: string } {
  const error = validateOdometerEntry(startReading, endReading);
  if (error) return { error };
  const miles = odometerMiles(startReading, endReading) as number;
  const reimbursement = mileageReimbursement(miles, ratePerMile) as number;
  return { miles, reimbursement, rate: ratePerMile };
}
