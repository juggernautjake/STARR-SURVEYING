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

  // Optional search (K): `q` matches a username or message body (case-insensitive). Used
  // by the DM/owner chat-search panel to find a handle or keyword across the live feed.
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 50)));
  let query = supabaseAdmin
    .from('dnd_stream_messages')
    .select('id, username, body, badges, color, created_at')
    .eq('character_id', params.id);
  if (q) {
    // Escape PostgREST or() reserved characters in the user term, then match name OR body.
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
  if (!access.isDM && !access.isOwner) return NextResponse.json({ error: 'Only the DM or owner can post to chat.' }, { status: 403 });

  const { body, username } = await req.json().catch(() => ({}));
  if (!body || !String(body).trim()) return NextResponse.json({ error: 'A message is required.' }, { status: 400 });

  const user = username
    ? { name: String(username).slice(0, 24), ...styleForName(String(username)) }
    : makeUsernames(1, Math.floor(Math.random() * 100000))[0];

  const { data, error } = await supabaseAdmin
    .from('dnd_stream_messages')
    .insert({ character_id: params.id, username: user.name, body: String(body).slice(0, 240), badges: user.badges, color: user.color })
    .select('id, username, body, badges, color, created_at')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not post.' }, { status: 500 });
  return NextResponse.json({ message: data });
}
