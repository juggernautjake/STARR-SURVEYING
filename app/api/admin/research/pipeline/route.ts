// app/api/admin/research/pipeline/route.ts
//
// Stub endpoint for the Pipeline Status widget (Slice 131). Real impl
// reads from the research pipeline run table (lives under
// /admin/research/pipeline UI from earlier slices). Returning an
// empty list surfaces the widget's "Pipelines quiet" empty state.
//
// Slice 191 of customizable-hub-and-work-mode-2026-05-28.md.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Shape mirrors the widget's expectation: `{ runs: PipelineRun[] }`.
  return NextResponse.json({ runs: [] });
}, { routeName: 'admin/research/pipeline' });
