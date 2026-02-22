// app/api/admin/research/[projectId]/drawings/[drawingId]/compare/route.ts
// POST — Run drawing-to-source comparison and verification
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { compareDrawingToSources } from '@/lib/research/comparison.service';

function extractIds(req: NextRequest): { projectId: string | null; drawingId: string | null } {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return { projectId: null, drawingId: null };
  const parts = afterResearch.split('/');
  return {
    projectId: parts[0] || null,
    drawingId: parts[2] || null,
  };
}

/* POST — Run comparison */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, drawingId } = extractIds(req);
  if (!projectId || !drawingId) {
    return NextResponse.json({ error: 'Project ID and Drawing ID required' }, { status: 400 });
  }

  const result = await compareDrawingToSources(drawingId, projectId);

  return NextResponse.json({ comparison: result });
}, { routeName: 'research/drawings/compare' });
