// app/api/dnd/characters/[id]/stream/replies/[replyId]/route.ts — resolve one reply.
// PATCH marks it handled (DM has dealt with it); DELETE removes it. DM/owner-gated.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

async function canManage(characterId: string, userId: string) {
  const { data } = await supabaseAdmin.from('dnd_characters').select('campaign_id, owner_user_id').eq('id', characterId).maybeSingle();
  const row = data as { campaign_id: string; owner_user_id: string | null } | null;
  if (!row) return false;
  const role = await getCampaignRole(row.campaign_id);
  return role === 'dm' || row.owner_user_id === userId;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; replyId: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!(await canManage(params.id, session.userId))) return NextResponse.json({ error: 'No access.' }, { status: 403 });

  const { handled } = await req.json().catch(() => ({}));
  const { data, error } = await supabaseAdmin
    .from('dnd_stream_replies')
    .update({ handled: handled !== false })
    .eq('id', params.replyId)
    .eq('character_id', params.id)
    .select('id, handled')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Reply not found.' }, { status: 404 });
  return NextResponse.json({ reply: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; replyId: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!(await canManage(params.id, session.userId))) return NextResponse.json({ error: 'No access.' }, { status: 403 });
  const { error } = await supabaseAdmin.from('dnd_stream_replies').delete().eq('id', params.replyId).eq('character_id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
