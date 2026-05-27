// app/api/admin/my-files/route.ts
// Personal file storage for /admin/my-files. Every query is scoped to the
// caller's email — users only ever see/manage their own files.
//
// GET    /api/admin/my-files            — list my files (each with a signed download URL)
// POST   /api/admin/my-files            — upload { dataUrl, name, folder?, description? }
// DELETE /api/admin/my-files?id=<id>    — delete a file (storage object + row)
//
// Storage: seeds/295_user_files.sql (private `user-files` bucket + user_files table).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BUCKET = 'user-files';
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB per file
const VALID_FOLDERS = new Set(['field-data', 'drawings', 'photos', 'documents', 'voice-memos', 'other']);
const SIGNED_URL_TTL = 3600; // 1 hour

const SELECT_COLS = 'id, user_email, file_name, file_type, file_size, storage_path, folder, description, uploaded_at';

function sanitizeEmail(email: string): string {
  return email.replace(/[^\w.@-]+/g, '_');
}

// ─── GET ──────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('user_files')
    .select(SELECT_COLS)
    .eq('user_email', session.user.email)
    .order('uploaded_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach a short-lived signed URL for each file (private bucket).
  const files = await Promise.all((data ?? []).map(async (f: Record<string, unknown>) => {
    const storagePath = String(f.storage_path);
    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL);
    return { ...f, file_url: signed?.signedUrl ?? null };
  }));
  return NextResponse.json({ files });
}, { routeName: 'admin/my-files' });

// ─── POST — upload ──────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { dataUrl?: string; name?: string; folder?: string; description?: string };
  if (typeof body.dataUrl !== 'string' || !body.dataUrl.startsWith('data:')) {
    return NextResponse.json({ error: 'Expected a base64 data URL in "dataUrl".' }, { status: 400 });
  }
  const match = body.dataUrl.match(/^data:([^;]*);base64,(.*)$/s);
  if (!match) return NextResponse.json({ error: 'Only base64 data URLs are supported.' }, { status: 400 });

  const mime = match[1] || 'application/octet-stream';
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0) return NextResponse.json({ error: 'Empty file.' }, { status: 400 });
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: `File exceeds ${Math.round(MAX_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
  }

  const fileName = (body.name ?? 'file').trim() || 'file';
  const folder = body.folder && VALID_FOLDERS.has(body.folder) ? body.folder : 'other';

  await ensureStorageBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES });

  const objectId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const safeName = fileName.replace(/[^\w.\-]+/g, '_').slice(0, 120);
  const storagePath = `${sanitizeEmail(session.user.email)}/${objectId}-${safeName}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });

  const { data, error } = await supabaseAdmin
    .from('user_files')
    .insert({
      user_email: session.user.email,
      file_name: fileName,
      file_type: mime,
      file_size: bytes.length,
      storage_path: storagePath,
      folder,
      description: body.description ?? null,
    })
    .select(SELECT_COLS)
    .single();
  if (error) {
    // Roll back the orphaned object so storage doesn't drift from the table.
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ file: data }, { status: 201 });
}, { routeName: 'admin/my-files' });

// ─── DELETE ───────────────────────────────────────────────────────────────────

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });

  // Only the owner may delete; fetch first to get the storage path + verify ownership.
  const { data: row, error: fetchErr } = await supabaseAdmin
    .from('user_files')
    .select('id, storage_path, user_email')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'File not found' }, { status: 404 });
  if ((row as { user_email: string }).user_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await supabaseAdmin.storage.from(BUCKET).remove([(row as { storage_path: string }).storage_path]).catch(() => {});
  const { error } = await supabaseAdmin.from('user_files').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'admin/my-files' });
