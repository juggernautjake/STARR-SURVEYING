// app/api/dnd/media/route.ts — list media for the galleries (Phase D4–D6).
//   ?characterId=…  → that character's images (read-gated via character access)
//   ?campaignId=…   → the campaign's images (members only) — powers the campaign gallery
// Newest first. Art/token uploads (D1/D2) already write dnd_media rows.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { getCharacterAccess } from '@/lib/dnd/characters';

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
