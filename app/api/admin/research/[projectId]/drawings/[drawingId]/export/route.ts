// app/api/admin/research/[projectId]/drawings/[drawingId]/export/route.ts
// POST — Export drawing to various formats (SVG, JSON, PNG, PDF)
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { getDrawingWithElements } from '@/lib/research/drawing.service';
import { renderDrawingSVG } from '@/lib/research/svg.renderer';
import { supabaseAdmin } from '@/lib/supabase';
import type { ExportFormat, ViewMode } from '@/types/research';

function extractIds(req: NextRequest): { projectId: string | null; drawingId: string | null } {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return { projectId: null, drawingId: null };
  const parts = afterResearch.split('/');
  return {
    projectId: parts[0] || null,
    drawingId: parts[2] || null,
  };
}

/* POST — Export drawing */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, drawingId } = extractIds(req);
  if (!projectId || !drawingId) {
    return NextResponse.json({ error: 'Project ID and Drawing ID required' }, { status: 400 });
  }

  const body = await req.json() as {
    format: ExportFormat;
    viewMode?: ViewMode;
    showTitleBlock?: boolean;
  };

  if (!body.format) {
    return NextResponse.json({ error: 'format is required' }, { status: 400 });
  }

  const result = await getDrawingWithElements(drawingId);
  if (!result) {
    return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });
  }

  if (result.drawing.research_project_id !== projectId) {
    return NextResponse.json({ error: 'Drawing not found in this project' }, { status: 404 });
  }

  const viewMode = body.viewMode || 'standard';
  const showTitleBlock = body.showTitleBlock !== false;
  const drawingName = result.drawing.name.replace(/[^a-zA-Z0-9_-]/g, '_');

  switch (body.format) {
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
      // These formats require additional server-side processing libraries
      // (sharp for PNG, jspdf for PDF, dxf-writer for DXF)
      // Return an informational response for now
      return NextResponse.json({
        error: `${body.format.toUpperCase()} export is not yet available. Use SVG or JSON export.`,
        available_formats: ['svg', 'json'],
      }, { status: 501 });

    default:
      return NextResponse.json({ error: `Unsupported format: ${body.format}` }, { status: 400 });
  }
}, { routeName: 'research/drawings/export' });
