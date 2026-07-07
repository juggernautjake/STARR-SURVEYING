// app/api/dnd/sessions/[id]/reset/route.ts — totally reset a session (DM only).
// Wipes the session's live state — encounters + their initiative entries (cascade),
// AI recaps, and this session's roll-log entries — then clears DM notes and returns the
// session to `prep`. The session shell + title are kept (use DELETE to remove entirely).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getDndSession();
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data: s } = await supabaseAdmin.from('dnd_sessions').select('id, campaign_id').eq('id', params.id).maybeSingle();
  const sess = s as { id: string; campaign_id: string } | null;
  if (!sess) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  if ((await getCampaignRole(sess.campaign_id)) !== 'dm') {
    return NextResponse.json({ error: 'Only the DM can reset a session.' }, { status: 403 });
  }

  // Encounters cascade-delete their initiative entries (FK ON DELETE CASCADE).
  await supabaseAdmin.from('dnd_encounters').delete().eq('session_id', params.id);
  await supabaseAdmin.from('dnd_recaps').delete().eq('session_id', params.id);
  await supabaseAdmin.from('dnd_roll_log').delete().eq('session_id', params.id);

  const { data, error } = await supabaseAdmin
    .from('dnd_sessions')
    .update({ status: 'prep', dm_notes: null })
    .eq('id', params.id)
    .select('id, title, status, sort_order, dm_notes')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not reset session.' }, { status: 500 });
  return NextResponse.json({ session: data });
}
