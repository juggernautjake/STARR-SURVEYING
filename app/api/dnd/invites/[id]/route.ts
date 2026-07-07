// app/api/dnd/invites/[id]/route.ts — revoke an invite (Phase B, B5a).
// Only a DM of the invite's campaign may revoke it. Revoking removes the invite
// record; it does not affect an already-registered player.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data: invite } = await supabaseAdmin
    .from('dnd_invites')
    .select('id, campaign_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });

  if ((await getCampaignRole(invite.campaign_id)) !== 'dm') {
    return NextResponse.json({ error: 'Only the DM of this campaign can revoke invites.' }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from('dnd_invites').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
