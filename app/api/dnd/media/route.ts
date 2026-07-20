// app/api/dnd/media/route.ts — list media for the galleries (Phase D4–D6).
//   ?characterId=…  → that character's images (read-gated via character access)
//   ?campaignId=…   → the campaign's images (members only) — powers the campaign gallery
// Newest first. Art/token uploads (D1/D2) already write dnd_media rows.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { getCharacterAccess, requireCharacterWrite } from '@/lib/dnd/characters';
// NOTE: helpers live in lib/, never exported from this file — a route module may only export
// recognised handlers, and an extra export fails `next build` (not `tsc --noEmit`).
import { storageKeyFromUrl } from '@/lib/dnd/media-storage';

// Gallery visibility (Phase P): a `dm-only` tag on a media row means the DM keeps it
// private — players never see it. Everything else is player-visible on the campaign hub.
const DM_ONLY_TAG = 'dm-only';
const BUCKET = 'dnd-media';
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const KINDS = new Set(['art', 'token', 'map', 'handout', 'reveal', 'avatar']);

export async function GET(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const characterId = req.nextUrl.searchParams.get('characterId');
  const campaignId = req.nextUrl.searchParams.get('campaignId');
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  const kind = req.nextUrl.searchParams.get('kind');

  let query = supabaseAdmin.from('dnd_media').select('*').order('created_at', { ascending: false });

  if (characterId) {
    const access = await getCharacterAccess(characterId);
    if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
    query = query.eq('character_id', characterId);
  } else if (sessionId) {
    const { data: s } = await supabaseAdmin.from('dnd_sessions').select('campaign_id').eq('id', sessionId).maybeSingle();
    if (!s || (await getCampaignRole((s as { campaign_id: string }).campaign_id)) === null) {
      return NextResponse.json({ error: 'No access to that session.' }, { status: 403 });
    }
    query = query.eq('session_id', sessionId);
  } else if (campaignId) {
    if ((await getCampaignRole(campaignId)) === null) {
      return NextResponse.json({ error: 'Not a member of that campaign.' }, { status: 403 });
    }
    query = query.eq('campaign_id', campaignId);
  } else {
    return NextResponse.json({ error: 'characterId, sessionId, or campaignId is required.' }, { status: 400 });
  }

  if (kind) query = query.eq('kind', kind);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ media: data ?? [] });
}

// POST — DM uploads a campaign gallery image (map, setting art, item art, handout…),
// choosing whether it's player-visible or DM-only (Phase P). Multipart form:
//   campaignId, file, kind?, label?, private?("1"|"true")
export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const form = await req.formData();
    const campaignId = String(form.get('campaignId') ?? '');
    const file = form.get('file');
    const kindRaw = String(form.get('kind') ?? 'art');
    const label = String(form.get('label') ?? '').trim() || null;
    const isPrivate = ['1', 'true', 'yes'].includes(String(form.get('private') ?? '').toLowerCase());
    if (!campaignId) return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 });
    if ((await getCampaignRole(campaignId)) !== 'dm') {
      return NextResponse.json({ error: 'Only the DM can add campaign art.' }, { status: 403 });
    }
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    const ext = ALLOWED[file.type];
    if (!ext) return NextResponse.json({ error: 'Use a PNG, JPG, WEBP, or GIF image.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be 15 MB or smaller.' }, { status: 400 });
    const mediaKind = KINDS.has(kindRaw) ? kindRaw : 'art';

    await ensureStorageBucket(BUCKET, { public: true });
    const key = `campaign/${campaignId}/${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(key, bytes, { contentType: file.type, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

    const { data, error } = await supabaseAdmin
      .from('dnd_media')
      .insert({ campaign_id: campaignId, url, kind: mediaKind, label, uploaded_by: session.userId, gallery_tags: isPrivate ? [DM_ONLY_TAG] : [] })
      .select('*')
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Upload failed.' }, { status: 500 });
    return NextResponse.json({ media: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed.' }, { status: 500 });
  }
}

// PATCH — flip a campaign media item's player visibility (DM only). Body: { id, private }.
export async function PATCH(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { id, private: isPrivate } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const { data: row } = await supabaseAdmin.from('dnd_media').select('id, campaign_id, gallery_tags').eq('id', id).maybeSingle();
  const media = row as { id: string; campaign_id: string | null; gallery_tags: string[] | null } | null;
  if (!media || !media.campaign_id) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if ((await getCampaignRole(media.campaign_id)) !== 'dm') return NextResponse.json({ error: 'DM only.' }, { status: 403 });

  const tags = new Set((media.gallery_tags ?? []).filter((t) => t !== DM_ONLY_TAG));
  if (isPrivate) tags.add(DM_ONLY_TAG);
  const { data, error } = await supabaseAdmin.from('dnd_media').update({ gallery_tags: Array.from(tags) }).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ media: data });
}

// DELETE — remove a media item. Query: ?id=…
//
// Two ownerships, two rules:
//   • CHARACTER media (character_id set) → anyone who can WRITE that character, i.e. its
//     owner, its assigned player, or a DM of a campaign it's in.
//   • CAMPAIGN media (campaign_id, no character) → DM only, as before.
//
// This handler used to require a campaign_id and DM role unconditionally, so deleting from
// a CHARACTER gallery answered 404 ("not found", for a character image with no campaign) or
// 403 ("DM only", for the character's own player). The gallery only removes a tile when the
// response is ok, so the image neither deleted nor disappeared — it looked like a dead
// button (owner report 2026-07-19).
export async function DELETE(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const { data: row } = await supabaseAdmin.from('dnd_media').select('id, campaign_id, character_id, url').eq('id', id).maybeSingle();
  const media = row as { id: string; campaign_id: string | null; character_id: string | null; url: string | null } | null;
  if (!media) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  if (media.character_id) {
    const res = await requireCharacterWrite(media.character_id);
    if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  } else if (media.campaign_id) {
    if ((await getCampaignRole(media.campaign_id)) !== 'dm') return NextResponse.json({ error: 'DM only.' }, { status: 403 });
  } else {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from('dnd_media').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Drop the stored object too, so "delete" means gone rather than an orphaned file still
  // sitting in the bucket (and still reachable by URL). Best-effort: the row is already
  // gone, and a storage hiccup shouldn't turn a successful delete into an error.
  const key = storageKeyFromUrl(media.url);
  if (key) await supabaseAdmin.storage.from(BUCKET).remove([key]).catch(() => {});

  return NextResponse.json({ ok: true });
}
