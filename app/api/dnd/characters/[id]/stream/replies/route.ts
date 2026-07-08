// app/api/dnd/characters/[id]/stream/replies/route.ts — the DM's reply inbox (Phase K).
// From the chat-search panel the streamer (owner) or DM can REPLY to a specific viewer.
// The reply is recorded here with the viewer's original handle + line so the DM can pick
// it up, respond back AS that viewer, or spin the chatter into a full NPC. GET lists the
// (unhandled) inbox for the DM/owner; POST files a reply and optionally posts it to chat.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { makeUsernames } from '@/lib/dnd/stream-names';

async function characterAccess(id: string, userId: string) {
  const { data } = await supabaseAdmin.from('dnd_characters').select('campaign_id, owner_user_id').eq('id', id).maybeSingle();
  const row = data as { campaign_id: string; owner_user_id: string | null } | null;
  if (!row) return null;
  const role = await getCampaignRole(row.campaign_id);
  return { isDM: role === 'dm', isOwner: row.owner_user_id === userId, isMember: role !== null };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await characterAccess(params.id, session.userId);
  if (!access) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!access.isDM && !access.isOwner) return NextResponse.json({ error: 'No access.' }, { status: 403 });

  const includeHandled = req.nextUrl.searchParams.get('all') === '1';
  let q = supabaseAdmin
    .from('dnd_stream_replies')
    .select('id, chatter_username, chatter_message, chatter_color, reply_body, handled, created_at')
    .eq('character_id', params.id);
  if (!includeHandled) q = q.eq('handled', false);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ replies: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await characterAccess(params.id, session.userId);
  if (!access) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!access.isDM && !access.isOwner) return NextResponse.json({ error: 'Only the DM or owner can reply.' }, { status: 403 });

  const { chatterUsername, chatterMessage, chatterColor, replyBody, postToChat } = await req.json().catch(() => ({}));
  const handle = String(chatterUsername ?? '').trim().slice(0, 24);
  const reply = String(replyBody ?? '').trim().slice(0, 240);
  if (!handle) return NextResponse.json({ error: 'A chatter username is required.' }, { status: 400 });
  if (!reply) return NextResponse.json({ error: 'A reply is required.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('dnd_stream_replies')
    .insert({
      character_id: params.id,
      from_user_id: session.userId,
      chatter_username: handle,
      chatter_message: chatterMessage ? String(chatterMessage).slice(0, 240) : null,
      chatter_color: chatterColor ? String(chatterColor).slice(0, 16) : null,
      reply_body: reply,
    })
    .select('id, chatter_username, chatter_message, chatter_color, reply_body, handled, created_at')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not file reply.' }, { status: 500 });

  // Optionally drop the reply straight into the live chat as a fresh viewer, so a public
  // back-and-forth reads naturally (the DM can also respond AS the original chatter later).
  if (postToChat) {
    const who = makeUsernames(1, Math.floor(Math.random() * 100000))[0];
    await supabaseAdmin.from('dnd_stream_messages').insert({
      character_id: params.id,
      username: who.name,
      body: `@${handle} ${reply}`.slice(0, 240),
      badges: who.badges,
      color: who.color,
    });
  }
  return NextResponse.json({ reply: data });
}
