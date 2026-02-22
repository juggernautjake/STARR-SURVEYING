// app/api/admin/research/[projectId]/documents/[docId]/content/route.ts
// GET — Get extracted text or signed URL for original file
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

function extractIds(req: NextRequest): { projectId: string | null; docId: string | null } {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return { projectId: null, docId: null };
  const parts = afterResearch.split('/');
  return {
    projectId: parts[0] || null,
    docId: parts[2] || null,
  };
}

/* GET — Get document content: extracted text and/or signed URL */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, docId } = extractIds(req);
  if (!projectId || !docId) {
    return NextResponse.json({ error: 'Project ID and Document ID required' }, { status: 400 });
  }

  const { data: doc, error } = await supabaseAdmin
    .from('research_documents')
    .select('id, research_project_id, extracted_text, extracted_text_method, storage_path, file_type, original_filename, processing_status')
    .eq('id', docId)
    .eq('research_project_id', projectId)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Generate signed URL for original file (60-minute expiry)
  let signedUrl: string | null = null;
  if (doc.storage_path) {
    try {
      const { data } = await supabaseAdmin.storage
        .from('research-documents')
        .createSignedUrl(doc.storage_path, 3600);
      signedUrl = data?.signedUrl || null;
    } catch {
      // Storage may not be configured — continue without URL
    }
  }

  return NextResponse.json({
    extracted_text: doc.extracted_text || null,
    extracted_text_method: doc.extracted_text_method || null,
    processing_status: doc.processing_status,
    signed_url: signedUrl,
    file_type: doc.file_type,
    original_filename: doc.original_filename,
  });
}, { routeName: 'research/documents/content' });
