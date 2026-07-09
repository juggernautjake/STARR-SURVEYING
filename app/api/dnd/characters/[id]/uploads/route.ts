// app/api/dnd/characters/[id]/uploads/route.ts — add/list/remove a character's build
// materials (Phase M6). Lets the owner (or DM) keep feeding a character AFTER it's made:
// upload source files, PDFs, screenshots, and reference art, plus free-text comments about
// the character. Everything here is what the AI reads when it builds the sheet out
// (POST .../ingest). Owner/DM gated.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getCharacterAccess } from '@/lib/dnd/characters';

const BUCKET = 'dnd-media';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file
const ART_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function extFromName(name: string, fallback: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return (m?.[1] ?? fallback).toLowerCase().slice(0, 8);
}

// GET — list this character's uploaded materials + the accumulated style/mechanics notes.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  if (!res.access.canWrite) return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });

  const { data } = await supabaseAdmin
    .from('dnd_character_uploads')
    .select('id, url, filename, mime, kind, created_at')
    .eq('character_id', params.id)
    .order('created_at', { ascending: true });
  return NextResponse.json({
    uploads: (data ?? []) as { id: string; url: string; filename: string | null; mime: string | null; kind: string; created_at: string }[],
    styleNotes: res.access.character.style_notes ?? '',
    importNotes: res.access.character.import_notes ?? null,
    underConstruction: !!res.access.character.under_construction,
  });
}

// POST (multipart) — add files/art and/or a comment. Comments are also saved as a source
// text file so the AI reads them like any other material.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  if (!res.access.canWrite) return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart upload.' }, { status: 400 });
  }
  const comment = String(form.get('comment') ?? '').trim();
  const sources = form.getAll('sources').filter((f): f is File => f instanceof File && f.size > 0);
  const art = form.getAll('art').filter((f): f is File => f instanceof File && f.size > 0);
  if (!comment && sources.length === 0 && art.length === 0) {
    return NextResponse.json({ error: 'Add a file, some art, or a comment first.' }, { status: 400 });
  }

  await ensureStorageBucket(BUCKET, { public: true });
  const uploads: { url: string; filename: string; mime: string; kind: string }[] = [];
  const put = async (bytes: Buffer, filename: string, mime: string, kind: 'source' | 'art') => {
    const key = `imports/${params.id}/${crypto.randomUUID()}.${extFromName(filename, kind === 'art' ? 'png' : 'bin')}`;
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(key, bytes, { contentType: mime || 'application/octet-stream', upsert: true });
    if (error) return;
    const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
    uploads.push({ url, filename, mime: mime || '', kind });
  };

  // The comment becomes a source doc (so the AI ingests it) and is appended to the
  // visible style/mechanics notes so the accumulated brief stays readable.
  if (comment) {
    await put(Buffer.from(comment, 'utf8'), `comment-${Date.now()}.txt`, 'text/plain', 'source');
    const prev = (res.access.character.style_notes ?? '').trim();
    const merged = prev ? `${prev}\n\n${comment}` : comment;
    await supabaseAdmin.from('dnd_characters').update({ style_notes: merged, updated_at: new Date().toISOString() }).eq('id', params.id);
  }
  for (const f of sources) {
    if (f.size <= MAX_BYTES) await put(Buffer.from(await f.arrayBuffer()), f.name, f.type, 'source');
  }
  for (const f of art) {
    if (f.size <= MAX_BYTES && ART_MIME.has(f.type)) await put(Buffer.from(await f.arrayBuffer()), f.name, f.type, 'art');
  }

  if (uploads.length) {
    await supabaseAdmin.from('dnd_character_uploads').insert(uploads.map((u) => ({ character_id: params.id, url: u.url, filename: u.filename, mime: u.mime, kind: u.kind })));
    // First art doubles as the token/portrait if the character has none yet.
    const firstArt = uploads.find((u) => u.kind === 'art');
    if (firstArt && !res.access.character.token_url) {
      await supabaseAdmin.from('dnd_characters').update({ art_url: res.access.character.art_url ?? firstArt.url, token_url: firstArt.url }).eq('id', params.id);
    }
  }

  return NextResponse.json({ ok: true, added: uploads.length });
}

// DELETE ?uploadId=… — remove one uploaded material (owner/DM). Best-effort storage cleanup.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  if (!res.access.canWrite) return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });

  const uploadId = req.nextUrl.searchParams.get('uploadId');
  if (!uploadId) return NextResponse.json({ error: 'uploadId is required.' }, { status: 400 });

  const { data: row } = await supabaseAdmin
    .from('dnd_character_uploads')
    .select('id, url, character_id')
    .eq('id', uploadId)
    .eq('character_id', params.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Upload not found.' }, { status: 404 });

  await supabaseAdmin.from('dnd_character_uploads').delete().eq('id', uploadId);
  // Best-effort: strip the stored object too (derive the key after the bucket segment).
  try {
    const url = (row as { url: string }).url;
    const marker = `/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx >= 0) await supabaseAdmin.storage.from(BUCKET).remove([url.slice(idx + marker.length)]);
  } catch {
    /* leave the orphaned object; the row is gone which is what matters */
  }
  return NextResponse.json({ ok: true });
}
