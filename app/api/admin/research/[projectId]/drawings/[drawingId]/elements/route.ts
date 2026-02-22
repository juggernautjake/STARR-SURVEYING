// app/api/admin/research/[projectId]/drawings/[drawingId]/elements/route.ts
// GET — List all elements for a drawing
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

function extractIds(req: NextRequest): { projectId: string | null; drawingId: string | null } {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return { projectId: null, drawingId: null };
  const parts = afterResearch.split('/');
  return {
    projectId: parts[0] || null,
    drawingId: parts[2] || null,
  };
}

/* GET — List all elements for a drawing */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, drawingId } = extractIds(req);
  if (!projectId || !drawingId) {
    return NextResponse.json({ error: 'Project ID and Drawing ID required' }, { status: 400 });
  }

  // Verify drawing belongs to project
  const { data: drawing } = await supabaseAdmin
    .from('rendered_drawings')
    .select('id, research_project_id')
    .eq('id', drawingId)
    .single();

  if (!drawing || drawing.research_project_id !== projectId) {
    return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });
  }

  // Optional filters
  const featureClass = req.nextUrl.searchParams.get('feature_class');
  const elementType = req.nextUrl.searchParams.get('element_type');
  const visibleOnly = req.nextUrl.searchParams.get('visible') === 'true';

  let query = supabaseAdmin
    .from('drawing_elements')
    .select('*')
    .eq('drawing_id', drawingId)
    .order('z_index', { ascending: true });

  if (featureClass) query = query.eq('feature_class', featureClass);
  if (elementType) query = query.eq('element_type', elementType);
  if (visibleOnly) query = query.eq('visible', true);

  const { data: elements, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    elements: elements || [],
    count: elements?.length || 0,
  });
}, { routeName: 'research/drawings/elements' });
