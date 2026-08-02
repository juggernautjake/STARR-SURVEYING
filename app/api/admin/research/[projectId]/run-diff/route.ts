// app/api/admin/research/[projectId]/run-diff/route.ts — what changed since the last run (plan R27).
//
// Research is not a one-shot: a job that sits for three months and gains two new deeds needs to be
// told so. `PipelineDiffEngine` diffs boundary calls between two stored versions and no screen ever
// rendered it; this answers the broader question the plan asks — new instruments, new imagery, and
// the changes a reviewer made — and says plainly what it cannot detect.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import {
  diffSinceLastRun,
  materialChanges,
  packetImpact,
  type DocumentLite,
  type FactLite,
} from '@/lib/research/run-diff';

function extractProjectId(req: NextRequest): string | null {
  const after = req.nextUrl.pathname.split('/research/')[1];
  return after ? after.split('/')[0] || null : null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // The two most recent runs. The window opens at the PREVIOUS run's start, because a document
  // fetched during that run belongs to it — windowing on its finish would report the last run's
  // whole haul as new work on the next one.
  const { data: runs, error: runErr } = await supabaseAdmin
    .from('research_runs')
    .select('started_at')
    .eq('research_project_id', projectId)
    .order('started_at', { ascending: false })
    .limit(2);

  if (runErr) {
    return NextResponse.json(
      { error: 'The run history could not be read. This is not the same as there having been one run.' },
      { status: 500 },
    );
  }

  const runRows = (runs ?? []) as Array<{ started_at: string }>;
  const currentRunAt = runRows[0]?.started_at ?? null;
  const previousRunAt = runRows[1]?.started_at ?? null;

  const [docRes, factRes, packetRes] = await Promise.all([
    supabaseAdmin.from('research_documents')
      .select('id, document_label, original_filename, document_type, recording_info, created_at')
      .eq('research_project_id', projectId),
    supabaseAdmin.from('extracted_data_points')
      .select('id, data_category, raw_value, display_value, corrected_value, review_status, reviewed_at, created_at')
      .eq('research_project_id', projectId),
    supabaseAdmin.from('research_packets')
      .select('approved_at').eq('research_project_id', projectId)
      .eq('status', 'approved').order('approved_at', { ascending: false }).limit(1),
  ]);

  const diff = diffSinceLastRun(
    { since: previousRunAt, previousRunAt, currentRunAt },
    (docRes.data ?? []) as DocumentLite[],
    (factRes.data ?? []) as FactLite[],
  );

  const approvedAt = ((packetRes.data ?? [])[0] as { approved_at?: string } | undefined)?.approved_at ?? null;

  return NextResponse.json(
    {
      ...diff,
      // The changes that should make somebody re-read the packet, separated from the ones that
      // should not — the difference between a change list and a to-do.
      material: materialChanges(diff),
      packetImpact: packetImpact(diff, approvedAt),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { routeName: 'research/run-diff' });
