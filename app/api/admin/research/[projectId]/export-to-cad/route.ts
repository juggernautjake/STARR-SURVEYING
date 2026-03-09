// app/api/admin/research/[projectId]/export-to-cad/route.ts
// GET — Convert the most recent RECON drawing to a STARR CAD DrawingDocument
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { convertReconToCAD, hasConvertibleElements } from '@/lib/cad/recon-to-cad';
import type { DrawingElement, RenderedDrawing } from '@/types/research';

function extractProjectId(req: NextRequest): string | null {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return null;
  return afterResearch.split('/')[0] || null;
}

/**
 * GET /api/admin/research/[projectId]/export-to-cad
 *
 * Converts the latest RECON drawing for the given research project into a
 * STARR CAD DrawingDocument and returns it as JSON.  The client stores the
 * document in localStorage and navigates to the CAD editor, which picks it up
 * on load.
 *
 * Response body:
 *   { document: DrawingDocument }
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // 1. Verify project exists and retrieve display metadata
  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select('id, address, parcel_id, owner_name')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // 2. Fetch the most recent rendered drawing
  const { data: drawings, error: drawErr } = await supabaseAdmin
    .from('rendered_drawings')
    .select('*')
    .eq('research_project_id', projectId)
    .order('version', { ascending: false })
    .limit(1);

  if (drawErr) {
    return NextResponse.json({ error: 'Failed to load drawing' }, { status: 500 });
  }

  if (!drawings || drawings.length === 0) {
    return NextResponse.json(
      { error: 'No drawing found for this project. Please generate a drawing first.' },
      { status: 404 },
    );
  }

  const drawing = drawings[0] as RenderedDrawing;

  // 3. Fetch drawing elements
  const { data: elementsRaw, error: elemErr } = await supabaseAdmin
    .from('drawing_elements')
    .select('*')
    .eq('drawing_id', drawing.id)
    .order('z_index', { ascending: true });

  if (elemErr) {
    return NextResponse.json({ error: 'Failed to load drawing elements' }, { status: 500 });
  }

  const elements = (elementsRaw ?? []) as DrawingElement[];

  if (!hasConvertibleElements(elements)) {
    return NextResponse.json(
      { error: 'Drawing has no geometry elements to export.' },
      { status: 422 },
    );
  }

  // 4. Build a human-friendly project name for the title block
  const projectLabel =
    [project.address, project.parcel_id].filter(Boolean).join(' — ') ||
    `Research Project ${projectId.slice(0, 8)}`;

  // 5. Convert to CAD document
  const document = convertReconToCAD(drawing, elements, projectLabel);

  return NextResponse.json({ document });
}, { routeName: 'research/export-to-cad' });
