// app/api/dnd/profile/avatar/route.ts — avatar upload for the signed-in dnd user (Phase B, B7).
// Stores the image in the public `dnd-media` bucket under avatars/ and saves the
// public URL to dnd_users.avatar_url.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';

const BUCKET = 'dnd-media';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
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
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    const ext = ALLOWED[file.type];
    if (!ext) return NextResponse.json({ error: 'Use a PNG, JPG, WEBP, or GIF image.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be 5 MB or smaller.' }, { status: 400 });

    await ensureStorageBucket(BUCKET, { public: true });

    const key = `avatars/${session.userId}/${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(key, bytes, { contentType: file.type, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key);
    const avatar_url = pub.publicUrl;

    const { data, error } = await supabaseAdmin
      .from('dnd_users')
      .update({ avatar_url })
      .eq('id', session.userId)
      .select('id, email, display_name, avatar_url')
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Saved image but could not update profile.' }, { status: 500 });
    }
    return NextResponse.json({ user: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed.' }, { status: 500 });
  }
}
