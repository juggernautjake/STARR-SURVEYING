// app/api/dnd/encounters/[id]/initiative/route.ts — a player submits their own
// initiative roll for the encounter (§6 initiative broadcast). The DM broadcasts a
// "roll for initiative" prompt to the table; each player's sheet rolls (digital or
// manual, with their bonus applied) and POSTs the total here. We set the initiative
// on the entry that matches the caller's character — auth: the character's owner OR
// the campaign DM. The tracker reorders by initiative, so the order auto-fills.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data: enc } = await supabaseAdmin.from('dnd_encounters').select('id, session_id').eq('id', params.id).maybeSingle();
  if (!enc) return NextResponse.json({ error: 'Encounter not found.' }, { status: 404 });
  const { data: sess } = await supabaseAdmin.from('dnd_sessions').select('campaign_id').eq('id', (enc as { session_id: string }).session_id).maybeSingle();
  const campaignId = (sess as { campaign_id: string } | null)?.campaign_id ?? '';

  const body = await req.json().catch(() => ({}));
  const characterId = String(body.characterId ?? '').trim();
  const total = Math.round(Number(body.total));
  if (!characterId || Number.isNaN(total)) return NextResponse.json({ error: 'characterId and a numeric total are required.' }, { status: 400 });

  // Authorize: the caller owns this character, or is the campaign DM.
  const { data: ch } = await supabaseAdmin.from('dnd_characters').select('owner_user_id').eq('id', characterId).maybeSingle();
  const isOwner = (ch as { owner_user_id: string | null } | null)?.owner_user_id === session.userId;
  const isDM = campaignId ? (await getCampaignRole(campaignId)) === 'dm' : false;
  if (!isOwner && !isDM) return NextResponse.json({ error: 'Not your character.' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('dnd_initiative_entries')
    .update({ initiative: total })
    .eq('encounter_id', params.id)
    .eq('character_id', characterId)
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'You are not a combatant in this encounter yet.' }, { status: 404 });
  return NextResponse.json({ ok: true, total });
}
