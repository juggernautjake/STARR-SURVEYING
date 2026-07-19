// app/api/dnd/characters/route.ts — list characters (Phase C4).
//   ?campaignId=…  → that campaign's characters IF the caller is its DM (all),
//                     otherwise only the caller's own characters in that campaign.
//   (no campaignId) → every character the caller owns.
// Returns lightweight rows (no heavy `data`) for roster/list views.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import { streamerCharacter } from '@/app/dnd/_sheet/data/streamer';
import { donataDime } from '@/app/dnd/_sheet/data/donata';
import { jack } from '@/app/dnd/_sheet/data/jack';

const LIST_COLS = 'id, campaign_id, owner_user_id, name, sheet_type, token_url, art_url, visibility, is_npc, is_library, updated_at';

export async function GET(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const campaignId = req.nextUrl.searchParams.get('campaignId');
  const npcOnly = req.nextUrl.searchParams.get('npc');
  const libraryOnly = req.nextUrl.searchParams.get('library');

  let query = supabaseAdmin.from('dnd_characters').select(LIST_COLS).order('updated_at', { ascending: false });

  if (campaignId) {
    const isDM = (await getCampaignRole(campaignId)) === 'dm';
    query = query.eq('campaign_id', campaignId);
    // A DM sees all characters in their campaign; a player sees only their own.
    if (!isDM) query = query.eq('owner_user_id', session.userId);
  } else {
    query = query.eq('owner_user_id', session.userId);
  }
  if (npcOnly) query = query.eq('is_npc', true);
  if (libraryOnly) query = query.eq('is_library', true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ characters: data ?? [] });
}

// POST — the DM creates a character shell in their campaign and (optionally) assigns
// it to a player (Phase E7). Body: { campaignId, name, sheetType?, isNpc?, ownerUserId? }.
export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const { campaignId, name, sheetType, isNpc, ownerUserId } = await req.json();
    if (!campaignId) return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 });
    if (!name || !String(name).trim()) return NextResponse.json({ error: 'Character name is required.' }, { status: 400 });
    if ((await getCampaignRole(String(campaignId))) !== 'dm') {
      return NextResponse.json({ error: 'Only the DM can create characters.' }, { status: 403 });
    }

    // If assigning to a player, that user must be a member of the campaign.
    if (ownerUserId) {
      const { data: mem } = await supabaseAdmin
        .from('dnd_campaign_members')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('user_id', ownerUserId)
        .maybeSingle();
      if (!mem) return NextResponse.json({ error: 'Owner must be a member of this campaign.' }, { status: 400 });
    }

    const cleanName = String(name).trim();
    const sheet_type = sheetType ? String(sheetType) : 'default';
    // NPCs are DM-owned and hidden by default; PCs are campaign-visible. New sheets
    // are seeded with a real character so they render on the engine (G1) — the
    // `streamer` type comes pre-statted (placeholder streamer build); others blank.
    const seedData =
      sheet_type === 'streamer' ? streamerCharacter(cleanName)
      : sheet_type === 'donata' ? donataDime(cleanName)
      : sheet_type === 'jack' ? jack(cleanName)
      : blankCharacter(cleanName);
    const { data, error } = await supabaseAdmin
      .from('dnd_characters')
      .insert({
        campaign_id: campaignId,
        name: cleanName,
        sheet_type,
        is_npc: !!isNpc,
        owner_user_id: isNpc ? session.userId : (ownerUserId ?? null),
        // Player characters are PUBLIC by default (owner 2026-07-18) so everyone at the table can view them; the
        // owner opts into private via the sheet's visibility toggle. NPCs stay private (DM tools).
        visibility: isNpc ? 'private' : 'public',
        data: seedData,
      })
      .select(LIST_COLS)
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not create character.' }, { status: 500 });
    // Add the campaign roster link (Phase S multi-campaign). Best-effort: if the join
    // table isn't migrated yet the home campaign_id above still lists it in the campaign.
    try {
      await supabaseAdmin
        .from('dnd_campaign_characters')
        .upsert({ campaign_id: campaignId, character_id: (data as { id: string }).id, added_by: session.userId }, { onConflict: 'campaign_id,character_id', ignoreDuplicates: true });
    } catch {
      /* join table not present yet */
    }
    return NextResponse.json({ character: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Create failed.' }, { status: 500 });
  }
}
