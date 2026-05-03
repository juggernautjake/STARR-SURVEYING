// app/api/admin/equipment/today/route.ts
//
// GET /api/admin/equipment/today?date=YYYY-MM-DD
//
// Phase F10.6-b-i — the §5.12.7.1 Today landing-page aggregator.
// Single endpoint that the F10.6-b-ii page consumes; the page
// stays thin and the aggregation logic lives in one place so
// the mobile parity surface (§5.12.9 EM home tab) can reuse it.
//
// Response shape — three strips + four banners:
//
//   strips.going_out      Strip A: state='held' AND reserved_
//                         from::date=date, grouped by job
//   strips.out_now        Strip B: state='checked_out' AND
//                         reserved_to >= now(), sorted by
//                         reserved_to ASC, with on-time / at-
//                         risk / overdue pill
//   strips.returned       Strip C: state='returned' AND actual_
//                         returned_at::date=date
//
//   banners.unstaffed_pto             personnel_unavailability
//                                     starting today
//   banners.low_stock_consumables     consumables below
//                                     low_stock_threshold AND
//                                     reserved today
//   banners.maintenance_starting_today  scheduled work for
//                                       today
//   banners.cert_expiring             equipment_inventory rows
//                                     with next_calibration_due_at
//                                     ≤ now() + 60 days (F10.7-i-i)
//
// Date defaults to today (server clock); query string accepts
// `date=YYYY-MM-DD` so the EM can scrub forward/back.
//
// Auth: admin / developer / tech_support / equipment_manager
// (same EQUIPMENT_ROLES set as the sidebar group).

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

type StatusPill = 'on_time' | 'at_risk' | 'overdue';

const AT_RISK_WINDOW_MS = 60 * 60 * 1000; // 1 hour before due

interface ReservationRow {
  id: string;
  job_id: string;
  equipment_inventory_id: string;
  reserved_from: string;
  reserved_to: string;
  state: string;
  is_override: boolean;
  notes: string | null;
  actual_checked_out_at: string | null;
  actual_returned_at: string | null;
  checked_out_to_user: string | null;
  checked_out_condition: string | null;
  returned_condition: string | null;
  consumed_quantity: number | null;
  nag_silenced_until: string | null;
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
    !userRoles.includes('tech_support') &&
    !userRoles.includes('equipment_manager')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const dateRaw = searchParams.get('date');
  let dateIso: string;
  if (dateRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      return NextResponse.json(
        { error: '`date` must be YYYY-MM-DD when present.' },
        { status: 400 }
      );
    }
    dateIso = dateRaw;
  } else {
    const now = new Date();
    dateIso = now.toISOString().slice(0, 10);
  }
  const dayStart = new Date(`${dateIso}T00:00:00.000Z`).toISOString();
  const dayEnd = new Date(`${dateIso}T23:59:59.999Z`).toISOString();
  const nowIso = new Date().toISOString();
  const atRiskCutoff = new Date(Date.now() + AT_RISK_WINDOW_MS).toISOString();

  // ── Strip A — Going out today (held, reserved_from in window) ──
  const goingOutRes = await supabaseAdmin
    .from('equipment_reservations')
    .select(
      'id, job_id, equipment_inventory_id, reserved_from, reserved_to, ' +
        'state, is_override, notes, actual_checked_out_at, ' +
        'actual_returned_at, checked_out_to_user, checked_out_condition, ' +
        'returned_condition, consumed_quantity, nag_silenced_until'
    )
    .eq('state', 'held')
    .gte('reserved_from', dayStart)
    .lte('reserved_from', dayEnd)
    .order('reserved_from', { ascending: true });
  if (goingOutRes.error) {
    return NextResponse.json(
      { error: goingOutRes.error.message },
      { status: 500 }
    );
  }
  const goingOut = (goingOutRes.data ?? []) as ReservationRow[];

  // ── Strip B — Out right now (checked_out, due in the future) ──
  const outNowRes = await supabaseAdmin
    .from('equipment_reservations')
    .select(
      'id, job_id, equipment_inventory_id, reserved_from, reserved_to, ' +
        'state, is_override, notes, actual_checked_out_at, ' +
        'actual_returned_at, checked_out_to_user, checked_out_condition, ' +
        'returned_condition, consumed_quantity, nag_silenced_until'
    )
    .eq('state', 'checked_out')
    .order('reserved_to', { ascending: true });
  if (outNowRes.error) {
    return NextResponse.json(
      { error: outNowRes.error.message },
      { status: 500 }
    );
  }
  const outNow = (outNowRes.data ?? []) as ReservationRow[];

  // ── Strip C — Already returned today ──
  const returnedRes = await supabaseAdmin
    .from('equipment_reservations')
    .select(
      'id, job_id, equipment_inventory_id, reserved_from, reserved_to, ' +
        'state, is_override, notes, actual_checked_out_at, ' +
        'actual_returned_at, checked_out_to_user, checked_out_condition, ' +
        'returned_condition, consumed_quantity, nag_silenced_until'
    )
    .eq('state', 'returned')
    .gte('actual_returned_at', dayStart)
    .lte('actual_returned_at', dayEnd)
    .order('actual_returned_at', { ascending: false });
  if (returnedRes.error) {
    return NextResponse.json(
      { error: returnedRes.error.message },
      { status: 500 }
    );
  }
  const returned = (returnedRes.data ?? []) as ReservationRow[];

  // ── Resolve display fields in one batch (across all strips) ──
  const allEquipmentIds = Array.from(
    new Set(
      [...goingOut, ...outNow, ...returned].map(
        (r) => r.equipment_inventory_id
      )
    )
  );
  const equipmentById = await loadEquipmentDisplay(allEquipmentIds);

  const allHolderIds = Array.from(
    new Set(
      [...outNow, ...returned]
        .map((r) => r.checked_out_to_user)
        .filter((v): v is string => !!v)
    )
  );
  const holderById = await loadHolderDisplay(allHolderIds);

  // ── Compute Strip B status pills ──
  const enrichedOutNow = outNow.map((r) => ({
    ...r,
    equipment_name: equipmentById.get(r.equipment_inventory_id) ?? null,
    holder_email: r.checked_out_to_user
      ? holderById.get(r.checked_out_to_user) ?? null
      : null,
    status_pill: pillFor(r.reserved_to, nowIso, atRiskCutoff),
  }));
  const overdueCount = enrichedOutNow.filter(
    (r) => r.status_pill === 'overdue'
  ).length;

  const enrichedGoingOut = goingOut.map((r) => ({
    ...r,
    equipment_name: equipmentById.get(r.equipment_inventory_id) ?? null,
  }));
  const enrichedReturned = returned.map((r) => ({
    ...r,
    equipment_name: equipmentById.get(r.equipment_inventory_id) ?? null,
    holder_email: r.checked_out_to_user
      ? holderById.get(r.checked_out_to_user) ?? null
      : null,
  }));

  // ── Banners (best-effort; failures degrade to empty arrays) ──
  const [unstaffedPto, lowStock, maintToday, certExpiring] =
    await Promise.all([
      loadUnstaffedPto(dayStart, dayEnd),
      loadLowStockConsumables(dayStart, dayEnd),
      loadMaintenanceStartingToday(dayStart, dayEnd),
      loadCertExpiring(nowIso),
    ]);

  return NextResponse.json({
    date: dateIso,
    now: nowIso,
    strips: {
      going_out: enrichedGoingOut,
      out_now: enrichedOutNow,
      returned: enrichedReturned,
    },
    banners: {
      unstaffed_pto: unstaffedPto,
      low_stock_consumables: lowStock,
      maintenance_starting_today: maintToday,
      cert_expiring: certExpiring,
    },
    counts: {
      going_out: goingOut.length,
      out_now: outNow.length,
      returned: returned.length,
      overdue: overdueCount,
    },
  });
}, { routeName: 'admin/equipment/today#get' });

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function pillFor(
  reservedTo: string,
  nowIso: string,
  atRiskCutoff: string
): StatusPill {
  if (reservedTo < nowIso) return 'overdue';
  if (reservedTo < atRiskCutoff) return 'at_risk';
  return 'on_time';
}

async function loadEquipmentDisplay(
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from('equipment_inventory')
    .select('id, name')
    .in('id', ids);
  if (error) {
    console.warn(
      '[admin/equipment/today] equipment lookup failed',
      { error: error.message }
    );
    return new Map();
  }
  const map = new Map<string, string>();
  for (const r of (data ?? []) as Array<{ id: string; name: string | null }>) {
    if (r.name) map.set(r.id, r.name);
  }
  return map;
}

async function loadHolderDisplay(
  userIds: string[]
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from('registered_users')
    .select('id, email, name')
    .in('id', userIds);
  if (error) {
    console.warn(
      '[admin/equipment/today] holder lookup failed',
      { error: error.message }
    );
    return new Map();
  }
  const map = new Map<string, string>();
  for (const r of (data ?? []) as Array<{
    id: string;
    email: string | null;
    name: string | null;
  }>) {
    map.set(r.id, r.name ?? r.email ?? r.id);
  }
  return map;
}

async function loadUnstaffedPto(
  dayStart: string,
  dayEnd: string
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabaseAdmin
    .from('personnel_unavailability')
    .select(
      'id, user_email, unavailable_from, unavailable_to, kind, reason'
    )
    .gte('unavailable_from', dayStart)
    .lte('unavailable_from', dayEnd)
    .order('unavailable_from', { ascending: true });
  if (error) {
    console.warn(
      '[admin/equipment/today] unstaffed_pto lookup failed',
      { error: error.message }
    );
    return [];
  }
  return (data ?? []) as Array<Record<string, unknown>>;
}

async function loadLowStockConsumables(
  dayStart: string,
  dayEnd: string
): Promise<Array<Record<string, unknown>>> {
  // Two-step: find consumables below threshold; cross-check
  // against reservations starting today. v1 surfaces ANY
  // consumable below threshold with at-least-one held
  // reservation in the window — narrowing further is polish.
  const { data: stocks, error: stocksErr } = await supabaseAdmin
    .from('equipment_inventory')
    .select(
      'id, name, item_kind, quantity_on_hand, low_stock_threshold, vendor'
    )
    .eq('item_kind', 'consumable')
    .not('low_stock_threshold', 'is', null)
    .is('retired_at', null);
  if (stocksErr) {
    console.warn(
      '[admin/equipment/today] consumables lookup failed',
      { error: stocksErr.message }
    );
    return [];
  }
  const candidates = ((stocks ?? []) as Array<{
    id: string;
    name: string | null;
    quantity_on_hand: number | null;
    low_stock_threshold: number | null;
    vendor: string | null;
  }>).filter(
    (r) =>
      r.quantity_on_hand !== null &&
      r.low_stock_threshold !== null &&
      r.quantity_on_hand <= r.low_stock_threshold
  );
  if (candidates.length === 0) return [];

  // Filter: only surface those with a held reservation today.
  const candidateIds = candidates.map((c) => c.id);
  const { data: rsv, error: rsvErr } = await supabaseAdmin
    .from('equipment_reservations')
    .select('equipment_inventory_id')
    .in('equipment_inventory_id', candidateIds)
    .eq('state', 'held')
    .gte('reserved_from', dayStart)
    .lte('reserved_from', dayEnd);
  if (rsvErr) {
    console.warn(
      '[admin/equipment/today] consumables-reserved lookup failed',
      { error: rsvErr.message }
    );
    return [];
  }
  const reservedIds = new Set(
    ((rsv ?? []) as Array<{ equipment_inventory_id: string }>).map(
      (r) => r.equipment_inventory_id
    )
  );
  return candidates.filter((c) => reservedIds.has(c.id)) as unknown as Array<
    Record<string, unknown>
  >;
}

async function loadMaintenanceStartingToday(
  dayStart: string,
  dayEnd: string
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabaseAdmin
    .from('maintenance_events')
    .select(
      'id, equipment_inventory_id, vehicle_id, kind, origin, state, ' +
        'scheduled_for, summary'
    )
    .gte('scheduled_for', dayStart)
    .lte('scheduled_for', dayEnd)
    .in('state', ['scheduled', 'in_progress', 'awaiting_parts', 'awaiting_vendor'])
    .order('scheduled_for', { ascending: true });
  if (error) {
    console.warn(
      '[admin/equipment/today] maintenance lookup failed',
      { error: error.message }
    );
    return [];
  }
  return (data ?? []) as Array<Record<string, unknown>>;
}

// F10.7-i-i — cert-expiring banner. Reads
// equipment_inventory.next_calibration_due_at (the canonical "when
// is this NIST cert expiring" column maintained by the F10.7-c
// maintenance event triggers from seeds/233). Surfaces every unit
// whose cert is already overdue OR comes due within the next
// 60 days. The blue Today banner gives the EM long-range
// visibility BEFORE the F10.7-h schedule cron fires the 60-day
// notification — a unit can lapse if no maintenance_schedules row
// exists for it; this banner is the safety net.
async function loadCertExpiring(
  nowIso: string
): Promise<
  Array<{
    id: string;
    name: string | null;
    next_calibration_due_at: string;
    days_until: number;
  }>
> {
  const cutoffMs = Date.now() + 60 * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();
  // F10.8 — exclude personal-kit rows (is_personal=true) so the
  // EM&apos;s cert-expiring banner doesn&apos;t balloon with a
  // surveyor&apos;s personal axe whose &ldquo;cal&rdquo; is just
  // a sticker on it. The tax-summary filter uses the same
  // predicate (seeds/233 §depreciation rollups).
  const { data, error } = await supabaseAdmin
    .from('equipment_inventory')
    .select('id, name, next_calibration_due_at, current_status')
    .not('next_calibration_due_at', 'is', null)
    .lte('next_calibration_due_at', cutoffIso)
    .eq('is_personal', false)
    .order('next_calibration_due_at', { ascending: true });
  if (error) {
    console.warn(
      '[admin/equipment/today] cert-expiring lookup failed',
      { error: error.message }
    );
    return [];
  }
  const rows = (data ?? []) as Array<{
    id: string;
    name: string | null;
    next_calibration_due_at: string;
    current_status: string | null;
  }>;
  const nowMs = new Date(nowIso).getTime();
  return rows
    .filter(
      (r) =>
        r.current_status !== 'retired' &&
        r.current_status !== 'lost'
    )
    .map((r) => ({
      id: r.id,
      name: r.name,
      next_calibration_due_at: r.next_calibration_due_at,
      days_until: Math.floor(
        (new Date(r.next_calibration_due_at).getTime() - nowMs) /
          (1000 * 60 * 60 * 24)
      ),
    }));
}
