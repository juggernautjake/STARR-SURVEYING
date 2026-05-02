// app/api/admin/equipment/consumables/route.ts
//
// GET /api/admin/equipment/consumables
//
// Phase F10.6-d-i — the §5.12.7.5 Consumables low-stock +
// restock-view aggregator. Returns every consumable
// equipment_inventory row with a 30-day burn rate, projected
// days-of-stock-remaining, and a reorder badge so the F10.6-d-ii
// page can render the full table without further roundtrips.
//
// Sort: days_remaining ASC (lowest rolls float to the top per
// the spec). Rows that don't yet have a 30-day consumption
// signal (recently added inventory, never returned) sort to the
// end with `days_remaining=null`.
//
// Reorder badge tiers per the spec:
//   reorder_now     days_remaining < 7  OR
//                   quantity_on_hand <= low_stock_threshold
//   reorder_soon    7 ≤ days_remaining < 14
//   ok              ≥ 14 OR null (no signal yet)
//
// Burn-rate calc: SUM(consumed_quantity) over reservations
// where actual_returned_at ≥ now()-30d, grouped by
// equipment_inventory_id. Daily rate = sum / 30.
// days_remaining = quantity_on_hand / daily_rate, capped at
// 999 to avoid surfacing "this paint will last 47 years" as a
// real number.
//
// Auth: EQUIPMENT_ROLES.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const REORDER_NOW_DAYS = 7;
const REORDER_SOON_DAYS = 14;
const DAYS_REMAINING_CAP = 999;

type ReorderBadge = 'reorder_now' | 'reorder_soon' | 'ok';

interface ConsumableRow {
  id: string;
  name: string | null;
  category: string | null;
  unit: string | null;
  quantity_on_hand: number | null;
  low_stock_threshold: number | null;
  vendor: string | null;
  cost_per_unit_cents: number | null;
  last_restocked_at: string | null;
  retired_at: string | null;
}

interface ConsumptionRow {
  equipment_inventory_id: string;
  consumed_quantity: number | null;
}

interface AggregatedRow {
  id: string;
  name: string | null;
  category: string | null;
  unit: string | null;
  quantity_on_hand: number | null;
  low_stock_threshold: number | null;
  vendor: string | null;
  cost_per_unit_cents: number | null;
  last_restocked_at: string | null;
  consumed_30d: number;
  daily_rate: number | null;
  days_remaining: number | null;
  reorder_badge: ReorderBadge;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  void req;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userRoles = (session.user as { roles?: string[] } | undefined)
    ?.roles ?? [];
  if (
    !isAdmin(session.user.roles) &&
    !userRoles.includes('tech_support') &&
    !userRoles.includes('equipment_manager')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Pull every non-retired consumable. Discontinued (retired)
  // rows are excluded — they're handled by the F10.6-d-iii
  // "Mark discontinued" admin path which writes retired_at.
  const { data: invRows, error: invErr } = await supabaseAdmin
    .from('equipment_inventory')
    .select(
      'id, name, category, unit, quantity_on_hand, low_stock_threshold, ' +
        'vendor, cost_per_unit_cents, last_restocked_at, retired_at'
    )
    .eq('item_kind', 'consumable')
    .is('retired_at', null);
  if (invErr) {
    console.error(
      '[admin/equipment/consumables] inventory read failed',
      { error: invErr.message }
    );
    return NextResponse.json({ error: invErr.message }, { status: 500 });
  }
  const consumables = (invRows ?? []) as ConsumableRow[];

  if (consumables.length === 0) {
    return NextResponse.json({
      rows: [],
      summary: {
        total: 0,
        reorder_now: 0,
        reorder_soon: 0,
        ok: 0,
        window_days: 30,
      },
    });
  }

  // 30-day consumption sum per equipment_id. seeds/242 +
  // seeds/239 give us consumed_quantity on returned reservations;
  // sum over the trailing window.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rsvRows, error: rsvErr } = await supabaseAdmin
    .from('equipment_reservations')
    .select('equipment_inventory_id, consumed_quantity')
    .eq('state', 'returned')
    .not('consumed_quantity', 'is', null)
    .gte('actual_returned_at', since);
  if (rsvErr) {
    console.warn(
      '[admin/equipment/consumables] consumption read failed',
      { error: rsvErr.message }
    );
  }
  const consumedById = new Map<string, number>();
  for (const r of ((rsvRows ?? []) as ConsumptionRow[])) {
    if (r.consumed_quantity == null || r.consumed_quantity <= 0) continue;
    consumedById.set(
      r.equipment_inventory_id,
      (consumedById.get(r.equipment_inventory_id) ?? 0) + r.consumed_quantity
    );
  }

  // Aggregate per row.
  const aggregated: AggregatedRow[] = consumables.map((c) => {
    const consumed30d = consumedById.get(c.id) ?? 0;
    const dailyRate = consumed30d > 0 ? consumed30d / 30 : null;
    const onHand = c.quantity_on_hand ?? 0;
    const daysRemaining = (() => {
      if (dailyRate === null) return null; // no signal yet
      if (dailyRate === 0) return null;
      const raw = onHand / dailyRate;
      return Math.min(Math.round(raw * 10) / 10, DAYS_REMAINING_CAP);
    })();
    const belowFloor =
      c.low_stock_threshold != null && onHand <= c.low_stock_threshold;
    const reorderBadge: ReorderBadge = (() => {
      if (belowFloor) return 'reorder_now';
      if (daysRemaining === null) return 'ok';
      if (daysRemaining < REORDER_NOW_DAYS) return 'reorder_now';
      if (daysRemaining < REORDER_SOON_DAYS) return 'reorder_soon';
      return 'ok';
    })();
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      unit: c.unit,
      quantity_on_hand: c.quantity_on_hand,
      low_stock_threshold: c.low_stock_threshold,
      vendor: c.vendor,
      cost_per_unit_cents: c.cost_per_unit_cents,
      last_restocked_at: c.last_restocked_at,
      consumed_30d: consumed30d,
      daily_rate: dailyRate,
      days_remaining: daysRemaining,
      reorder_badge: reorderBadge,
    };
  });

  // Sort: lowest days_remaining first; null sorts last.
  aggregated.sort((a, b) => {
    const aVal = a.days_remaining ?? Number.POSITIVE_INFINITY;
    const bVal = b.days_remaining ?? Number.POSITIVE_INFINITY;
    if (aVal !== bVal) return aVal - bVal;
    return (a.name ?? a.id).localeCompare(b.name ?? b.id);
  });

  const summary = {
    total: aggregated.length,
    reorder_now: aggregated.filter((r) => r.reorder_badge === 'reorder_now')
      .length,
    reorder_soon: aggregated.filter((r) => r.reorder_badge === 'reorder_soon')
      .length,
    ok: aggregated.filter((r) => r.reorder_badge === 'ok').length,
    window_days: 30,
  };

  console.log('[admin/equipment/consumables GET]', {
    total: summary.total,
    reorder_now: summary.reorder_now,
    reorder_soon: summary.reorder_soon,
    actor_email: session.user.email,
  });

  return NextResponse.json({ rows: aggregated, summary });
}, { routeName: 'admin/equipment/consumables#get' });
