// app/api/admin/equipment/reservations-timeline/route.ts
//
// GET /api/admin/equipment/reservations-timeline
//   ?from=ISO&to=ISO
//   [&group_by=equipment|job]
//   [&category=str]
//   [&state=held|checked_out|returned|cancelled]
//   [&overdue_only=1]
//
// Phase F10.6-c-i — the §5.12.7.2 Reservations timeline
// aggregator. Returns every `equipment_reservations` row whose
// window overlaps [from, to), grouped into swimlanes per the
// requested `group_by`. The F10.6-c-ii page UI consumes this
// payload and renders the Gantt; this endpoint stays
// presentation-agnostic so the §5.12.9 mobile timeline + the
// future "/admin/jobs/[id]/timeline" job-detail embed can
// reuse it.
//
// Default window: today → today + 14 days.
//
// Group modes:
//   * equipment — one swimlane per equipment_inventory row
//                 referenced by at least one reservation in
//                 the window. Each bar carries job_id +
//                 holder for the drilldown drawer
//                 (F10.6-c-iii).
//   * job       — one swimlane per job_id with at-least-one
//                 reservation. Each bar carries
//                 equipment_inventory_id + name.
//
// Filter chips:
//   * category    narrow to equipment_inventory.category=…
//                 (engine pre-resolves the matching ids).
//   * state       narrow to one reservation state.
//   * overdue_only=1  state='checked_out' AND reserved_to <
//                 now() — the "what's late RIGHT NOW" view.
//
// Auth: EQUIPMENT_ROLES.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const ALLOWED_GROUP_BY = new Set(['equipment', 'job']);
const ALLOWED_STATES = new Set(['held', 'checked_out', 'returned', 'cancelled']);

interface ReservationRow {
  id: string;
  job_id: string;
  equipment_inventory_id: string;
  reserved_from: string;
  reserved_to: string;
  state: string;
  is_override: boolean;
  notes: string | null;
  checked_out_to_user: string | null;
  returned_condition: string | null;
}

interface SwimlaneBar {
  reservation_id: string;
  state: string;
  reserved_from: string;
  reserved_to: string;
  is_override: boolean;
  job_id: string;
  equipment_inventory_id: string;
  equipment_name: string | null;
  holder_email: string | null;
  returned_condition: string | null;
}

interface Swimlane {
  key: string; // equipment_inventory_id OR job_id
  label: string;
  meta: Record<string, unknown>;
  bars: SwimlaneBar[];
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
  const fromRaw = searchParams.get('from');
  const toRaw = searchParams.get('to');
  const groupByRaw = searchParams.get('group_by') ?? 'equipment';
  const categoryRaw = searchParams.get('category');
  const stateRaw = searchParams.get('state');
  const overdueOnly = searchParams.get('overdue_only') === '1';

  if (!ALLOWED_GROUP_BY.has(groupByRaw)) {
    return NextResponse.json(
      {
        error:
          '`group_by` must be `equipment` or `job` when present.',
      },
      { status: 400 }
    );
  }
  const groupBy = groupByRaw as 'equipment' | 'job';

  if (stateRaw && !ALLOWED_STATES.has(stateRaw)) {
    return NextResponse.json(
      { error: `\`state\` must be one of: ${Array.from(ALLOWED_STATES).join(', ')}.` },
      { status: 400 }
    );
  }

  // Default window — today → today + 14 days.
  const now = new Date();
  const defaultFrom = now.toISOString();
  const defaultToDate = new Date(now);
  defaultToDate.setUTCDate(defaultToDate.getUTCDate() + 14);
  const defaultTo = defaultToDate.toISOString();

  let from = defaultFrom;
  let to = defaultTo;
  if (fromRaw) {
    const t = Date.parse(fromRaw);
    if (!Number.isFinite(t)) {
      return NextResponse.json(
        { error: '`from` must be a parseable ISO timestamp.' },
        { status: 400 }
      );
    }
    from = new Date(t).toISOString();
  }
  if (toRaw) {
    const t = Date.parse(toRaw);
    if (!Number.isFinite(t)) {
      return NextResponse.json(
        { error: '`to` must be a parseable ISO timestamp.' },
        { status: 400 }
      );
    }
    to = new Date(t).toISOString();
  }
  if (Date.parse(to) <= Date.parse(from)) {
    return NextResponse.json(
      { error: '`to` must be strictly after `from`.' },
      { status: 400 }
    );
  }

  // Optional category filter — pre-resolve matching equipment_ids.
  let categoryFilterIds: string[] | null = null;
  if (categoryRaw && categoryRaw.trim().length > 0) {
    const { data, error } = await supabaseAdmin
      .from('equipment_inventory')
      .select('id')
      .eq('category', categoryRaw.trim())
      .is('retired_at', null);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    categoryFilterIds = ((data ?? []) as Array<{ id: string }>).map(
      (r) => r.id
    );
    if (categoryFilterIds.length === 0) {
      return NextResponse.json({
        window: { from, to },
        group_by: groupBy,
        filters: {
          category: categoryRaw.trim(),
          state: stateRaw,
          overdue_only: overdueOnly,
        },
        swimlanes: [],
        summary: { swimlane_count: 0, bar_count: 0 },
      });
    }
  }

  // Window-overlap query. The seeds/239 partial GiST index
  // covers active rows; the broader query below also picks up
  // returned/cancelled bars for visual continuity in the Gantt.
  let q = supabaseAdmin
    .from('equipment_reservations')
    .select(
      'id, job_id, equipment_inventory_id, reserved_from, reserved_to, ' +
        'state, is_override, notes, checked_out_to_user, returned_condition'
    )
    .lt('reserved_from', to)
    .gt('reserved_to', from);
  if (stateRaw) q = q.eq('state', stateRaw);
  if (categoryFilterIds) q = q.in('equipment_inventory_id', categoryFilterIds);
  if (overdueOnly) {
    q = q
      .eq('state', 'checked_out')
      .lt('reserved_to', new Date().toISOString());
  }

  const { data, error } = await q.order('reserved_from', { ascending: true });
  if (error) {
    console.error('[admin/equipment/reservations-timeline] read failed', {
      error: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as ReservationRow[];

  if (rows.length === 0) {
    return NextResponse.json({
      window: { from, to },
      group_by: groupBy,
      filters: {
        category: categoryRaw,
        state: stateRaw,
        overdue_only: overdueOnly,
      },
      swimlanes: [],
      summary: { swimlane_count: 0, bar_count: 0 },
    });
  }

  // Batch lookups — equipment names + holder emails.
  const equipmentIds = Array.from(
    new Set(rows.map((r) => r.equipment_inventory_id))
  );
  const equipmentById = new Map<
    string,
    { name: string | null; category: string | null; item_kind: string | null }
  >();
  {
    const { data: items, error: eqErr } = await supabaseAdmin
      .from('equipment_inventory')
      .select('id, name, category, item_kind')
      .in('id', equipmentIds);
    if (eqErr) {
      console.warn(
        '[admin/equipment/reservations-timeline] equipment lookup failed',
        { error: eqErr.message }
      );
    } else {
      for (const r of (items ?? []) as Array<{
        id: string;
        name: string | null;
        category: string | null;
        item_kind: string | null;
      }>) {
        equipmentById.set(r.id, {
          name: r.name,
          category: r.category,
          item_kind: r.item_kind,
        });
      }
    }
  }

  const userIds = Array.from(
    new Set(
      rows
        .map((r) => r.checked_out_to_user)
        .filter((v): v is string => !!v)
    )
  );
  const holderById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users, error: userErr } = await supabaseAdmin
      .from('registered_users')
      .select('id, email, name')
      .in('id', userIds);
    if (userErr) {
      console.warn(
        '[admin/equipment/reservations-timeline] holder lookup failed',
        { error: userErr.message }
      );
    } else {
      for (const r of (users ?? []) as Array<{
        id: string;
        email: string | null;
        name: string | null;
      }>) {
        holderById.set(r.id, r.name ?? r.email ?? r.id);
      }
    }
  }

  // Build bars with display fields resolved.
  const bars: SwimlaneBar[] = rows.map((r) => ({
    reservation_id: r.id,
    state: r.state,
    reserved_from: r.reserved_from,
    reserved_to: r.reserved_to,
    is_override: r.is_override,
    job_id: r.job_id,
    equipment_inventory_id: r.equipment_inventory_id,
    equipment_name: equipmentById.get(r.equipment_inventory_id)?.name ?? null,
    holder_email: r.checked_out_to_user
      ? holderById.get(r.checked_out_to_user) ?? null
      : null,
    returned_condition: r.returned_condition,
  }));

  // Group into swimlanes.
  const laneMap = new Map<string, Swimlane>();
  for (const bar of bars) {
    const key =
      groupBy === 'equipment' ? bar.equipment_inventory_id : bar.job_id;
    let lane = laneMap.get(key);
    if (!lane) {
      const label =
        groupBy === 'equipment'
          ? bar.equipment_name ?? bar.equipment_inventory_id
          : `Job ${bar.job_id.slice(0, 8)}`;
      const meta =
        groupBy === 'equipment'
          ? {
              category:
                equipmentById.get(bar.equipment_inventory_id)?.category ??
                null,
              item_kind:
                equipmentById.get(bar.equipment_inventory_id)?.item_kind ??
                null,
            }
          : { job_id: bar.job_id };
      lane = { key, label, meta, bars: [] };
      laneMap.set(key, lane);
    }
    lane.bars.push(bar);
  }

  // Stable swimlane ordering — alphabetical by label.
  const swimlanes = Array.from(laneMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );

  return NextResponse.json({
    window: { from, to },
    group_by: groupBy,
    filters: {
      category: categoryRaw,
      state: stateRaw,
      overdue_only: overdueOnly,
    },
    swimlanes,
    summary: {
      swimlane_count: swimlanes.length,
      bar_count: bars.length,
    },
  });
}, { routeName: 'admin/equipment/reservations-timeline#get' });
