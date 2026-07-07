// app/api/dnd/invites/[id]/respond/route.ts — accept/decline a directed invite (Phase P).
// Only the invited user may respond. Accept → they become a campaign member (with the
// invite's role) and land on the campaign hub; decline → the invite is marked declined.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { accept } = await req.json().catch(() => ({}));

  const { data: invite } = await supabaseAdmin
    .from('dnd_invites')
    .select('id, campaign_id, role, invited_user_id, status, expires_at')
    .eq('id', params.id)
    .maybeSingle();
  const iv = invite as { id: string; campaign_id: string; role: string; invited_user_id: string | null; status: string; expires_at: string | null } | null;
  if (!iv) return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
  if (iv.invited_user_id !== session.userId) return NextResponse.json({ error: 'This invite is not for you.' }, { status: 403 });
  if (iv.status !== 'pending') return NextResponse.json({ error: 'This invite is no longer pending.' }, { status: 409 });
  if (iv.expires_at && new Date(iv.expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from('dnd_invites').update({ status: 'revoked' }).eq('id', iv.id);
    return NextResponse.json({ error: 'This invite has expired.' }, { status: 410 });
  }

  if (!accept) {
    await supabaseAdmin.from('dnd_invites').update({ status: 'declined' }).eq('id', iv.id);
    return NextResponse.json({ ok: true, accepted: false });
  }

  // Accept: add membership (idempotent on the unique (campaign_id, user_id)), then close
  // the invite.
  const role = iv.role === 'dm' ? 'dm' : 'player';
  const { error: memErr } = await supabaseAdmin
    .from('dnd_campaign_members')
    .upsert({ campaign_id: iv.campaign_id, user_id: session.userId, role }, { onConflict: 'campaign_id,user_id', ignoreDuplicates: true });
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });

  await supabaseAdmin.from('dnd_invites').update({ status: 'accepted', used_by: session.userId, used_at: new Date().toISOString() }).eq('id', iv.id);
  return NextResponse.json({ ok: true, accepted: true, campaignId: iv.campaign_id });
}
