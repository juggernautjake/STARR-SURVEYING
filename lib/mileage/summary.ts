// lib/mileage/summary.ts
//
// hub-widget-excellence-15 — mileage-tracker. Pure roll-up that
// condenses the IRS-grade `/api/admin/mileage` `days[]` payload into the
// 3-number summary the widget renders. Dependency-free → unit-tested in
// node.

export interface MileageDay {
  miles: number;
  by_vehicle?: ReadonlyArray<{ is_driver: boolean | null; miles: number }>;
}

export interface MileageSummary {
  miles: number;
  trips: number;
  reimbursable_amount: number;
}

/** 2025 IRS standard mileage rate for business use ($/mile). Used as
 *  the default for the widget's `reimbursable_amount`. The number is
 *  conservative — operators with an internally negotiated rate can
 *  pass their own via `ratePerMile`. */
export const IRS_BUSINESS_RATE_2025 = 0.7;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Sum the per-day miles + count distinct driving days as "trips"
 * (a per-day session is the surveyor's intuitive trip unit on this
 * tile — segment counts spike with ping cadence and are hard to read
 * at a glance). The reimbursable amount uses only DRIVER miles when
 * the per-vehicle breakdown is available (IRS only deducts driver
 * miles), falling back to the day's total when the breakdown is
 * absent.
 */
export function summarizeMileageDays(
  days: readonly MileageDay[],
  ratePerMile: number = IRS_BUSINESS_RATE_2025,
): MileageSummary {
  let totalMiles = 0;
  let driverMiles = 0;
  let trips = 0;
  let anyBreakdown = false;

  for (const d of days) {
    totalMiles += d.miles;
    if (d.miles > 0) trips += 1;
    if (d.by_vehicle && d.by_vehicle.length > 0) {
      anyBreakdown = true;
      for (const v of d.by_vehicle) {
        if (v.is_driver === true) driverMiles += v.miles;
      }
    }
  }

  const reimbursableMiles = anyBreakdown ? driverMiles : totalMiles;
  return {
    miles: round2(totalMiles),
    trips,
    reimbursable_amount: round2(reimbursableMiles * ratePerMile),
  };
}
