// app/api/cron/clocked-in-after-hours/route.ts
//
// GET /api/cron/clocked-in-after-hours
//
// Slice H7 of docs/planning/in-progress/01_HOURS_TIME_CORRECTION_2026-06-24.md.
// Evening sweep that reminds anyone STILL clocked in (an open
// job_time_entries row, end_time IS NULL) to clock out, so a forgotten
// clock-out doesn't accrue bogus hours.
//
// Only fires past 6pm in the business timezone (America/Chicago) and
// de-dupes so a user gets at most one nag per evening even though the
// cron runs a few times. Auth: `Authorization: Bearer <CRON_SECRET>`
// (Vercel attaches it). Register in vercel.json.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import {
  buildAfterHoursClockReminders,
  type OpenClockEntry,
} from '@/lib/notifications/after-hours-clock';

const BUSINESS_TZ = 'America/Chicago';
const AFTER_HOUR = 18; // 6pm local
const DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000; // one nag per ~evening

/** Current hour (0–23) in the business timezone. */
function localHour(now: Date): number {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  return parseInt(s, 10);
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/clocked-in-after-hours] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  // Only nag in the evening (local). Keeps a mis-scheduled run from
  // pinging people at, say, 9am.
  if (localHour(now) < AFTER_HOUR) {
    return NextResponse.json({ skipped: 'before 6pm local', localHour: localHour(now) });
  }

  // Everyone currently clocked in (open shift).
  const { data: open, error } = await supabaseAdmin
    .from('job_time_entries')
    .select('user_email, start_time')
    .is('end_time', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let reminders = buildAfterHoursClockReminders((open ?? []) as OpenClockEntry[], now.getTime());

  // De-dupe: drop anyone already reminded in the dedupe window.
  if (reminders.length > 0) {
    const since = new Date(now.getTime() - DEDUPE_WINDOW_MS).toISOString();
    const { data: recent } = await supabaseAdmin
      .from('notifications')
      .select('user_email')
      .eq('source_type', 'clock_reminder')
      .gte('created_at', since);
    const nagged = new Set((recent ?? []).map((r: { user_email: string }) => r.user_email));
    reminders = reminders.filter((r) => !nagged.has(r.user_email));
  }

  let sent = 0;
  for (const reminder of reminders) {
    try {
      await notify(reminder);
      sent += 1;
    } catch { /* ignore individual failures */ }
  }

  return NextResponse.json({ openShifts: open?.length ?? 0, reminders: reminders.length, sent });
}, { routeName: 'cron/clocked-in-after-hours' });
