// app/api/cron/drawing-due-reminder/route.ts
//
// GET /api/cron/drawing-due-reminder
//
// drawings-collaboration Slice 2 — daily nudge for assigned drawings
// whose due date is approaching or overdue. Boundary-only firing
// (3 / 1 / 0 days + overdue once per run) mirrors the assignment-
// reminders cron so the bell stays spam-free.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` (same as the other crons;
// Vercel attaches it automatically). Register in vercel.json.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import {
  buildDrawingDueReminders,
  type DrawingDueRow,
} from '@/lib/notifications/drawing';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/drawing-due-reminder] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('cad_drawings')
    .select('id, name, assigned_to, due_date, job_id')
    .not('assigned_to', 'is', null)
    .not('due_date', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reminders = buildDrawingDueReminders((data ?? []) as DrawingDueRow[], Date.now());

  let sent = 0;
  for (const reminder of reminders) {
    try {
      await notify(reminder);
      sent += 1;
    } catch {
      /* ignore individual failures */
    }
  }

  return NextResponse.json({ scanned: data?.length ?? 0, reminders: reminders.length, sent });
}, { routeName: 'cron/drawing-due-reminder' });
