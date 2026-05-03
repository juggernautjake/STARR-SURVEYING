// app/api/admin/equipment/depreciation-rollup/route.ts
//
// GET /api/admin/equipment/depreciation-rollup?tax_year=YYYY
//
// Phase F10.9 — read-side companion to the lock-year worker.
// Walks every active depreciable asset and returns the per-row
// schedule for the requested tax year, sourcing from the frozen
// `equipment_tax_elections` table when the year is locked + from
// the on-the-fly depreciation library when it isn&apos;t.
//
// Drives:
//   * §5.12.7.7 fleet valuation page — asset list with per-row
//     depreciation columns + bottom-line aggregate.
//   * Tax-summary endpoint extension — same numbers, scoped to
//     a single year.
//   * Asset Detail Schedule PDF — passed to the worker function
//     that fills the report.
//
// Auth: admin / developer / bookkeeper / equipment_manager.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  computeDepreciationSchedule,
  depreciationForYear,
  type DepreciableAsset,
  type DepreciationMethod,
} from '@/lib/equipment/depreciation';

interface AssetRow {
  id: string;
  name: string | null;
  category: string | null;
  acquired_at: string | null;
  acquired_cost_cents: number | null;
  placed_in_service_at: string | null;
  useful_life_months: number | null;
  depreciation_method: DepreciationMethod;
  tax_year_locked_through: number | null;
  disposed_at: string | null;
  retired_at: string | null;
}

interface ElectionRow {
  equipment_id: string;
  tax_year: number;
  depreciation_method: DepreciationMethod;
  depreciation_amount_cents: number;
  accumulated_depreciation_cents: number;
  basis_cents: number;
  locked_at: string | null;
}

interface RollupAssetEntry {
  asset_id: string;
  name: string | null;
  category: string | null;
  acquired_cost_cents: number;
  acquired_at: string | null;
  placed_in_service_at: string | null;
  depreciation_method: DepreciationMethod;
  tax_year: number;
  /** True when the year&apos;s row was read from a locked
   *  equipment_tax_elections row; false when computed live. */
  is_locked: boolean;
  amount_cents: number;
  basis_cents: number;
  remaining_basis_cents: number;
  accumulated_through_year_cents: number;
  notes: string | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userRoles = (session.user as { roles?: string[] } | undefined)
    ?.roles ?? [];
  if (
    !isAdmin(session.user.roles) &&
    !userRoles.includes('equipment_manager') &&
    !userRoles.includes('bookkeeper')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Parse tax_year ───────────────────────────────────────────
  const url = new URL(req.url);
  const taxYearRaw = url.searchParams.get('tax_year');
  const taxYear = taxYearRaw
    ? Number.parseInt(taxYearRaw, 10)
    : new Date().getUTCFullYear();
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
    return NextResponse.json(
      { error: '`tax_year` must be a year between 2000 and 2100.' },
      { status: 400 }
    );
  }

  // ── Read every active depreciable asset ─────────────────────
  // Active = not retired, not disposed, has a real cost basis,
  // and isn&apos;t depreciation_method='none'.
  const { data: assets, error: assetsErr } = await supabaseAdmin
    .from('equipment_inventory')
    .select(
      'id, name, category, acquired_at, acquired_cost_cents, ' +
        'placed_in_service_at, useful_life_months, ' +
        'depreciation_method, tax_year_locked_through, ' +
        'disposed_at, retired_at'
    )
    .is('retired_at', null)
    .is('disposed_at', null)
    .neq('depreciation_method', 'none')
    .gt('acquired_cost_cents', 0);
  if (assetsErr) {
    return NextResponse.json(
      { error: assetsErr.message },
      { status: 500 }
    );
  }
  const assetRows = (assets ?? []) as AssetRow[];

  if (assetRows.length === 0) {
    return NextResponse.json({
      tax_year: taxYear,
      assets: [],
      totals: {
        amount_cents: 0,
        basis_cents: 0,
        remaining_basis_cents: 0,
        accumulated_through_year_cents: 0,
      },
    });
  }

  // ── Pull every election row for these assets in one read ────
  // Filtering server-side by (equipment_id IN ...) AND (tax_year
  // <= taxYear) keeps the payload bounded; we group client-side.
  const assetIds = assetRows.map((r) => r.id);
  const { data: elections, error: elecErr } = await supabaseAdmin
    .from('equipment_tax_elections')
    .select(
      'equipment_id, tax_year, depreciation_method, ' +
        'depreciation_amount_cents, accumulated_depreciation_cents, ' +
        'basis_cents, locked_at'
    )
    .in('equipment_id', assetIds)
    .lte('tax_year', taxYear)
    .order('tax_year', { ascending: true });
  if (elecErr) {
    return NextResponse.json(
      { error: elecErr.message },
      { status: 500 }
    );
  }
  const electionRows = (elections ?? []) as ElectionRow[];
  const electionsByAsset = new Map<string, ElectionRow[]>();
  for (const e of electionRows) {
    const list = electionsByAsset.get(e.equipment_id) ?? [];
    list.push(e);
    electionsByAsset.set(e.equipment_id, list);
  }

  // ── Build the per-asset rollup entries ──────────────────────
  const entries: RollupAssetEntry[] = [];
  for (const asset of assetRows) {
    if (asset.acquired_cost_cents === null || asset.acquired_cost_cents <= 0) {
      continue;
    }
    const placedAt =
      asset.placed_in_service_at ?? asset.acquired_at ?? null;
    if (!placedAt) continue;

    const dAsset: DepreciableAsset = {
      acquired_cost_cents: asset.acquired_cost_cents,
      placed_in_service_at: placedAt,
      depreciation_method: asset.depreciation_method,
      useful_life_months: asset.useful_life_months,
    };

    const lockedThrough = asset.tax_year_locked_through ?? 0;
    const electionsForAsset = electionsByAsset.get(asset.id) ?? [];

    const entry: RollupAssetEntry = {
      asset_id: asset.id,
      name: asset.name,
      category: asset.category,
      acquired_cost_cents: asset.acquired_cost_cents,
      acquired_at: asset.acquired_at,
      placed_in_service_at: placedAt,
      depreciation_method: asset.depreciation_method,
      tax_year: taxYear,
      is_locked: false,
      amount_cents: 0,
      basis_cents: 0,
      remaining_basis_cents: 0,
      accumulated_through_year_cents: 0,
      notes: null,
    };

    if (taxYear <= lockedThrough) {
      // Locked: read straight from the election row.
      const locked = electionsForAsset.find((e) => e.tax_year === taxYear);
      if (locked) {
        entry.is_locked = true;
        entry.amount_cents = locked.depreciation_amount_cents;
        entry.basis_cents = locked.basis_cents;
        entry.remaining_basis_cents = Math.max(
          0,
          locked.basis_cents - locked.depreciation_amount_cents
        );
        entry.accumulated_through_year_cents =
          locked.accumulated_depreciation_cents;
      }
      // Locked-but-no-row case: shouldn&apos;t happen if the
      // worker ran cleanly. Surface the asset with zero numbers
      // so the bookkeeper can spot the gap; the lock-year ritual
      // backfill handler can fix it.
    } else {
      // Compute live via the lib. Sum prior-year amounts from
      // locked rows + library rows so accumulated reflects the
      // mixed source of truth.
      const yearRow = depreciationForYear(dAsset, taxYear);
      const fullSchedule = computeDepreciationSchedule(dAsset);
      const accumulatedFromLocked = electionsForAsset
        .filter((e) => e.tax_year < taxYear)
        .reduce((sum, e) => sum + e.depreciation_amount_cents, 0);
      // Live-computed prior-year amounts (years > lockedThrough
      // and < taxYear).
      const accumulatedFromLive = fullSchedule
        .filter(
          (r) => r.tax_year > lockedThrough && r.tax_year < taxYear
        )
        .reduce((sum, r) => sum + r.amount_cents, 0);
      entry.is_locked = false;
      entry.amount_cents = yearRow?.amount_cents ?? 0;
      entry.basis_cents = yearRow?.basis_cents ?? asset.acquired_cost_cents;
      entry.remaining_basis_cents = yearRow?.remaining_basis_cents ?? 0;
      entry.accumulated_through_year_cents =
        accumulatedFromLocked +
        accumulatedFromLive +
        entry.amount_cents;
      entry.notes = yearRow?.notes ?? null;
    }

    entries.push(entry);
  }

  // ── Aggregate ────────────────────────────────────────────────
  const totals = entries.reduce(
    (acc, e) => ({
      amount_cents: acc.amount_cents + e.amount_cents,
      basis_cents: acc.basis_cents + e.basis_cents,
      remaining_basis_cents:
        acc.remaining_basis_cents + e.remaining_basis_cents,
      accumulated_through_year_cents:
        acc.accumulated_through_year_cents +
        e.accumulated_through_year_cents,
    }),
    {
      amount_cents: 0,
      basis_cents: 0,
      remaining_basis_cents: 0,
      accumulated_through_year_cents: 0,
    }
  );

  return NextResponse.json({
    tax_year: taxYear,
    assets: entries,
    totals,
  });
}, { routeName: 'admin/equipment/depreciation-rollup#get' });
