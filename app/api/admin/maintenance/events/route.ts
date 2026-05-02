// app/api/admin/maintenance/events/route.ts
//
// GET  /api/admin/maintenance/events  (F10.7-b — list + filter)
// POST /api/admin/maintenance/events  (F10.7-c-i — create)
//
// Read-only list endpoint + manual-create POST for the §5.12.8
// maintenance_events table. Powers the F10.7-f calendar feed +
// F10.7-g per-equipment service-history view + the §5.12.7.4
// 'open work' panel. Manual create lands rows EM-initiated (the
// F10.5-g damage/lost triage path inserts directly via the
// triggerDamageTriage / triggerLostTriage helpers; the F10.7-h
// recurring-schedule cron uses this same POST handler with
// origin='recurring_schedule').
//
// Auth: EQUIPMENT_ROLES (read); admin / developer /
// equipment_manager (write).

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

// ──────────────────────────────────────────────────────────────
// POST — F10.7-c-i: manual create
// ──────────────────────────────────────────────────────────────
//
// Body:
//   {
//     equipment_inventory_id?: UUID,    // XOR with vehicle_id
//     vehicle_id?: UUID,
//     kind: enum,                       // required
//     origin?: enum,                    // default 'manual'
//     state?: enum,                     // default 'scheduled'
//     scheduled_for?: ISO,
//     expected_back_at?: ISO,
//     vendor_name?: string,
//     vendor_contact?: string,
//     vendor_work_order?: string,
//     performed_by_user_id?: UUID,
//     cost_cents?: integer,             // total parts + labour
//     linked_receipt_id?: UUID,
//     summary: string,                  // required (≤ 200 chars)
//     notes?: string,
//   }
//
// XOR target: exactly one of equipment_inventory_id / vehicle_id
// must be present. The seeds/245 CHECK enforces; we pre-validate
// for cleaner error messages.
//
// performed_by + vendor_name CAN coexist (e.g., in-shop rebuild
// using a vendor part). The §5.12.8 spec's "calibration requires
// a third party" gate is enforced at the F10.7-c-ii PATCH level
// when the EM completes a calibration event — keeps create
// permissive so manual entry doesn't fight the EM.
//
// Returns: the created row.

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userRoles = (session.user as { roles?: string[] } | undefined)
    ?.roles ?? [];
  if (
    !isAdmin(session.user.roles) &&
    !userRoles.includes('equipment_manager')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const actorUserId =
    (session.user as { id?: string } | undefined)?.id ?? null;

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON object.' },
      { status: 400 }
    );
  }

  // ── XOR target ──────────────────────────────────────────────
  const equipmentId =
    typeof body.equipment_inventory_id === 'string'
      ? body.equipment_inventory_id.trim()
      : '';
  const vehicleId =
    typeof body.vehicle_id === 'string' ? body.vehicle_id.trim() : '';
  const hasEq = equipmentId.length > 0;
  const hasVeh = vehicleId.length > 0;
  if (hasEq === hasVeh) {
    return NextResponse.json(
      {
        error:
          'Provide exactly one of `equipment_inventory_id` or ' +
          '`vehicle_id`.',
      },
      { status: 400 }
    );
  }
  if (hasEq && !UUID_RE.test(equipmentId)) {
    return NextResponse.json(
      { error: '`equipment_inventory_id` must be a valid UUID.' },
      { status: 400 }
    );
  }
  if (hasVeh && !UUID_RE.test(vehicleId)) {
    return NextResponse.json(
      { error: '`vehicle_id` must be a valid UUID.' },
      { status: 400 }
    );
  }

  // ── Required + enum-gated fields ───────────────────────────
  const kind = typeof body.kind === 'string' ? body.kind.trim() : '';
  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json(
      {
        error:
          '`kind` is required and must be one of: ' +
          Array.from(ALLOWED_KINDS).join(', '),
      },
      { status: 400 }
    );
  }

  let origin = 'manual';
  if (body.origin !== undefined && body.origin !== null) {
    if (typeof body.origin !== 'string' || !ALLOWED_ORIGINS.has(body.origin)) {
      return NextResponse.json(
        {
          error: `\`origin\` must be one of: ${Array.from(ALLOWED_ORIGINS).join(', ')}.`,
        },
        { status: 400 }
      );
    }
    origin = body.origin;
  }

  let state = 'scheduled';
  if (body.state !== undefined && body.state !== null) {
    if (typeof body.state !== 'string' || !ALLOWED_STATES.has(body.state)) {
      return NextResponse.json(
        {
          error: `\`state\` must be one of: ${Array.from(ALLOWED_STATES).join(', ')}.`,
        },
        { status: 400 }
      );
    }
    state = body.state;
  }

  const summary =
    typeof body.summary === 'string' ? body.summary.trim() : '';
  if (!summary) {
    return NextResponse.json(
      { error: '`summary` is required.' },
      { status: 400 }
    );
  }
  if (summary.length > 200) {
    return NextResponse.json(
      { error: '`summary` must be ≤ 200 characters.' },
      { status: 400 }
    );
  }

  // ── Optional ISO timestamp + UUID + numeric fields ─────────
  const scheduledFor = parseOptionalIso(body.scheduled_for, 'scheduled_for');
  if ('error' in scheduledFor) return scheduledFor.error;
  const expectedBackAt = parseOptionalIso(
    body.expected_back_at,
    'expected_back_at'
  );
  if ('error' in expectedBackAt) return expectedBackAt.error;

  const performedBy = parseOptionalUuid(
    body.performed_by_user_id,
    'performed_by_user_id'
  );
  if ('error' in performedBy) return performedBy.error;

  const linkedReceipt = parseOptionalUuid(
    body.linked_receipt_id,
    'linked_receipt_id'
  );
  if ('error' in linkedReceipt) return linkedReceipt.error;

  const costCents = parseOptionalInt(body.cost_cents, 'cost_cents', 0);
  if ('error' in costCents) return costCents.error;

  const vendorName = parseOptionalString(body.vendor_name, 'vendor_name');
  if ('error' in vendorName) return vendorName.error;
  const vendorContact = parseOptionalString(
    body.vendor_contact,
    'vendor_contact'
  );
  if ('error' in vendorContact) return vendorContact.error;
  const vendorWorkOrder = parseOptionalString(
    body.vendor_work_order,
    'vendor_work_order'
  );
  if ('error' in vendorWorkOrder) return vendorWorkOrder.error;

  const notes = parseOptionalString(body.notes, 'notes');
  if ('error' in notes) return notes.error;

  // ── Insert ──────────────────────────────────────────────────
  const insertBody = {
    equipment_inventory_id: hasEq ? equipmentId : null,
    vehicle_id: hasVeh ? vehicleId : null,
    kind,
    origin,
    state,
    scheduled_for: scheduledFor.value,
    expected_back_at: expectedBackAt.value,
    vendor_name: vendorName.value,
    vendor_contact: vendorContact.value,
    vendor_work_order: vendorWorkOrder.value,
    performed_by_user_id: performedBy.value,
    cost_cents: costCents.value,
    linked_receipt_id: linkedReceipt.value,
    summary,
    notes: notes.value,
    created_by: actorUserId,
  };

  const { data: inserted, error } = await supabaseAdmin
    .from('maintenance_events')
    .insert(insertBody)
    .select(
      'id, equipment_inventory_id, vehicle_id, kind, origin, state, ' +
        'scheduled_for, started_at, completed_at, expected_back_at, ' +
        'vendor_name, vendor_contact, vendor_work_order, ' +
        'performed_by_user_id, cost_cents, linked_receipt_id, ' +
        'summary, notes, qa_passed, next_due_at, created_at, ' +
        'created_by, updated_at'
    )
    .maybeSingle();
  if (error) {
    console.error('[admin/maintenance/events POST] insert failed', {
      code: (error as { code?: string }).code,
      message: error.message,
    });
    return NextResponse.json(
      { error: error.message ?? 'Insert failed.' },
      { status: 500 }
    );
  }
  if (!inserted) {
    return NextResponse.json(
      { error: 'Insert returned no row.' },
      { status: 500 }
    );
  }

  console.log('[admin/maintenance/events POST] ok', {
    event_id: (inserted as { id: string }).id,
    equipment_inventory_id: hasEq ? equipmentId : null,
    vehicle_id: hasVeh ? vehicleId : null,
    kind,
    origin,
    state,
    actor_email: session.user.email,
  });

  return NextResponse.json({ event: inserted });
}, { routeName: 'admin/maintenance/events#post' });

// ──────────────────────────────────────────────────────────────
// Body-validation helpers
// ──────────────────────────────────────────────────────────────

type Maybe<T> = { value: T | null } | { error: NextResponse };

function parseOptionalIso(raw: unknown, name: string): Maybe<string> {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== 'string') {
    return {
      error: NextResponse.json(
        { error: `\`${name}\` must be a string when present.` },
        { status: 400 }
      ),
    };
  }
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) {
    return {
      error: NextResponse.json(
        { error: `\`${name}\` must be a parseable ISO timestamp.` },
        { status: 400 }
      ),
    };
  }
  return { value: new Date(t).toISOString() };
}

function parseOptionalUuid(raw: unknown, name: string): Maybe<string> {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
    return {
      error: NextResponse.json(
        { error: `\`${name}\` must be a valid UUID when present.` },
        { status: 400 }
      ),
    };
  }
  return { value: raw };
}

function parseOptionalInt(
  raw: unknown,
  name: string,
  min: number
): Maybe<number> {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < min) {
    return {
      error: NextResponse.json(
        {
          error: `\`${name}\` must be an integer ≥ ${min} when present.`,
        },
        { status: 400 }
      ),
    };
  }
  return { value: raw };
}

function parseOptionalString(raw: unknown, name: string): Maybe<string> {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== 'string') {
    return {
      error: NextResponse.json(
        { error: `\`${name}\` must be a string when present.` },
        { status: 400 }
      ),
    };
  }
  const trimmed = raw.trim();
  return { value: trimmed.length > 0 ? trimmed : null };
}
