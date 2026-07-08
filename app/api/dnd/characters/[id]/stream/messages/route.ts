// app/api/dnd/characters/[id]/stream/messages/route.ts — persisted stream chat lines
// (Phase J4). POST lets the DM inject a specific message "from chat" (attributed to a
// random viewer handle unless one is given); GET lists recent lines for the overlay to
// poll. The AI spam generator (J5) posts here too.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { makeUsernames, styleForName } from '@/lib/dnd/stream-names';

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
  if (!access.isMember) return NextResponse.json({ error: 'No access.' }, { status: 403 });

  // `q` matches a username OR body (K, search panel). `user` fetches one handle's whole
  // history this session (R, click-a-name). Anyone in the campaign may read the feed.
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const exactUser = (req.nextUrl.searchParams.get('user') ?? '').trim();
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 50)));
  const COLS = 'id, username, body, badges, color, created_at, kind, amount, sender_user_id';
  let query = supabaseAdmin.from('dnd_stream_messages').select(COLS).eq('character_id', params.id);
  if (exactUser) {
    query = query.eq('username', exactUser.slice(0, 24));
  } else if (q) {
    const safe = q.replace(/[,()*]/g, ' ').trim();
    if (safe) query = query.or(`username.ilike.%${safe}%,body.ilike.%${safe}%`);
  }
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: (data ?? []).reverse() });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await characterAccess(params.id, session.userId);
  if (!access) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!access.isDM && !access.isOwner) return NextResponse.json({ error: 'Only the DM or owner can clear chat.' }, { status: 403 });
  const { error } = await supabaseAdmin.from('dnd_stream_messages').delete().eq('character_id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await characterAccess(params.id, session.userId);
  if (!access) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  // Any campaign MEMBER can chat in the stream like a viewer; only the DM/owner can post
  // AS an arbitrary handle (aliases, regulars, injected lines).
  if (!access.isMember) return NextResponse.json({ error: 'Join the campaign to chat.' }, { status: 403 });
  const privileged = access.isDM || access.isOwner;

  const { body, username, color, badges } = await req.json().catch(() => ({}));
  if (!body || !String(body).trim()) return NextResponse.json({ error: 'A message is required.' }, { status: 400 });

  // A fellow player posting → forced to their own display name with a bright PARTY badge +
  // colour + their user id, so the streamer spots a real teammate's line instantly. The
  // DM/owner may instead post as any handle (or a random viewer if none given).
  const user =
    !privileged
      ? { name: String(session.displayName).slice(0, 24), color: '#ffd23f', badges: ['party'], senderId: session.userId }
      : username
        ? {
            name: String(username).slice(0, 24),
            color: (typeof color === 'string' && color) || styleForName(String(username)).color,
            badges: Array.isArray(badges) ? badges.filter((b) => typeof b === 'string').slice(0, 4) : styleForName(String(username)).badges,
            senderId: null as string | null,
          }
        : { ...makeUsernames(1, Math.floor(Math.random() * 100000))[0], senderId: null as string | null };

  const { data, error } = await supabaseAdmin
    .from('dnd_stream_messages')
    .insert({ character_id: params.id, username: user.name, body: String(body).slice(0, 240), badges: user.badges, color: user.color, sender_user_id: user.senderId, kind: 'chat' })
    .select('id, username, body, badges, color, created_at, kind, amount, sender_user_id')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not post.' }, { status: 500 });
  return NextResponse.json({ message: data });
}
