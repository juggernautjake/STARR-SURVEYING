// app/api/dnd/media/route.ts — list media for the galleries (Phase D4–D6).
//   ?characterId=…  → that character's images (read-gated via character access)
//   ?campaignId=…   → the campaign's images (members only) — powers the campaign gallery
// Newest first. Art/token uploads (D1/D2) already write dnd_media rows.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { getCharacterAccess } from '@/lib/dnd/characters';

const BUCKET = 'dnd-media';

// DELETE ?id=<mediaId> — remove one gallery image (its dnd_media row + storage object).
// Gated by write access to the owning character. If the character's art_url/token_url
// pointed at it, that pointer is cleared too (the client also clears any variantArt).
export async function DELETE(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'A media id is required.' }, { status: 400 });

  const { data: row } = await supabaseAdmin.from('dnd_media').select('id, url, character_id').eq('id', id).maybeSingle();
  const media = row as { id: string; url: string; character_id: string | null } | null;
  if (!media) return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
  if (!media.character_id) return NextResponse.json({ error: 'Not a character image.' }, { status: 400 });

  const access = await getCharacterAccess(media.character_id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.access.canWrite) return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });

  // Best-effort: delete the storage object (key is everything after the bucket segment).
  const marker = `/${BUCKET}/`;
  const at = media.url.indexOf(marker);
  if (at !== -1) {
    const key = decodeURIComponent(media.url.slice(at + marker.length));
    await supabaseAdmin.storage.from(BUCKET).remove([key]).catch(() => {});
  }
  // Clear the character pointers if either referenced this image.
  const patch: Record<string, unknown> = {};
  const { data: ch } = await supabaseAdmin.from('dnd_characters').select('art_url, token_url').eq('id', media.character_id).maybeSingle();
  const cc = ch as { art_url: string | null; token_url: string | null } | null;
  if (cc?.art_url === media.url) patch.art_url = null;
  if (cc?.token_url === media.url) patch.token_url = null;
  if (Object.keys(patch).length) await supabaseAdmin.from('dnd_characters').update(patch).eq('id', media.character_id);

  const { error } = await supabaseAdmin.from('dnd_media').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

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
