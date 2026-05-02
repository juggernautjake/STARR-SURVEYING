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
// Phase F10.7-h-ii — same scan also fans out 60/30/7-day
// "calibration coming up" notifications to admin +
// equipment_manager recipients. Boundary-only firing (days_until
// ∈ {60, 30, 7}) means each window triggers exactly once per cycle
// so the EM inbox doesn't fill up; schedules with
// auto_create_event=false still get notifications.
//
// Phase F10.7-i-ii — second pass scans
// equipment_inventory.next_calibration_due_at and auto-creates a
// state='scheduled' calibration event with origin='cert_expiring'
// for any unit whose cert is within 60 days OR overdue AND not
// already covered by a maintenance_schedules row (specific or
// category match). Safety net for units that slipped through the
// schedule-rule setup.
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
//   3. If `days_until ∈ {60, 30, 7}` (h-ii): emit a notification
//      to every admin + equipment_manager recipient. Independent
//      of auto_create_event so manual-only schedules still nudge.
//   4. If `days_until ≤ lead_time_days`
//      AND auto_create_event is true
//      AND no open event already covers this target+kind:
//      INSERT a new maintenance_event:
//        kind = schedule.kind
//        equipment_inventory_id = target
//        origin = 'recurring_schedule'
//        state = 'scheduled'
//        scheduled_for = next_due_at
//        next_due_at = NULL (gets set on the NEXT completion)
//        summary = "Auto-scheduled <kind> from recurring rule"
//
// Idempotent: the duplicate-suppression check at step 4 means
// re-running the cron within the same day is a no-op for events.
// Notifications are intentionally NOT deduplicated server-side —
// boundary-only firing means the cron only emits 3 windows per
// schedule per cycle anyway. A separate debug-trigger via
// `?dry=1` returns the projected actions + notification queue
// without writing.
//
// Returns:
//   200 { scanned, projected, created, skipped, notified, dry_run }
//
// Auth: `Authorization: Bearer <CRON_SECRET>`. Same pattern as
// the F10.5-f-ii equipment-overdue-nag tick.

import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notifyMany } from '@/lib/notifications';

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
  schedule_id: string | null;
  equipment_inventory_id: string;
  kind: string;
  next_due_at: string;
  reason:
    | 'never_serviced'
    | 'next_due_anchor'
    | 'completed_anchor'
    | 'cert_expiring_fallback';
  origin: 'recurring_schedule' | 'cert_expiring';
}

interface PendingNotification {
  schedule_id: string;
  equipment_inventory_id: string;
  kind: string;
  days_until: number;
  next_due_at: string;
}

// F10.7-h-ii — boundary days. Cron runs once/day so each value
// passes through exactly once per cycle, making this the cheapest
// possible dedup mechanism (no extra table required).
const NOTIFICATION_WINDOWS = new Set([60, 30, 7]);

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

  // ── F10.7-i-ii — cert-expiring fallback fetch ────────────────
  // Reads every non-retired/non-lost equipment_inventory row whose
  // NIST cert is overdue OR within 60 days. The Pass 2 projection
  // below uses this list to auto-create calibration events for
  // units NOT covered by any maintenance_schedules row.
  const certCutoffMs = now.getTime() + 60 * 24 * 60 * 60 * 1000;
  const certCutoffIso = new Date(certCutoffMs).toISOString();
  const { data: certUnitsRaw, error: certErr } = await supabaseAdmin
    .from('equipment_inventory')
    .select('id, name, category, next_calibration_due_at, current_status')
    .not('next_calibration_due_at', 'is', null)
    .lte('next_calibration_due_at', certCutoffIso);
  if (certErr) {
    console.warn(
      '[cron/maintenance-schedule-tick] cert-expiring lookup failed',
      { error: certErr.message }
    );
  }
  const certUnits = (
    (certUnitsRaw ?? []) as Array<{
      id: string;
      name: string | null;
      category: string | null;
      next_calibration_due_at: string;
      current_status: string | null;
    }>
  ).filter(
    (r) =>
      r.current_status !== 'retired' && r.current_status !== 'lost'
  );

  if (targets.length === 0 && certUnits.length === 0) {
    return NextResponse.json({
      scanned: scheduleRows.length,
      projected: 0,
      created: 0,
      notified: 0,
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
    new Set([
      ...targets.map((t) => t.equipmentId),
      ...certUnits.map((c) => c.id),
    ])
  );
  if (allEquipmentIds.length === 0) {
    return NextResponse.json({
      scanned: scheduleRows.length,
      projected: 0,
      created: 0,
      notified: 0,
      skipped: 0,
      dry_run: dryRun,
    });
  }
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
  const pendingNotifications: PendingNotification[] = [];
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

    // ── F10.7-h-ii — boundary-day notifications ───────────────
    // Fires regardless of auto_create_event so manual-only
    // schedules still surface to the EM at the 60/30/7-day
    // gates. Only emit when there's no open event already
    // covering the target+kind — once the EM is acting on it,
    // the calendar carries the visibility.
    if (
      NOTIFICATION_WINDOWS.has(days) &&
      (bucket?.open.length ?? 0) === 0
    ) {
      pendingNotifications.push({
        schedule_id: schedule.id,
        equipment_inventory_id: equipmentId,
        kind: schedule.kind,
        days_until: days,
        next_due_at: nextDueIso,
      });
    }

    // ── Auto-create event gate ───────────────────────────────
    if (!schedule.auto_create_event) {
      // Manual-only schedule. Notifications above still fire;
      // skip the event creation path.
      skipped++;
      continue;
    }
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
      origin: 'recurring_schedule',
    });
  }

  // ── F10.7-i-ii — Pass 2: cert-expiring fallback ──────────────
  // Runs after the schedule pass so we can consult the in-memory
  // `actions` queue + the existing event buckets for dedup. A
  // unit is auto-handled here only when it&apos;s NOT covered by
  // any calibration schedule rule (specific equipment_id OR
  // category match) AND has no open calibration event AND no
  // pass-1 action queued for it.
  let certExpiringSkipped = 0;
  if (certUnits.length > 0) {
    // Build the "covered by a calibration schedule" set in one
    // pass. Mirrors the targets-fan-out logic above but scoped to
    // calibration kind only.
    const calibrationCovered = new Set<string>();
    for (const sched of scheduleRows) {
      if (sched.kind !== 'calibration') continue;
      if (sched.equipment_inventory_id) {
        calibrationCovered.add(sched.equipment_inventory_id);
      } else if (sched.category) {
        const ids = equipmentByCategory.get(sched.category) ?? [];
        for (const id of ids) calibrationCovered.add(id);
      }
    }

    // Pass-1 actions already queued for kind=calibration on a
    // given equipment id — also dedup against these.
    const pass1QueuedCalibration = new Set<string>(
      actions
        .filter((a) => a.kind === 'calibration')
        .map((a) => a.equipment_inventory_id)
    );

    for (const unit of certUnits) {
      if (calibrationCovered.has(unit.id)) {
        // A schedule rule covers this — pass 1 already handled it.
        certExpiringSkipped++;
        continue;
      }
      if (pass1QueuedCalibration.has(unit.id)) {
        // Already queued by the schedule pass (defensive — should
        // never hit because the cover-set check above catches
        // everything pass 1 would queue).
        certExpiringSkipped++;
        continue;
      }
      const bucket = eventsByPair.get(bucketKey(unit.id, 'calibration'));
      if ((bucket?.open.length ?? 0) > 0) {
        // Calibration event already open for this unit.
        certExpiringSkipped++;
        continue;
      }

      actions.push({
        schedule_id: null,
        equipment_inventory_id: unit.id,
        kind: 'calibration',
        next_due_at: unit.next_calibration_due_at,
        reason: 'cert_expiring_fallback',
        origin: 'cert_expiring',
      });
    }
  }
  skipped += certExpiringSkipped;

  if (actions.length === 0 || dryRun) {
    if (dryRun) {
      console.log(
        '[cron/maintenance-schedule-tick] dry run',
        {
          scanned: scheduleRows.length,
          projected: actions.length,
          notifications: pendingNotifications.length,
          skipped,
        }
      );
      return NextResponse.json({
        scanned: scheduleRows.length,
        cert_units_scanned: certUnits.length,
        projected: actions.length,
        created: 0,
        cert_expiring_created: 0,
        notified: 0,
        skipped,
        dry_run: true,
        actions,
        notifications: pendingNotifications,
      });
    }
    // Live mode with no auto-create work — still fan out any
    // pending boundary-day notifications below before returning.
    if (pendingNotifications.length === 0) {
      return NextResponse.json({
        scanned: scheduleRows.length,
        cert_units_scanned: certUnits.length,
        projected: 0,
        created: 0,
        cert_expiring_created: 0,
        notified: 0,
        skipped,
        dry_run: false,
      });
    }
  }

  // ── Insert in one batch (when there are actions) — failures
  //    here surface in the cron log; partial inserts are fine
  //    because each row is independently idempotent on the next
  //    tick.
  let createdCount = 0;
  if (actions.length > 0) {
    const insertRows = actions.map((a) => ({
      equipment_inventory_id: a.equipment_inventory_id,
      kind: a.kind,
      origin: a.origin,
      state: 'scheduled',
      scheduled_for: a.next_due_at,
      summary:
        a.origin === 'cert_expiring'
          ? `Auto-scheduled calibration — NIST cert expiring (no schedule rule)`
          : `Auto-scheduled ${a.kind.replace(/_/g, ' ')} from recurring rule`,
      notes:
        `Created by /api/cron/maintenance-schedule-tick at ${nowIso}. ` +
        `Anchor: ${a.reason}.` +
        (a.schedule_id ? ` Schedule: ${a.schedule_id}.` : ''),
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
          notified: 0,
          skipped,
        },
        { status: 500 }
      );
    }
    createdCount = inserted?.length ?? 0;
  }

  // ── F10.7-h-ii — fan out boundary-day notifications ───────
  let notifiedCount = 0;
  if (pendingNotifications.length > 0) {
    // Recipients: every admin + equipment_manager. Mirrors the
    // F10.5-f-ii equipment-overdue-digest recipient lookup.
    let recipients: string[] = [];
    try {
      const { data: rows, error: ruErr } = await supabaseAdmin
        .from('registered_users')
        .select('email, roles')
        .or('roles.cs.{admin},roles.cs.{equipment_manager}');
      if (ruErr) {
        console.warn(
          '[cron/maintenance-schedule-tick] recipients lookup failed',
          { error: ruErr.message }
        );
      } else {
        recipients = ((rows ?? []) as Array<{ email: string | null }>)
          .map((r) => r.email)
          .filter((e): e is string => !!e);
      }
    } catch (err) {
      console.warn(
        '[cron/maintenance-schedule-tick] recipients lookup threw',
        { error: (err as Error).message }
      );
    }

    if (recipients.length === 0) {
      console.log(
        '[cron/maintenance-schedule-tick] zero recipients; skipping fan-out',
        { pending: pendingNotifications.length }
      );
    } else {
      // Resolve equipment names in one batched read so each
      // notification body is human-readable.
      const eqIds = Array.from(
        new Set(pendingNotifications.map((n) => n.equipment_inventory_id))
      );
      const eqNameById = new Map<string, string>();
      if (eqIds.length > 0) {
        const { data: items } = await supabaseAdmin
          .from('equipment_inventory')
          .select('id, name')
          .in('id', eqIds);
        for (const r of (items ?? []) as Array<{
          id: string;
          name: string | null;
        }>) {
          eqNameById.set(r.id, r.name ?? r.id);
        }
      }

      for (const pn of pendingNotifications) {
        const equipmentName =
          eqNameById.get(pn.equipment_inventory_id) ??
          pn.equipment_inventory_id;
        const dueDate = new Date(pn.next_due_at);
        const dueLabel = Number.isFinite(dueDate.getTime())
          ? dueDate.toISOString().slice(0, 10)
          : pn.next_due_at;
        const kindLabel = pn.kind.replace(/_/g, ' ');
        const escalation: 'low' | 'normal' | 'high' =
          pn.days_until <= 7
            ? 'high'
            : pn.days_until <= 30
            ? 'normal'
            : 'low';
        const icon =
          pn.days_until <= 7 ? '⚠️' : pn.days_until <= 30 ? '🛠️' : '📅';
        try {
          await notifyMany(recipients, {
            type: 'maintenance_schedule_due',
            title: `${equipmentName} ${kindLabel} due in ${pn.days_until} days`,
            body:
              `${equipmentName} is due for ${kindLabel} on ${dueLabel}. ` +
              (pn.days_until <= 7
                ? 'Schedule the service now to keep the unit available.'
                : pn.days_until <= 30
                ? 'Heads-up — line up the vendor or block the unit on the calendar.'
                : 'Long-range notice — start coordinating vendor scheduling.'),
            icon,
            escalation_level: escalation,
            source_type: 'maintenance_schedule',
            source_id: pn.schedule_id,
            link: '/admin/equipment/maintenance',
          });
          notifiedCount += recipients.length;
        } catch (err) {
          console.warn(
            '[cron/maintenance-schedule-tick] notifyMany failed',
            {
              schedule_id: pn.schedule_id,
              equipment_inventory_id: pn.equipment_inventory_id,
              error: (err as Error).message,
            }
          );
        }
      }
    }
  }

  const certExpiringCreated = actions.filter(
    (a) => a.origin === 'cert_expiring'
  ).length;

  console.log('[cron/maintenance-schedule-tick] tick complete', {
    scanned: scheduleRows.length,
    cert_units_scanned: certUnits.length,
    projected: actions.length,
    created: createdCount,
    cert_expiring_created: certExpiringCreated,
    notified: notifiedCount,
    notifications_queued: pendingNotifications.length,
    skipped,
    now: nowIso,
  });

  return NextResponse.json({
    scanned: scheduleRows.length,
    cert_units_scanned: certUnits.length,
    projected: actions.length,
    created: createdCount,
    cert_expiring_created: certExpiringCreated,
    notified: notifiedCount,
    skipped,
    dry_run: false,
  });
}, { routeName: 'cron/maintenance-schedule-tick#get' });
