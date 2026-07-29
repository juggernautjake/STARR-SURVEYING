// app/api/dnd/handouts/route.ts — the handout library (Phase H3). Campaign-scoped
// reusable images/maps that persist across sessions and feed reveals (H1/H2) + the
// DM hotbar (H4). POST uploads a handout (DM); GET lists the campaign's handouts.
import { NextRequest, NextResponse } from 'next/server';
import { checkStorageQuota, recordStorage } from '@/lib/dnd/storage-ledger';
import { enforceRateLimit } from '@/lib/dnd/rate-limit';
import { UPLOAD_LIMITS, tooLargeMessage } from '@/lib/dnd/upload-limits';
import crypto from 'node:crypto';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

const BUCKET = 'dnd-media';
const MAX_BYTES = UPLOAD_LIMITS.HANDOUT;
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  // Write throttle (P2-1b): uploads cost storage, so an unthrottled one is the clearest abuse vector
  // in the API. Fails OPEN if the limiter table is missing — see lib/dnd/rate-limit.ts.
  const limited = await enforceRateLimit('write', session.userId);
  if (limited) return limited;

  try {
    const form = await req.formData();
    const campaignId = form.get('campaignId');
    const label = form.get('label');
    const file = form.get('file');
    if (!campaignId) return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 });
    if ((await getCampaignRole(String(campaignId))) !== 'dm') return NextResponse.json({ error: 'Only the DM can add handouts.' }, { status: 403 });
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    const ext = ALLOWED[file.type];
    if (!ext) return NextResponse.json({ error: 'Use a PNG, JPG, WEBP, or GIF image.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: tooLargeMessage(MAX_BYTES, 'Image') }, { status: 400 });

    // Total-bytes ceiling (P2-7): the per-file limit above caps how BIG one upload is; this caps how
    // many. The incoming size is included, so the refusal lands before the bytes are stored.
    const overQuota = await checkStorageQuota(session.userId, file.size);
    if (overQuota) return NextResponse.json({ error: overQuota }, { status: 413 });

    await ensureStorageBucket(BUCKET, { public: true });
    const key = `handouts/${campaignId}/${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(key, bytes, { contentType: file.type, upsert: true });
    await recordStorage({ userId: session.userId, bucket: BUCKET, objectPath: key, bytes: file.size });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

    const { data, error } = await supabaseAdmin
      .from('dnd_handouts')
      .insert({ campaign_id: campaignId, url, label: label ? String(label) : null, uploaded_by: session.userId })
      .select('id, url, label, created_at')
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not save handout.' }, { status: 500 });
    return NextResponse.json({ handout: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const campaignId = req.nextUrl.searchParams.get('campaignId');
  if (!campaignId) return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 });
  if ((await getCampaignRole(campaignId)) === null) return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('dnd_handouts')
    .select('id, url, label, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ handouts: data ?? [] });
}
