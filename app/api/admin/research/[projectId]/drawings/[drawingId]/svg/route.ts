// app/api/admin/research/[projectId]/drawings/[drawingId]/svg/route.ts — SVG rendering endpoint
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { getDrawingWithElements } from '@/lib/research/drawing.service';
import { renderDrawingSVG } from '@/lib/research/svg.renderer';
import type { ViewMode } from '@/types/research';

function extractIds(req: NextRequest): { projectId: string | null; drawingId: string | null } {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return { projectId: null, drawingId: null };
  const parts = afterResearch.split('/');
  return {
    projectId: parts[0] || null,
    drawingId: parts[2] || null,
  };
}

/* GET — Render drawing as SVG */
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

  if (result.drawing.research_project_id !== projectId) {
    return NextResponse.json({ error: 'Drawing not found in this project' }, { status: 404 });
  }

  const viewMode = (req.nextUrl.searchParams.get('viewMode') || 'standard') as ViewMode;
  const showTitleBlock = req.nextUrl.searchParams.get('titleBlock') !== 'false';
  const showLegend = viewMode === 'feature';
  const showConfidenceBar = viewMode === 'confidence';

  const svg = renderDrawingSVG(result.drawing, result.elements, viewMode, {
    showTitleBlock,
    showNorthArrow: true,
    showScaleBar: true,
    showLegend,
    showConfidenceBar,
    interactive: true,
  });

  return NextResponse.json({ svg });
}, { routeName: 'research/drawings/svg' });
