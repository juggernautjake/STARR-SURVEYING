// app/api/dnd/stream/aliases/[aliasId]/route.ts — edit/delete one of the user's aliases.
// Ownership-gated to the alias's user. Aliases persist until the user deletes them.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { styleForName } from '@/lib/dnd/stream-names';

const COLS = 'id, name, color, badges, npc_character_id, created_at';

async function ownAlias(aliasId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('dnd_stream_aliases')
    .select('id, user_id')
    .eq('id', aliasId)
    .maybeSingle();
  const row = data as { id: string; user_id: string } | null;
  return row && row.user_id === userId ? row : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { aliasId: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!(await ownAlias(params.aliasId, session.userId)))
    return NextResponse.json({ error: 'Alias not found.' }, { status: 404 });

  const { name, color, badges } = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (name !== undefined) {
    const clean = String(name).trim().slice(0, 24);
    if (!clean) return NextResponse.json({ error: 'An alias name is required.' }, { status: 400 });
    patch.name = clean;
    if (color === undefined) patch.color = styleForName(clean).color; // re-derive color with the new name
  }
  if (color !== undefined) patch.color = color ? String(color) : styleForName(String(name ?? '')).color;
  if (Array.isArray(badges)) patch.badges = badges.filter((b) => typeof b === 'string').slice(0, 4);
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('dnd_stream_aliases')
    .update(patch)
    .eq('id', params.aliasId)
    .select(COLS)
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505')
      return NextResponse.json({ error: 'You already have an alias with that name.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ alias: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { aliasId: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!(await ownAlias(params.aliasId, session.userId)))
    return NextResponse.json({ error: 'Alias not found.' }, { status: 404 });
  const { error } = await supabaseAdmin.from('dnd_stream_aliases').delete().eq('id', params.aliasId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
