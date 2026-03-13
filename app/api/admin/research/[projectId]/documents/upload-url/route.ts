// app/api/admin/research/[projectId]/documents/upload-url/route.ts
// Returns a Supabase Storage signed upload URL so the browser can PUT the
// file directly to Supabase, completely bypassing the Next.js request body
// limit and resolving the 413 "Payload Too Large" error.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { validateUploadFile } from '@/lib/research/document.service';

export const maxDuration = 30;

/**
 * POST /api/admin/research/[projectId]/documents/upload-url
 *
 * Body (JSON):
 *   filename     string  — original file name (used for extension detection)
 *   fileSize     number  — byte size of the file (used for limit validation)
 *   fileType     string  — MIME type (used as Content-Type on the signed PUT)
 *   documentType string? — optional pre-set document classification
 *   documentLabel string? — optional human-readable label
 *
 * Returns:
 *   { docId, signedUrl, storagePath }
 *   — or —
 *   { document } when an identical file already exists in the project
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = req.nextUrl.pathname.split('/research/')[1]?.split('/')[0];
  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { filename, fileSize, fileType, documentType, documentLabel } = body as {
    filename?: string;
    fileSize?: number;
    fileType?: string;
    documentType?: string;
    documentLabel?: string;
  };

  if (!filename) {
    return NextResponse.json({ error: 'filename is required' }, { status: 400 });
  }

  // Validate file type and size
  const validationError = validateUploadFile(filename, fileSize ?? 0);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Verify the project exists
  const { data: project } = await supabaseAdmin
    .from('research_projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Short-circuit if an identical file (same name + size) already exists
  const { data: existingFile } = await supabaseAdmin
    .from('research_documents')
    .select('id, document_label')
    .eq('research_project_id', projectId)
    .eq('original_filename', filename)
    .eq('file_size_bytes', fileSize ?? 0)
    .maybeSingle();

  if (existingFile) {
    return NextResponse.json({ document: existingFile });
  }

  // Build a unique storage path
  const timestamp = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${projectId}/${timestamp}_${safeName}`;
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  // Create the DB record now (processing_status = 'pending').
  // We set storage_path immediately so processDocument can download the file
  // once the upload is confirmed via the confirm_upload PATCH action.
  const { data: doc, error: dbError } = await supabaseAdmin
    .from('research_documents')
    .insert({
      research_project_id: projectId,
      source_type: 'user_upload',
      original_filename: filename,
      file_type: ext,
      file_size_bytes: fileSize ?? null,
      storage_path: storagePath,
      storage_url: null,
      document_type: documentType ?? null,
      document_label: documentLabel ?? filename,
      processing_status: 'pending',
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Generate a short-lived signed upload URL for direct browser → Supabase upload
  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from('research-documents')
    .createSignedUploadUrl(storagePath);

  if (signedError || !signedData) {
    // Clean up the orphaned DB record
    await supabaseAdmin.from('research_documents').delete().eq('id', doc.id);
    return NextResponse.json(
      { error: `Failed to create upload URL: ${signedError?.message ?? 'unknown error'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    docId: doc.id,
    signedUrl: signedData.signedUrl,
    storagePath,
  });
}, { routeName: 'research/documents/upload-url' });
