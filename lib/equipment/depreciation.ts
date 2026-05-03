// lib/equipment/depreciation.ts
//
// Phase F10.9 — Section 179 / MACRS / straight-line depreciation
// algorithm. Pure functions; no DB. The §5.12.10 lock-year
// ritual + the Asset Detail Schedule PDF + the §5.12.7.7 fleet
// valuation page all consume the per-year schedule this module
// emits.
//
// Conventions:
//   * All dollars in cents (BIGINT-compatible). The schedule
//     ALWAYS sums to acquired_cost_cents — rounding happens on
//     the LAST year of the schedule so totals reconcile to the
//     penny. (Floor on intermediate years; remainder absorbs
//     the float drift on year N.)
//   * Half-year convention applies to MACRS + straight-line.
//     The asset gets a half year of depreciation in year 1
//     regardless of which month it landed in service. Mid-
//     quarter / mid-month conventions ship as a v2 polish if
//     the bookkeeper hits the 40% Q4-purchase trigger.
//   * Section 179 takes the FULL cost in year 1 (subject to
//     the annual cap from Pub 946). Year 2+ rows have zero.
//   * Bonus first-year depreciation applies the phased-out
//     percentage in year 1, then the remaining basis goes
//     through MACRS-5 (current TCJA 5-year property default).
//
// Inputs are dataclass-shaped so a future async/cross-batch
// computation can pass arrays through without per-row I/O.
//
// Coverage: spec §5.12.10 ("Depreciation algorithm — runs on
// lock-year"). Pub 946 references baked in below.

// ────────────────────────────────────────────────────────────
// Pub 946 constants
// ────────────────────────────────────────────────────────────

/**
 * MACRS 5-year property half-year convention percentages (Pub
 * 946 Table A-1). Sums to 1.0 exactly across 6 fiscal years
 * (years 1-5 plus year 6 stub from the half-year convention).
 */
const MACRS_5YR_HALF_YEAR: readonly number[] = [
  0.2, 0.32, 0.192, 0.1152, 0.1152, 0.0576,
];

/**
 * MACRS 7-year property half-year convention percentages (Pub
 * 946 Table A-1). 8 fiscal years (years 1-7 plus year 8 stub).
 */
const MACRS_7YR_HALF_YEAR: readonly number[] = [
  0.1429, 0.2449, 0.1749, 0.1249, 0.0893, 0.0892, 0.0893, 0.0446,
];

/**
 * Bonus first-year depreciation percentage by tax year — TCJA
 * phase-out schedule. 2017-2022 = 100%; phased down 20% per
 * year through 2027; zero thereafter unless Congress extends.
 * The remaining basis goes through MACRS-5.
 */
const BONUS_DEPRECIATION_BY_YEAR: Record<number, number> = {
  2017: 1.0,
  2018: 1.0,
  2019: 1.0,
  2020: 1.0,
  2021: 1.0,
  2022: 1.0,
  2023: 0.8,
  2024: 0.6,
  2025: 0.4,
  2026: 0.2,
  // 2027+ → 0 unless re-extended.
};

/**
 * Section 179 expense cap by tax year (Pub 946). Indexed for
 * inflation each year. The bookkeeper can override this in
 * `app_settings` once the tax-summary extension lands; the
 * baseline here keeps the algorithm correct against historical
 * years for re-runs / audit.
 */
const SECTION_179_CAP_CENTS_BY_YEAR: Record<number, number> = {
  2017: 510_000_00,
  2018: 1_000_000_00,
  2019: 1_020_000_00,
  2020: 1_040_000_00,
  2021: 1_050_000_00,
  2022: 1_080_000_00,
  2023: 1_160_000_00,
  2024: 1_220_000_00,
  2025: 1_250_000_00,
  2026: 1_280_000_00,
};

const DEFAULT_BONUS_PERCENT = 0;
const DEFAULT_SECTION_179_CAP_CENTS = 1_280_000_00; // current cap

export type DepreciationMethod =
  | 'section_179'
  | 'straight_line'
  | 'macrs_5yr'
  | 'macrs_7yr'
  | 'bonus_first_year'
  | 'none';

export interface DepreciableAsset {
  /** Cost basis at acquisition (cents). */
  acquired_cost_cents: number;
  /** ISO date the asset was actually put to work. Determines
   *  the first tax year of the schedule. */
  placed_in_service_at: string;
  /** Election from the §5.12.10 enum. */
  depreciation_method: DepreciationMethod;
  /** Optional override for straight-line. Falls back to a
   *  sensible default per asset class when null. */
  useful_life_months?: number | null;
}

export interface DepreciationYear {
  tax_year: number;
  /** Dollars depreciated FOR this year (Schedule C Line 13). */
  amount_cents: number;
  /** Cost basis the year started with (decreases as accumulated
   *  depreciation grows). */
  basis_cents: number;
  /** Cost basis the year ENDED with — feeds into year+1 as
   *  basis_cents. */
  remaining_basis_cents: number;
  /** Snapshot of the method that produced this year&apos;s
   *  amount. Same as input for normal cases; the bonus-then-
   *  MACRS chain produces 'bonus_first_year' on year 1 and
   *  'macrs_5yr' on years 2-N. */
  method: DepreciationMethod;
  /** Free-form context for the audit log. "MACRS 5-year, year
   *  1 of 6 (half-year convention)." */
  notes?: string;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Compute the full year-by-year depreciation schedule for an
 * asset. The first row&apos;s tax_year is the calendar year of
 * `placed_in_service_at`; subsequent rows count up by one year
 * until the basis hits zero (or the schedule is exhausted).
 *
 * Returns an empty array for `depreciation_method='none'` or
 * when the cost basis is zero.
 *
 * Pure function: no I/O, no global state read beyond the Pub
 * 946 constants above.
 */
export function computeDepreciationSchedule(
  asset: DepreciableAsset
): DepreciationYear[] {
  if (asset.depreciation_method === 'none') return [];
  if (asset.acquired_cost_cents <= 0) return [];

  const startYear = parseStartYear(asset.placed_in_service_at);
  if (startYear === null) return [];

  switch (asset.depreciation_method) {
    case 'section_179':
      return scheduleSection179(asset, startYear);
    case 'straight_line':
      return scheduleStraightLine(asset, startYear);
    case 'macrs_5yr':
      return scheduleMacrs(
        asset,
        startYear,
        MACRS_5YR_HALF_YEAR,
        'macrs_5yr'
      );
    case 'macrs_7yr':
      return scheduleMacrs(
        asset,
        startYear,
        MACRS_7YR_HALF_YEAR,
        'macrs_7yr'
      );
    case 'bonus_first_year':
      return scheduleBonusFirstYear(asset, startYear);
    default:
      // Exhaustiveness check via never — runtime guard for
      // stringly-typed inputs from JSON bodies.
      return [];
  }
}

/**
 * Return only the row for a specific tax year, or null if the
 * asset isn&apos;t depreciable that year (year before
 * placed_in_service or after the schedule ends).
 *
 * Used by the §5.12.10 lock-year ritual when freezing one row
 * at a time + by the tax-summary endpoint when computing the
 * unlocked-year sum.
 */
export function depreciationForYear(
  asset: DepreciableAsset,
  taxYear: number
): DepreciationYear | null {
  const schedule = computeDepreciationSchedule(asset);
  return schedule.find((row) => row.tax_year === taxYear) ?? null;
}

// ────────────────────────────────────────────────────────────
// Method-specific schedules
// ────────────────────────────────────────────────────────────

function scheduleSection179(
  asset: DepreciableAsset,
  startYear: number
): DepreciationYear[] {
  const cap = SECTION_179_CAP_CENTS_BY_YEAR[startYear] ?? DEFAULT_SECTION_179_CAP_CENTS;
  const expensed = Math.min(asset.acquired_cost_cents, cap);
  const remainingBasis = asset.acquired_cost_cents - expensed;

  const rows: DepreciationYear[] = [
    {
      tax_year: startYear,
      amount_cents: expensed,
      basis_cents: asset.acquired_cost_cents,
      remaining_basis_cents: remainingBasis,
      method: 'section_179',
      notes: `Section 179 expense, capped at $${(cap / 100).toLocaleString()} for ${startYear}.`,
    },
  ];

  // If the cost exceeded the cap, the leftover basis goes
  // through MACRS-5 starting year 2. (This is the standard
  // §179 + MACRS hybrid path the IRS allows.)
  if (remainingBasis > 0) {
    const rest = scheduleMacrs(
      { ...asset, acquired_cost_cents: remainingBasis },
      startYear + 1,
      MACRS_5YR_HALF_YEAR,
      'macrs_5yr'
    );
    rows.push(...rest);
  }
  return rows;
}

function scheduleStraightLine(
  asset: DepreciableAsset,
  startYear: number
): DepreciationYear[] {
  const lifeMonths = asset.useful_life_months ?? 60; // default 5 years
  if (lifeMonths <= 0) return [];

  const lifeYears = Math.ceil(lifeMonths / 12);
  // Half-year convention: years 1 and N+1 each get half a year of
  // depreciation; years 2..N get a full year.
  const annualCents = Math.floor(asset.acquired_cost_cents / lifeYears);
  const halfYearCents = Math.floor(annualCents / 2);

  const rows: DepreciationYear[] = [];
  let remaining = asset.acquired_cost_cents;

  // Year 1 — half year.
  rows.push({
    tax_year: startYear,
    amount_cents: halfYearCents,
    basis_cents: asset.acquired_cost_cents,
    remaining_basis_cents: remaining - halfYearCents,
    method: 'straight_line',
    notes: `Straight-line, ${lifeYears}yr useful life, year 1 of ${lifeYears + 1} (half-year convention).`,
  });
  remaining -= halfYearCents;

  // Years 2..N — full year. Last year absorbs rounding to keep
  // totals reconciled.
  for (let yr = 2; yr <= lifeYears; yr += 1) {
    const isLast = yr === lifeYears + 1; // never true here
    const amount = isLast ? remaining : annualCents;
    rows.push({
      tax_year: startYear + yr - 1,
      amount_cents: amount,
      basis_cents: remaining,
      remaining_basis_cents: remaining - amount,
      method: 'straight_line',
      notes: `Straight-line, ${lifeYears}yr useful life, year ${yr} of ${lifeYears + 1} (full year).`,
    });
    remaining -= amount;
  }

  // Final stub year — half-year convention, absorbs remainder
  // so the schedule sums to acquired_cost_cents exactly.
  rows.push({
    tax_year: startYear + lifeYears,
    amount_cents: remaining,
    basis_cents: remaining,
    remaining_basis_cents: 0,
    method: 'straight_line',
    notes: `Straight-line, ${lifeYears}yr useful life, final year (half-year stub; absorbs rounding).`,
  });

  return rows;
}

function scheduleMacrs(
  asset: DepreciableAsset,
  startYear: number,
  table: readonly number[],
  reportedMethod: DepreciationMethod
): DepreciationYear[] {
  if (table.length === 0) return [];

  const cost = asset.acquired_cost_cents;
  const rows: DepreciationYear[] = [];
  let remaining = cost;

  for (let i = 0; i < table.length; i += 1) {
    const isLast = i === table.length - 1;
    // Rounding strategy: floor every intermediate year so totals
    // never overshoot; last year absorbs the remainder so the
    // schedule sums exactly to cost.
    const amount = isLast ? remaining : Math.floor(cost * table[i]);
    rows.push({
      tax_year: startYear + i,
      amount_cents: amount,
      basis_cents: remaining,
      remaining_basis_cents: remaining - amount,
      method: reportedMethod,
      notes: `${labelForMacrs(reportedMethod)}, year ${i + 1} of ${table.length} (half-year convention; ${(table[i] * 100).toFixed(2)}% rate).`,
    });
    remaining -= amount;
  }
  return rows;
}

function scheduleBonusFirstYear(
  asset: DepreciableAsset,
  startYear: number
): DepreciationYear[] {
  const bonusPct =
    BONUS_DEPRECIATION_BY_YEAR[startYear] ?? DEFAULT_BONUS_PERCENT;
  if (bonusPct <= 0) {
    // Past the phase-out. Fall back to MACRS-5 with a note.
    const rows = scheduleMacrs(
      asset,
      startYear,
      MACRS_5YR_HALF_YEAR,
      'macrs_5yr'
    );
    if (rows.length > 0) {
      rows[0] = {
        ...rows[0],
        notes:
          (rows[0].notes ?? '') +
          ` Bonus depreciation requested but phased out for ${startYear}; falling back to MACRS-5.`,
      };
    }
    return rows;
  }

  const bonusCents = Math.floor(asset.acquired_cost_cents * bonusPct);
  const remainingBasis = asset.acquired_cost_cents - bonusCents;

  const rows: DepreciationYear[] = [
    {
      tax_year: startYear,
      amount_cents: bonusCents,
      basis_cents: asset.acquired_cost_cents,
      remaining_basis_cents: remainingBasis,
      method: 'bonus_first_year',
      notes: `Bonus first-year depreciation at ${(bonusPct * 100).toFixed(0)}% (TCJA phase-out for ${startYear}).`,
    },
  ];

  // Remaining basis amortizes over MACRS-5 starting year 2.
  if (remainingBasis > 0) {
    const rest = scheduleMacrs(
      { ...asset, acquired_cost_cents: remainingBasis },
      startYear + 1,
      MACRS_5YR_HALF_YEAR,
      'macrs_5yr'
    );
    rows.push(...rest);
  }
  return rows;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function parseStartYear(iso: string): number | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).getUTCFullYear();
}

function labelForMacrs(method: DepreciationMethod): string {
  switch (method) {
    case 'macrs_5yr':
      return 'MACRS 5-year';
    case 'macrs_7yr':
      return 'MACRS 7-year';
    default:
      return 'MACRS';
  }
}
