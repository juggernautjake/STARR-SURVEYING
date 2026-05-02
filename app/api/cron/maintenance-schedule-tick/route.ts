// app/api/cron/maintenance-schedule-tick/route.ts
//
// GET /api/cron/maintenance-schedule-tick
//
// Phase F10.7-h-i — daily 3am tick that walks every active
// `maintenance_schedules` row and auto-creates a state='scheduled'
// `maintenance_events` row when the projected `next_due_at` falls
// inside the schedule's lead window AND no scheduled / in-progress
// event already covers that target+kind.
//
// Vercel cron config (vercel.json):
//   { "path": "/api/cron/maintenance-schedule-tick",
//     "schedule": "0 8 * * *" }
//   The schedule is UTC. 3am CST = 09:00 UTC (CDT) / 09:00 UTC
//   (CST). Running at 08:00 UTC slots us in just before the EM
//   logs in for the day so the calendar reflects auto-created
//   events on first load. DST drift is acceptable here — the
//   cron is idempotent and the EM never relies on the precise
//   minute.
//
// Algorithm (per schedule row):
//
//   1. Resolve targets:
//        - schedule.equipment_inventory_id set → just that unit
//        - schedule.category set → fan-out to every
//          equipment_inventory row with category = X
//   2. For each target, find the most-recent maintenance_event
//      matching kind + target. Use the event's `next_due_at`
//      column as the canonical "when is this due again" anchor.
//      Fallback: completed_at + frequency_months months.
//      Never-serviced: due now (forces an alert on first tick).
//   3. If `next_due_at - now() ≤ lead_time_days`
//      AND auto_create_event is true
//      AND no existing scheduled / in_progress event already
//          covers this target+kind for the same projected window:
//      INSERT a new maintenance_event:
//        kind = schedule.kind
//        equipment_inventory_id = target
//        origin = 'recurring_schedule'
//        state = 'scheduled'
//        scheduled_for = next_due_at
//        next_due_at = NULL (gets set on the NEXT completion)
//        summary = "Auto-scheduled <kind> from recurring rule"
//
// Idempotent: the duplicate-suppression check at step 3 means
// re-running the cron within the same day is a no-op. A separate
// debug-trigger via `?dry=1` returns the projected actions
// without writing.
//
// Returns:
//   200 { scanned, projected, created, skipped, dry_run }
//
// Auth: `Authorization: Bearer <CRON_SECRET>`. Same pattern as
// the F10.5-f-ii equipment-overdue-nag tick.

import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface ScheduleRow {
  id: string;
  equipment_inventory_id: string | null;
  category: string | null;
  kind: string;
  frequency_months: number;
  lead_time_days: number;
  is_hard_block: boolean;
  auto_create_event: boolean;
}

interface EventRow {
  id: string;
  equipment_inventory_id: string | null;
  kind: string;
  state: string;
  scheduled_for: string | null;
  completed_at: string | null;
  next_due_at: string | null;
}

interface ProjectedAction {
  schedule_id: string;
  equipment_inventory_id: string;
  kind: string;
  next_due_at: string;
  reason: 'never_serviced' | 'next_due_anchor' | 'completed_anchor';
}

const ALLOWED_KINDS_FOR_EVENT = new Set([
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

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  // Date.setMonth handles month overflow + leap-day edge cases
  // the way Postgres `+ interval '12 months'` does.
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

function daysUntil(iso: string, now: Date): number {
  const due = new Date(iso).getTime();
  if (!Number.isFinite(due)) return Number.POSITIVE_INFINITY;
  return Math.floor((due - now.getTime()) / (1000 * 60 * 60 * 24));
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  // ── Auth ────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error(
      '[cron/maintenance-schedule-tick] CRON_SECRET not set'
    );
    return NextResponse.json(
      { error: 'CRON_SECRET not configured.' },
      { status: 500 }
    );
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';
  const now = new Date();
  const nowIso = now.toISOString();

  // ── Read every schedule (small N — single round-trip) ──────
  const { data: schedules, error: schedErr } = await supabaseAdmin
    .from('maintenance_schedules')
    .select(
      'id, equipment_inventory_id, category, kind, frequency_months, ' +
        'lead_time_days, is_hard_block, auto_create_event'
    );
  if (schedErr) {
    console.error(
      '[cron/maintenance-schedule-tick] schedule read failed',
      { error: schedErr.message }
    );
    return NextResponse.json({ error: schedErr.message }, { status: 500 });
  }
  const scheduleRows = (schedules ?? []) as ScheduleRow[];

  if (scheduleRows.length === 0) {
    console.log(
      '[cron/maintenance-schedule-tick] tick: zero schedules'
    );
    return NextResponse.json({
      scanned: 0,
      projected: 0,
      created: 0,
      skipped: 0,
      dry_run: dryRun,
    });
  }

  // ── Resolve category targets in one batched read ────────────
  const categoriesNeeded = Array.from(
    new Set(
      scheduleRows
        .filter((s) => s.category)
        .map((s) => s.category as string)
    )
  );
  const equipmentByCategory = new Map<string, string[]>();
  if (categoriesNeeded.length > 0) {
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from('equipment_inventory')
      .select('id, category')
      .in('category', categoriesNeeded);
    if (itemsErr) {
      console.warn(
        '[cron/maintenance-schedule-tick] equipment fan-out failed',
        { error: itemsErr.message }
      );
    } else {
      for (const r of (items ?? []) as Array<{
        id: string;
        category: string | null;
      }>) {
        if (!r.category) continue;
        const list = equipmentByCategory.get(r.category) ?? [];
        list.push(r.id);
        equipmentByCategory.set(r.category, list);
      }
    }
  }

  // ── Build the (target_equipment_id, kind) pair set so the
  //    duplicate-suppression check + last-event lookup can fan
  //    out in two batched reads instead of N+1.
  const targets: Array<{ schedule: ScheduleRow; equipmentId: string }> =
    [];
  for (const sched of scheduleRows) {
    if (sched.equipment_inventory_id) {
      targets.push({
        schedule: sched,
        equipmentId: sched.equipment_inventory_id,
      });
    } else if (sched.category) {
      const ids = equipmentByCategory.get(sched.category) ?? [];
      for (const id of ids) {
        targets.push({ schedule: sched, equipmentId: id });
      }
    }
  }

  if (targets.length === 0) {
    return NextResponse.json({
      scanned: scheduleRows.length,
      projected: 0,
      created: 0,
      skipped: 0,
      dry_run: dryRun,
    });
  }

  // ── Pull every relevant event in one read keyed by the
  //    distinct (equipment_id, kind) pairs we care about. We
  //    over-fetch slightly (every event for these equipment ids,
  //    not just matching kinds) but the kind set is small so the
  //    cost is dominated by the equipment_id IN clause anyway.
  const allEquipmentIds = Array.from(
    new Set(targets.map((t) => t.equipmentId))
  );
  const { data: events, error: eventsErr } = await supabaseAdmin
    .from('maintenance_events')
    .select(
      'id, equipment_inventory_id, kind, state, scheduled_for, ' +
        'completed_at, next_due_at'
    )
    .in('equipment_inventory_id', allEquipmentIds);
  if (eventsErr) {
    console.error(
      '[cron/maintenance-schedule-tick] events lookup failed',
      { error: eventsErr.message }
    );
    return NextResponse.json(
      { error: eventsErr.message },
      { status: 500 }
    );
  }
  const eventRows = (events ?? []) as EventRow[];

  // Group events by (equipment_id, kind) — both for picking the
  // most-recent completed/next_due anchor AND for checking
  // duplicate scheduled / in_progress rows.
  type EventBucket = {
    open: EventRow[]; // scheduled / in_progress / awaiting_*
    mostRecentCompletion: EventRow | null;
  };
  const bucketKey = (eqId: string, kind: string) => `${eqId}::${kind}`;
  const eventsByPair = new Map<string, EventBucket>();
  const OPEN_STATES = new Set([
    'scheduled',
    'in_progress',
    'awaiting_parts',
    'awaiting_vendor',
  ]);
  for (const ev of eventRows) {
    if (!ev.equipment_inventory_id) continue;
    const key = bucketKey(ev.equipment_inventory_id, ev.kind);
    let bucket = eventsByPair.get(key);
    if (!bucket) {
      bucket = { open: [], mostRecentCompletion: null };
      eventsByPair.set(key, bucket);
    }
    if (OPEN_STATES.has(ev.state)) {
      bucket.open.push(ev);
    } else if (ev.state === 'complete') {
      const prevAt = bucket.mostRecentCompletion?.completed_at ?? null;
      const thisAt = ev.completed_at;
      if (
        !prevAt ||
        (thisAt && new Date(thisAt) > new Date(prevAt))
      ) {
        bucket.mostRecentCompletion = ev;
      }
    }
  }

  // ── Project per (schedule, equipment) and decide actions ───
  const actions: ProjectedAction[] = [];
  let skipped = 0;
  for (const { schedule, equipmentId } of targets) {
    if (!ALLOWED_KINDS_FOR_EVENT.has(schedule.kind)) {
      skipped++;
      console.warn(
        '[cron/maintenance-schedule-tick] schedule kind not in event enum',
        {
          schedule_id: schedule.id,
          kind: schedule.kind,
        }
      );
      continue;
    }
    if (!schedule.auto_create_event) {
      // Manual-only schedule. h-ii notification covers it; this
      // batch is auto-create-only so skip silently.
      skipped++;
      continue;
    }
    const key = bucketKey(equipmentId, schedule.kind);
    const bucket = eventsByPair.get(key);

    // Anchor: prefer next_due_at on the most-recent completed
    // event; fall back to completed_at + frequency; finally
    // never-serviced → due now.
    let nextDueIso: string;
    let reason: ProjectedAction['reason'];
    const anchor = bucket?.mostRecentCompletion;
    if (anchor?.next_due_at) {
      nextDueIso = anchor.next_due_at;
      reason = 'next_due_anchor';
    } else if (anchor?.completed_at) {
      nextDueIso = addMonths(
        anchor.completed_at,
        schedule.frequency_months
      );
      reason = 'completed_anchor';
    } else {
      nextDueIso = nowIso;
      reason = 'never_serviced';
    }

    const days = daysUntil(nextDueIso, now);
    if (days > schedule.lead_time_days) {
      // Outside the lead window — nothing to do.
      continue;
    }

    // Duplicate suppression: skip if there's already an open
    // event for this target+kind. We don't need to compare
    // scheduled_for windows — one open event is enough.
    if ((bucket?.open.length ?? 0) > 0) {
      skipped++;
      continue;
    }

    actions.push({
      schedule_id: schedule.id,
      equipment_inventory_id: equipmentId,
      kind: schedule.kind,
      next_due_at: nextDueIso,
      reason,
    });
  }

  if (actions.length === 0 || dryRun) {
    if (dryRun) {
      console.log(
        '[cron/maintenance-schedule-tick] dry run',
        {
          scanned: scheduleRows.length,
          projected: actions.length,
          skipped,
        }
      );
    }
    return NextResponse.json({
      scanned: scheduleRows.length,
      projected: actions.length,
      created: 0,
      skipped,
      dry_run: dryRun,
      ...(dryRun ? { actions } : {}),
    });
  }

  // ── Insert in one batch — failures here surface in the cron
  //    log; partial inserts are fine because each row is
  //    independently idempotent on the next tick.
  const insertRows = actions.map((a) => ({
    equipment_inventory_id: a.equipment_inventory_id,
    kind: a.kind,
    origin: 'recurring_schedule',
    state: 'scheduled',
    scheduled_for: a.next_due_at,
    summary: `Auto-scheduled ${a.kind.replace(/_/g, ' ')} from recurring rule`,
    notes:
      `Created by /api/cron/maintenance-schedule-tick at ${nowIso}. ` +
      `Anchor: ${a.reason}. Schedule: ${a.schedule_id}.`,
  }));

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('maintenance_events')
    .insert(insertRows)
    .select('id, equipment_inventory_id, kind, scheduled_for');
  if (insertErr) {
    console.error(
      '[cron/maintenance-schedule-tick] insert failed',
      { error: insertErr.message, count: insertRows.length }
    );
    return NextResponse.json(
      {
        error: insertErr.message,
        scanned: scheduleRows.length,
        projected: actions.length,
        created: 0,
        skipped,
      },
      { status: 500 }
    );
  }

  console.log('[cron/maintenance-schedule-tick] tick complete', {
    scanned: scheduleRows.length,
    projected: actions.length,
    created: inserted?.length ?? 0,
    skipped,
    now: nowIso,
  });

  return NextResponse.json({
    scanned: scheduleRows.length,
    projected: actions.length,
    created: inserted?.length ?? 0,
    skipped,
    dry_run: false,
  });
}, { routeName: 'cron/maintenance-schedule-tick#get' });
