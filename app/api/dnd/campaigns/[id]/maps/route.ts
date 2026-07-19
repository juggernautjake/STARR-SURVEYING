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
// Embedded images at/above this size (e.g. baked 3D-planet sprite-sheets, which run to megabytes)
// are pushed to Storage so they don't bloat the `data` jsonb row; smaller blobs stay inline.
const EMBED_MIN_BYTES = 40 * 1024;

function extForMime(mime: string): string {
  return IMG_EXT[mime] || (mime.startsWith('image/') ? mime.slice(6).split('+')[0].replace(/[^a-z0-9]/gi, '') || 'bin' : 'bin');
}

// Move one large `data:image/...` URL to the dnd-media bucket; return its public URL (or null to
// leave it inline). Keyed by content hash so re-saving the same sheet reuses the same object.
async function uploadDataUrl(campaignId: string, dataUrl: string): Promise<string | null> {
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  const bytes = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8');
  if (bytes.length < EMBED_MIN_BYTES || bytes.length > MAX_BYTES) return null;
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  const key = `campaign/${campaignId}/maps/embedded/${hash}.${extForMime(mime)}`;
  try {
    await ensureStorageBucket(BUCKET, { public: true });
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(key, bytes, { contentType: mime, upsert: true });
    if (error) return null;
    return supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  } catch {
    return null; // on any storage failure, keep the map savable with the inline blob
  }
}

// Recursively replace large embedded `data:image` URLs in a stardust-map with Storage URLs.
async function deinlineDataUrls(node: unknown, campaignId: string): Promise<unknown> {
  if (typeof node === 'string') {
    if (node.startsWith('data:image/')) return (await uploadDataUrl(campaignId, node)) || node;
    return node;
  }
  if (Array.isArray(node)) {
    const out: unknown[] = [];
    for (const v of node) out.push(await deinlineDataUrls(v, campaignId));
    return out;
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = await deinlineDataUrls(v, campaignId);
    return out;
  }
  return node;
}

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
  // Never let a stale list be cached — a just-deleted/renamed/published map must show correctly on reload.
  return NextResponse.json({ maps: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
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
    // Push megabyte-scale embedded sheets/images out to Storage before persisting the jsonb row.
    const data = body.data != null ? await deinlineDataUrls(body.data, params.id) : null;
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
  // Delete and RETURN the deleted rows, so we can tell a real deletion from a no-op (wrong id / already gone)
  // instead of always reporting success — a silent no-op is exactly what made a "deleted" map reappear on refresh.
  const { data: deleted, error } = await supabaseAdmin
    .from('dnd_maps')
    .delete()
    .eq('id', id)
    .eq('campaign_id', params.id)
    .select('id, storage_path');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deleted || deleted.length === 0) return NextResponse.json({ error: 'Map not found in this campaign (nothing was deleted).' }, { status: 404 });
  const path = (deleted[0] as { storage_path: string | null }).storage_path;
  if (path) {
    try { await supabaseAdmin.storage.from(BUCKET).remove([path]); } catch { /* orphan cleanup best-effort */ }
  }
  return NextResponse.json({ ok: true, deleted: deleted.length });
}
