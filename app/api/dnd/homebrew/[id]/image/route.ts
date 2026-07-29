// app/api/dnd/homebrew/[id]/image/route.ts — artwork for a piece of custom content (P6-11).
//
// The owner's case, verbatim: *"Say a user creates some kind of creature and has artwork they want to use,
// they would build the creature giving it stats and feats and abilities and actions and stuff, and a
// description, and they would also upload the image of the creature. Then there would be a complete
// statblock for that creature and their image would be shown too."*
//
// POST replaces the image; DELETE removes it. Creator-only, through the SAME `canWriteHomebrew` the rest of
// the Studio uses — a piece being publicly readable never makes it publicly editable.
import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/dnd/rate-limit';
import { UPLOAD_LIMITS, tooLargeMessage } from '@/lib/dnd/upload-limits';
import crypto from 'node:crypto';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { rowToHomebrew, canWriteHomebrew, type HomebrewRow, type StoredHomebrew } from '@/lib/dnd/homebrew/store';
import { storageKeyFromUrl } from '@/lib/dnd/media-storage';

const BUCKET = 'dnd-media';
// 8 MB, matching character art (`characters/[id]/media`). Content art is shown at the same sizes on the
// same kinds of card, so a different ceiling here would be an arbitrary difference to explain later.
const MAX_BYTES = UPLOAD_LIMITS.IMAGE;
const ALLOWED: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
};

/** Load a piece with its author resolved. Returns the ROW alongside it, because both handlers need the
 *  previous `image_url` to clean up storage and the model omits it when absent.
 *
 *  Note what this does NOT do: it does not check authorization. An earlier version did, and
 *  `delete-route-authorization.test.ts` failed — correctly. That guard scans each DELETE handler's own body
 *  for a real permission check, and a gate hidden inside a helper is invisible to it. The guard is right
 *  about the underlying property too: on a destructive handler the authorization should be readable at the
 *  point of use, not one indirection away. Two duplicated lines is the correct price. */
async function loadPiece(id: string): Promise<{ row: HomebrewRow; piece: StoredHomebrew } | null> {
  const { data } = await supabaseAdmin.from('dnd_homebrew').select('*').eq('id', id).maybeSingle();
  const row = data as HomebrewRow | null;
  if (!row) return null;
  const { data: u } = await supabaseAdmin.from('dnd_users').select('display_name').eq('id', row.owner_user_id).maybeSingle();
  const piece = rowToHomebrew(row, (u as { display_name?: string } | null)?.display_name ?? '');
  return piece ? { row, piece } : null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  // Write throttle (P2-1b): uploads cost storage, so an unthrottled one is the clearest abuse vector
  // in the API. Fails OPEN if the limiter table is missing — see lib/dnd/rate-limit.ts.
  const limited = await enforceRateLimit('write', session.userId);
  if (limited) return limited;

  const found = await loadPiece(params.id);
  if (!found) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!canWriteHomebrew(found.piece, { userId: session.userId })) {
    return NextResponse.json({ error: 'This is not yours to edit.' }, { status: 403 });
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No image provided.' }, { status: 400 });
    const ext = ALLOWED[file.type];
    if (!ext) return NextResponse.json({ error: 'Use a PNG, JPG, WEBP, or GIF image.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: tooLargeMessage(MAX_BYTES, 'Image') }, { status: 400 });

    await ensureStorageBucket(BUCKET, { public: true });

    const key = `homebrew/${params.id}/${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(key, bytes, { contentType: file.type, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key);
    const image_url = pub.publicUrl;

    const { error } = await supabaseAdmin
      .from('dnd_homebrew')
      .update({ image_url, updated_at: new Date().toISOString() })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // The PREVIOUS file is removed only after the row points at the new one. Doing it the other way round
    // means a failed update leaves the piece referencing an object that no longer exists — a broken image
    // with no way back. An orphaned object costs storage; a broken reference costs the artwork.
    const old = found.row.image_url;
    if (old) {
      const oldKey = storageKeyFromUrl(old, BUCKET);
      if (oldKey && oldKey !== key) await supabaseAdmin.storage.from(BUCKET).remove([oldKey]).then(() => {}, () => {});
    }

    return NextResponse.json({ imageUrl: image_url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed.' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const found = await loadPiece(params.id);
  if (!found) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!canWriteHomebrew(found.piece, { userId: session.userId })) {
    return NextResponse.json({ error: 'This is not yours to edit.' }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from('dnd_homebrew')
    .update({ image_url: null, updated_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const old = found.row.image_url;
  if (old) {
    const oldKey = storageKeyFromUrl(old, BUCKET);
    if (oldKey) await supabaseAdmin.storage.from(BUCKET).remove([oldKey]).then(() => {}, () => {});
  }
  return NextResponse.json({ ok: true });
}
