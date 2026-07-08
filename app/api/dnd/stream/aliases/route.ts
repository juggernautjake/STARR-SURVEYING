// app/api/dnd/stream/aliases/route.ts — a signed-in user's persistent chat aliases (K).
// The DM builds a stable of named handles to speak as in a streamer's chat. Aliases are
// scoped to the user (reusable across their streamer characters) and are ONLY used when
// explicitly selected — the ambient/AI crowd never draws from them. Each may carry a
// fixed color/badges and (later) a generated NPC sheet.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { styleForName } from '@/lib/dnd/stream-names';

const COLS = 'id, name, color, badges, npc_character_id, created_at';

export async function GET() {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from('dnd_stream_aliases')
    .select(COLS)
    .eq('user_id', session.userId)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ aliases: data ?? [] });
}

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { name, color, badges } = await req.json().catch(() => ({}));
  const clean = String(name ?? '').trim().slice(0, 24);
  if (!clean) return NextResponse.json({ error: 'An alias name is required.' }, { status: 400 });

  // Default a stable color/badges from the name so the handle always looks the same.
  const style = styleForName(clean);
  const row = {
    user_id: session.userId,
    name: clean,
    color: (typeof color === 'string' && color) || style.color,
    badges: Array.isArray(badges) ? badges.filter((b) => typeof b === 'string').slice(0, 4) : style.badges,
  };
  const { data, error } = await supabaseAdmin
    .from('dnd_stream_aliases')
    .insert(row)
    .select(COLS)
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505')
      return NextResponse.json({ error: 'You already have an alias with that name.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ alias: data });
}
