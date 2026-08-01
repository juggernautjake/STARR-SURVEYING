// app/api/dnd/maps/asset/route.ts — direct-to-Storage upload handshake for a PERSONAL map's images.
//
// The standalone twin of `campaigns/[id]/maps/asset`. Same reason it exists: a built map embeds its
// images as `data:` URLs and can run to tens of megabytes, while a serverless request body is capped
// around 4.5 MB — so the Studio de-inlines large images on the client, PUTs the bytes straight to
// Storage through a short-lived signed URL, and sends only small JSON to the save endpoint.
//
// The only difference from the campaign version is who may ask: there is no DM to check, so a signed-in
// user may mint an upload URL under **their own** prefix and nowhere else. The key is built from
// `session.userId` server-side and never from the request, so a caller cannot aim it at another user's
// folder by editing the payload.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';

const BUCKET = 'dnd-media';
const IMG_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

function extForMime(mime: string): string {
  return IMG_EXT[mime] || (mime.startsWith('image/') ? mime.slice(6).split('+')[0].replace(/[^a-z0-9]/gi, '') || 'bin' : 'bin');
}

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const hash = body && typeof body.hash === 'string' ? body.hash.replace(/[^a-f0-9]/gi, '').slice(0, 64) : '';
  const contentType = body && typeof body.contentType === 'string' ? body.contentType : '';
  if (!hash || hash.length < 16 || !contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'A content hash and an image content-type are required.' }, { status: 400 });
  }

  const ext = extForMime(contentType);
  const dir = `user/${session.userId}/maps/embedded`;
  const name = `${hash}.${ext}`;
  const key = `${dir}/${name}`;

  await ensureStorageBucket(BUCKET, { public: true });
  const publicUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

  // Content-addressed: the same image saved twice reuses one object, so re-saving a map is cheap.
  try {
    const { data: found } = await supabaseAdmin.storage.from(BUCKET).list(dir, { search: name, limit: 1 });
    if (found && found.some((f) => f.name === name)) return NextResponse.json({ publicUrl, existing: true });
  } catch {
    /* listing is best-effort — fall through to minting a fresh upload URL */
  }

  const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(key);
  if (error || !signed) return NextResponse.json({ error: error?.message ?? 'Could not create an upload URL.' }, { status: 500 });
  return NextResponse.json({ publicUrl, uploadUrl: signed.signedUrl });
}
