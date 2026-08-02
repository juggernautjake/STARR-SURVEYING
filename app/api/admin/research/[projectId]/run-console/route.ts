// app/api/admin/research/[projectId]/run-console/route.ts — what the run is doing and what it has
// spent (plan R22).
//
// The data all existed and none of it reached the operator: R4 writes every model call and paid page
// to `research_usage_events`, R5 records the ceilings and what they made a run skip, R3 keeps the
// phase and heartbeat on `research_runs`. The run panel showed a progress list and a cancel button.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import { buildConsole, type RunRow, type UsageRow } from '@/lib/research/run-console';

function extractProjectId(req: NextRequest): string | null {
  const after = req.nextUrl.pathname.split('/research/')[1];
  return after ? after.split('/')[0] || null : null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const [runRes, usageRes] = await Promise.all([
    supabaseAdmin
      .from('research_runs')
      .select('*')
      .eq('research_project_id', projectId)
      .order('started_at', { ascending: false })
      .limit(1),
    supabaseAdmin
      .from('research_usage_events')
      .select('event_type, cost_usd, model, created_at')
      .eq('research_project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  // A failed read is not "no run" — the §1.1b defect this repo has shipped repeatedly. An operator
  // told "nothing is running" while a 25-minute run burns money is worse than one told nothing.
  if (runRes.error) {
    return NextResponse.json(
      { error: 'The run record could not be read. This is not the same as no run being active.' },
      { status: 500 },
    );
  }

  const run = ((runRes.data ?? []) as RunRow[])[0];
  if (!run) {
    return NextResponse.json(
      { run: null, message: 'No run has been recorded for this project yet.' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Usage is an enhancement to the console, not its precondition: a failed usage read must not hide
  // the phase and the cancel button. It IS reported, so a broken spend writer stays visible.
  const usageFailed = !!usageRes.error;
  const events = (usageRes.data ?? []) as UsageRow[];

  return NextResponse.json(
    {
      run: buildConsole(run, events, Date.now()),
      usageFailed,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { routeName: 'research/run-console' });
