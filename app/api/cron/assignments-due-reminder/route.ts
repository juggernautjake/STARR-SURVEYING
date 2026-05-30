// app/api/cron/assignments-due-reminder/route.ts
//
// GET /api/cron/assignments-due-reminder
//
// hub-widget-excellence-03 Slice 3 — daily reminder pass that nudges
// assignees about pending assignments that are due soon or overdue, so
// students + workers stay on top of their work (master ask: "remind
// students and workers of important updates").
//
// Boundary-only firing (days-until-due ∈ {3, 1, 0}) + a once-per-daily-
// run overdue ping keeps the bell from filling up — see
// `buildAssignmentReminders`. Idempotent enough for a daily cadence.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` (same as the other crons;
// Vercel attaches it automatically). Register in vercel.json.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import {
  buildAssignmentReminders,
  type ReminderAssignment,
} from '@/lib/notifications/assignment-reminders';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/assignments-due-reminder] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pending assignments that carry a due date.
  const { data, error } = await supabaseAdmin
    .from('assignments')
    .select('id, title, assigned_to, due_date, status')
    .eq('status', 'pending')
    .not('due_date', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reminders = buildAssignmentReminders((data ?? []) as ReminderAssignment[], Date.now());

  // Fire them. Best-effort per reminder so one bad row doesn't sink the
  // batch.
  let sent = 0;
  for (const reminder of reminders) {
    try {
      await notify(reminder);
      sent += 1;
    } catch { /* ignore individual failures */ }
  }

  return NextResponse.json({ scanned: data?.length ?? 0, reminders: reminders.length, sent });
}, { routeName: 'cron/assignments-due-reminder' });
