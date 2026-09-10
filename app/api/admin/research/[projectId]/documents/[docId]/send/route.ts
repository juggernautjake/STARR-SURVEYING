// app/api/admin/research/[projectId]/documents/[docId]/send/route.ts — move or copy a research document
// to another research project.
//
// Owner, 2026-09-09: the shared file viewer sends files "to new destinations". A research document's
// bytes live in the research-documents bucket under a per-document key, so a MOVE re-parents the row
// and a COPY duplicates the object under a fresh key. Extracted text, OCR regions and page images
// travel with a copy (they are the worker's reading of the same bytes); annotations, data points and
// run lineage do not — they belong to the project the document was read in.
//
//   POST { mode: 'move' | 'copy', target_project_id: string }

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth } from '@/lib/auth';
import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

function extractIds(req: NextRequest): { projectId: string | null; docId: string | null } {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return { projectId: null, docId: null };
  const parts = afterResearch.split('/');
  return { projectId: parts[0] || null, docId: parts[2] || null };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { projectId, docId } = extractIds(req);
  if (!projectId || !docId) return NextResponse.json({ error: 'Project ID and Document ID required' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { mode?: string; target_project_id?: string };
  const mode = body.mode === 'copy' ? 'copy' : body.mode === 'move' ? 'move' : null;
  const target = typeof body.target_project_id === 'string' ? body.target_project_id : '';
  if (!mode || !target) return NextResponse.json({ error: 'mode ("move" | "copy") and target_project_id are required.' }, { status: 400 });
  if (target === projectId) return NextResponse.json({ error: 'The document is already in that project.' }, { status: 400 });

  const { data: targetProject } = await supabaseAdmin.from('research_projects').select('id').eq('id', target).maybeSingle();
  if (!targetProject) return NextResponse.json({ error: 'That research project is not here.' }, { status: 404 });

  const { data: doc } = await supabaseAdmin.from('research_documents').select('*').eq('id', docId).maybeSingle();
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  if (doc.research_project_id !== projectId) return NextResponse.json({ error: 'Document does not belong to this project' }, { status: 403 });

  if (mode === 'move') {
    const { data: moved, error } = await supabaseAdmin
      .from('research_documents')
      .update({ research_project_id: target })
      .eq('id', docId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ document: moved });
  }

  // ── copy ──
  let storagePath: string | null = null;
  let storageUrl: string | null = null;
  if (doc.storage_path) {
    const ext = String(doc.storage_path).includes('.') ? String(doc.storage_path).slice(String(doc.storage_path).lastIndexOf('.')) : '';
    const dest = `${target}/${randomUUID()}${ext}`;
    const { error: copyErr } = await supabaseAdmin.storage.from(RESEARCH_DOCUMENTS_BUCKET).copy(doc.storage_path, dest);
    if (copyErr) return NextResponse.json({ error: `Could not copy the file's bytes: ${copyErr.message}` }, { status: 500 });
    storagePath = dest;
    storageUrl = supabaseAdmin.storage.from(RESEARCH_DOCUMENTS_BUCKET).getPublicUrl(dest).data?.publicUrl ?? null;
  }

  const {
    id: _id, research_project_id: _rp, created_at: _c, updated_at: _u,
    research_run_id: _run, last_seen_run_id: _seen, run_seen_count: _seenCount, duplicate_of: _dup, duplicate_reason: _dupReason,
    superseded_at: _sup, research_round: _round, identity_key: _identity,
    ...rest
  } = doc as Record<string, unknown>;
  const { data: copied, error: insErr } = await supabaseAdmin
    .from('research_documents')
    .insert({
      ...rest,
      research_project_id: target,
      storage_path: storagePath,
      storage_url: storageUrl,
      // A copy is a user act: the target project's operator put it there.
      source_type: 'user_upload',
    })
    .select()
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  return NextResponse.json({ document: copied }, { status: 201 });
}, { routeName: 'research/documents/send' });
