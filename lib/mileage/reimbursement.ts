// lib/mileage/reimbursement.ts — how a mileage figure becomes money.
//
// C0b4 of docs/planning/completed/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// ── WHAT THIS FILE USED TO BE ───────────────────────────────────────────────────────────────────
//
// `lib/mileage/odometer.ts`, "the pure math for the Work Mode MANUAL mileage tracker" — the
// surveyor typing the vehicle's odometer at clock-in and clock-out. The owner respecified mileage
// capture from odometer readings to addresses (D9), C0b3b shipped the address form, and C0g
// deleted the Work Mode shell that held the odometer one.
//
// So the capture half — `odometerMiles`, `validateOdometerEntry`, `resolveOdometerEntry` — had no
// caller in any UI by the time C0b4 came to remove it. What it did still have was a branch in
// `POST /api/admin/mileage/manual` that no screen in the product could reach.
//
// The valuation half is a different matter and is why this file still exists: `mileageReimbursement`
// and `MAX_REASONABLE_DAILY_MILES` are on the LIVE address path, and deleting the module wholesale
// would have taken them with it. Renamed rather than left in place, for the reason C0e gives about
// the field-assistant route: a file named for a path that no longer exists is a comment that has
// started lying.
//
// ── ON "HISTORICAL ODOMETER ROWS MUST STAY READABLE" ────────────────────────────────────────────
//
// C0b4's brief required it. Checked against the live database first: `mileage_entries` holds **zero
// rows**, of any source. There is no history to orphan — the constraint was written on an
// assumption about a table that had never taken a successful write until C0b3 fixed the generated
// column it was fighting.
//
// `distance_source = 'odometer'` is nonetheless left LEGAL in the check constraint, and nothing on
// the read path filters on it. That costs nothing and keeps the promise for a row that arrives from
// a backup or an import later — whereas tightening the constraint would make such a row
// unwritable, which is the orphaning the slice was trying to prevent.
import { IRS_BUSINESS_RATE_2025 } from '@/lib/mileage/summary';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A sanity ceiling on a single trip (miles). Anything above is almost certainly a typo — an extra
 *  digit — and is flagged rather than silently reimbursed. */
export const MAX_REASONABLE_DAILY_MILES = 2000;

/**
 * Reimbursement dollars for a mileage figure at the IRS business rate (or an operator-supplied
 * rate). Returns null for a non-finite/negative mileage so a bad entry never becomes a bad payout
 * line.
 */
export function mileageReimbursement(miles: number, ratePerMile: number = IRS_BUSINESS_RATE_2025): number | null {
  if (!Number.isFinite(miles) || miles < 0) return null;
  if (!Number.isFinite(ratePerMile) || ratePerMile < 0) return null;
  return round2(miles * ratePerMile);
}
