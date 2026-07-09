// app/api/dnd/campaigns/[id]/characters/route.ts — a character's campaign roster (Phase S).
// A character can live in MULTIPLE campaigns via the dnd_campaign_characters join table.
//   POST { characterId } → add an existing character to this campaign. Allowed for the
//     character's OWNER (bringing their own character in) or the campaign's DM (placing a
//     character into the campaign they run). Ownership never changes — this only adds a
//     roster link. The character's first campaign also becomes its "home" campaign_id.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const role = await getCampaignRole(params.id);
  if (role === null) return NextResponse.json({ error: 'Join the campaign before adding characters to it.' }, { status: 403 });

  let body: { characterId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const characterId = body.characterId ? String(body.characterId) : '';
  if (!characterId) return NextResponse.json({ error: 'characterId is required.' }, { status: 400 });

  const { data } = await supabaseAdmin
    .from('dnd_characters')
    .select('id, owner_user_id, campaign_id, name')
    .eq('id', characterId)
    .maybeSingle();
  const ch = data as { id: string; owner_user_id: string | null; campaign_id: string | null; name: string } | null;
  if (!ch) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });

  // The owner (bringing their own character) or the DM (running the campaign) may add it.
  const isOwner = ch.owner_user_id != null && ch.owner_user_id === session.userId;
  if (!isOwner && role !== 'dm') {
    return NextResponse.json({ error: 'Only the character’s owner or the DM can add it to a campaign.' }, { status: 403 });
  }

  // Add the roster link (idempotent). If the join table isn't migrated yet, fall back to
  // setting the legacy home campaign so the character still shows up.
  try {
    await supabaseAdmin
      .from('dnd_campaign_characters')
      .upsert({ campaign_id: params.id, character_id: characterId, added_by: session.userId }, { onConflict: 'campaign_id,character_id', ignoreDuplicates: true });
  } catch {
    /* join table not present — the home-campaign write below keeps it working */
  }
  // First campaign a character joins becomes its "home" (back-compat with the many
  // access routes that still read dnd_characters.campaign_id).
  if (!ch.campaign_id) {
    await supabaseAdmin.from('dnd_characters').update({ campaign_id: params.id, updated_at: new Date().toISOString() }).eq('id', characterId);
  }
  return NextResponse.json({ ok: true, characterId });
}
