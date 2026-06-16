// app/api/cron/phase-reminders/route.ts
//
// GET /api/cron/phase-reminders
//
// job-calendar Slice C5 — fires once per day. For every phase-typed
// `schedule_events` row whose start_time falls TODAY or TOMORROW in
// America/Chicago, dispatch a notification to the assignee:
//   - day-before → 🔔 Tomorrow: <Phase> — <JobName>     (normal)
//   - day-of     → 📍 Today:    <Phase> — <JobName>     (high)
//
// Schedule (set in vercel.json): `0 13 * * *` = 8am Central / 7am
// Standard. Same time as the drawing-due-reminder cron so the
// office gets all of their morning notifications at once.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` (same as the other
// crons; Vercel attaches it automatically).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import {
  buildPhaseReminderRows,
  PHASE_EVENT_TYPES,
  type PhaseEventRow,
} from '@/lib/calendar/phase-reminder';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/phase-reminders] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pull a small window — today + tomorrow + a ±1d pad — so the cron
  // only sees the rows it could possibly fire on. Wider pulls would
  // waste bandwidth on a year's worth of scheduled rows.
  const now = new Date();
  const fromIso = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString();
  const toIso = new Date(now.getTime() + 2 * 24 * 3600 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('schedule_events')
    .select('id, title, event_type, start_time, end_time, job_id, assigned_to, location, notes')
    .in('event_type', PHASE_EVENT_TYPES as unknown as string[])
    .gte('start_time', fromIso)
    .lte('start_time', toIso)
    .eq('status', 'approved');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reminders = buildPhaseReminderRows((data ?? []) as PhaseEventRow[], now);

  // notify() inserts each row individually; we await them sequentially
  // so a single bad row doesn't stop the others (the helper itself
  // logs DB errors, doesn't throw).
  let sent = 0;
  for (const r of reminders) {
    try {
      await notify(r);
      sent++;
    } catch (err) {
      console.error('[cron/phase-reminders] notify failed for', r.source_id, err);
    }
  }

  return NextResponse.json({
    candidate_events: data?.length ?? 0,
    reminders_sent: sent,
  });
}, { routeName: 'cron/phase-reminders' });
