// app/api/admin/research/[projectId]/survey-plan/route.ts
// GET — Generate a plain-English field survey plan from all extracted data
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { generateSurveyPlan } from '@/lib/research/survey-plan.service';

function extractProjectId(req: NextRequest): string | null {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return null;
  return afterResearch.split('/')[0] || null;
}

/**
 * GET /api/admin/research/[projectId]/survey-plan
 *
 * Returns an AI-generated field survey plan for the project.
 * Works at any stage — returns a minimal checklist when no analysis data exists,
 * or a detailed plan when deed calls, discrepancies, and source documents are present.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Verify project exists
  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const plan = await generateSurveyPlan(projectId);
  return NextResponse.json(plan);
}, { routeName: 'research/survey-plan' });
