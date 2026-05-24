// app/api/admin/cad/images/route.ts
//
// Uploads a CAD survey image to the cad-images storage bucket and
// returns its public URL. Drawings then reference the URL instead of
// inlining the full base64 in the document JSONB, keeping image-heavy
// surveys small. Accepts a base64 data URL in JSON (the client already
// reads the file as a data URL for the preview).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin, CAD_IMAGES_BUCKET, ensureStorageBucket } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per image
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { dataUrl?: string; name?: string };
  const dataUrl = body.dataUrl;
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return NextResponse.json({ error: 'Expected a base64 data URL in "dataUrl".' }, { status: 400 });
  }

  // Parse "data:<mime>;base64,<payload>"
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) {
    return NextResponse.json({ error: 'Only base64 data URLs are supported.' }, { status: 400 });
  }
  const mime = match[1];
  const ext = EXT_BY_MIME[mime];
  if (!ext) {
    return NextResponse.json({ error: `Unsupported image type ${mime}.` }, { status: 415 });
  }
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: `Image exceeds ${Math.round(MAX_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
  }

  await ensureStorageBucket(CAD_IMAGES_BUCKET, { public: true, fileSizeLimit: MAX_BYTES });

  // Per-user folder + random object id; not enumerable.
  const safeUser = session.user.email.replace(/[^\w.@-]+/g, '_');
  const objectId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const storagePath = `${safeUser}/${objectId}.${ext}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(CAD_IMAGES_BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 502 });
  }

  const { data: pub } = supabaseAdmin.storage.from(CAD_IMAGES_BUCKET).getPublicUrl(storagePath);
  return NextResponse.json({ url: pub.publicUrl, storagePath }, { status: 201 });
}, { routeName: 'cad/images', exposeErrors: true });
