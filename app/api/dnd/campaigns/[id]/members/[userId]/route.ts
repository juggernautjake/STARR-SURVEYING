// app/api/dnd/campaigns/[id]/members/[userId]/route.ts — the DM removes a player (Phase Q).
// Drops the membership; their characters stay in the campaign (the DM can reassign or make
// them claimable). The DM can't remove themselves this way.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; userId: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if ((await getCampaignRole(params.id)) !== 'dm') return NextResponse.json({ error: 'Only the DM can remove players.' }, { status: 403 });
  if (params.userId === session.userId) return NextResponse.json({ error: 'You cannot remove yourself.' }, { status: 400 });

  const { data: mem } = await supabaseAdmin
    .from('dnd_campaign_members').select('role').eq('campaign_id', params.id).eq('user_id', params.userId).maybeSingle();
  if (!mem) return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 404 });
  if ((mem as { role: string }).role === 'dm') return NextResponse.json({ error: 'You cannot remove the DM.' }, { status: 400 });

  const { error } = await supabaseAdmin.from('dnd_campaign_members').delete().eq('campaign_id', params.id).eq('user_id', params.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
