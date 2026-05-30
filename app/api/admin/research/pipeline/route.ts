// app/api/admin/research/pipeline/route.ts
//
// Pipeline Status widget endpoint (Slice 131). hub-widget-excellence-12
// — this was a hardcoded `{ runs: [] }` stub, so the widget always
// showed "Pipelines quiet". There's no dedicated pipeline-run table, but
// each research project IS a pipeline run (its `status` is the workflow
// stage), so we surface recent projects as runs via the pure mapper in
// lib/research/pipeline-runs.ts.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { toPipelineRun, type PipelineRunProject } from '@/lib/research/pipeline-runs';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('research_projects')
    .select('id, name, status, updated_at')
    .order('updated_at', { ascending: false })
    .limit(25);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Shape mirrors the widget's expectation: `{ runs: PipelineRun[] }`.
  const runs = ((data ?? []) as PipelineRunProject[]).map(toPipelineRun);
  return NextResponse.json({ runs });
}, { routeName: 'admin/research/pipeline' });
