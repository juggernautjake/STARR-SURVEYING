// app/api/admin/research/[projectId]/data-points/[dpId]/route.ts
// GET — Single data point with source document reference
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

function extractIds(req: NextRequest): { projectId: string | null; dpId: string | null } {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return { projectId: null, dpId: null };
  const parts = afterResearch.split('/');
  // parts: [projectId, "data-points", dpId]
  return {
    projectId: parts[0] || null,
    dpId: parts[2] || null,
  };
}

/* GET — Get single data point with source document info */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, dpId } = extractIds(req);
  if (!projectId || !dpId) {
    return NextResponse.json({ error: 'Project ID and Data Point ID required' }, { status: 400 });
  }

  const { data: dataPoint, error } = await supabaseAdmin
    .from('extracted_data_points')
    .select('*')
    .eq('id', dpId)
    .eq('research_project_id', projectId)
    .single();

  if (error || !dataPoint) {
    return NextResponse.json({ error: 'Data point not found' }, { status: 404 });
  }

  // Fetch the source document info
  let sourceDocument = null;
  if (dataPoint.document_id) {
    const { data: doc } = await supabaseAdmin
      .from('research_documents')
      .select('id, document_label, document_type, original_filename, source_type')
      .eq('id', dataPoint.document_id)
      .single();
    sourceDocument = doc;
  }

  // Fetch related discrepancies
  const { data: discrepancies } = await supabaseAdmin
    .from('discrepancies')
    .select('id, title, severity, resolution_status')
    .eq('research_project_id', projectId)
    .contains('data_point_ids', [dpId]);

  return NextResponse.json({
    data_point: dataPoint,
    source_document: sourceDocument,
    related_discrepancies: discrepancies || [],
  });
}, { routeName: 'research/data-points/detail' });
