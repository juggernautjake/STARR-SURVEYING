// app/api/admin/research/[projectId]/runs/route.ts — the run history (plan C4/D5).
//
// ── WHY THIS HAD TO EXIST BEFORE THE RE-RUN DIALOG COULD ────────────────────────────────────────
//
// The owner's requirement is that a re-run be editable: change the inputs, change the settings,
// decide whether it may use TexasFile. An editable form needs a starting point, and the only
// honest starting point is **what the previous run was actually told** — not what the project
// currently says, because a project can be edited between runs and frequently is.
//
// Without this, the dialog would have to seed itself from `research_projects` and quietly present
// the project's current values as "what run 1 used". Those are different facts, and showing one
// while labelling it the other is how somebody re-runs with a $2.00 ceiling believing they had
// raised it.
//
// Since seed 623 the run row carries `settings` and `inputs` for exactly this, so the answer is a
// read rather than a reconstruction.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

function extractProjectId(req: NextRequest): string | null {
  const after = req.nextUrl.pathname.split('/research/')[1];
  return after ? after.split('/')[0] || null : null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('research_runs')
    .select(
      'id, run_number, trigger, status, phase, message, progress_percent, stop_reason, ' +
      'settings, inputs, cost_usd, paid_pages, started_at, finished_at, heartbeat_at, ' +
      'failure_reason, budget_summary',
    )
    .eq('research_project_id', projectId)
    .order('started_at', { ascending: false })
    .limit(25);

  if (error) {
    // A failed read is NOT "no runs". Answering `{ runs: [] }` here would let the dialog seed
    // itself from nothing and present the defaults as "what run 1 used" — the precise confusion
    // this endpoint exists to prevent.
    return NextResponse.json(
      { error: 'The run history could not be read. This is not the same as there being no runs.' },
      { status: 500 },
    );
  }

  const runs = (data ?? []) as Array<Record<string, unknown>>;

  // How many documents each run produced. `research_run_id` is set from seed 623 onward, so runs
  // before it report null rather than zero — "not attributed" and "found nothing" are different,
  // and 671 documents in this database predate attribution entirely.
  const counts: Record<string, number> = {};
  if (runs.length > 0) {
    const { data: docRows } = await supabaseAdmin
      .from('research_documents')
      .select('research_run_id')
      .eq('research_project_id', projectId)
      .not('research_run_id', 'is', null);
    for (const row of (docRows ?? []) as Array<{ research_run_id: string }>) {
      counts[row.research_run_id] = (counts[row.research_run_id] ?? 0) + 1;
    }
  }

  return NextResponse.json(
    {
      runs: runs.map((r) => ({
        ...r,
        documentCount: counts[String(r.id)] ?? null,
      })),
      /** The most recent run, which is what the re-run dialog seeds itself from. */
      latest: runs[0] ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { routeName: 'research/runs' });
