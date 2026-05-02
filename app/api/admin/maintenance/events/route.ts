// app/api/admin/maintenance/events/route.ts
//
// GET /api/admin/maintenance/events
//   ?equipment_id=&vehicle_id=&state=&kind=&origin=
//    &since=YYYY-MM-DD&until=YYYY-MM-DD&open_only=1&limit=N
//
// Phase F10.7-b — list + filter the §5.12.8 maintenance_events
// table. Per-equipment, per-vehicle, per-state, per-kind, per-
// origin, date window. Open-state filter convenience flag for
// the EM dashboard's "what's currently in shop?" view.
//
// Joins equipment_inventory.name + vehicles.name + actor display
// fields so the F10.7-f calendar UI + F10.7-g detail page render
// without per-row roundtrips.
//
// Returns:
//   {
//     events: MaintenanceEventRow[],
//     summary: {
//       total, open_count, by_state, by_kind, by_origin,
//       truncated
//     }
//   }
//
// Auth: EQUIPMENT_ROLES.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

const ALLOWED_STATES = new Set([
  'scheduled',
  'in_progress',
  'awaiting_parts',
  'awaiting_vendor',
  'complete',
  'cancelled',
  'failed_qa',
]);
const OPEN_STATES = [
  'scheduled',
  'in_progress',
  'awaiting_parts',
  'awaiting_vendor',
];
const ALLOWED_KINDS = new Set([
  'calibration',
  'repair',
  'firmware_update',
  'inspection',
  'cleaning',
  'scheduled_service',
  'damage_triage',
  'recall',
  'software_license',
]);
const ALLOWED_ORIGINS = new Set([
  'recurring_schedule',
  'damaged_return',
  'manual',
  'vendor_recall',
  'cert_expiring',
  'lost_returned',
]);

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface EventRow {
  id: string;
  equipment_inventory_id: string | null;
  vehicle_id: string | null;
  kind: string;
  origin: string;
  state: string;
  scheduled_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  expected_back_at: string | null;
  vendor_name: string | null;
  vendor_work_order: string | null;
  performed_by_user_id: string | null;
  cost_cents: number | null;
  linked_receipt_id: string | null;
  summary: string;
  notes: string | null;
  qa_passed: boolean | null;
  next_due_at: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
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
  const equipmentIdRaw = searchParams.get('equipment_id');
  const vehicleIdRaw = searchParams.get('vehicle_id');
  const stateRaw = searchParams.get('state');
  const kindRaw = searchParams.get('kind');
  const originRaw = searchParams.get('origin');
  const sinceRaw = searchParams.get('since');
  const untilRaw = searchParams.get('until');
  const openOnly = searchParams.get('open_only') === '1';
  const limitRaw = searchParams.get('limit');

  if (equipmentIdRaw && !UUID_RE.test(equipmentIdRaw)) {
    return NextResponse.json(
      { error: '`equipment_id` must be a UUID.' },
      { status: 400 }
    );
  }
  if (vehicleIdRaw && !UUID_RE.test(vehicleIdRaw)) {
    return NextResponse.json(
      { error: '`vehicle_id` must be a UUID.' },
      { status: 400 }
    );
  }
  if (stateRaw && !ALLOWED_STATES.has(stateRaw)) {
    return NextResponse.json(
      { error: `\`state\` must be one of: ${Array.from(ALLOWED_STATES).join(', ')}.` },
      { status: 400 }
    );
  }
  if (kindRaw && !ALLOWED_KINDS.has(kindRaw)) {
    return NextResponse.json(
      { error: `\`kind\` must be one of: ${Array.from(ALLOWED_KINDS).join(', ')}.` },
      { status: 400 }
    );
  }
  if (originRaw && !ALLOWED_ORIGINS.has(originRaw)) {
    return NextResponse.json(
      { error: `\`origin\` must be one of: ${Array.from(ALLOWED_ORIGINS).join(', ')}.` },
      { status: 400 }
    );
  }
  if (sinceRaw && !/^\d{4}-\d{2}-\d{2}$/.test(sinceRaw)) {
    return NextResponse.json(
      { error: '`since` must be YYYY-MM-DD.' },
      { status: 400 }
    );
  }
  if (untilRaw && !/^\d{4}-\d{2}-\d{2}$/.test(untilRaw)) {
    return NextResponse.json(
      { error: '`until` must be YYYY-MM-DD.' },
      { status: 400 }
    );
  }

  let limit = DEFAULT_LIMIT;
  if (limitRaw) {
    const n = parseInt(limitRaw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json(
        { error: '`limit` must be a positive integer.' },
        { status: 400 }
      );
    }
    limit = Math.min(n, MAX_LIMIT);
  }

  // Build the query incrementally.
  let q = supabaseAdmin
    .from('maintenance_events')
    .select(
      'id, equipment_inventory_id, vehicle_id, kind, origin, state, ' +
        'scheduled_for, started_at, completed_at, expected_back_at, ' +
        'vendor_name, vendor_work_order, performed_by_user_id, ' +
        'cost_cents, linked_receipt_id, summary, notes, qa_passed, ' +
        'next_due_at, created_at, created_by, updated_at'
    )
    .order('scheduled_for', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit + 1); // +1 to detect truncation

  if (equipmentIdRaw) q = q.eq('equipment_inventory_id', equipmentIdRaw);
  if (vehicleIdRaw) q = q.eq('vehicle_id', vehicleIdRaw);
  if (kindRaw) q = q.eq('kind', kindRaw);
  if (originRaw) q = q.eq('origin', originRaw);
  if (stateRaw) {
    q = q.eq('state', stateRaw);
  } else if (openOnly) {
    q = q.in('state', OPEN_STATES);
  }
  if (sinceRaw) q = q.gte('created_at', `${sinceRaw}T00:00:00.000Z`);
  if (untilRaw) q = q.lte('created_at', `${untilRaw}T23:59:59.999Z`);

  const { data, error } = await q;
  if (error) {
    console.error('[admin/maintenance/events GET] read failed', {
      error: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rawRows = (data ?? []) as EventRow[];
  const truncated = rawRows.length > limit;
  const rows = truncated ? rawRows.slice(0, limit) : rawRows;

  // Batch resolve equipment + vehicle + actor display fields.
  const equipmentIds = Array.from(
    new Set(
      rows.map((r) => r.equipment_inventory_id).filter((v): v is string => !!v)
    )
  );
  const vehicleIds = Array.from(
    new Set(rows.map((r) => r.vehicle_id).filter((v): v is string => !!v))
  );
  const actorIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.created_by, r.performed_by_user_id])
        .filter((v): v is string => !!v)
    )
  );

  const equipmentNameById = new Map<string, string>();
  if (equipmentIds.length > 0) {
    const { data: items } = await supabaseAdmin
      .from('equipment_inventory')
      .select('id, name')
      .in('id', equipmentIds);
    for (const r of (items ?? []) as Array<{ id: string; name: string | null }>) {
      equipmentNameById.set(r.id, r.name ?? r.id);
    }
  }

  const vehicleNameById = new Map<string, string>();
  if (vehicleIds.length > 0) {
    const { data: items, error: vErr } = await supabaseAdmin
      .from('vehicles')
      .select('id, name')
      .in('id', vehicleIds);
    if (vErr) {
      console.warn('[admin/maintenance/events GET] vehicle lookup failed', {
        error: vErr.message,
      });
    }
    for (const r of (items ?? []) as Array<{ id: string; name: string | null }>) {
      vehicleNameById.set(r.id, r.name ?? r.id);
    }
  }

  const actorById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actors } = await supabaseAdmin
      .from('registered_users')
      .select('id, email, name')
      .in('id', actorIds);
    for (const r of (actors ?? []) as Array<{
      id: string;
      email: string | null;
      name: string | null;
    }>) {
      actorById.set(r.id, r.name ?? r.email ?? r.id);
    }
  }

  const enriched = rows.map((r) => ({
    ...r,
    equipment_name: r.equipment_inventory_id
      ? equipmentNameById.get(r.equipment_inventory_id) ?? null
      : null,
    vehicle_name: r.vehicle_id
      ? vehicleNameById.get(r.vehicle_id) ?? null
      : null,
    created_by_label: r.created_by
      ? actorById.get(r.created_by) ?? null
      : null,
    performed_by_label: r.performed_by_user_id
      ? actorById.get(r.performed_by_user_id) ?? null
      : null,
  }));

  // Roll-up summary.
  const byState: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  const byOrigin: Record<string, number> = {};
  let openCount = 0;
  for (const r of enriched) {
    byState[r.state] = (byState[r.state] ?? 0) + 1;
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    byOrigin[r.origin] = (byOrigin[r.origin] ?? 0) + 1;
    if (OPEN_STATES.includes(r.state)) openCount++;
  }

  return NextResponse.json({
    events: enriched,
    summary: {
      total: enriched.length,
      open_count: openCount,
      by_state: byState,
      by_kind: byKind,
      by_origin: byOrigin,
      truncated,
    },
    filters: {
      equipment_id: equipmentIdRaw,
      vehicle_id: vehicleIdRaw,
      state: stateRaw,
      kind: kindRaw,
      origin: originRaw,
      since: sinceRaw,
      until: untilRaw,
      open_only: openOnly,
      limit,
    },
  });
}, { routeName: 'admin/maintenance/events#get' });
