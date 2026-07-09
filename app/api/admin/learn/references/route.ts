// app/api/admin/learn/references/route.ts — the grounded FS tutor's reference library.
//   GET  → list uploaded reference documents (admin).
//   POST → upload a document (PDF/DOCX/text/image): extract text → chunk → embed → store,
//          so the tutor can retrieve trusted passages from it before answering.
// Admin/content-manager gated. ANTHROPIC_API_KEY is needed to OCR scans; VOYAGE_API_KEY to
// embed (without it the doc is stored but not yet semantically searchable — flagged in the
// response so the admin can configure the key and re-upload).
import { NextRequest, NextResponse } from 'next/server';
import { auth, canManageContent } from '@/lib/auth';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { extractReferenceText, chunkText } from '@/lib/learn/reference-extract';
import { embedDocuments, embeddingsConfigured } from '@/lib/learn/embeddings';

export const maxDuration = 300; // extraction + OCR + embedding can run long for big PDFs
const BUCKET = 'learn-references';
const MAX_BYTES = 40 * 1024 * 1024;

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageContent(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('fs_reference_docs')
    .select('id, title, source, kind, status, error, char_count, chunk_count, notes, original_filename, created_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [], embeddingsConfigured: embeddingsConfigured() });
}, { routeName: 'admin/learn/references#get' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageContent(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart upload.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'A file is required.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File is too large (40 MB max).' }, { status: 400 });
  const title = String(form.get('title') ?? '').trim() || file.name;
  const source = String(form.get('source') ?? '').trim() || null;
  const notes = String(form.get('notes') ?? '').trim() || null;

  const buffer = Buffer.from(await file.arrayBuffer());

  // Store the original privately (references may be copyrighted; only extracted passages
  // are ever surfaced, and only to the AI). Best-effort — ingestion proceeds regardless.
  let storagePath: string | null = null;
  try {
    await ensureStorageBucket(BUCKET, { public: false });
    const key = `${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`.slice(0, 200);
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(key, buffer, { contentType: file.type || 'application/octet-stream', upsert: true });
    if (!upErr) storagePath = key;
  } catch {
    /* storage optional */
  }

  // Create the doc row up front so a slow extraction/embed still leaves a record.
  const { data: docRow, error: insErr } = await supabaseAdmin
    .from('fs_reference_docs')
    .insert({ title, source, notes, original_filename: file.name, storage_path: storagePath, status: 'processing', added_by: session.user.email })
    .select('id')
    .single();
  if (insErr || !docRow) return NextResponse.json({ error: insErr?.message ?? 'Could not create the document.' }, { status: 500 });
  const docId = (docRow as { id: string }).id;

  const fail = async (message: string, status = 500) => {
    await supabaseAdmin.from('fs_reference_docs').update({ status: 'failed', error: message, updated_at: new Date().toISOString() }).eq('id', docId);
    return NextResponse.json({ error: message, id: docId }, { status });
  };

  // Extract → chunk.
  let extracted;
  try {
    extracted = await extractReferenceText(buffer, file.type, file.name);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Text extraction failed.');
  }
  const chunks = chunkText(extracted.text);
  if (chunks.length === 0) return fail('No readable text was found in this file.', 422);

  // Embed each chunk (skip gracefully if no embeddings key — doc stored, not yet searchable).
  let embeddings: (number[] | null)[] = chunks.map(() => null);
  let warning: string | null = null;
  if (embeddingsConfigured()) {
    try {
      embeddings = await embedDocuments(chunks);
    } catch (e) {
      warning = `Stored, but embedding failed so it isn't searchable yet: ${e instanceof Error ? e.message : 'unknown error'}`;
    }
  } else {
    warning = 'Stored, but VOYAGE_API_KEY is not configured, so this document is not yet searchable by the tutor.';
  }

  const rows = chunks.map((content, i) => ({
    doc_id: docId,
    ordinal: i,
    content,
    token_estimate: Math.ceil(content.length / 4),
    embedding: embeddings[i] ?? null,
  }));
  // Insert in batches to stay under payload limits.
  for (let i = 0; i < rows.length; i += 100) {
    const { error: cErr } = await supabaseAdmin.from('fs_reference_chunks').insert(rows.slice(i, i + 100));
    if (cErr) return fail(`Saving passages failed: ${cErr.message}`);
  }

  await supabaseAdmin
    .from('fs_reference_docs')
    .update({ status: 'ready', kind: extracted.kind, char_count: extracted.text.length, chunk_count: chunks.length, error: warning, updated_at: new Date().toISOString() })
    .eq('id', docId);

  return NextResponse.json({ ok: true, id: docId, chunks: chunks.length, kind: extracted.kind, warning });
}, { routeName: 'admin/learn/references#post' });
