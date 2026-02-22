// app/api/admin/research/[projectId]/documents/[docId]/route.ts
// GET single document, DELETE document
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

function extractIds(req: NextRequest): { projectId: string | null; docId: string | null } {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return { projectId: null, docId: null };
  const parts = afterResearch.split('/');
  // parts: [projectId, "documents", docId, ...]
  return {
    projectId: parts[0] || null,
    docId: parts[2] || null,
  };
}

/* GET — Get single document with extracted data point count */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, docId } = extractIds(req);
  if (!projectId || !docId) {
    return NextResponse.json({ error: 'Project ID and Document ID required' }, { status: 400 });
  }

  const { data: doc, error } = await supabaseAdmin
    .from('research_documents')
    .select('*')
    .eq('id', docId)
    .eq('research_project_id', projectId)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Get data point count for this document
  const { count } = await supabaseAdmin
    .from('extracted_data_points')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', docId);

  return NextResponse.json({
    document: doc,
    data_point_count: count || 0,
  });
}, { routeName: 'research/documents/detail' });

/* DELETE — Remove a specific document */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, docId } = extractIds(req);
  if (!projectId || !docId) {
    return NextResponse.json({ error: 'Project ID and Document ID required' }, { status: 400 });
  }

  // Verify document belongs to project
  const { data: doc } = await supabaseAdmin
    .from('research_documents')
    .select('id, storage_path')
    .eq('id', docId)
    .eq('research_project_id', projectId)
    .single();

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Delete from storage
  if (doc.storage_path) {
    await supabaseAdmin.storage
      .from('research-documents')
      .remove([doc.storage_path])
      .catch(() => {}); // Best-effort cleanup
  }

  // Delete associated data points first
  await supabaseAdmin
    .from('extracted_data_points')
    .delete()
    .eq('document_id', docId);

  // Delete document record
  const { error } = await supabaseAdmin
    .from('research_documents')
    .delete()
    .eq('id', docId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}, { routeName: 'research/documents/detail' });
