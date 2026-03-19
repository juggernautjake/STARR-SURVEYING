// app/api/admin/research/[projectId]/documents/route.ts — Document upload & list
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET, ensureStorageBucket } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { processDocument, validateUploadFile, ACCEPTED_FILE_TYPES } from '@/lib/research/document.service';

// Allow up to 120 seconds for uploads (large files + storage round-trip + OCR extraction)
export const maxDuration = 120;

/* GET — List all documents for a research project */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.pathname.split('/research/')[1]?.split('/')[0];
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('research_documents')
    .select('*')
    .eq('research_project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ documents: data || [] });
}, { routeName: 'research/documents' });

/* POST — Upload file(s) to a research project */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.pathname.split('/research/')[1]?.split('/')[0];
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Verify project exists
  const { data: project } = await supabaseAdmin
    .from('research_projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const formData = await req.formData();
  const files = formData.getAll('file') as File[];
  const documentType = formData.get('document_type') as string | null;
  const documentLabel = formData.get('document_label') as string | null;

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  // Ensure the storage bucket exists before processing any uploads.
  // This is a no-op after the first successful call in this process (cached).
  await ensureStorageBucket();

  const results: { document: unknown; error?: string }[] = [];

  for (const file of files) {
    // Validate
    const validationError = validateUploadFile(file.name, file.size);
    if (validationError) {
      results.push({ document: null, error: `${file.name}: ${validationError}` });
      continue;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Skip if an identical file (same name + size) already exists in this project
    const { data: existingFile } = await supabaseAdmin
      .from('research_documents')
      .select('id, document_label')
      .eq('research_project_id', projectId)
      .eq('original_filename', file.name)
      .eq('file_size_bytes', file.size)
      .maybeSingle();
    if (existingFile) {
      results.push({ document: existingFile });
      continue;
    }

    // Generate storage path
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${projectId}/${timestamp}_${safeName}`;

    // Upload to Supabase Storage
    let storageUrl: string | null = null;
    let uploadedStoragePath: string | null = null;
    try {
      const { error: uploadError } = await supabaseAdmin.storage
        .from(RESEARCH_DOCUMENTS_BUCKET)
        .upload(storagePath, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });

      if (uploadError) {
        console.warn(`[Upload] Storage upload failed for ${file.name}:`, uploadError.message);
      } else {
        uploadedStoragePath = storagePath;
        const { data: urlData } = supabaseAdmin.storage
          .from(RESEARCH_DOCUMENTS_BUCKET)
          .getPublicUrl(storagePath);
        storageUrl = urlData?.publicUrl || null;
      }
    } catch (err) {
      console.warn(`[Upload] Storage error for ${file.name}:`, err);
    }

    // Create database record — only set storage_path if upload succeeded
    const { data: doc, error: dbError } = await supabaseAdmin
      .from('research_documents')
      .insert({
        research_project_id: projectId,
        source_type: 'user_upload',
        original_filename: file.name,
        file_type: ext,
        file_size_bytes: file.size,
        storage_path: uploadedStoragePath,
        storage_url: storageUrl,
        document_type: documentType || null,
        document_label: documentLabel || file.name,
        processing_status: 'pending',
      })
      .select()
      .single();

    if (dbError) {
      results.push({ document: null, error: `${file.name}: ${dbError.message}` });
      continue;
    }

    // Process document synchronously — extract text & classify so it's ready
    // for analysis immediately after upload completes. This prevents the race
    // condition where /analyze is called before extraction finishes.
    try {
      await processDocument(doc.id);
      // Re-fetch updated document with extracted text and new status
      const { data: updatedDoc } = await supabaseAdmin
        .from('research_documents')
        .select('*')
        .eq('id', doc.id)
        .single();
      results.push({ document: updatedDoc || doc });
    } catch (err) {
      console.error(`[Upload] Document processing failed for ${doc.id}:`, err);
      // Non-fatal: return the original doc record; user can retry via "Reprocess"
      results.push({ document: doc });
    }
  }

  const successCount = results.filter(r => r.document).length;
  const errorCount = results.filter(r => r.error).length;

  return NextResponse.json({
    documents: results.filter(r => r.document).map(r => r.document),
    errors: results.filter(r => r.error).map(r => r.error),
    message: `${successCount} file(s) uploaded${errorCount ? `, ${errorCount} failed` : ''}`,
  }, { status: 201 });
}, { routeName: 'research/documents' });

/* PATCH — Reprocess a document that previously failed */
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const docId = searchParams.get('id');
  const action = searchParams.get('action');

  if (!docId) return NextResponse.json({ error: 'Document id is required' }, { status: 400 });

  if (action === 'reprocess') {
    // Verify document exists and is in an error or extractable state
    const { data: doc } = await supabaseAdmin
      .from('research_documents')
      .select('id, processing_status')
      .eq('id', docId)
      .single();

    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    // Reset the document status to pending and clear the error
    await supabaseAdmin.from('research_documents').update({
      processing_status: 'pending',
      processing_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', docId);

    // Re-trigger processing in the background
    processDocument(docId).catch(err => {
      console.error(`[Reprocess] Background processing failed for ${docId}:`, err);
    });

    return NextResponse.json({ success: true, message: 'Document reprocessing started' });
  }

  if (action === 'confirm_upload') {
    // Called by the client after a successful direct-to-Supabase upload.
    // Updates the storage_url and triggers background text extraction.
    const body = await req.json().catch(() => ({})) as { storagePath?: string };
    const storagePath = body?.storagePath;

    const { data: doc } = await supabaseAdmin
      .from('research_documents')
      .select('id, storage_path')
      .eq('id', docId)
      .single();

    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    // Derive the public URL from the storage path
    let storageUrl: string | null = null;
    const pathToUse = storagePath ?? doc.storage_path;
    if (pathToUse) {
      const { data: urlData } = supabaseAdmin.storage
        .from(RESEARCH_DOCUMENTS_BUCKET)
        .getPublicUrl(pathToUse);
      storageUrl = urlData?.publicUrl ?? null;
    }

    await supabaseAdmin.from('research_documents').update({
      storage_url: storageUrl,
      processing_status: 'pending',
      processing_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', docId);

    // Trigger async processing (don't await)
    processDocument(docId).catch(err => {
      console.error(`[ConfirmUpload] Background processing failed for ${docId}:`, err);
    });

    return NextResponse.json({ success: true, message: 'Upload confirmed, processing started' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}, { routeName: 'research/documents/reprocess' });

/* DELETE — Remove a document from the project */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.pathname.split('/research/')[1]?.split('/')[0];
  const { searchParams } = new URL(req.url);
  const docId = searchParams.get('id');
  if (!docId) return NextResponse.json({ error: 'Document id is required' }, { status: 400 });

  // Get the document — verify it belongs to this project
  const { data: doc } = await supabaseAdmin
    .from('research_documents')
    .select('storage_path, research_project_id')
    .eq('id', docId)
    .single();

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  // Enforce project ownership
  if (projectId && doc.research_project_id !== projectId) {
    return NextResponse.json({ error: 'Document does not belong to this project' }, { status: 403 });
  }

  // Delete from storage
  if (doc.storage_path) {
    await supabaseAdmin.storage
      .from(RESEARCH_DOCUMENTS_BUCKET)
      .remove([doc.storage_path])
      .catch(() => {}); // Best-effort storage cleanup
  }

  // Delete from database (cascades to extracted_data_points)
  const { error } = await supabaseAdmin
    .from('research_documents')
    .delete()
    .eq('id', docId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}, { routeName: 'research/documents' });
