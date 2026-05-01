// app/api/cron/equipment-overdue-nag/route.ts
//
// GET /api/cron/equipment-overdue-nag
//
// Phase F10.5-f-ii — the §5.12.6 6pm/9pm overdue-gear nag tick.
// Runs the "every checked_out reservation past reserved_to + not
// silenced" query and fans out a §5.10.4 notification to each
// `checked_out_to_user` so they can extend OR mark in-transit
// from the inline notification actions.
//
// Vercel cron config (vercel.json):
//   { "path": "/api/cron/equipment-overdue-nag", "schedule":
//     "0 0,3 * * 2-6" }
//   The schedule is UTC. 6pm CST = 00:00 UTC next day, 9pm CST
//   = 03:00 UTC next day, so "Tue-Sat at 00:00 and 03:00 UTC"
//   maps to "Mon-Fri at 6pm and 9pm CST". DST-aware tuning is
//   a v1+ polish — the F10.5-h equipment-manager admin can edit
//   vercel.json if seasonal drift becomes annoying.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` header. Vercel
// cron requests carry this automatically when CRON_SECRET is
// set in the project's env vars. Manual triggers from admin
// users (debugging, force-tick) also work via the same header
// — keep CRON_SECRET in 1Password and rotate when needed.
//
// Idempotent: re-running the query within the same window is
// safe — the notification table accepts duplicates and the
// surveyor's inbox will collapse them in v2 polish (a future
// "I already nagged this user about this row in the last 2
// hours" guard can land here without changing the cron
// schedule).
//
// Returns:
//   200 { sent: N, skipped: M, scanned: T }
//
// where `skipped` counts rows we found but couldn't notify
// (typically: registered_users row missing for the
// checked_out_to_user UUID — the surveyor was deleted from the
// directory but their reservation row survived).

import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';

interface OverdueRow {
  id: string;
  job_id: string;
  equipment_inventory_id: string;
  reserved_from: string;
  reserved_to: string;
  checked_out_to_user: string | null;
  nag_silenced_until: string | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  // ── Auth ────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/equipment-overdue-nag] CRON_SECRET not set');
    return NextResponse.json(
      { error: 'CRON_SECRET not configured.' },
      { status: 500 }
    );
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const nowIso = new Date().toISOString();

  // ── Query: every checked_out reservation past reserved_to ──
  // and not currently silenced. Filter `nag_silenced_until` two
  // ways: NULL (never silenced) OR <= now() (silence expired).
  const { data, error } = await supabaseAdmin
    .from('equipment_reservations')
    .select(
      'id, job_id, equipment_inventory_id, reserved_from, reserved_to, ' +
        'checked_out_to_user, nag_silenced_until'
    )
    .eq('state', 'checked_out')
    .lt('reserved_to', nowIso)
    .or(`nag_silenced_until.is.null,nag_silenced_until.lte.${nowIso}`);
  if (error) {
    console.error(
      '[cron/equipment-overdue-nag] overdue query failed',
      { error: error.message }
    );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const overdue = (data ?? []) as OverdueRow[];

  if (overdue.length === 0) {
    console.log('[cron/equipment-overdue-nag] tick: zero overdue rows');
    return NextResponse.json({ sent: 0, skipped: 0, scanned: 0 });
  }

  // ── Resolve checked_out_to_user UUIDs → emails ──────────────
  const userIds = Array.from(
    new Set(
      overdue
        .map((r) => r.checked_out_to_user)
        .filter((v): v is string => !!v)
    )
  );
  const usersById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users, error: usersErr } = await supabaseAdmin
      .from('registered_users')
      .select('id, email')
      .in('id', userIds);
    if (usersErr) {
      console.warn(
        '[cron/equipment-overdue-nag] user lookup failed; will skip rows',
        { error: usersErr.message }
      );
    } else {
      for (const r of (users ?? []) as Array<{ id: string; email: string }>) {
        if (r.email) usersById.set(r.id, r.email);
      }
    }
  }

  // ── Resolve equipment_inventory_id → name for the notification body ──
  const equipmentIds = Array.from(
    new Set(overdue.map((r) => r.equipment_inventory_id))
  );
  const equipmentById = new Map<string, string>();
  if (equipmentIds.length > 0) {
    const { data: items, error: eqErr } = await supabaseAdmin
      .from('equipment_inventory')
      .select('id, name')
      .in('id', equipmentIds);
    if (eqErr) {
      console.warn(
        '[cron/equipment-overdue-nag] equipment lookup failed; will use ID',
        { error: eqErr.message }
      );
    } else {
      for (const r of (items ?? []) as Array<{
        id: string;
        name: string | null;
      }>) {
        equipmentById.set(r.id, r.name ?? r.id);
      }
    }
  }

  // ── Fan out notifications ───────────────────────────────────
  let sent = 0;
  let skipped = 0;
  for (const row of overdue) {
    if (!row.checked_out_to_user) {
      skipped++;
      continue;
    }
    const recipient = usersById.get(row.checked_out_to_user);
    if (!recipient) {
      skipped++;
      console.warn(
        '[cron/equipment-overdue-nag] no email for user',
        {
          reservation_id: row.id,
          user_id: row.checked_out_to_user,
        }
      );
      continue;
    }
    const equipmentName =
      equipmentById.get(row.equipment_inventory_id) ??
      row.equipment_inventory_id;
    try {
      await notify({
        user_email: recipient,
        type: 'equipment_overdue_return',
        title: `Return ${equipmentName}`,
        body:
          `${equipmentName} was due back at ${row.reserved_to}. Drop it ` +
          `off, or tap to extend until 8am or mark in-transit.`,
        icon: '⏰',
        escalation_level: 'high',
        source_type: 'equipment_reservation',
        source_id: row.id,
        // Mobile clients render the inline action buttons by
        // matching `type === 'equipment_overdue_return'` and
        // reading source_id; the button handlers POST to F10.5-d
        // (extend) or F10.5-f-iii (silence-nag).
        link: `/admin/jobs/${row.job_id}`,
      });
      sent++;
    } catch (err) {
      skipped++;
      console.warn(
        '[cron/equipment-overdue-nag] notify failed',
        {
          reservation_id: row.id,
          recipient,
          error: (err as Error).message,
        }
      );
    }
  }

  console.log('[cron/equipment-overdue-nag] tick complete', {
    scanned: overdue.length,
    sent,
    skipped,
    now: nowIso,
  });

  return NextResponse.json({
    sent,
    skipped,
    scanned: overdue.length,
  });
}, { routeName: 'cron/equipment-overdue-nag#get' });
