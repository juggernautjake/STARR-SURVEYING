// app/api/admin/jobs/new/route.ts — the jobs this person has not opened yet (owner, 2026-09-10).
//
//   GET  /api/admin/jobs/new              → { jobs: [{ id, project_id }] }
//   POST /api/admin/jobs/new { job_id }   → marks that job's `job_created` notification read
//
// The truth is the notifications table (lib/notifications.ts writes a `job_created` row per
// recipient when a job is created). "New" = that row is still unread. Opening the job page reads
// it — the bell's inbox and the NEW bubbles clear together, because they are the same row.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('source_id')
    .eq('user_email', session.user.email)
    .eq('type', 'job_created')
    .eq('is_read', false)
    .eq('is_dismissed', false)
    .not('source_id', 'is', null)
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = [...new Set(((data ?? []) as Array<{ source_id: string }>).map((r) => r.source_id))];
  if (ids.length === 0) return NextResponse.json({ jobs: [] });

  // Only jobs that still exist: a job deleted after its notification went out is not "new".
  const { data: jobs, error: jobsErr } = await supabaseAdmin
    .from('jobs')
    .select('id, project_id')
    .in('id', ids)
    .is('deleted_at', null);
  if (jobsErr) return NextResponse.json({ error: jobsErr.message }, { status: 500 });

  return NextResponse.json({ jobs: (jobs ?? []) as Array<{ id: string; project_id: string | null }> });
}, { routeName: 'jobs/new' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { job_id?: string };
  const jobId = typeof body.job_id === 'string' ? body.job_id.trim() : '';
  if (!jobId) return NextResponse.json({ error: 'job_id is required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_email', session.user.email)
    .eq('type', 'job_created')
    .eq('source_id', jobId)
    .eq('is_read', false);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}, { routeName: 'jobs/new' });
