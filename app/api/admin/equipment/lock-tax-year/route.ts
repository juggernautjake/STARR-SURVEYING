// app/api/admin/equipment/lock-tax-year/route.ts
//
// POST /api/admin/equipment/lock-tax-year
//   body: { tax_year: int, dry_run?: boolean }
//
// Phase F10.9 — the §5.12.10 lock-year ritual. Walks every
// active depreciable asset, computes its depreciation for the
// requested tax year via lib/equipment/depreciation, and writes
// one `equipment_tax_elections` row per asset with the lock
// stamps set. After the rows commit, bumps each asset&apos;s
// `tax_year_locked_through` to the new year so future PATCHes
// to depreciation_method don&apos;t retroactively change a
// frozen Schedule C.
//
// Idempotency: the seeds/250 UNIQUE (equipment_id, tax_year)
// constraint catches duplicate-lock attempts. The endpoint uses
// `upsert` with onConflict 'equipment_id,tax_year' AND
// `ignoreDuplicates: true` so a re-run of the lock for the same
// year is a no-op rather than an error — the bookkeeper can
// safely re-trigger the ritual when adding late assets.
//
// Dry-run support: `dry_run=true` runs the projection + returns
// the would-be inserts WITHOUT writing. Useful for the §5.12.7.7
// fleet valuation page&apos;s "preview lock" button.
//
// Auth: admin only. The lock-year ritual is the bookkeeper&apos;s
// highest-stakes operation — once locked, the audit story is
// reproducible but the numbers can&apos;t be changed without an
// admin override (which lands as a separate batch).

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  computeDepreciationSchedule,
  type DepreciableAsset,
  type DepreciationMethod,
} from '@/lib/equipment/depreciation';

interface AssetRow {
  id: string;
  name: string | null;
  acquired_at: string | null;
  acquired_cost_cents: number | null;
  placed_in_service_at: string | null;
  useful_life_months: number | null;
  depreciation_method: DepreciationMethod;
  tax_year_locked_through: number | null;
  disposed_at: string | null;
  retired_at: string | null;
}

interface PriorElectionRow {
  equipment_id: string;
  tax_year: number;
  depreciation_amount_cents: number;
}

interface PendingElection {
  equipment_id: string;
  tax_year: number;
  depreciation_method: DepreciationMethod;
  depreciation_amount_cents: number;
  accumulated_depreciation_cents: number;
  basis_cents: number;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    tax_year?: unknown;
    dry_run?: unknown;
  } | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON object.' },
      { status: 400 }
    );
  }

  if (
    typeof body.tax_year !== 'number' ||
    !Number.isInteger(body.tax_year) ||
    body.tax_year < 2000 ||
    body.tax_year > 2100
  ) {
    return NextResponse.json(
      { error: '`tax_year` must be an integer between 2000 and 2100.' },
      { status: 400 }
    );
  }
  const taxYear = body.tax_year;
  const dryRun = body.dry_run === true;

  const currentYear = new Date().getUTCFullYear();
  if (taxYear > currentYear) {
    return NextResponse.json(
      {
        error: `Cannot lock tax_year ${taxYear} — refuses to lock a future year.`,
        code: 'future_year',
      },
      { status: 400 }
    );
  }

  // ── Read every active depreciable asset ─────────────────────
  const { data: assets, error: assetsErr } = await supabaseAdmin
    .from('equipment_inventory')
    .select(
      'id, name, acquired_at, acquired_cost_cents, ' +
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
      scanned: 0,
      locked: 0,
      skipped: 0,
      dry_run: dryRun,
    });
  }

  // ── Pre-load prior-year election amounts so accumulated
  //    depreciation reconciles against the locked source of
  //    truth (not just the live schedule) ──────────────────────
  const assetIds = assetRows.map((r) => r.id);
  const { data: priorElections, error: priorErr } = await supabaseAdmin
    .from('equipment_tax_elections')
    .select('equipment_id, tax_year, depreciation_amount_cents')
    .in('equipment_id', assetIds)
    .lt('tax_year', taxYear);
  if (priorErr) {
    return NextResponse.json(
      { error: priorErr.message },
      { status: 500 }
    );
  }
  const priorByAsset = new Map<string, PriorElectionRow[]>();
  for (const e of (priorElections ?? []) as PriorElectionRow[]) {
    const list = priorByAsset.get(e.equipment_id) ?? [];
    list.push(e);
    priorByAsset.set(e.equipment_id, list);
  }

  // ── Project the rows we&apos;d insert ───────────────────────
  const pending: PendingElection[] = [];
  let skipped = 0;
  for (const asset of assetRows) {
    if (
      asset.acquired_cost_cents === null ||
      asset.acquired_cost_cents <= 0
    ) {
      skipped++;
      continue;
    }
    const placedAt =
      asset.placed_in_service_at ?? asset.acquired_at ?? null;
    if (!placedAt) {
      skipped++;
      console.warn(
        '[admin/equipment/lock-tax-year] missing placed_in_service_at',
        { equipment_id: asset.id }
      );
      continue;
    }

    const dAsset: DepreciableAsset = {
      acquired_cost_cents: asset.acquired_cost_cents,
      placed_in_service_at: placedAt,
      depreciation_method: asset.depreciation_method,
      useful_life_months: asset.useful_life_months,
    };
    const schedule = computeDepreciationSchedule(dAsset);
    const yearRow = schedule.find((r) => r.tax_year === taxYear);
    if (!yearRow) {
      // Asset is past-end-of-schedule (already fully depreciated) or
      // pre-start (placed-in-service after taxYear). Nothing to lock
      // either way.
      skipped++;
      continue;
    }

    // Accumulated depreciation = (sum of locked prior-year amounts)
    // + (sum of live-computed amounts for years that were never
    // locked) + this year&apos;s amount.
    const lockedPriorTotal = (priorByAsset.get(asset.id) ?? []).reduce(
      (sum, e) => sum + e.depreciation_amount_cents,
      0
    );
    const lockedThrough = asset.tax_year_locked_through ?? 0;
    const livePriorTotal = schedule
      .filter((r) => r.tax_year > lockedThrough && r.tax_year < taxYear)
      .reduce((sum, r) => sum + r.amount_cents, 0);
    const accumulated =
      lockedPriorTotal + livePriorTotal + yearRow.amount_cents;

    pending.push({
      equipment_id: asset.id,
      tax_year: taxYear,
      depreciation_method: yearRow.method,
      depreciation_amount_cents: yearRow.amount_cents,
      accumulated_depreciation_cents: accumulated,
      basis_cents: yearRow.basis_cents,
    });
  }

  if (dryRun) {
    return NextResponse.json({
      tax_year: taxYear,
      scanned: assetRows.length,
      projected: pending.length,
      skipped,
      dry_run: true,
      pending,
    });
  }

  if (pending.length === 0) {
    return NextResponse.json({
      tax_year: taxYear,
      scanned: assetRows.length,
      locked: 0,
      skipped,
      dry_run: false,
    });
  }

  // ── Insert election rows ─────────────────────────────────────
  // upsert with ignoreDuplicates so a re-run of the ritual for
  // the same year is a no-op rather than 23505. The
  // tax_year_locked_through bump below also gates re-locking
  // logically (the bookkeeper UI hides the button once locked).
  const lockedAt = new Date().toISOString();
  const lockedBy = session.user.email;
  const insertRows = pending.map((p) => ({
    ...p,
    locked_at: lockedAt,
    locked_by: lockedBy,
  }));
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('equipment_tax_elections')
    .upsert(insertRows, {
      onConflict: 'equipment_id,tax_year',
      ignoreDuplicates: true,
    })
    .select('id, equipment_id, tax_year');
  if (insertErr) {
    console.error(
      '[admin/equipment/lock-tax-year] elections insert failed',
      { tax_year: taxYear, error: insertErr.message }
    );
    return NextResponse.json(
      { error: insertErr.message ?? 'Elections insert failed.' },
      { status: 500 }
    );
  }
  const insertedCount = (inserted ?? []).length;

  // ── Bump tax_year_locked_through on each asset ──────────────
  // Best-effort; failures here surface in the cron log but the
  // election rows are already committed. The next lock-year run
  // self-heals via the same per-asset comparison.
  const insertedIds = new Set(
    ((inserted ?? []) as Array<{ equipment_id: string }>).map(
      (r) => r.equipment_id
    )
  );
  if (insertedIds.size > 0) {
    const { error: bumpErr } = await supabaseAdmin
      .from('equipment_inventory')
      .update({ tax_year_locked_through: taxYear })
      .in('id', Array.from(insertedIds))
      .lt('tax_year_locked_through', taxYear);
    if (bumpErr) {
      console.warn(
        '[admin/equipment/lock-tax-year] tax_year_locked_through bump failed',
        { tax_year: taxYear, error: bumpErr.message }
      );
    }
  }

  console.log('[admin/equipment/lock-tax-year] ok', {
    tax_year: taxYear,
    scanned: assetRows.length,
    locked: insertedCount,
    skipped,
    actor_email: session.user.email,
  });

  return NextResponse.json({
    tax_year: taxYear,
    scanned: assetRows.length,
    locked: insertedCount,
    skipped,
    dry_run: false,
  });
}, { routeName: 'admin/equipment/lock-tax-year#post' });
