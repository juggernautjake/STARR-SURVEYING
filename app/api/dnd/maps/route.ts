// app/api/dnd/maps/route.ts — a person's own maps, built and saved without a campaign.
//
// Owner request 2026-08-01: *"make sure that when a user clicks the new map button in the nav menu … they
// are actually directed to the map builder. User's should be able to build and save maps independently
// of a campaign."*
//
//   GET             → list my standalone maps. ?mapId=… → one map WITH data.
//   POST json       → create/update a built map. body: { id?, name?, kind:'built', data }
//   POST multipart  → upload a premade map image. fields: file, name?
//   PATCH           → rename. body: { id, name }
//   POST ?copyTo=…  → copy one of my maps into a campaign I DM. body: { id }
//   DELETE ?id=…    → remove a map; best-effort storage cleanup.
//
// ── THE AUTHORIZATION MODEL IS THE WHOLE DIFFERENCE ────────────────────────────────────────────────
//
// The campaign route asks `getCampaignRole()`. There is no campaign here, so the only fact that can
// answer "may you read this" is `owner_id = you`. Every query below therefore carries `.eq('owner_id',
// session.userId)` AND `.is('campaign_id', null)` — both, not either. Owner alone would let a person
// reach a campaign map they happened to create through the personal endpoint, which bypasses the
// campaign's own publish gate; `campaign_id IS NULL` alone would expose every orphan map in the table.
// The pair is what makes "standalone maps I own" a closed set.
//
// `published` is deliberately never written here. Publishing is a statement about who at a table can
// see a map, and a standalone map has no table. A map becomes visible to players by being copied into
// a campaign (`?copyTo=`), which re-enters the campaign's own DM check — so the permission to show
// players a map still lives in exactly one place.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { checkStorageQuota, recordStorage, releaseStorage } from '@/lib/dnd/storage-ledger';
import { enforceRateLimit } from '@/lib/dnd/rate-limit';
import { UPLOAD_LIMITS, tooLargeMessage } from '@/lib/dnd/upload-limits';

const BUCKET = 'dnd-media';
const MAX_BYTES = UPLOAD_LIMITS.LARGE_FILE;
const IMG_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const LIST_COLS = 'id, campaign_id, name, kind, image_url, published, created_at, updated_at';

/** Every read and write of a personal map is bounded by these two facts together. Factored out so a
 *  future handler cannot add a third query that remembers only one of them. */
function myMaps(userId: string) {
  return supabaseAdmin.from('dnd_maps').select(LIST_COLS).eq('owner_id', userId).is('campaign_id', null);
}

export async function GET(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const mapId = new URL(req.url).searchParams.get('mapId');
  if (mapId) {
    const { data, error } = await supabaseAdmin
      .from('dnd_maps')
      .select('*')
      .eq('id', mapId)
      .eq('owner_id', session.userId)
      .is('campaign_id', null)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Map not found.' }, { status: 404 });
    return NextResponse.json({ map: data }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const { data, error } = await myMaps(session.userId).order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ maps: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const limited = await enforceRateLimit('write', session.userId);
  if (limited) return limited;

  // ── Copy into a campaign ────────────────────────────────────────────────────────────────────────
  // The one path out of the personal library. It re-checks DM on the destination rather than trusting
  // that owning the source is enough — those are different permissions and conflating them would let
  // any member drop a map into any campaign they belong to.
  const copyTo = new URL(req.url).searchParams.get('copyTo');
  if (copyTo) {
    const body = await req.json().catch(() => null);
    const id = body && typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
    if ((await getCampaignRole(copyTo)) !== 'dm') {
      return NextResponse.json({ error: 'Only the DM of that campaign can add maps to it.' }, { status: 403 });
    }
    const { data: src, error: readErr } = await supabaseAdmin
      .from('dnd_maps')
      .select('name, kind, image_url, data')
      .eq('id', id)
      .eq('owner_id', session.userId)
      .is('campaign_id', null)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!src) return NextResponse.json({ error: 'Map not found.' }, { status: 404 });

    // A copy, not a move: the personal original stays. `storage_path` is deliberately NOT copied —
    // two rows claiming the same object would make deleting either one delete the other's image.
    const row = src as { name: string; kind: string; image_url: string | null; data: unknown };
    const { data: created, error } = await supabaseAdmin
      .from('dnd_maps')
      .insert({
        campaign_id: copyTo,
        owner_id: null,
        name: row.name,
        kind: row.kind,
        image_url: row.image_url,
        data: row.data,
        created_by: session.userId,
      })
      .select(LIST_COLS)
      .single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? 'Copy failed.' }, { status: 500 });
    return NextResponse.json({ map: created });
  }

  const contentType = req.headers.get('content-type') || '';

  // ── Built map (JSON) ────────────────────────────────────────────────────────────────────────────
  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    const name = String(body.name ?? '').trim() || 'Untitled Map';
    const now = new Date().toISOString();

    if (body.id) {
      const { data: updated, error } = await supabaseAdmin
        .from('dnd_maps')
        .update({ name, data: body.data ?? null, kind: 'built', updated_at: now })
        .eq('id', String(body.id))
        .eq('owner_id', session.userId)
        .is('campaign_id', null)
        .select(LIST_COLS)
        .single();
      if (error || !updated) return NextResponse.json({ error: error?.message ?? 'Could not save map.' }, { status: 500 });
      return NextResponse.json({ map: updated });
    }

    const { data: created, error } = await supabaseAdmin
      .from('dnd_maps')
      .insert({ campaign_id: null, owner_id: session.userId, name, kind: 'built', data: body.data ?? null, created_by: session.userId })
      .select(LIST_COLS)
      .single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? 'Could not create map.' }, { status: 500 });
    return NextResponse.json({ map: created });
  }

  // ── Image map (multipart) ───────────────────────────────────────────────────────────────────────
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
  if (file.size > MAX_BYTES) return NextResponse.json({ error: tooLargeMessage(MAX_BYTES, 'Image') }, { status: 400 });

  const overQuota = await checkStorageQuota(session.userId, file.size);
  if (overQuota) return NextResponse.json({ error: overQuota }, { status: 413 });

  await ensureStorageBucket(BUCKET, { public: true });
  const key = `user/${session.userId}/maps/${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(key, bytes, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  await recordStorage({ userId: session.userId, bucket: BUCKET, objectPath: key, bytes: file.size });
  const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

  const { data, error } = await supabaseAdmin
    .from('dnd_maps')
    .insert({
      campaign_id: null,
      owner_id: session.userId,
      name: name || file.name.replace(/\.[^.]+$/, '') || 'Uploaded Map',
      kind: 'image',
      image_url: url,
      storage_path: key,
      created_by: session.userId,
    })
    .select(LIST_COLS)
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Upload failed.' }, { status: 500 });
  return NextResponse.json({ map: data });
}

export async function PATCH(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = body.id ? String(body.id) : '';
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('dnd_maps')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', session.userId)
    .is('campaign_id', null)
    .select(LIST_COLS)
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Update failed.' }, { status: 500 });
  return NextResponse.json({ map: data });
}

export async function DELETE(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let id = new URL(req.url).searchParams.get('id');
  if (!id) {
    const b = await req.json().catch(() => null);
    if (b && typeof b.id === 'string') id = b.id;
  }
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  // Return the deleted rows so a no-op (wrong id, someone else's map) reports 404 rather than success —
  // the campaign route learned this the hard way when "deleted" maps reappeared on refresh.
  const { data: deleted, error } = await supabaseAdmin
    .from('dnd_maps')
    .delete()
    .eq('id', id)
    .eq('owner_id', session.userId)
    .is('campaign_id', null)
    .select('id, storage_path');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deleted || deleted.length === 0) return NextResponse.json({ error: 'Map not found (nothing was deleted).' }, { status: 404 });

  const path = (deleted[0] as { storage_path: string | null }).storage_path;
  if (path) {
    try { await supabaseAdmin.storage.from(BUCKET).remove([path]); } catch { /* orphan cleanup best-effort */ }
  }
  await releaseStorage(path ? [path] : []);
  return NextResponse.json({ ok: true, deleted: deleted.length });
}
