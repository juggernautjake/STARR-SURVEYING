// app/api/admin/research/[projectId]/analyze/route.ts — Start or check analysis
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { mayBuyDocuments, paidDocumentsNotice } from '@/lib/research/paid-documents';
import { analyzeProject, getAnalysisStatus } from '@/lib/research/analysis.service';
import { checkScope, scopeRefusal } from '@/lib/research/scope';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

/* POST — Start analysis for a project */
export const POST = withErrorHandler(async (req: NextRequest) => {
  // The worker auto-runs analysis at run finish, authenticating with x-worker-key like the
  // queue-claim route (a machine, not a session). A worker call skips the session AND the
  // interactive status gates — a post-run analysis is valid whatever step the project landed on —
  // but still honours the scope refusal below.
  const workerKey = req.headers.get('x-worker-key');
  const isWorker = !!workerKey && !!process.env.WORKER_API_KEY && workerKey === process.env.WORKER_API_KEY;
  const session = isWorker ? null : await auth();
  if (!isWorker && !session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Verify project exists and is in a valid state
  const { data: project } = await supabaseAdmin
    .from('research_projects')
    .select('id, status, state, county')
    .eq('id', projectId)
    .single();

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  // Parse optional config from body early so we can check resume mode for the status check below
  let config: { extractCategories?: Record<string, boolean>; resume?: boolean; maxCostUsd?: number; documentId?: string; benchmark?: boolean } | undefined;
  try {
    const body = await req.json() as { extractCategories?: Record<string, boolean>; resume?: boolean; maxCostUsd?: number; documentId?: string; benchmark?: boolean };
    if (body.extractCategories || body.resume || typeof body.maxCostUsd === 'number' || body.documentId || body.benchmark) {
      config = {};
      if (body.extractCategories) config.extractCategories = body.extractCategories;
      if (body.resume) config.resume = true;
      // The analyze run's own cost cap (plan R1). Clamped to a sane range; a $0 cap is meaningful
      // ("estimate only, analyse nothing paid") and survives, so clamp rather than reject.
      if (typeof body.maxCostUsd === 'number' && Number.isFinite(body.maxCostUsd)) {
        config.maxCostUsd = Math.min(Math.max(body.maxCostUsd, 0), 100);
      }
      // Per-file analysis (plan E3): analyse only this one document at its quoted price.
      if (typeof body.documentId === 'string' && body.documentId) config.documentId = body.documentId;
      // Benchmark calibration run (no cost cap, page-scaled time) — sets the standardized $/page rate.
      if (body.benchmark === true) config.benchmark = true;
    }
  } catch {
    // No body or invalid JSON — use defaults
  }

  const isResume = config?.resume === true;

  if (project.status === 'analyzing' && !isResume && !isWorker) {
    return NextResponse.json({ error: 'Analysis already in progress' }, { status: 409 });
  }

  // Resume mode: allowed from 'analyzing' (frozen run) or 'review' (supplemental uploads).
  // When resuming from 'review', only newly-uploaded documents (status 'extracted') are
  // analyzed — previously-analyzed documents are skipped.
  if (isResume && project.status !== 'analyzing' && project.status !== 'review') {
    return NextResponse.json({
      error: `Cannot resume from "${project.status}" status — resume is valid from "analyzing" (frozen run) or "review" (supplemental uploads).`,
    }, { status: 400 });
  }

  if (!isResume && !isWorker && project.status !== 'configure' && project.status !== 'review') {
    return NextResponse.json({
      error: `Cannot start analysis from "${project.status}" status. Project must be in "configure" or "review" step.`
    }, { status: 400 });
  }

  // ── SCOPE, BEFORE ANYTHING EXPENSIVE (Phase S2) ────────────────────────────────────────────
  //
  // This is the LAST place a run can be stopped, and it is the one that has to hold: the browser
  // can be bypassed, and the batch form is a different screen with its own copy of the button.
  // Before this there was no state check anywhere in the system, so an out-of-state property
  // geocoded, routed to a Texas aggregator, and spent money reporting on no property at all.
  //
  // 422 rather than 400: the request is well formed and the operator did nothing wrong. The body
  // carries the verdict and a next step, because a refusal with no next step is a dead end.
  //
  // A resume is checked too. A project can be edited between runs, and the second run is exactly
  // the one that slips through a guard that only watches the first.
  const scope = checkScope(project.state as string | null, project.county as string | null);
  if (!scope.canRun) {
    return NextResponse.json(scopeRefusal(scope), { status: 422 });
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

  // ── WHY A NOTICE RIDES ALONG WITH THE STATUS ────────────────────────────────────────────────
  //
  // A run with `allow_paid_documents = false` finishes with fewer documents. Without this, the UI
  // renders that identically to a run that searched everywhere and found nothing — and the reader
  // cannot tell "this property has no recorded deed" from "you told me not to look behind the
  // paywall". Those are opposite facts and only one of them is about the property.
  //
  // Deliberately silent when nothing was actually skipped: a Bell County run with the toggle off
  // reaches no paywall, so announcing a restriction that changed no outcome would be noise, and
  // noise is what makes real notices go unread.
  const { data: project } = await supabaseAdmin
    .from('research_projects')
    .select('allow_paid_documents')
    .eq('id', projectId)
    .maybeSingle();

  const { count: skippedCount } = await supabaseAdmin
    .from('research_document_purchases')
    .select('*', { count: 'exact', head: true })
    .eq('research_project_id', projectId)
    // `permission_unreadable` added 2026-09-02, when the worker started writing these rows at all.
    // It is a THIRD state, not a variant of the other two: "you told us not to spend" is finished,
    // "we could not find out whether you had" is worth re-running once the setting reads. Counting
    // it here is what stops a run that refused out of caution from looking like a run that had
    // nothing to skip.
    .in('status', ['paid_disabled', 'no_vendor_credentials', 'permission_unreadable']);

  const decision = mayBuyDocuments({
    allowPaidDocuments: (project as { allow_paid_documents?: boolean } | null)?.allow_paid_documents !== false,
    // Presence, not validity — the worker warns separately when a login is wrong rather than absent.
    hasVendorCredentials: Boolean(process.env.TEXASFILE_USERNAME),
  });

  return NextResponse.json({
    ...status,
    paidDocumentsNotice: paidDocumentsNotice(decision, skippedCount ?? 0),
  });
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
