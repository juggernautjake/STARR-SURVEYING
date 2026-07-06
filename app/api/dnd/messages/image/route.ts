// app/api/dnd/messages/image/route.ts — upload a chat image (Phase F5).
// Any campaign member may upload; returns the public URL, which the client then
// sends as a message's image_url (the message row is the record — no dnd_media
// row needed here). Kept small since chat images are ephemeral attachments.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

const BUCKET = 'dnd-media';
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const form = await req.formData();
    const campaignId = form.get('campaignId');
    const file = form.get('file');
    if (!campaignId) return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 });
    if ((await getCampaignRole(String(campaignId))) === null) {
      return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 403 });
    }
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    const ext = ALLOWED[file.type];
    if (!ext) return NextResponse.json({ error: 'Use a PNG, JPG, WEBP, or GIF image.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be 8 MB or smaller.' }, { status: 400 });

    await ensureStorageBucket(BUCKET, { public: true });
    const key = `chat/${campaignId}/${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(key, bytes, { contentType: file.type, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed.' }, { status: 500 });
  }
}
