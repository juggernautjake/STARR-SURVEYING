// app/api/dnd/characters/[id]/claim/route.ts — a player claims a character (Phase Q).
// A signed-in member of the character's campaign can claim it when the DM has marked it
// `claimable` OR it has no owner yet. Claiming makes it that player's own PRIVATE PC
// (owner set, is_npc=false, claimable cleared) so only they + the DM can open it.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('dnd_characters')
    .select('id, campaign_id, owner_user_id, claimable, name')
    .eq('id', params.id)
    .maybeSingle();
  const ch = data as { id: string; campaign_id: string | null; owner_user_id: string | null; claimable: boolean; name: string } | null;
  if (!ch) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!ch.campaign_id) return NextResponse.json({ error: 'This character is not in a campaign.' }, { status: 400 });

  // Must be a member of the campaign to claim one of its characters.
  const role = await getCampaignRole(ch.campaign_id);
  if (!role) return NextResponse.json({ error: 'Join the campaign before claiming a character.' }, { status: 403 });

  if (ch.owner_user_id === session.userId) return NextResponse.json({ error: 'You already own this character.' }, { status: 400 });
  // Claimable only if the DM permitted it, or nobody owns it yet.
  if (!ch.claimable && ch.owner_user_id) {
    return NextResponse.json({ error: 'This character is not available to claim.' }, { status: 403 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from('dnd_characters')
    .update({ owner_user_id: session.userId, is_npc: false, claimable: false, visibility: 'private', updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, name')
    .single();
  if (error || !updated) return NextResponse.json({ error: error?.message ?? 'Could not claim character.' }, { status: 500 });
  return NextResponse.json({ character: updated });
}
