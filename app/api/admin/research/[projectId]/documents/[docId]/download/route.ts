// app/api/admin/research/[projectId]/documents/[docId]/download/route.ts
// Phase 13: Document download proxy.
//
// GET — Returns a signed/proxied download for a purchased document stored in
//       Supabase Storage.  Requires the document to belong to the project and
//       to have a storage_path set (i.e., it was actually uploaded/purchased).
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

function extractIds(req: NextRequest): { projectId: string | null; docId: string | null } {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return { projectId: null, docId: null };
  // pathname: /api/admin/research/[projectId]/documents/[docId]/download
  // afterResearch: [projectId]/documents/[docId]/download
  const parts = afterResearch.split('/');
  return {
    projectId: parts[0] || null,
    docId: parts[2] || null,   // parts[1] = "documents"
  };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, docId } = extractIds(req);
  if (!projectId || !docId) {
    return NextResponse.json({ error: 'Project ID and Document ID required' }, { status: 400 });
  }

  // Fetch document — verify it belongs to this project
  const { data: doc, error } = await supabaseAdmin
    .from('research_documents')
    .select('id, research_project_id, original_filename, file_type, storage_path, storage_url')
    .eq('id', docId)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  if (doc.research_project_id !== projectId) {
    return NextResponse.json({ error: 'Document does not belong to this project' }, { status: 403 });
  }

  if (!doc.storage_path) {
    return NextResponse.json({ error: 'Document file not available for download' }, { status: 404 });
  }

  // Try to get a signed URL valid for 60 minutes
  const { data: signedData, error: signErr } = await supabaseAdmin.storage
    .from('research-documents')
    .createSignedUrl(doc.storage_path, 3600);  // 60 min

  if (signErr || !signedData?.signedUrl) {
    // Fall back to direct download via storage API
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from('research-documents')
      .download(doc.storage_path);

    if (dlErr || !blob) {
      return NextResponse.json(
        { error: 'Failed to generate download URL', detail: signErr?.message },
        { status: 500 },
      );
    }

    // Stream the file back
    const arrayBuffer = await blob.arrayBuffer();
    const filename = doc.original_filename || `document.${doc.file_type || 'pdf'}`;
    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // Redirect to signed URL (avoids proxying large files through Next.js)
  return NextResponse.redirect(signedData.signedUrl, { status: 302 });
}, { routeName: 'research/documents/download' });
