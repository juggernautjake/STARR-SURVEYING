// app/api/cron/drawing-due-reminder/route.ts
//
// GET /api/cron/drawing-due-reminder
//
// drawings-collaboration Slice 2 — daily nudge for assigned drawings
// whose due date is approaching or overdue. Boundary-only firing
// (3 / 1 / 0 days + overdue once per run) mirrors the assignment-
// reminders cron so the bell stays spam-free.
//
// Slice 5 — fans out to the job-scope cohort (assignee + job_team)
// so overseers see the deadline, not just the drawer.
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
import { usersForJobScope } from '@/lib/jobs/scope';

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

  // Cache per-job scope lookups so each job hits the DB once even when
  // it has multiple due drawings.
  const scopeCache = new Map<string, string[]>();
  async function scopeFor(jobId: string | null): Promise<string[]> {
    if (!jobId) return [];
    const cached = scopeCache.get(jobId);
    if (cached) return cached;
    const fetched = await usersForJobScope(jobId, supabaseAdmin);
    scopeCache.set(jobId, fetched);
    return fetched;
  }

  let sent = 0;
  let overseerFanout = 0;
  for (const reminder of reminders) {
    try {
      await notify(reminder);
      sent += 1;
    } catch {
      /* ignore individual failures */
    }

    // Slice 5 — fan out to the job team (minus the assignee, who got
    // the primary payload above). Each overseer sees a softened body
    // so they don't think it's their personal task to deliver.
    const sourceRow = (data ?? []).find(
      (r: { id?: string | null }) => r.id === reminder.source_id,
    ) as DrawingDueRow | undefined;
    const jobId = sourceRow?.job_id ?? null;
    if (!jobId) continue;
    const scope = await scopeFor(jobId);
    for (const peer of scope) {
      if (peer === reminder.user_email) continue;
      try {
        await notify({
          ...reminder,
          user_email: peer,
          body: `Reminder for the job team: ${reminder.title.replace(/^⏰\s*/, '')}.`,
        });
        overseerFanout += 1;
      } catch {
        /* ignore */
      }
    }
  }

  return NextResponse.json({
    scanned: data?.length ?? 0,
    reminders: reminders.length,
    sent,
    overseer_fanout: overseerFanout,
  });
}, { routeName: 'cron/drawing-due-reminder' });
