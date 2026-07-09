// app/api/dnd/campaigns/[id]/characters/[characterId]/route.ts — remove a character from
// one campaign (Phase S). DELETE drops the roster link only; the character and its owner
// are untouched (it just leaves this table). Allowed for the campaign's DM or the
// character's owner. If the campaign being left was the character's "home" campaign_id,
// the home is repointed at another campaign it's still in (or cleared).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; characterId: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('dnd_characters')
    .select('id, owner_user_id, campaign_id')
    .eq('id', params.characterId)
    .maybeSingle();
  const ch = data as { id: string; owner_user_id: string | null; campaign_id: string | null } | null;
  if (!ch) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });

  const role = await getCampaignRole(params.id);
  const isOwner = ch.owner_user_id != null && ch.owner_user_id === session.userId;
  if (!isOwner && role !== 'dm') {
    return NextResponse.json({ error: 'Only the character’s owner or the DM can remove it from a campaign.' }, { status: 403 });
  }

  // Drop the roster link.
  try {
    await supabaseAdmin
      .from('dnd_campaign_characters')
      .delete()
      .eq('campaign_id', params.id)
      .eq('character_id', params.characterId);
  } catch {
    /* join table not present yet — the home-campaign repoint below still removes it */
  }

  // If this was the character's home campaign, repoint home at another campaign it's still
  // in (any remaining join row), else clear it so it no longer appears in this campaign.
  if (ch.campaign_id === params.id) {
    let nextHome: string | null = null;
    try {
      const { data: rest } = await supabaseAdmin
        .from('dnd_campaign_characters')
        .select('campaign_id')
        .eq('character_id', params.characterId)
        .limit(1);
      nextHome = ((rest ?? []) as { campaign_id: string }[])[0]?.campaign_id ?? null;
    } catch {
      /* ignore */
    }
    await supabaseAdmin
      .from('dnd_characters')
      .update({ campaign_id: nextHome, updated_at: new Date().toISOString() })
      .eq('id', params.characterId);
  }

  return NextResponse.json({ ok: true });
}
