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
  REMINDER_LOOKAHEAD_MIN,
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
  const toIso = new Date(nowMs + REMINDER_LOOKAHEAD_MIN * 60_000).toISOString();

  // Timed (non-all-day) events starting inside the look-ahead window.
  const { data, error } = await supabaseAdmin
    .from('schedule_events')
    .select('id, title, assigned_to, start_time, all_day, location')
    .eq('all_day', false)
    .gte('start_time', fromIso)
    .lte('start_time', toIso);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const row of (data ?? []) as ReminderEvent[]) {
    const reminder = buildEventReminder(row, nowMs);
    if (!reminder) continue;
    try {
      await notify(reminder);
      sent += 1;
    } catch { /* ignore individual failures */ }
  }

  return NextResponse.json({ scanned: data?.length ?? 0, sent });
}, { routeName: 'cron/schedule-event-reminders' });
