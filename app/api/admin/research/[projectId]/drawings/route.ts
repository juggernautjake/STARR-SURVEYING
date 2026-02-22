// app/api/admin/research/[projectId]/drawings/route.ts — Drawing list & creation
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { createDrawing, listDrawings } from '@/lib/research/drawing.service';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

/* GET — List all drawings for a project */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const drawings = await listDrawings(projectId);

  return NextResponse.json({ drawings, total: drawings.length });
}, { routeName: 'research/drawings' });

/* POST — Create a new drawing from analyzed data */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Verify project exists and has analyzed data
  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select('id, status')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Verify we have analyzed data
  const { count: dpCount } = await supabaseAdmin
    .from('extracted_data_points')
    .select('id', { count: 'exact', head: true })
    .eq('research_project_id', projectId);

  if (!dpCount || dpCount === 0) {
    return NextResponse.json({
      error: 'No analyzed data points found. Run analysis first.',
    }, { status: 400 });
  }

  const body = await req.json().catch(() => ({})) as {
    name?: string;
    drawing_template_id?: string;
  };

  // Update project status to 'drawing' if it's on 'review'
  if (project.status === 'review') {
    await supabaseAdmin
      .from('research_projects')
      .update({ status: 'drawing', updated_at: new Date().toISOString() })
      .eq('id', projectId);
  }

  const result = await createDrawing(projectId, {
    name: body.name,
    drawingTemplateId: body.drawing_template_id,
  });

  return NextResponse.json({
    drawing_id: result.drawingId,
    element_count: result.elementCount,
    message: `Drawing created with ${result.elementCount} elements`,
  });
}, { routeName: 'research/drawings/create' });
