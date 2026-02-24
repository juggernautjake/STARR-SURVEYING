// app/api/admin/research/[projectId]/analyze/route.ts — Start or check analysis
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { analyzeProject, getAnalysisStatus } from '@/lib/research/analysis.service';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

/* POST — Start analysis for a project */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Verify project exists and is in a valid state
  const { data: project } = await supabaseAdmin
    .from('research_projects')
    .select('id, status')
    .eq('id', projectId)
    .single();

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  if (project.status === 'analyzing') {
    return NextResponse.json({ error: 'Analysis already in progress' }, { status: 409 });
  }

  if (project.status !== 'configure' && project.status !== 'review') {
    return NextResponse.json({
      error: `Cannot start analysis from "${project.status}" status. Project must be in "configure" or "review" step.`
    }, { status: 400 });
  }

  // Parse optional config from body
  let config: { extractCategories?: Record<string, boolean> } | undefined;
  try {
    const body = await req.json();
    if (body.extractCategories) {
      config = { extractCategories: body.extractCategories };
    }
  } catch {
    // No body or invalid JSON — use defaults
  }

  // Start analysis asynchronously
  analyzeProject(projectId, config).catch(err => {
    console.error(`[Analysis API] Background analysis failed for ${projectId}:`, err);
  });

  return NextResponse.json({
    message: 'Analysis started',
    projectId,
    status: 'analyzing',
  });
}, { routeName: 'research/analyze' });

/* GET — Check analysis status */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const status = await getAnalysisStatus(projectId);
  return NextResponse.json(status);
}, { routeName: 'research/analyze/status' });

/* DELETE — Abort a running analysis and immediately reset to a clean state */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data: project } = await supabaseAdmin
    .from('research_projects')
    .select('id, status')
    .eq('id', projectId)
    .single();

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (project.status !== 'analyzing') {
    return NextResponse.json({ error: 'No analysis in progress' }, { status: 409 });
  }

  // Immediately reset the project to a clean configure state so the UI
  // reflects the abort right away — no waiting for the background task to notice.
  // Clear all partial data from this run so the next run starts completely fresh.
  await Promise.all([
    // 1. Reset project status and clear logs / partial metadata immediately
    supabaseAdmin.from('research_projects').update({
      status: 'configure',
      analysis_metadata: { abort_requested: true, aborted_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    }).eq('id', projectId),

    // 2. Delete any data points extracted during this (now aborted) run
    supabaseAdmin.from('extracted_data_points').delete().eq('research_project_id', projectId),

    // 3. Delete any discrepancies from this run
    supabaseAdmin.from('discrepancies').delete().eq('research_project_id', projectId),

    // 4. Reset all documents that were mid-analysis back to 'extracted' so they
    //    will be re-processed when the user starts a new run
    supabaseAdmin
      .from('research_documents')
      .update({ processing_status: 'extracted', updated_at: new Date().toISOString() })
      .eq('research_project_id', projectId)
      .eq('processing_status', 'analyzing'),
  ]);

  return NextResponse.json({
    message: 'Analysis aborted. All partial results cleared. Ready for a fresh run.',
    status: 'configure',
  });
}, { routeName: 'research/analyze/abort' });
