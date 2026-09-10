// app/api/admin/research/[projectId]/documents/[docId]/route.ts
// GET single document (with optional ?include=content for extracted text + signed URL)
// DELETE document
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { parseTags } from '@/lib/files/labels';

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

/* GET — Get single document with data point count, or content details via ?include=content */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, docId } = extractIds(req);
  if (!projectId || !docId) {
    return NextResponse.json({ error: 'Project ID and Document ID required' }, { status: 400 });
  }

  const includeContent = req.nextUrl.searchParams.get('include') === 'content';

  // Content mode: return extracted text and signed URL
  if (includeContent) {
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
          .from(RESEARCH_DOCUMENTS_BUCKET)
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
  }

  // Standard mode: return full document with data point count
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
      .from(RESEARCH_DOCUMENTS_BUCKET)
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

/* PATCH — the person's own facts about a document: its display name, a note, tags (seed 634).
 *
 * Owner, 2026-09-09: the shared file viewer renames, annotates and tags every kind of file. Nothing
 * the worker wrote (text, OCR, relevance, lineage) is reachable from here. */
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { projectId, docId } = extractIds(req);
  if (!projectId || !docId) return NextResponse.json({ error: 'Project ID and Document ID required' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { document_label?: string | null; notes?: string | null; tags?: string[] | string };
  const patch: Record<string, unknown> = {};
  if ('document_label' in body) {
    const label = typeof body.document_label === 'string' ? body.document_label.trim().slice(0, 200) : '';
    patch.document_label = label || null;
  }
  if ('notes' in body) patch.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 4000) : null;
  if ('tags' in body) patch.tags = parseTags(body.tags);
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });

  const { data: existing } = await supabaseAdmin.from('research_documents').select('id, research_project_id').eq('id', docId).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  if (existing.research_project_id !== projectId) return NextResponse.json({ error: 'Document does not belong to this project' }, { status: 403 });

  const { data, error } = await supabaseAdmin.from('research_documents').update(patch).eq('id', docId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ document: data });
}, { routeName: 'research/documents/patch' });
