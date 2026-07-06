// app/api/dnd/campaigns/[id]/soundboard/sounds/route.ts — upload a sound (Phase H6).
// DM-only multipart upload of an SFX/music clip into the dnd-audio bucket + a dnd_sounds
// row. Reuses the verified handout upload path (ensureStorageBucket + storage.upload).
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

const BUCKET = 'dnd-audio';
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if ((await getCampaignRole(params.id)) !== 'dm') return NextResponse.json({ error: 'Only the DM can add sounds.' }, { status: 403 });

  try {
    const form = await req.formData();
    const tabId = form.get('tabId');
    const label = form.get('label');
    const kind = form.get('kind') === 'music' ? 'music' : 'sfx';
    const loop = form.get('loop') === 'true';
    const file = form.get('file');
    if (!tabId) return NextResponse.json({ error: 'tabId is required.' }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    const ext = ALLOWED[file.type];
    if (!ext) return NextResponse.json({ error: 'Use an MP3, WAV, OGG, WEBM, M4A, or AAC file.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Audio must be 20 MB or smaller.' }, { status: 400 });

    // Confirm the tab belongs to this campaign.
    const { data: tab } = await supabaseAdmin.from('dnd_soundboard_tabs').select('id').eq('id', String(tabId)).eq('campaign_id', params.id).maybeSingle();
    if (!tab) return NextResponse.json({ error: 'Tab not found in this campaign.' }, { status: 404 });

    await ensureStorageBucket(BUCKET, { public: true });
    const key = `soundboard/${params.id}/${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(key, bytes, { contentType: file.type, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

    const { count } = await supabaseAdmin.from('dnd_sounds').select('id', { count: 'exact', head: true }).eq('tab_id', String(tabId));
    const { data, error } = await supabaseAdmin
      .from('dnd_sounds')
      .insert({ campaign_id: params.id, tab_id: String(tabId), label: label ? String(label).slice(0, 60) : file.name, url, kind, loop, sort_order: count ?? 0 })
      .select('id, tab_id, label, url, kind, volume, loop, sort_order')
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not save sound.' }, { status: 500 });
    return NextResponse.json({ sound: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed.' }, { status: 500 });
  }
}
