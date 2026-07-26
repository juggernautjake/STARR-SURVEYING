// app/api/dnd/campaigns/[id]/join-character/route.ts — a signed-in user attaches one of THEIR
// characters to the open-access demo campaign (request: "add characters to the demo campaign").
// Self-join is deliberately limited to the open demo (`DEMO_CAMPAIGN_ID`) — you can't push a
// character into someone else's private campaign. It upserts the caller's player membership + the
// roster link, and promotes a personal (campaign-less/private) character so it shows in the demo.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { DEMO_CAMPAIGN_ID } from '@/lib/dnd/constants';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // WHO MAY SELF-JOIN A CAMPAIGN (widened 2026-07-26 for S11: "a clear and easy way to take character into
  // and out of a campaign").
  //
  // This used to be `params.id !== DEMO_CAMPAIGN_ID → 403`, full stop, so the ONLY campaign a player could
  // add a character to was the open demo. That made "take it in" demo-only while "take it out" already
  // worked for any campaign — an asymmetry the owner asked to close.
  //
  // The rule it was protecting still holds, and is now stated directly instead of via the demo: **you
  // cannot push a character into a campaign you do not belong to.** A caller who is already a member (or
  // its DM) is not pushing anything into a stranger's game — they are adding their own character to their
  // own table, which is the whole request. The demo stays self-joinable BECAUSE it is open-access, which is
  // why membership is created below rather than required.
  const isDemo = params.id === DEMO_CAMPAIGN_ID;
  if (!isDemo) {
    const role = await getCampaignRole(params.id);
    if (role === null) {
      return NextResponse.json(
        { error: 'You are not in that campaign, so you cannot add a character to it. Ask its DM to invite you.' },
        { status: 403 },
      );
    }
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

  // 1. Ensure the caller is a member (as a player). For the open demo this is the self-join itself; for any
  //    other campaign the check above already proved membership, so this is a no-op there.
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
