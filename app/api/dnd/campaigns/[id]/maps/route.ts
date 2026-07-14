// app/api/dnd/campaigns/[id]/maps/route.ts — campaign maps for the Stardust map suite (Phase U).
//   GET            → list maps (DM: all; members: published only). ?mapId=… → one map WITH data.
//   POST multipart → upload a premade map image (DM). fields: file, name?
//   POST json      → create/update a built map (DM). body: { id?, name?, kind:'built', data }
//   PATCH          → rename / publish toggle (DM). body: { id, name?, published? }
//   DELETE ?id=…   → remove a map (DM); best-effort storage cleanup for image maps.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

const BUCKET = 'dnd-media';
const MAX_BYTES = 25 * 1024 * 1024;
const IMG_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
// Light columns for list views (omit the potentially-large `data` blob).
const LIST_COLS = 'id, campaign_id, name, kind, image_url, published, created_at, updated_at';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const role = await getCampaignRole(params.id);
  if (role === null) return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 403 });

  const mapId = req.nextUrl.searchParams.get('mapId');
  if (mapId) {
    // Full map (with data) — for the editor (DM) or the console (members, published only).
    const { data } = await supabaseAdmin.from('dnd_maps').select('*').eq('id', mapId).eq('campaign_id', params.id).maybeSingle();
    const map = data as { published: boolean } | null;
    if (!map) return NextResponse.json({ error: 'Map not found.' }, { status: 404 });
    if (role !== 'dm' && !map.published) return NextResponse.json({ error: 'That map is not published.' }, { status: 403 });
    return NextResponse.json({ map });
  }

  let query = supabaseAdmin.from('dnd_maps').select(LIST_COLS).eq('campaign_id', params.id).order('updated_at', { ascending: false });
  if (role !== 'dm') query = query.eq('published', true);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ maps: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if ((await getCampaignRole(params.id)) !== 'dm') return NextResponse.json({ error: 'Only the DM can add maps.' }, { status: 403 });

  const contentType = req.headers.get('content-type') || '';

  // ── Built map (JSON) — create or update the Studio's stardust-map ──
  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    const name = String(body.name ?? '').trim() || 'Untitled Map';
    const data = body.data ?? null;
    const now = new Date().toISOString();
    if (body.id) {
      const { data: updated, error } = await supabaseAdmin
        .from('dnd_maps')
        .update({ name, data, kind: 'built', updated_at: now })
        .eq('id', String(body.id))
        .eq('campaign_id', params.id)
        .select(LIST_COLS)
        .single();
      if (error || !updated) return NextResponse.json({ error: error?.message ?? 'Could not save map.' }, { status: 500 });
      return NextResponse.json({ map: updated });
    }
    const { data: created, error } = await supabaseAdmin
      .from('dnd_maps')
      .insert({ campaign_id: params.id, name, kind: 'built', data, created_by: session.userId })
      .select(LIST_COLS)
      .single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? 'Could not create map.' }, { status: 500 });
    return NextResponse.json({ map: created });
  }

  // ── Image map (multipart) — upload a premade map picture ──
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart upload or JSON body.' }, { status: 400 });
  }
  const file = form.get('file');
  const name = String(form.get('name') ?? '').trim();
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  const ext = IMG_EXT[file.type];
  if (!ext) return NextResponse.json({ error: 'Use a PNG, JPG, WEBP, or GIF image.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be 25 MB or smaller.' }, { status: 400 });

  await ensureStorageBucket(BUCKET, { public: true });
  const key = `campaign/${params.id}/maps/${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(key, bytes, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

  const { data, error } = await supabaseAdmin
    .from('dnd_maps')
    .insert({ campaign_id: params.id, name: name || file.name.replace(/\.[^.]+$/, '') || 'Uploaded Map', kind: 'image', image_url: url, storage_path: key, created_by: session.userId })
    .select(LIST_COLS)
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Upload failed.' }, { status: 500 });
  return NextResponse.json({ map: data });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if ((await getCampaignRole(params.id)) !== 'dm') return NextResponse.json({ error: 'Only the DM can edit maps.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = body.id ? String(body.id) : '';
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.published === 'boolean') patch.published = body.published;

  const { data, error } = await supabaseAdmin
    .from('dnd_maps')
    .update(patch)
    .eq('id', id)
    .eq('campaign_id', params.id)
    .select(LIST_COLS)
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Update failed.' }, { status: 500 });
  return NextResponse.json({ map: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if ((await getCampaignRole(params.id)) !== 'dm') return NextResponse.json({ error: 'Only the DM can delete maps.' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const { data: row } = await supabaseAdmin.from('dnd_maps').select('storage_path').eq('id', id).eq('campaign_id', params.id).maybeSingle();
  const { error } = await supabaseAdmin.from('dnd_maps').delete().eq('id', id).eq('campaign_id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const path = (row as { storage_path: string | null } | null)?.storage_path;
  if (path) {
    try { await supabaseAdmin.storage.from(BUCKET).remove([path]); } catch { /* orphan cleanup best-effort */ }
  }
  return NextResponse.json({ ok: true });
}
