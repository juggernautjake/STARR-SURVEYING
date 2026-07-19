// app/api/dnd/campaigns/[id]/characters/[characterId]/promote/route.ts — the creator opts to REPLACE their
// original with the in-campaign version (owner 2026-07-18: "if players want to, they can update the original
// character sheet to actually be replaced by an in-campaign version — make this an option").
//
// POST — the character's CREATOR (only they own the original) copies this campaign's override over
// dnd_characters.data, then clears the override so the campaign and original are back in sync. No override →
// nothing to promote. Not the DM and not another player: only the creator may overwrite their own original.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { promoteOverrideToOriginal } from '@/lib/dnd/campaign-character-copy';
import { canPromoteCampaignToOriginal } from '@/lib/dnd/character-visibility';

export async function POST(_req: NextRequest, { params }: { params: { id: string; characterId: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // Only the creator of the original may replace it (owns dnd_characters.owner_user_id).
  const { data: character } = await supabaseAdmin
    .from('dnd_characters')
    .select('id, owner_user_id')
    .eq('id', params.characterId)
    .maybeSingle();
  if (!character) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });

  const isCreator = character.owner_user_id === session.userId;
  if (!canPromoteCampaignToOriginal({ isCreator, isDM: false, isAssignedPlayer: false, isCampaignMember: false })) {
    return NextResponse.json({ error: 'Only the character’s creator can replace the original with the campaign version.' }, { status: 403 });
  }

  const { data: roster } = await supabaseAdmin
    .from('dnd_campaign_characters')
    .select('id, data_override')
    .eq('campaign_id', params.id)
    .eq('character_id', params.characterId)
    .maybeSingle();
  if (!roster) return NextResponse.json({ error: 'That character is not in this campaign.' }, { status: 404 });

  const promoted = promoteOverrideToOriginal((roster as { data_override?: unknown }).data_override ?? null);
  if (promoted == null) {
    return NextResponse.json({ error: 'The campaign has no changes to promote yet.' }, { status: 400 });
  }

  // Write the campaign copy over the original, then clear the override so the two are back in sync.
  const { error: writeErr } = await supabaseAdmin
    .from('dnd_characters')
    .update({ data: promoted })
    .eq('id', params.characterId);
  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });

  await supabaseAdmin
    .from('dnd_campaign_characters')
    .update({ data_override: null, override_updated_at: null, override_updated_by: null })
    .eq('campaign_id', params.id)
    .eq('character_id', params.characterId);

  return NextResponse.json({ ok: true, promoted: true });
}
