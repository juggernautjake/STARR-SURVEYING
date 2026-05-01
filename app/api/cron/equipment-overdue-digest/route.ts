// app/api/cron/equipment-overdue-digest/route.ts
//
// GET /api/cron/equipment-overdue-digest
//
// Phase F10.5-f-iv — the §5.12.6 10pm daily digest. Fans out
// ONE summary notification per recipient (every admin +
// equipment_manager user) listing every reservation still in
// `state='checked_out' AND reserved_to < now()` so morning
// follow-ups have context. Distinct from the F10.5-f-ii
// per-surveyor nag tick: digest is for record-keepers, nag is
// for the holder.
//
// The digest INTENTIONALLY ignores `nag_silenced_until` — a
// silence applies only to the surveyor's nag, not the office's
// nightly bookkeeping. If the gear hasn't physically come back,
// the office should know.
//
// On-site GPS context (location_pings cluster) is omitted in
// v1 — the §5.12.6 spec calls it out as "for context" so it
// fits the polish layer once location_pings ingest stabilises.
// Body lists each row's instrument name + holder + due time.
//
// Vercel cron config (vercel.json):
//   { "path": "/api/cron/equipment-overdue-digest",
//     "schedule": "0 4 * * 2-6" }
//   The schedule is UTC. 10pm CST = 04:00 UTC next day; "Tue-Sat
//   at 04:00 UTC" maps to "Mon-Fri at 10pm CST".
//
// Auth: Authorization: Bearer <CRON_SECRET>. Same pattern as
// F10.5-f-ii. Misconfigured CRON_SECRET → 500 with a clear
// log.
//
// Returns:
//   200 { recipients: N, rows: T, sent: S, skipped: M }
//
// Idempotent: re-running within the window inserts another
// digest into each recipient's inbox. v1+ polish: cooldown
// guard so a manual re-trigger doesn't spam.

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
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  // ── Auth ────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error(
      '[cron/equipment-overdue-digest] CRON_SECRET not set'
    );
    return NextResponse.json(
      { error: 'CRON_SECRET not configured.' },
      { status: 500 }
    );
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const nowIso = new Date().toISOString();

  // ── Overdue query — IGNORES silence ─────────────────────────
  const { data, error } = await supabaseAdmin
    .from('equipment_reservations')
    .select(
      'id, job_id, equipment_inventory_id, reserved_from, reserved_to, ' +
        'checked_out_to_user'
    )
    .eq('state', 'checked_out')
    .lt('reserved_to', nowIso)
    .order('reserved_to', { ascending: true });
  if (error) {
    console.error(
      '[cron/equipment-overdue-digest] overdue query failed',
      { error: error.message }
    );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const overdue = (data ?? []) as OverdueRow[];

  // ── Recipients: every admin + equipment_manager ─────────────
  let recipients: string[] = [];
  try {
    const { data: rows, error: ruErr } = await supabaseAdmin
      .from('registered_users')
      .select('email, roles')
      .or('roles.cs.{admin},roles.cs.{equipment_manager}');
    if (ruErr) {
      console.warn(
        '[cron/equipment-overdue-digest] recipients lookup failed',
        { error: ruErr.message }
      );
    } else {
      recipients = ((rows ?? []) as Array<{ email: string | null }>)
        .map((r) => r.email)
        .filter((e): e is string => !!e);
    }
  } catch (err) {
    console.warn(
      '[cron/equipment-overdue-digest] recipients lookup threw',
      { error: (err as Error).message }
    );
  }

  // No-overdue case still pings — record-keepers want a "clean"
  // confirmation in their inbox so a missing digest is a real
  // signal that the cron failed. Skip when there are no
  // recipients at all (env mis-configured, no admins yet).
  if (recipients.length === 0) {
    console.log(
      '[cron/equipment-overdue-digest] zero recipients; skipping fan-out',
      { rows: overdue.length }
    );
    return NextResponse.json({
      recipients: 0,
      rows: overdue.length,
      sent: 0,
      skipped: 0,
    });
  }

  // ── Resolve display fields for the digest body ──────────────
  const equipmentIds = Array.from(
    new Set(overdue.map((r) => r.equipment_inventory_id))
  );
  const holderUserIds = Array.from(
    new Set(
      overdue
        .map((r) => r.checked_out_to_user)
        .filter((v): v is string => !!v)
    )
  );

  const equipmentById = new Map<string, string>();
  if (equipmentIds.length > 0) {
    const { data: items } = await supabaseAdmin
      .from('equipment_inventory')
      .select('id, name')
      .in('id', equipmentIds);
    for (const r of (items ?? []) as Array<{
      id: string;
      name: string | null;
    }>) {
      equipmentById.set(r.id, r.name ?? r.id);
    }
  }

  const holderById = new Map<string, string>();
  if (holderUserIds.length > 0) {
    const { data: holders } = await supabaseAdmin
      .from('registered_users')
      .select('id, email, name')
      .in('id', holderUserIds);
    for (const r of (holders ?? []) as Array<{
      id: string;
      email: string | null;
      name: string | null;
    }>) {
      holderById.set(r.id, r.name ?? r.email ?? r.id);
    }
  }

  // ── Compose digest body ─────────────────────────────────────
  const titleSuffix =
    overdue.length === 0
      ? 'all clear'
      : overdue.length === 1
      ? '1 unreturned'
      : `${overdue.length} unreturned`;
  const title = `Overdue gear — ${titleSuffix}`;

  const body = (() => {
    if (overdue.length === 0) {
      return 'No checked-out reservations are past reserved_to. Nothing to follow up on tomorrow.';
    }
    const lines = overdue.slice(0, 25).map((r) => {
      const item = equipmentById.get(r.equipment_inventory_id) ?? r.equipment_inventory_id;
      const holder = r.checked_out_to_user
        ? holderById.get(r.checked_out_to_user) ?? r.checked_out_to_user
        : '—';
      return `• ${item} — ${holder}, due ${r.reserved_to}`;
    });
    const more = overdue.length > 25 ? `\n…+${overdue.length - 25} more` : '';
    return `${overdue.length} reservation(s) still checked out past reserved_to:\n${lines.join('\n')}${more}`;
  })();

  // ── Fan out ─────────────────────────────────────────────────
  let sent = 0;
  let skipped = 0;
  for (const recipient of recipients) {
    try {
      await notify({
        user_email: recipient,
        type: 'equipment_overdue_digest',
        title,
        body,
        icon: '📋',
        escalation_level: overdue.length > 0 ? 'normal' : 'low',
        source_type: 'equipment_reservation',
        link: '/admin/equipment',
      });
      sent++;
    } catch (err) {
      skipped++;
      console.warn(
        '[cron/equipment-overdue-digest] notify failed',
        { recipient, error: (err as Error).message }
      );
    }
  }

  console.log('[cron/equipment-overdue-digest] tick complete', {
    recipients: recipients.length,
    rows: overdue.length,
    sent,
    skipped,
  });

  return NextResponse.json({
    recipients: recipients.length,
    rows: overdue.length,
    sent,
    skipped,
  });
}, { routeName: 'cron/equipment-overdue-digest#get' });
