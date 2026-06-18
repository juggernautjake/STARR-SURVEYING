// app/api/admin/profile/images/route.ts
//
// Slice EP4 — CRUD for the per-employee "About me" image
// gallery. Reuses the same data-URL upload pattern as the
// EP3 avatar endpoint; stores objects in a separate public
// `user-gallery` bucket so the avatar code path stays clean.
//
//   GET    ?email=<email>     — list a user's gallery (self OR admin)
//   POST   { dataUrl, caption?, sort_order? }
//                              — upload + create the row
//   DELETE ?id=<id>            — remove (owner OR admin)
//
// Storage: seeds/312_employee_images.sql.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BUCKET = 'user-gallery';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per image
const MAX_CAPTION_LEN = 280;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const SELECT_COLS = 'id, user_email, image_url, storage_path, caption, sort_order, created_at';

function sanitizeEmail(email: string): string {
  return email.replace(/[^\w.@-]+/g, '_');
}

function normalizeCaption(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const t = input.trim();
  if (t === '') return null;
  return t.slice(0, MAX_CAPTION_LEN);
}

// ─── GET ──────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email') || session.user.email;

  if (!isAdmin(session.user.roles) && email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('employee_images')
    .select(SELECT_COLS)
    .eq('user_email', email)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ images: data ?? [] });
}, { routeName: 'admin/profile/images' });

// ─── POST ─────────────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { dataUrl?: string; caption?: string; sort_order?: number };
  if (typeof body.dataUrl !== 'string' || !body.dataUrl.startsWith('data:')) {
    return NextResponse.json({ error: 'Expected a base64 data URL in "dataUrl".' }, { status: 400 });
  }
  const match = body.dataUrl.match(/^data:([^;]*);base64,(.*)$/s);
  if (!match) return NextResponse.json({ error: 'Only base64 data URLs are supported.' }, { status: 400 });

  const mime = match[1] || 'application/octet-stream';
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json({ error: `Unsupported image type "${mime}".` }, { status: 415 });
  }
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0) return NextResponse.json({ error: 'Empty file.' }, { status: 400 });
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: `Image exceeds ${Math.round(MAX_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
  }

  await ensureStorageBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES });

  const ext = mime.split('/')[1] ?? 'bin';
  const objectId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storagePath = `${sanitizeEmail(session.user.email)}/${objectId}.${ext}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });

  const { data: publicData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = publicData?.publicUrl;
  if (!publicUrl) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: 'Could not resolve the public URL for the new image.' }, { status: 500 });
  }

  // Default sort_order = (current max for this user) + 1, so the
  // new image lands at the bottom of the grid. The client can
  // pass an explicit sort_order to drop it elsewhere.
  let sortOrder = typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
    ? Math.floor(body.sort_order)
    : NaN;
  if (!Number.isFinite(sortOrder)) {
    const { data: tail } = await supabaseAdmin
      .from('employee_images')
      .select('sort_order')
      .eq('user_email', session.user.email)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const topSort = (tail as { sort_order?: number } | null)?.sort_order ?? 0;
    sortOrder = topSort + 1;
  }

  const { data, error } = await supabaseAdmin
    .from('employee_images')
    .insert({
      user_email: session.user.email,
      image_url: publicUrl,
      storage_path: storagePath,
      caption: normalizeCaption(body.caption),
      sort_order: sortOrder,
    })
    .select(SELECT_COLS)
    .single();
  if (error) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ image: data }, { status: 201 });
}, { routeName: 'admin/profile/images' });

// ─── DELETE ───────────────────────────────────────────────────────────────

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { data: row, error: fetchErr } = await supabaseAdmin
    .from('employee_images')
    .select('id, user_email, storage_path')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  const ownerEmail = (row as { user_email: string }).user_email;
  if (ownerEmail !== session.user.email && !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await supabaseAdmin.storage.from(BUCKET).remove([(row as { storage_path: string }).storage_path]).catch(() => {});
  const { error } = await supabaseAdmin.from('employee_images').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'admin/profile/images' });
