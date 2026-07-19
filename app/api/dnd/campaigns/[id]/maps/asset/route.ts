// app/api/dnd/campaigns/[id]/maps/asset/route.ts — direct-to-Storage upload handshake for map images.
//
// Why this exists: a built map's JSON embeds its images as `data:` URLs. A whole map can run to tens of
// megabytes, but a serverless function's request body is capped (~4.5 MB on Vercel) — so POSTing the full map
// to `…/maps` was rejected with 413 BEFORE the handler (and its server-side de-inlining) could run. The Studio
// now de-inlines large images on the CLIENT first: for each big image it calls this endpoint to get a short-lived
// signed upload URL, PUTs the bytes STRAIGHT to Supabase Storage (which has no 4.5 MB limit), and swaps the
// `data:` URL for the returned public URL. The map JSON that finally hits `…/maps` is then small.
//
// POST body: { hash: string (content sha-256, hex), contentType: string }
//   → { publicUrl, existing } if the object already exists (client skips the upload), or
//   → { publicUrl, uploadUrl } — PUT the bytes to `uploadUrl` (Content-Type: <contentType>), then use publicUrl.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

const BUCKET = 'dnd-media';
const IMG_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

function extForMime(mime: string): string {
  return IMG_EXT[mime] || (mime.startsWith('image/') ? mime.slice(6).split('+')[0].replace(/[^a-z0-9]/gi, '') || 'bin' : 'bin');
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if ((await getCampaignRole(params.id)) !== 'dm') return NextResponse.json({ error: 'Only the DM can add map images.' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const hash = body && typeof body.hash === 'string' ? body.hash.replace(/[^a-f0-9]/gi, '').slice(0, 64) : '';
  const contentType = body && typeof body.contentType === 'string' ? body.contentType : '';
  if (!hash || hash.length < 16 || !contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'A content hash and an image content-type are required.' }, { status: 400 });
  }

  const ext = extForMime(contentType);
  const dir = `campaign/${params.id}/maps/embedded`;
  const name = `${hash}.${ext}`;
  const key = `${dir}/${name}`;

  await ensureStorageBucket(BUCKET, { public: true });
  const publicUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

  // Content-addressed: if this exact image was uploaded before, reuse it — the client skips the upload.
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
