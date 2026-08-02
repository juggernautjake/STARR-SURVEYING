// app/api/admin/research/[projectId]/survey-plan/route.ts
// GET — Generate a plain-English field survey plan from all extracted data
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { generateSurveyPlan } from '@/lib/research/survey-plan.service';
// The gameplan is kept and versioned; the AI original is never overwritten (research plan R21).
import {
  currentVersion,
  diffPlans,
  editsAtRisk,
  listVersions,
  mergedPlan,
  saveVersion,
} from '@/lib/research/survey-plan-versions';

function extractProjectId(req: NextRequest): string | null {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return null;
  return afterResearch.split('/')[0] || null;
}

async function requireProject(projectId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('research_projects').select('id').eq('id', projectId).single();
  return !error && !!data;
}

/**
 * GET /api/admin/research/[projectId]/survey-plan
 *
 * Returns the CURRENT stored plan (plan R21), generating version 1 the first time.
 *
 * This used to call `generateSurveyPlan()` on every request, which meant a page refresh burned AI
 * tokens and produced a different plan — so the document a crew was working from changed underneath
 * them, and nothing recorded what it had said. Regeneration is now an explicit POST, because
 * rewriting the field plan is an action, not a read.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  if (!(await requireProject(projectId))) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  let current = await currentVersion(projectId);
  if (!current) {
    const plan = await generateSurveyPlan(projectId);
    current = await saveVersion(projectId, plan, {
      reason: 'First plan generated for this property.',
      generatedBy: session.user.email,
    });
  }

  const versions = await listVersions(projectId);
  return NextResponse.json({
    ...mergedPlan(current),
    _version: {
      version: current.version,
      generatedAt: current.generatedAt,
      editedAt: current.editedAt,
      editedBy: current.editedBy,
      total: versions.length,
      // A crew that annotated an older version must be told, not silently shown a clean plan.
      editsAtRisk: editsAtRisk(versions),
    },
  });
}, { routeName: 'research/survey-plan' });

/**
 * POST /api/admin/research/[projectId]/survey-plan
 *
 * Regenerates the plan as a NEW version. The previous one is demoted, never deleted — a plan a crew
 * has already worked from is evidence of what they were told.
 *
 * Body: `{ reason?: string }`
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  if (!(await requireProject(projectId))) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const previous = await currentVersion(projectId);

  const plan = await generateSurveyPlan(projectId);
  const saved = await saveVersion(projectId, plan, {
    reason: body.reason,
    generatedBy: session.user.email,
  });

  return NextResponse.json({
    ...mergedPlan(saved),
    _version: {
      version: saved.version,
      generatedAt: saved.generatedAt,
      total: (await listVersions(projectId)).length,
      // What changed, by name — "the plan changed" is useless to a crew that read the old one.
      diff: previous ? diffPlans(previous, saved) : null,
    },
  });
}, { routeName: 'research/survey-plan-regenerate' });
