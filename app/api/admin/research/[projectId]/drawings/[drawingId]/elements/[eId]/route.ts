// app/api/admin/research/[projectId]/drawings/[drawingId]/elements/[eId]/route.ts
// GET single element, PATCH update element
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

function extractIds(req: NextRequest): { projectId: string | null; drawingId: string | null; eId: string | null } {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return { projectId: null, drawingId: null, eId: null };
  const parts = afterResearch.split('/');
  // parts: [projectId, "drawings", drawingId, "elements", eId]
  return {
    projectId: parts[0] || null,
    drawingId: parts[2] || null,
    eId: parts[4] || null,
  };
}

/* GET — Get single element with full details */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, drawingId, eId } = extractIds(req);
  if (!projectId || !drawingId || !eId) {
    return NextResponse.json({ error: 'Project ID, Drawing ID, and Element ID required' }, { status: 400 });
  }

  const { data: element, error } = await supabaseAdmin
    .from('drawing_elements')
    .select('*')
    .eq('id', eId)
    .eq('drawing_id', drawingId)
    .single();

  if (error || !element) {
    return NextResponse.json({ error: 'Element not found' }, { status: 404 });
  }

  return NextResponse.json({ element });
}, { routeName: 'research/drawings/elements/detail' });

/* PATCH — Update element properties */
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, drawingId, eId } = extractIds(req);
  if (!projectId || !drawingId || !eId) {
    return NextResponse.json({ error: 'Project ID, Drawing ID, and Element ID required' }, { status: 400 });
  }

  // Verify element exists and belongs to this drawing
  const { data: existing } = await supabaseAdmin
    .from('drawing_elements')
    .select('id, drawing_id')
    .eq('id', eId)
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
    .eq('id', eId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ element: updated });
}, { routeName: 'research/drawings/elements/detail' });
