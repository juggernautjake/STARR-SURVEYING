// app/api/dnd/sessions/[id]/media/route.ts — attach a map/image to a session (E6).
// DM uploads an image to the dnd-media bucket and records a dnd_media row
// (session_id + campaign_id, kind default 'map'). Feeds the console Maps tab.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

const BUCKET = 'dnd-media';
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB (maps can be large)
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getDndSession();
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data: sess } = await supabaseAdmin.from('dnd_sessions').select('id, campaign_id').eq('id', params.id).maybeSingle();
  const session = sess as { id: string; campaign_id: string } | null;
  if (!session) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  if ((await getCampaignRole(session.campaign_id)) !== 'dm') {
    return NextResponse.json({ error: 'Only the DM can attach maps.' }, { status: 403 });
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    const label = form.get('label');
    const kind = form.get('kind') === 'handout' ? 'handout' : 'map';
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    const ext = ALLOWED[file.type];
    if (!ext) return NextResponse.json({ error: 'Use a PNG, JPG, WEBP, or GIF image.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be 12 MB or smaller.' }, { status: 400 });

    await ensureStorageBucket(BUCKET, { public: true });
    const key = `sessions/${params.id}/${kind}/${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(key, bytes, { contentType: file.type, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

    const { data, error } = await supabaseAdmin
      .from('dnd_media')
      .insert({
        campaign_id: session.campaign_id,
        session_id: params.id,
        url,
        kind,
        label: label ? String(label) : null,
        uploaded_by: auth.userId,
      })
      .select('*')
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Saved image but could not record it.' }, { status: 500 });
    return NextResponse.json({ media: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed.' }, { status: 500 });
  }
}
