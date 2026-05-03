// app/api/admin/maintenance/calendar/route.ts
//
// GET /api/admin/maintenance/calendar
//   ?month=YYYY-MM
//   [&equipment_id=UUID]
//   [&kind=enum]
//
// Phase F10.7-e — calendar aggregator. Returns the data the
// §5.12.7.4 month-grid page needs in one roundtrip:
//
//   month       window (from / to ISO timestamps)
//   days[]      one entry per calendar day in the window;
//               carries the events scheduled THAT day
//   upcoming    next-30-days events sorted ASC for the
//               sidebar list
//   next_due_per_equipment   schedule-driven rollup —
//               for every maintenance_schedule, find the
//               latest completed event matching it and
//               project next_due_at = last_completed_at
//               + frequency_months. Drives the
//               §5.12.7.4 lookahead lane that pre-loads
//               work the F10.7-h cron will eventually
//               auto-create.
//
// Filters: optional `equipment_id` (narrow to one unit's
// service history) and `kind` (narrow to one work type).
//
// Auth: EQUIPMENT_ROLES.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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

const OPEN_STATES = new Set([
  'scheduled',
  'in_progress',
  'awaiting_parts',
  'awaiting_vendor',
]);

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
  summary: string;
}

interface ScheduleRow {
  id: string;
  equipment_inventory_id: string | null;
  category: string | null;
  kind: string;
  frequency_months: number;
  lead_time_days: number;
  is_hard_block: boolean;
}

function parseMonth(raw: string | null): { from: Date; to: Date } | null {
  if (!raw) {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
    );
    return { from, to };
  }
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { from, to };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayList(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  );
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  );
  while (cursor.getTime() <= end.getTime()) {
    out.push(isoDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
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
  const monthRaw = searchParams.get('month');
  const equipmentIdRaw = searchParams.get('equipment_id');
  const kindRaw = searchParams.get('kind');

  const window = parseMonth(monthRaw);
  if (!window) {
    return NextResponse.json(
      { error: '`month` must be YYYY-MM when present.' },
      { status: 400 }
    );
  }
  if (equipmentIdRaw && !UUID_RE.test(equipmentIdRaw)) {
    return NextResponse.json(
      { error: '`equipment_id` must be a UUID.' },
      { status: 400 }
    );
  }
  if (kindRaw && !ALLOWED_KINDS.has(kindRaw)) {
    return NextResponse.json(
      { error: `\`kind\` must be one of: ${Array.from(ALLOWED_KINDS).join(', ')}.` },
      { status: 400 }
    );
  }

  const monthFromIso = window.from.toISOString();
  const monthToIso = window.to.toISOString();

  // Window predicate: scheduled_for falls in the month OR the
  // event is currently open and would surface as "in shop" on
  // the calendar's day strip (use scheduled_for for placement
  // when set, otherwise expected_back_at, otherwise created_at
  // for fallback).
  let monthQ = supabaseAdmin
    .from('maintenance_events')
    .select(
      'id, equipment_inventory_id, vehicle_id, kind, origin, state, ' +
        'scheduled_for, started_at, completed_at, expected_back_at, ' +
        'vendor_name, summary'
    )
    .gte('scheduled_for', monthFromIso)
    .lte('scheduled_for', monthToIso)
    .order('scheduled_for', { ascending: true });
  if (equipmentIdRaw) {
    monthQ = monthQ.eq('equipment_inventory_id', equipmentIdRaw);
  }
  if (kindRaw) monthQ = monthQ.eq('kind', kindRaw);

  const { data: monthData, error: monthErr } = await monthQ;
  if (monthErr) {
    return NextResponse.json({ error: monthErr.message }, { status: 500 });
  }
  const monthEvents = (monthData ?? []) as EventRow[];

  // Upcoming = next-30-days from now, regardless of month.
  const nowIso = new Date().toISOString();
  const upcomingEnd = new Date();
  upcomingEnd.setUTCDate(upcomingEnd.getUTCDate() + 30);
  let upcomingQ = supabaseAdmin
    .from('maintenance_events')
    .select(
      'id, equipment_inventory_id, vehicle_id, kind, origin, state, ' +
        'scheduled_for, started_at, completed_at, expected_back_at, ' +
        'vendor_name, summary'
    )
    .in('state', Array.from(OPEN_STATES))
    .gte('scheduled_for', nowIso)
    .lte('scheduled_for', upcomingEnd.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(100);
  if (equipmentIdRaw) {
    upcomingQ = upcomingQ.eq('equipment_inventory_id', equipmentIdRaw);
  }
  if (kindRaw) upcomingQ = upcomingQ.eq('kind', kindRaw);

  const { data: upcomingData, error: upcomingErr } = await upcomingQ;
  if (upcomingErr) {
    return NextResponse.json(
      { error: upcomingErr.message },
      { status: 500 }
    );
  }
  const upcomingEvents = (upcomingData ?? []) as EventRow[];

  // F10.7-j-ii — failed_qa events surface independently of the
  // current month so a calibration that failed QA last month
  // doesn't fall off the EM's radar. Sorted DESC by scheduled_for
  // (most recent first); state='failed_qa' is terminal-ish (re-
  // openable to in_progress) but nothing else writes to this
  // state via the cron. Date-filter intentionally absent.
  let failedQaQ = supabaseAdmin
    .from('maintenance_events')
    .select(
      'id, equipment_inventory_id, vehicle_id, kind, origin, state, ' +
        'scheduled_for, started_at, completed_at, expected_back_at, ' +
        'vendor_name, summary'
    )
    .eq('state', 'failed_qa')
    .order('scheduled_for', { ascending: false })
    .limit(50);
  if (equipmentIdRaw) {
    failedQaQ = failedQaQ.eq('equipment_inventory_id', equipmentIdRaw);
  }
  if (kindRaw) failedQaQ = failedQaQ.eq('kind', kindRaw);
  const { data: failedQaData, error: failedQaErr } = await failedQaQ;
  if (failedQaErr) {
    console.warn(
      '[admin/maintenance/calendar] failed_qa lookup failed',
      { error: failedQaErr.message }
    );
  }
  const failedQaEvents = (failedQaData ?? []) as EventRow[];

  // Resolve equipment names in one batch across the union.
  const allEquipmentIds = Array.from(
    new Set(
      [...monthEvents, ...upcomingEvents, ...failedQaEvents]
        .map((r) => r.equipment_inventory_id)
        .filter((v): v is string => !!v)
    )
  );
  const equipmentNameById = new Map<string, string>();
  if (allEquipmentIds.length > 0) {
    const { data: items } = await supabaseAdmin
      .from('equipment_inventory')
      .select('id, name, category')
      .in('id', allEquipmentIds);
    for (const r of (items ?? []) as Array<{
      id: string;
      name: string | null;
      category: string | null;
    }>) {
      equipmentNameById.set(r.id, r.name ?? r.id);
    }
  }

  function enrich(r: EventRow) {
    return {
      ...r,
      equipment_name: r.equipment_inventory_id
        ? equipmentNameById.get(r.equipment_inventory_id) ?? null
        : null,
    };
  }

  const enrichedMonth = monthEvents.map(enrich);
  const enrichedUpcoming = upcomingEvents.map(enrich);
  const enrichedFailedQa = failedQaEvents.map(enrich);

  // F10.8 — strip rows whose equipment is personal kit so the
  // §5.12.7.4 calendar doesn&apos;t flag a surveyor&apos;s personal
  // axe. PostgREST doesn&apos;t support a join-side WHERE clause
  // on the anon-key path, so we filter post-fetch using a small
  // pre-loaded id set. The Set is bounded by the personal-kit
  // count which is single-digit in practice.
  const { data: personalRows } = await supabaseAdmin
    .from('equipment_inventory')
    .select('id')
    .eq('is_personal', true);
  const personalEquipmentIds = new Set(
    ((personalRows ?? []) as Array<{ id: string }>).map((r) => r.id)
  );
  const filterPersonal = <T extends { equipment_inventory_id: string | null }>(
    rows: T[]
  ): T[] =>
    rows.filter(
      (r) =>
        !r.equipment_inventory_id ||
        !personalEquipmentIds.has(r.equipment_inventory_id)
    );
  const filteredMonth = filterPersonal(enrichedMonth);
  const filteredUpcoming = filterPersonal(enrichedUpcoming);
  const filteredFailedQa = filterPersonal(enrichedFailedQa);

  // Group month events by day (using scheduled_for date).
  const days = dayList(window.from, window.to).map((day) => {
    const events = filteredMonth.filter(
      (e) => e.scheduled_for && e.scheduled_for.slice(0, 10) === day
    );
    return { date: day, events };
  });

  // ── Next-due-per-equipment (schedule-driven rollup) ──────
  // Read every maintenance_schedule, then resolve the latest
  // completed event per (schedule × equipment_id). For category
  // schedules, fan out across the matching equipment_inventory
  // rows.
  const { data: schedulesData, error: schedulesErr } = await supabaseAdmin
    .from('maintenance_schedules')
    .select(
      'id, equipment_inventory_id, category, kind, frequency_months, ' +
        'lead_time_days, is_hard_block'
    );
  if (schedulesErr) {
    console.warn(
      '[admin/maintenance/calendar] schedules read failed',
      { error: schedulesErr.message }
    );
  }
  const schedules = (schedulesData ?? []) as ScheduleRow[];

  // Resolve category → equipment_id list when the schedule pins
  // a category instead of a specific unit.
  const categoryNeeded = Array.from(
    new Set(
      schedules
        .filter((s) => !!s.category)
        .map((s) => s.category as string)
    )
  );
  const equipmentByCategory = new Map<string, string[]>();
  if (categoryNeeded.length > 0) {
    const { data: catData } = await supabaseAdmin
      .from('equipment_inventory')
      .select('id, category')
      .in('category', categoryNeeded)
      .is('retired_at', null);
    for (const r of (catData ?? []) as Array<{
      id: string;
      category: string | null;
    }>) {
      if (!r.category) continue;
      const arr = equipmentByCategory.get(r.category) ?? [];
      arr.push(r.id);
      equipmentByCategory.set(r.category, arr);
    }
  }

  // Build the (equipment_id × kind) pairs needed for the
  // last-completed lookup.
  type Pair = {
    schedule_id: string;
    equipment_id: string;
    kind: string;
    frequency_months: number;
    lead_time_days: number;
  };
  const pairs: Pair[] = [];
  for (const s of schedules) {
    if (s.equipment_inventory_id) {
      pairs.push({
        schedule_id: s.id,
        equipment_id: s.equipment_inventory_id,
        kind: s.kind,
        frequency_months: s.frequency_months,
        lead_time_days: s.lead_time_days,
      });
    } else if (s.category) {
      const ids = equipmentByCategory.get(s.category) ?? [];
      for (const eqId of ids) {
        pairs.push({
          schedule_id: s.id,
          equipment_id: eqId,
          kind: s.kind,
          frequency_months: s.frequency_months,
          lead_time_days: s.lead_time_days,
        });
      }
    }
  }

  // Last completed maintenance_event per (equipment_id × kind).
  // One bulk read filtered to the equipment_ids we care about,
  // then groupBy in memory.
  const pairEquipmentIds = Array.from(
    new Set(pairs.map((p) => p.equipment_id))
  );
  const lastCompletedByPair = new Map<string, string>(); // key = equip:kind
  if (pairEquipmentIds.length > 0) {
    const { data: completedData } = await supabaseAdmin
      .from('maintenance_events')
      .select('equipment_inventory_id, kind, completed_at')
      .in('equipment_inventory_id', pairEquipmentIds)
      .eq('state', 'complete')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false });
    for (const r of (completedData ?? []) as Array<{
      equipment_inventory_id: string;
      kind: string;
      completed_at: string;
    }>) {
      const key = `${r.equipment_inventory_id}:${r.kind}`;
      // Take the first hit per key — order DESC means it's the
      // latest. Subsequent rows with the same key are older.
      if (!lastCompletedByPair.has(key)) {
        lastCompletedByPair.set(key, r.completed_at);
      }
    }
  }

  const nowMs = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const nextDuePerEquipment = pairs
    .map((p) => {
      const key = `${p.equipment_id}:${p.kind}`;
      const lastCompletedAt = lastCompletedByPair.get(key) ?? null;
      const nextDueAt = lastCompletedAt
        ? addMonths(lastCompletedAt, p.frequency_months)
        : // No completed event yet — treat as due immediately
          // so the EM sees "this never had a cal; schedule one"
          // rather than the schedule disappearing.
          new Date().toISOString();
      const daysUntilDue = Math.round(
        (Date.parse(nextDueAt) - nowMs) / ONE_DAY_MS
      );
      const inLeadWindow = daysUntilDue <= p.lead_time_days;
      return {
        schedule_id: p.schedule_id,
        equipment_id: p.equipment_id,
        equipment_name: equipmentNameById.get(p.equipment_id) ?? null,
        kind: p.kind,
        frequency_months: p.frequency_months,
        lead_time_days: p.lead_time_days,
        last_completed_at: lastCompletedAt,
        next_due_at: nextDueAt,
        days_until_due: daysUntilDue,
        in_lead_window: inLeadWindow,
      };
    })
    .sort((a, b) => a.days_until_due - b.days_until_due);

  // Roll-up summary.
  const byState: Record<string, number> = {};
  let openCount = 0;
  for (const e of filteredMonth) {
    byState[e.state] = (byState[e.state] ?? 0) + 1;
    if (OPEN_STATES.has(e.state)) openCount++;
  }

  return NextResponse.json({
    month: { from: monthFromIso, to: monthToIso },
    days,
    upcoming: filteredUpcoming,
    failed_qa: filteredFailedQa,
    next_due_per_equipment: nextDuePerEquipment,
    summary: {
      month_event_count: filteredMonth.length,
      open_count: openCount,
      by_state: byState,
      upcoming_count: filteredUpcoming.length,
      failed_qa_count: filteredFailedQa.length,
      schedules_count: schedules.length,
      pairs_count: pairs.length,
      due_in_lead_window: nextDuePerEquipment.filter(
        (n) => n.in_lead_window
      ).length,
    },
    filters: {
      month: window.from.toISOString().slice(0, 7),
      equipment_id: equipmentIdRaw,
      kind: kindRaw,
    },
  });
}, { routeName: 'admin/maintenance/calendar#get' });
