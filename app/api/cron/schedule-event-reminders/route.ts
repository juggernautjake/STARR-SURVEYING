// app/api/cron/schedule-event-reminders/route.ts
//
// GET /api/cron/schedule-event-reminders
//
// hub-widget-excellence-04 Slice 4 — hourly pass that reminds assignees
// about calendar events starting within the next look-ahead window
// (REMINDER_LOOKAHEAD_MIN). The hourly cadence + 60-min look-ahead means
// each timed event lands in exactly one window, so it reminds once
// without a per-event "already reminded" flag.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` (same as the other crons).
// Registered in vercel.json at `0 * * * *` (top of every hour).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import {
  buildEventReminder,
  dueReminderLeads,
  REMINDER_LOOKAHEAD_MIN,
  REMINDER_SCAN_AHEAD_MIN,
  type ReminderEvent,
} from '@/lib/notifications/event-reminder';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/schedule-event-reminders] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const nowMs = Date.now();
  const fromIso = new Date(nowMs).toISOString();
  // Slice S3 — widen the scan to cover the longest configured
  // lead (1 day) plus the cron's own hourly window, so a 1-day
  // lead on an event ~25h out still lands in the scan and fires.
  const toIso = new Date(nowMs + REMINDER_SCAN_AHEAD_MIN * 60_000).toISOString();

  // Timed (non-all-day) events starting inside the scan window.
  const { data, error } = await supabaseAdmin
    .from('schedule_events')
    .select('id, title, assigned_to, start_time, all_day, location, reminder_minutes_before')
    .eq('all_day', false)
    .gte('start_time', fromIso)
    .lte('start_time', toIso);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const row of (data ?? []) as ReminderEvent[]) {
    // Slice S3 — fire one notification per LEAD whose ready-to-
    // fire moment falls in the current hour's window.
    // `buildEventReminder` still constructs the per-event copy;
    // any due lead in this hour triggers a single notify() call.
    const dueLeads = dueReminderLeads(row, nowMs, REMINDER_LOOKAHEAD_MIN);
    if (dueLeads.length === 0) continue;
    const reminder = buildEventReminder(row, nowMs);
    if (!reminder) continue;
    for (const _lead of dueLeads) {
      void _lead;
      try {
        await notify(reminder);
        sent += 1;
      } catch { /* ignore individual failures */ }
    }
  }

  return NextResponse.json({ scanned: data?.length ?? 0, sent });
}, { routeName: 'cron/schedule-event-reminders' });
