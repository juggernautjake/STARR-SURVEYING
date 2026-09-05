// app/api/admin/research/[projectId]/cost/route.ts — the TRUE all-phases spend for one project (F2).
//
// Plan RESEARCH_SYSTEM_COMPLETION F2. The run card's "SPENT" reflects only the worker phase's
// in-memory accumulator; app-side analysis writes the same `research_usage_events` ledger without it,
// so a project's real total (gather + analyze) is invisible. This sums the LEDGER for one project —
// the truth — and breaks it down by phase (event_type) so the UI can show gather vs analyze vs
// purchases without undercounting.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

const round4 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 10000) / 10000;

/* GET — the project's true spend from the research_usage_events ledger, total + by event_type. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('research_usage_events')
    .select('event_type, cost_usd')
    .eq('research_project_id', projectId);

  if (error) {
    return NextResponse.json({ error: 'Could not read the cost ledger', details: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{ event_type: string | null; cost_usd: number | string | null }>;
  const byEventType: Record<string, number> = {};
  let totalUsd = 0;
  for (const r of rows) {
    const c = Number(r.cost_usd) || 0;
    totalUsd += c;
    const k = r.event_type || 'unknown';
    byEventType[k] = round4((byEventType[k] || 0) + c);
  }

  return NextResponse.json({
    projectId,
    totalUsd: round4(totalUsd),
    events: rows.length,
    byEventType,
  });
});
