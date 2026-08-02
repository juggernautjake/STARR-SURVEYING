// app/api/admin/research/[projectId]/data-points/[dpId]/route.ts
// GET — Single data point with source document reference
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
// Accepted, rejected, corrected, or nobody has looked (research plan R23).
import { reviewMeta, validateReview, type ReviewStatus } from '@/lib/research/fact-review';

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

/* PATCH — Record a person's verdict on this fact (plan R23).
 *
 * `extracted_data_points` carried a confidence score and no human verdict, so a value read correctly
 * off a deed and one the model invented looked identical to every downstream stage. A reviewer who
 * spotted a wrong bearing had nowhere to put that knowledge.
 *
 * The original `raw_value` is NEVER written here. A correction goes in `corrected_value`, so "what
 * did the extraction actually say" stays answerable — which is the question worth asking when the
 * same misread appears on the next property, and what makes the pair usable as a golden record. */
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, dpId } = extractIds(req);
  if (!projectId || !dpId) {
    return NextResponse.json({ error: 'Project ID and Data Point ID required' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    review_status?: ReviewStatus;
    corrected_value?: string | null;
    review_note?: string | null;
  };

  const status = body.review_status ?? 'unreviewed';
  const invalid = validateReview(status, body.corrected_value);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('extracted_data_points')
    .update({
      review_status: status,
      corrected_value: status === 'corrected' ? body.corrected_value!.trim() : null,
      review_note: body.review_note?.trim() || null,
      // Clearing a review must also clear who did it, or the row claims a reviewer for a verdict
      // that no longer exists.
      reviewed_by: status === 'unreviewed' ? null : session.user.email,
      reviewed_at: status === 'unreviewed' ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dpId)
    .eq('research_project_id', projectId)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Data point not found, or the review could not be saved.' }, { status: 404 });
  }

  return NextResponse.json({ data_point: data, review: reviewMeta(data) });
}, { routeName: 'research/data-points/review' });
