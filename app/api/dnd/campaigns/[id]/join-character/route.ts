// app/api/dnd/campaigns/[id]/join-character/route.ts — a signed-in user attaches one of THEIR
// characters to the open-access demo campaign (request: "add characters to the demo campaign").
// Self-join is deliberately limited to the open demo (`DEMO_CAMPAIGN_ID`) — you can't push a
// character into someone else's private campaign. It upserts the caller's player membership + the
// roster link, and promotes a personal (campaign-less/private) character so it shows in the demo.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { DEMO_CAMPAIGN_ID } from '@/lib/dnd/constants';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (params.id !== DEMO_CAMPAIGN_ID) {
    return NextResponse.json({ error: 'Only the open demo campaign can be self-joined.' }, { status: 403 });
  }

  const { characterId } = await req.json().catch(() => ({}));
  const charId = String(characterId ?? '').trim();
  if (!charId) return NextResponse.json({ error: 'A characterId is required.' }, { status: 400 });

  const { data: ch } = await supabaseAdmin
    .from('dnd_characters')
    .select('id, owner_user_id, campaign_id, visibility')
    .eq('id', charId)
    .maybeSingle();
  if (!ch) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (ch.owner_user_id !== session.userId) {
    return NextResponse.json({ error: 'You can only add your own character.' }, { status: 403 });
  }

  // 1. Ensure the caller is a member of the demo (as a player).
  const { data: mem } = await supabaseAdmin
    .from('dnd_campaign_members')
    .select('role')
    .eq('campaign_id', params.id)
    .eq('user_id', session.userId)
    .maybeSingle();
  if (!mem) {
    await supabaseAdmin.from('dnd_campaign_members').insert({ campaign_id: params.id, user_id: session.userId, role: 'player' });
  }

  // 2. Roster link (multi-campaign source of truth).
  try {
    await supabaseAdmin
      .from('dnd_campaign_characters')
      .upsert({ campaign_id: params.id, character_id: charId, added_by: session.userId }, { onConflict: 'campaign_id,character_id', ignoreDuplicates: true });
  } catch {
    /* join table not present yet */
  }

  // 3. Give the character a home campaign if it had none. We deliberately DO NOT touch visibility here anymore:
  //    characters are public by default (owner 2026-07-18), and a character the owner has deliberately made
  //    private stays private on join — the DM still always sees it; only fellow players are gated. (Was:
  //    force-promoting private → campaign, which overrode the owner's privacy choice.)
  const patch: Record<string, unknown> = {};
  if (!ch.campaign_id) patch.campaign_id = params.id;
  if (Object.keys(patch).length) await supabaseAdmin.from('dnd_characters').update(patch).eq('id', charId);

  return NextResponse.json({ ok: true, campaignId: params.id, characterId: charId });
}
