// app/api/dnd/characters/[id]/media/route.ts — character art/token (Phase D1/D2).
// POST uploads an image (kind = art|token) to the dnd-media bucket, points the
// character's art_url/token_url at it, and records a dnd_media row (which powers
// the galleries in D4–D6). DELETE clears the pointer. Owner/DM only.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { getCharacterAccess } from '@/lib/dnd/characters';

const BUCKET = 'dnd-media';
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const COLUMN = { art: 'art_url', token: 'token_url' } as const;
type MediaKind = keyof typeof COLUMN;

function parseKind(v: unknown): MediaKind | null {
  return v === 'art' || v === 'token' ? v : null;
}

// Upload kinds that DON'T point a character column — the returned URL is stored elsewhere
// (e.g. an inventory item's `image`, saved inside the character's `data` blob). 'item' here.
function parseUploadKind(v: unknown): MediaKind | 'item' | null {
  return v === 'item' ? 'item' : parseKind(v);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const access = await getCharacterAccess(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.access.canWrite) return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });

  try {
    const form = await req.formData();
    const kind = parseUploadKind(form.get('kind'));
    if (!kind) return NextResponse.json({ error: "kind must be 'art', 'token', or 'item'." }, { status: 400 });
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    const ext = ALLOWED[file.type];
    if (!ext) return NextResponse.json({ error: 'Use a PNG, JPG, WEBP, or GIF image.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be 8 MB or smaller.' }, { status: 400 });

    await ensureStorageBucket(BUCKET, { public: true });
    const key = `characters/${params.id}/${kind}/${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(key, bytes, { contentType: file.type, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

    // 'item' images don't point a character column — the URL is stored on the inventory item
    // inside the character's `data` blob by the client. art/token update their column here.
    let campaignId: string | null = null;
    if (kind === 'art' || kind === 'token') {
      const { data: character, error: uErr } = await supabaseAdmin
        .from('dnd_characters')
        .update({ [COLUMN[kind]]: url, updated_at: new Date().toISOString() })
        .eq('id', params.id)
        .select('id, campaign_id, art_url, token_url')
        .single();
      if (uErr || !character) return NextResponse.json({ error: uErr?.message ?? 'Saved image but could not update character.' }, { status: 500 });
      campaignId = character.campaign_id;
    } else {
      const { data: character } = await supabaseAdmin.from('dnd_characters').select('campaign_id').eq('id', params.id).maybeSingle();
      campaignId = character?.campaign_id ?? null;
    }

    // Record a media-library row (best-effort; for art/token the column pointer is the source of truth).
    await supabaseAdmin.from('dnd_media').insert({
      campaign_id: campaignId,
      character_id: params.id,
      url,
      kind,
      uploaded_by: session.userId,
    });

    return NextResponse.json({ url, kind });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed.' }, { status: 500 });
  }
}

// PUT — point art_url/token_url at an image the character ALREADY has (from the gallery),
// no upload. Body: { kind: 'art'|'token', url }. Owner/DM only.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await getCharacterAccess(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.access.canWrite) return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });

  const { kind: rawKind, url } = await req.json().catch(() => ({}));
  const kind = parseKind(rawKind);
  if (!kind) return NextResponse.json({ error: "kind must be 'art' or 'token'." }, { status: 400 });
  if (!url || typeof url !== 'string') return NextResponse.json({ error: 'A url is required.' }, { status: 400 });

  const { data: character, error } = await supabaseAdmin
    .from('dnd_characters')
    .update({ [COLUMN[kind]]: url, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, art_url, token_url')
    .single();
  if (error || !character) return NextResponse.json({ error: error?.message ?? 'Could not update.' }, { status: 500 });
  return NextResponse.json({ ok: true, kind, url, character });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await getCharacterAccess(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.access.canWrite) return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });

  const kind = parseKind(req.nextUrl.searchParams.get('kind'));
  if (!kind) return NextResponse.json({ error: "kind must be 'art' or 'token'." }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('dnd_characters')
    .update({ [COLUMN[kind]]: null, updated_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
