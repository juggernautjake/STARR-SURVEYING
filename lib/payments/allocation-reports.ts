// lib/payments/allocation-reports.ts
//
// Phase-2 Slice 10 (data layer) of
// docs/planning/completed/CUSTOMER_INVOICING_PHASE2_2026-06-21.md.
//
// Pure aggregators that turn raw `financial_allocations` ledger rows
// + the category catalog into the rollups the §9.8 / Phase-2 Slice 10
// reports dashboard renders. The route handler queries the rows, hands
// them here, gets back fully-shaped report sections — no further math
// or sorting needed downstream.
//
// Pure → testable with frozen inputs, previewable on the dashboard
// without writing to the DB, reusable from CSV-export endpoints.

import type { AllocationCategoryInput } from './allocation-engine';

/** Subset of `financial_allocations` (seed 374) the rollup reads. */
export interface AllocationLedgerRow {
  id: string;
  payment_id: string;
  category_id: string;
  amount_cents: number;
  /** ISO timestamp. */
  allocated_at: string;
}

/** The rollup needs `label` + `color` on top of the engine's
 *  AllocationCategoryInput so the report rows carry display fields. */
export interface CategoryWithDisplay extends AllocationCategoryInput {
  label: string;
  color?: string | null;
}

// ── §10.1 Per-category rollup ────────────────────────────────────

export interface CategoryReportRow {
  category_id: string;
  category_key: string;
  label: string;
  color: string | null;
  sort_order: number;
  /** Target percentage of revenue dad set on the category. */
  target_percent: number;
  /** What that percentage WOULD be in dollars given the actual
   *  observed revenue in the window. */
  target_cents: number;
  /** What actually landed in this category's ledger. */
  actual_cents: number;
  /** `actual_cents` as a share of the WINDOW'S total observed
   *  revenue (0..1). */
  share_of_actual: number;
  /** actual_cents - target_cents. Negative = under target.
   *  Positive = over target. */
  variance_cents: number;
  /** Variance as a percentage of the target. Capped at +/-999 so a
   *  divide-by-zero category (target=0 but allocations present)
   *  renders sanely. null when target is 0. */
  variance_percent: number | null;
  /** Count of ledger rows aggregated. */
  row_count: number;
}

export interface AllocationReportSection {
  rows: CategoryReportRow[];
  /** Sum across all rows.actual_cents. */
  total_revenue_cents: number;
  /** Sum across all rows.target_cents — matches total_revenue_cents
   *  unless target percentages don't sum to 100 (config error). */
  total_target_cents: number;
  /** Sum of category.target_percent. Should be 100 in the happy
   *  path; anything else is a config error the editor must fix. */
  total_percent: number;
  /** Window the report covered (null = all-time). */
  window: { start: string | null; end: string | null };
}

export interface RollupOptions {
  /** Inclusive lower bound on `allocated_at`. ISO timestamp. null =
   *  no lower bound. */
  from?: string | null;
  /** Inclusive upper bound. */
  to?: string | null;
  /** When true, include inactive categories (with zero allocations
   *  expected). Useful for "historical" reports where dad has since
   *  archived a category. Default false. */
  include_inactive?: boolean;
}

/** Pure. Roll up the ledger rows into one row per category with
 *  target vs actual + variance + share-of-actual. */
export function rollupAllocationsByCategory(
  categories: readonly CategoryWithDisplay[],
  ledger: readonly AllocationLedgerRow[],
  opts: RollupOptions = {},
): AllocationReportSection {
  const from = opts.from ? Date.parse(opts.from) : null;
  const to = opts.to ? Date.parse(opts.to) : null;

  const scoped = ledger.filter((row) => {
    const t = Date.parse(row.allocated_at);
    if (Number.isNaN(t)) return false;
    if (from !== null && t < from) return false;
    if (to !== null && t > to) return false;
    return true;
  });

  const total_revenue_cents = scoped.reduce((s, r) => s + r.amount_cents, 0);

  const ledgerByCategory = new Map<string, AllocationLedgerRow[]>();
  for (const r of scoped) {
    const list = ledgerByCategory.get(r.category_id);
    if (list) list.push(r); else ledgerByCategory.set(r.category_id, [r]);
  }

  const eligibleCategories = opts.include_inactive
    ? categories
    : categories.filter((c) => c.is_active);

  const rows: CategoryReportRow[] = eligibleCategories.map((c) => {
    const cls = ledgerByCategory.get(c.id) ?? [];
    const actual_cents = cls.reduce((s, r) => s + r.amount_cents, 0);
    const target_cents = Math.round(total_revenue_cents * c.target_percent / 100);
    const variance_cents = actual_cents - target_cents;
    const variance_percent = target_cents === 0
      ? null
      : clamp(round1((variance_cents / target_cents) * 100), -999, 999);
    const share_of_actual = total_revenue_cents > 0 ? actual_cents / total_revenue_cents : 0;
    return {
      category_id: c.id,
      category_key: c.category_key,
      label: c.label,
      color: c.color ?? null,
      sort_order: c.sort_order,
      target_percent: c.target_percent,
      target_cents,
      actual_cents,
      share_of_actual,
      variance_cents,
      variance_percent,
      row_count: cls.length,
    };
  });

  rows.sort((a, b) => a.sort_order - b.sort_order);

  const total_target_cents = rows.reduce((s, r) => s + r.target_cents, 0);
  const total_percent = round2(
    eligibleCategories.reduce((s: number, c) => s + Number(c.target_percent), 0),
  );

  return {
    rows,
    total_revenue_cents,
    total_target_cents,
    total_percent,
    window: { start: opts.from ?? null, end: opts.to ?? null },
  };
}

// ── §10.2 Revenue by period ──────────────────────────────────────

export type Granularity = 'day' | 'week' | 'month' | 'year';

export interface PeriodBucket {
  /** YYYY-MM-DD for day, YYYY-MM-DD (Monday) for week, YYYY-MM for
   *  month, YYYY for year. */
  period_key: string;
  /** ISO timestamp of the start of the bucket — useful for sort +
   *  range queries downstream. */
  period_start: string;
  total_cents: number;
  row_count: number;
}

/** Pure. Bucket the ledger rows by period granularity. */
export function revenueByPeriod(
  ledger: readonly AllocationLedgerRow[],
  granularity: Granularity,
  opts: RollupOptions = {},
): PeriodBucket[] {
  const from = opts.from ? Date.parse(opts.from) : null;
  const to = opts.to ? Date.parse(opts.to) : null;

  const buckets = new Map<string, PeriodBucket>();

  for (const row of ledger) {
    const t = Date.parse(row.allocated_at);
    if (Number.isNaN(t)) continue;
    if (from !== null && t < from) continue;
    if (to !== null && t > to) continue;

    const date = new Date(t);
    const key = periodKey(date, granularity);
    const start = periodStart(date, granularity).toISOString();

    const existing = buckets.get(key);
    if (existing) {
      existing.total_cents += row.amount_cents;
      existing.row_count += 1;
    } else {
      buckets.set(key, {
        period_key: key,
        period_start: start,
        total_cents: row.amount_cents,
        row_count: 1,
      });
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.period_start.localeCompare(b.period_start));
}

// ── Internals ────────────────────────────────────────────────────

function periodKey(d: Date, g: Granularity): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  switch (g) {
    case 'day':   return `${y}-${m}-${day}`;
    case 'week': {
      // ISO week — Monday-based. Use the date of the Monday at or
      // before this date in UTC.
      const monday = startOfIsoWeek(d);
      const yy = monday.getUTCFullYear();
      const mm = String(monday.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(monday.getUTCDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    }
    case 'month': return `${y}-${m}`;
    case 'year':  return `${y}`;
  }
}

function periodStart(d: Date, g: Granularity): Date {
  switch (g) {
    case 'day': return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    case 'week': return startOfIsoWeek(d);
    case 'month': return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    case 'year': return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  }
}

function startOfIsoWeek(d: Date): Date {
  const day = d.getUTCDay();
  const shift = (day + 6) % 7;  // Sunday=0 → 6, Monday=1 → 0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - shift));
  return monday;
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }
