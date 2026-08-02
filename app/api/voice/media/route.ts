// app/api/voice/media/route.ts — Andrew's own uploads.
//
// Separate from `/api/voice/uploads` (the public script-attachment endpoint) for one reason that
// matters: this one requires a session, so the allowlist can be generous. A stranger may send a PDF
// or an MP3; Andrew may upload the WAV masters, the video of a recital and the headshot, because he
// is the person who owns the bucket.
//
// ── TWO DESTINATIONS, ONE UPLOADER ──────────────────────────────────────────────────────────────
//
// `va_media` is anything that can appear ON the site — photos, demo audio, video. `va_documents` is
// everything that must never appear on it — tax forms, signed agreements, session masters, insurance.
// The split is the access rule made structural: a bug that leaks one table does not leak the other.
// `destination` picks which, and the storage bucket differs accordingly.

import { NextResponse } from 'next/server';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';
import { safeStorageName } from '@/lib/voice/upload-rules';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Public: served straight into <img> and <audio> on the marketing site. */
const MEDIA_BUCKET = 'voice-media';
/** Private: reached only through signed URLs from the studio. */
const DOCS_BUCKET = 'voice-documents';

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB — a WAV master of a long session is genuinely this big

const MEDIA_KINDS: Record<string, RegExp> = {
  image: /^image\/(jpeg|png|webp|gif|avif|svg\+xml)$/,
  audio: /^audio\//,
  video: /^video\//,
  document: /^(application|text)\//,
};

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

function kindOf(mime: string): string {
  for (const [kind, re] of Object.entries(MEDIA_KINDS)) {
    if (re.test(mime)) return kind;
  }
  return 'document';
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind');

  let query = supabaseAdmin.from('va_media').select('*').order('created_at', { ascending: false }).limit(500);
  if (kind && kind !== 'all') query = query.eq('kind', kind);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ media: data ?? [] });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'That is over 200 MB. Compress it or link to it instead.' }, { status: 413 });
  }

  const destination = String(form.get('destination') ?? 'media');
  const isDoc = destination === 'documents';
  const bucket = isDoc ? DOCS_BUCKET : MEDIA_BUCKET;

  await ensureStorageBucket(bucket, { public: !isDoc, fileSizeLimit: MAX_BYTES });

  const prefix = crypto.randomUUID();
  const path = `${isDoc ? 'docs' : 'media'}/${prefix}/${safeStorageName(file.name)}`;

  const { error: uploadErr } = await supabaseAdmin.storage.from(bucket).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });

  if (uploadErr) {
    console.error('[voice/media] upload failed:', uploadErr.message);
    return NextResponse.json({ error: 'Could not store that file.' }, { status: 500 });
  }

  const title = String(form.get('title') ?? '').trim() || file.name;

  if (isDoc) {
    const { data, error } = await supabaseAdmin
      .from('va_documents')
      .insert({
        title: title.slice(0, 200),
        folder: String(form.get('folder') ?? 'Unfiled').slice(0, 120) || 'Unfiled',
        category: String(form.get('category') ?? 'other').slice(0, 40),
        // Documents keep a storage PATH, not a URL — the bucket is private and every read has to be
        // signed behind the session check.
        url: path,
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        notes: String(form.get('notes') ?? '').slice(0, 1000) || null,
      })
      .select('id, title')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ document: data });
  }

  const { data: publicUrl } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);

  const { data, error } = await supabaseAdmin
    .from('va_media')
    .insert({
      kind: kindOf(file.type || ''),
      title: title.slice(0, 200),
      alt_text: String(form.get('altText') ?? '').slice(0, 400) || null,
      url: publicUrl.publicUrl,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      tags: String(form.get('tags') ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10),
    })
    .select('id, title, url, kind')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ media: data });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const table = searchParams.get('table') === 'documents' ? 'va_documents' : 'va_media';
  if (!id) return NextResponse.json({ error: 'Which one?' }, { status: 400 });

  const { data: row } = await supabaseAdmin.from(table).select('storage_path').eq('id', id).maybeSingle();

  const { error } = await supabaseAdmin.from(table).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Remove the bytes too, best-effort. A failure here leaves an orphaned object costing a fraction of
  // a cent — worth far less than failing the delete the user asked for and already saw succeed.
  if (row?.storage_path) {
    void supabaseAdmin.storage
      .from(table === 'va_documents' ? DOCS_BUCKET : MEDIA_BUCKET)
      .remove([row.storage_path])
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
