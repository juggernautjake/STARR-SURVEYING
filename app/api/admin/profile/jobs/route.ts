// app/api/admin/profile/jobs/route.ts
//
// Slice EP5 — list of jobs a user has worked on. Drives the
// "Jobs I've worked on" card on the profile + the same section
// on the public /admin/employees/[email] page.
//
// GET ?email=<email>   — list rows (self OR admin)
//
// Read path:
//   1. Pull every job_team row for the user, ordered by the
//      most-recent assigned_from desc so the list reads from
//      current → oldest.
//   2. Hydrate the related job rows in a single follow-up
//      query (avoids the embedded-select syntax which
//      requires a foreign-key relationship in the schema
//      cache; the join here is logical).

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface JobTeamRow {
  job_id: string;
  user_email: string;
  is_crew_lead: boolean | null;
  state: string | null;
  assigned_from: string | null;
  assigned_to: string | null;
}

interface JobRow {
  id: string;
  name: string | null;
  job_number: string | null;
  stage: string | null;
  address: string | null;
  created_at: string | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email') || session.user.email;

  // Non-admins can only see their own job history.
  if (!isAdmin(session.user.roles) && email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: assignments, error: teamErr } = await supabaseAdmin
    .from('job_team')
    .select('job_id, user_email, is_crew_lead, state, assigned_from, assigned_to')
    .eq('user_email', email)
    .order('assigned_from', { ascending: false, nullsFirst: false })
    .returns<JobTeamRow[]>();
  if (teamErr) return NextResponse.json({ error: teamErr.message }, { status: 500 });

  const rows: JobTeamRow[] = assignments ?? [];
  if (rows.length === 0) return NextResponse.json({ jobs: [] });

  const jobIds = Array.from(
    new Set(rows.map((r: JobTeamRow) => r.job_id).filter((id: string | null): id is string => !!id)),
  );
  const { data: jobs, error: jobsErr } = await supabaseAdmin
    .from('jobs')
    .select('id, name, job_number, stage, address, created_at')
    .in('id', jobIds)
    .returns<JobRow[]>();
  if (jobsErr) return NextResponse.json({ error: jobsErr.message }, { status: 500 });

  const jobsById = new Map<string, JobRow>();
  for (const j of jobs ?? []) jobsById.set(j.id, j);

  // Collapse multiple job_team rows for the same job (e.g. a
  // worker added then removed then re-added) into one entry per
  // job. Pick the assignment with the most recent assigned_from.
  // Already in descending order, so the first occurrence wins.
  const seen = new Set<string>();
  const merged: Array<{
    job_id: string;
    job_name: string | null;
    job_number: string | null;
    stage: string | null;
    address: string | null;
    created_at: string | null;
    is_crew_lead: boolean;
    state: string | null;
    assigned_from: string | null;
  }> = [];
  for (const row of rows) {
    if (!row.job_id || seen.has(row.job_id)) continue;
    seen.add(row.job_id);
    const job = jobsById.get(row.job_id);
    if (!job) continue;
    merged.push({
      job_id: row.job_id,
      job_name: job.name,
      job_number: job.job_number,
      stage: job.stage,
      address: job.address,
      created_at: job.created_at,
      is_crew_lead: row.is_crew_lead === true,
      state: row.state,
      assigned_from: row.assigned_from,
    });
  }

  return NextResponse.json({ jobs: merged });
}, { routeName: 'admin/profile/jobs' });
