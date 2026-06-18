// app/api/admin/profile/avatar/route.ts
//
// Slice EP3 — profile-pic upload + removal.
//
//   POST   { dataUrl }   — upload a new avatar (base64 data URL)
//   DELETE               — clear the custom avatar; auth provider
//                          fallback (e.g. Google photo) takes over
//
// Storage: public `user-avatars` bucket (auto-created via
// ensureStorageBucket on first upload). The public URL is written
// to registered_users.avatar_url so every read picks it up.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BUCKET = 'user-avatars';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — avatars don't need more
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function sanitizeEmail(email: string): string {
  return email.replace(/[^\w.@-]+/g, '_');
}

// ─── POST ─────────────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { dataUrl?: string };
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
    return NextResponse.json({ error: `Avatar exceeds ${Math.round(MAX_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
  }

  await ensureStorageBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES });

  // The path includes a timestamp so a re-upload doesn't get
  // served from the CDN's cache of the previous avatar. We also
  // delete the old object after the new one lands so the bucket
  // doesn't grow without bound.
  const ext = mime.split('/')[1] ?? 'bin';
  const objectName = `${sanitizeEmail(session.user.email)}-${Date.now()}.${ext}`;
  const storagePath = `${sanitizeEmail(session.user.email)}/${objectName}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });

  const { data: publicData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = publicData?.publicUrl;
  if (!publicUrl) {
    // Roll back the storage object so we don't have a dangling upload.
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: 'Could not resolve the public URL for the new avatar.' }, { status: 500 });
  }

  // Look up the previous custom avatar so we can prune it after the
  // database row is updated. We only delete paths under THIS user's
  // folder in the avatars bucket so an auth-provider URL (e.g. a
  // Google photo) is left alone.
  const { data: prior } = await supabaseAdmin
    .from('registered_users')
    .select('avatar_url')
    .eq('email', session.user.email)
    .maybeSingle();
  const priorUrl: string | null = (prior as { avatar_url?: string | null } | null)?.avatar_url ?? null;

  const { error: dbErr } = await supabaseAdmin
    .from('registered_users')
    .update({ avatar_url: publicUrl })
    .eq('email', session.user.email);
  if (dbErr) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  if (priorUrl && priorUrl.includes(`/${BUCKET}/`)) {
    // priorUrl looks like ".../storage/v1/object/public/user-avatars/<sanitized>/<file>";
    // pull the path after the bucket name to drive the remove() call.
    const after = priorUrl.split(`/${BUCKET}/`)[1] ?? '';
    if (after) {
      await supabaseAdmin.storage.from(BUCKET).remove([after]).catch(() => {});
    }
  }

  return NextResponse.json({ avatar_url: publicUrl });
}, { routeName: 'admin/profile/avatar' });

// ─── DELETE ───────────────────────────────────────────────────────────────

export const DELETE = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: prior } = await supabaseAdmin
    .from('registered_users')
    .select('avatar_url')
    .eq('email', session.user.email)
    .maybeSingle();
  const priorUrl: string | null = (prior as { avatar_url?: string | null } | null)?.avatar_url ?? null;

  const { error } = await supabaseAdmin
    .from('registered_users')
    .update({ avatar_url: null })
    .eq('email', session.user.email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (priorUrl && priorUrl.includes(`/${BUCKET}/`)) {
    const after = priorUrl.split(`/${BUCKET}/`)[1] ?? '';
    if (after) {
      await supabaseAdmin.storage.from(BUCKET).remove([after]).catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}, { routeName: 'admin/profile/avatar' });
