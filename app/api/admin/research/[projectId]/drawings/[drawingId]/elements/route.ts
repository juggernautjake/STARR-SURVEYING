// app/api/admin/research/[projectId]/drawings/[drawingId]/elements/route.ts
// GET — List all elements for a drawing (or single element via ?elementId=xxx)
// PATCH — Update a single element (requires ?elementId=xxx)
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

/* GET — List all elements for a drawing, or get single element via ?elementId=xxx */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, drawingId } = extractIds(req);
  if (!projectId || !drawingId) {
    return NextResponse.json({ error: 'Project ID and Drawing ID required' }, { status: 400 });
  }

  // Single element detail mode
  const elementId = req.nextUrl.searchParams.get('elementId');
  if (elementId) {
    const { data: element, error } = await supabaseAdmin
      .from('drawing_elements')
      .select('*')
      .eq('id', elementId)
      .eq('drawing_id', drawingId)
      .single();

    if (error || !element) {
      return NextResponse.json({ error: 'Element not found' }, { status: 404 });
    }

    return NextResponse.json({ element });
  }

  // List mode — verify drawing belongs to project
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

/* PATCH — Update element properties (requires ?elementId=xxx) */
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, drawingId } = extractIds(req);
  if (!projectId || !drawingId) {
    return NextResponse.json({ error: 'Project ID and Drawing ID required' }, { status: 400 });
  }

  const elementId = req.nextUrl.searchParams.get('elementId');
  if (!elementId) {
    return NextResponse.json({ error: 'elementId query parameter required' }, { status: 400 });
  }

  // Verify element exists and belongs to this drawing
  const { data: existing } = await supabaseAdmin
    .from('drawing_elements')
    .select('id, drawing_id')
    .eq('id', elementId)
    .eq('drawing_id', drawingId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: 'Element not found' }, { status: 404 });
  }

  const body = await req.json();
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.visible !== undefined) updateData.visible = body.visible;
  if (body.locked !== undefined) updateData.locked = body.locked;
  if (body.user_notes !== undefined) updateData.user_notes = body.user_notes;
  if (body.style) updateData.style = body.style;
  if (body.geometry) {
    updateData.geometry = body.geometry;
    updateData.user_modified = true;
  }
  if (body.attributes) updateData.attributes = body.attributes;

  const { data: updated, error } = await supabaseAdmin
    .from('drawing_elements')
    .update(updateData)
    .eq('id', elementId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ element: updated });
}, { routeName: 'research/drawings/elements' });
