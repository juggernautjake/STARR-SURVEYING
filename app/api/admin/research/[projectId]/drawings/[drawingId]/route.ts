// app/api/admin/research/[projectId]/drawings/[drawingId]/route.ts
// GET — Drawing detail (with elements) or SVG rendering (?format=svg)
// PATCH — Save drawing state (annotations, preferences, name) or update element
// POST — Actions: compare, export
// DELETE — Archive (soft-delete) or permanently delete a drawing
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { getDrawingWithElements } from '@/lib/research/drawing.service';
import { renderDrawingSVG } from '@/lib/research/svg.renderer';
import { compareDrawingToSources } from '@/lib/research/comparison.service';
import type { ExportFormat, ViewMode } from '@/types/research';

function extractIds(req: NextRequest): { projectId: string | null; drawingId: string | null } {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return { projectId: null, drawingId: null };
  const parts = afterResearch.split('/');
  // parts: [projectId, "drawings", drawingId]
  return {
    projectId: parts[0] || null,
    drawingId: parts[2] || null,
  };
}

/* GET — Get drawing with all elements, or render as SVG via ?format=svg */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, drawingId } = extractIds(req);
  if (!projectId || !drawingId) {
    return NextResponse.json({ error: 'Project ID and Drawing ID required' }, { status: 400 });
  }

  const result = await getDrawingWithElements(drawingId);
  if (!result) {
    return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });
  }

  // Verify drawing belongs to this project
  if (result.drawing.research_project_id !== projectId) {
    return NextResponse.json({ error: 'Drawing not found in this project' }, { status: 404 });
  }

  // SVG rendering mode
  const format = req.nextUrl.searchParams.get('format');
  if (format === 'svg') {
    const viewMode = (req.nextUrl.searchParams.get('viewMode') || 'standard') as ViewMode;
    const showTitleBlock = req.nextUrl.searchParams.get('titleBlock') !== 'false';
    const showNorthArrow = req.nextUrl.searchParams.get('northArrow') !== 'false';
    const showScaleBar = req.nextUrl.searchParams.get('scaleBar') !== 'false';
    const showLegend = req.nextUrl.searchParams.get('legend') === 'true' || viewMode === 'feature';
    const showConfidenceBar = req.nextUrl.searchParams.get('confidenceBar') === 'true' || viewMode === 'confidence';

    const svg = renderDrawingSVG(result.drawing, result.elements, viewMode, {
      showTitleBlock,
      showNorthArrow,
      showScaleBar,
      showLegend,
      showConfidenceBar,
      interactive: true,
    });

    return NextResponse.json({ svg });
  }

  // Standard detail mode
  return NextResponse.json({
    drawing: result.drawing,
    elements: result.elements,
    element_count: result.elements.length,
  });
}, { routeName: 'research/drawings/detail' });

/* PATCH — Save drawing state or update individual element */
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, drawingId } = extractIds(req);
  if (!projectId || !drawingId) {
    return NextResponse.json({ error: 'Project ID and Drawing ID required' }, { status: 400 });
  }

  const body = await req.json();

  // ── Drawing-level save (annotations, preferences, name) ───────────────
  if (body.save) {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.annotations !== undefined) updateData.user_annotations = body.annotations;
    if (body.preferences !== undefined) updateData.user_preferences = body.preferences;
    if (body.name) updateData.name = body.name;

    const { data: updated, error } = await supabaseAdmin
      .from('rendered_drawings')
      .update(updateData)
      .eq('id', drawingId)
      .eq('research_project_id', projectId)
      .select('id, name, updated_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ drawing: updated });
  }

  // ── Element-level update ──────────────────────────────────────────────
  if (!body.element_id) {
    return NextResponse.json({ error: 'element_id or save flag required' }, { status: 400 });
  }

  // Verify element belongs to this drawing
  const { data: element } = await supabaseAdmin
    .from('drawing_elements')
    .select('id, drawing_id')
    .eq('id', body.element_id)
    .eq('drawing_id', drawingId)
    .single();

  if (!element) {
    return NextResponse.json({ error: 'Element not found' }, { status: 404 });
  }

  const updates = body.updates || {};
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.visible !== undefined) updateData.visible = updates.visible;
  if (updates.locked !== undefined) updateData.locked = updates.locked;
  if (updates.user_notes !== undefined) updateData.user_notes = updates.user_notes;
  if (updates.style) updateData.style = updates.style;
  if (updates.geometry) {
    updateData.geometry = updates.geometry;
    updateData.user_modified = true;
  }

  const { data: updated, error } = await supabaseAdmin
    .from('drawing_elements')
    .update(updateData)
    .eq('id', body.element_id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ element: updated });
}, { routeName: 'research/drawings/update' });

/* POST — Drawing actions: compare or export */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, drawingId } = extractIds(req);
  if (!projectId || !drawingId) {
    return NextResponse.json({ error: 'Project ID and Drawing ID required' }, { status: 400 });
  }

  const body = await req.json();
  const action = body.action as string;

  // ── Compare action ────────────────────────────────────────────────────
  if (action === 'compare') {
    const comparisonResult = await compareDrawingToSources(drawingId, projectId);
    return NextResponse.json({ comparison: comparisonResult });
  }

  // ── Export action ─────────────────────────────────────────────────────
  if (action === 'export') {
    const format = body.format as ExportFormat;
    if (!format) {
      return NextResponse.json({ error: 'format is required for export action' }, { status: 400 });
    }

    const result = await getDrawingWithElements(drawingId);
    if (!result) {
      return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });
    }

    if (result.drawing.research_project_id !== projectId) {
      return NextResponse.json({ error: 'Drawing not found in this project' }, { status: 404 });
    }

    const viewMode = (body.viewMode || 'standard') as ViewMode;
    const showTitleBlock = body.showTitleBlock !== false;
    const drawingName = result.drawing.name.replace(/[^a-zA-Z0-9_-]/g, '_');

    switch (format) {
      case 'svg': {
        const svg = renderDrawingSVG(result.drawing, result.elements, viewMode, {
          showTitleBlock,
          showNorthArrow: true,
          showScaleBar: true,
          showLegend: viewMode === 'feature',
          showConfidenceBar: viewMode === 'confidence',
          interactive: false,
        });
        const data = Buffer.from(svg).toString('base64');
        return NextResponse.json({
          export: {
            format: 'svg',
            filename: `${drawingName}.svg`,
            blob_data: data,
            size_bytes: Buffer.byteLength(svg),
          },
        });
      }

      case 'json': {
        const jsonData = JSON.stringify({
          drawing: result.drawing,
          elements: result.elements,
          exported_at: new Date().toISOString(),
          version: '1.0',
        }, null, 2);
        const data = Buffer.from(jsonData).toString('base64');
        return NextResponse.json({
          export: {
            format: 'json',
            filename: `${drawingName}.json`,
            blob_data: data,
            size_bytes: Buffer.byteLength(jsonData),
          },
        });
      }

      case 'png':
      case 'pdf':
      case 'dxf':
        return NextResponse.json({
          error: `${format.toUpperCase()} export is not yet available. Use SVG or JSON export.`,
          available_formats: ['svg', 'json'],
        }, { status: 501 });

      default:
        return NextResponse.json({ error: `Unsupported format: ${format}` }, { status: 400 });
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'compare' or 'export'.` }, { status: 400 });
}, { routeName: 'research/drawings/actions' });

/* DELETE — Archive (soft-delete) or permanently delete a drawing */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, drawingId } = extractIds(req);
  if (!projectId || !drawingId) {
    return NextResponse.json({ error: 'Project ID and Drawing ID required' }, { status: 400 });
  }

  // Verify drawing exists and belongs to project
  const { data: drawing, error: fetchErr } = await supabaseAdmin
    .from('rendered_drawings')
    .select('id, research_project_id')
    .eq('id', drawingId)
    .eq('research_project_id', projectId)
    .single();

  if (fetchErr || !drawing) {
    return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });
  }

  const permanent = req.nextUrl.searchParams.get('permanent') === 'true';

  if (permanent) {
    // Hard delete: remove elements first, then drawing
    await supabaseAdmin
      .from('drawing_elements')
      .delete()
      .eq('drawing_id', drawingId);

    const { error } = await supabaseAdmin
      .from('rendered_drawings')
      .delete()
      .eq('id', drawingId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, action: 'deleted' });
  }

  // Soft delete: set archived_at timestamp
  const { error } = await supabaseAdmin
    .from('rendered_drawings')
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', drawingId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, action: 'archived' });
}, { routeName: 'research/drawings/delete' });
