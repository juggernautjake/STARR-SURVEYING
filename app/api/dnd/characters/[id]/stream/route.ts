// app/api/dnd/characters/[id]/stream/route.ts — streamer-chat state (Phase J2). Each
// character can "go live" with a fake stream overlay: is_live, viewer_count, chat_speed.
// GET returns the state (default if none); PATCH (DM or owner) toggles live / sets the
// viewer count + speed. The chat panel (J3) and spam/polls (J5/J7) build on this.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

const DEFAULT_STATE = { is_live: false, viewer_count: 0, chat_speed: 3, engagement: 50 };
const COLS = 'is_live, viewer_count, chat_speed, engagement, active_spam, updated_at';

async function characterAccess(id: string, userId: string) {
  const { data } = await supabaseAdmin.from('dnd_characters').select('campaign_id, owner_user_id').eq('id', id).maybeSingle();
  const row = data as { campaign_id: string; owner_user_id: string | null } | null;
  if (!row) return null;
  const role = await getCampaignRole(row.campaign_id);
  return { role, isDM: role === 'dm', isOwner: row.owner_user_id === userId, isMember: role !== null };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await characterAccess(params.id, session.userId);
  if (!access) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!access.isMember) return NextResponse.json({ error: 'No access.' }, { status: 403 });

  const { data } = await supabaseAdmin.from('dnd_stream_state').select(COLS).eq('character_id', params.id).maybeSingle();
  return NextResponse.json({ stream: data ?? { ...DEFAULT_STATE, active_spam: null } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await characterAccess(params.id, session.userId);
  if (!access) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!access.isDM && !access.isOwner) return NextResponse.json({ error: 'Only the DM or owner can control the stream.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { character_id: params.id, updated_at: new Date().toISOString() };
  if (typeof body.isLive === 'boolean') patch.is_live = body.isLive;
  // Clamp to [0, 9e15] — a bigint column, but capped under JS's exact-integer limit
  // (2^53) so quadrillion-scale counts round-trip precisely.
  if (body.viewerCount != null) patch.viewer_count = Math.max(0, Math.min(9e15, Math.round(Number(body.viewerCount)) || 0));
  if (body.chatSpeed != null) patch.chat_speed = Math.max(1, Math.min(10, Math.round(Number(body.chatSpeed)) || 3));
  if (body.engagement != null) patch.engagement = Math.max(0, Math.min(100, Math.round(Number(body.engagement)) || 0));
  if (Object.keys(patch).length <= 2) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('dnd_stream_state')
    .upsert(patch, { onConflict: 'character_id' })
    .select(COLS)
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Update failed.' }, { status: 500 });
  return NextResponse.json({ stream: data });
}
