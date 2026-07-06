// app/api/dnd/characters/[id]/edits/route.ts — the sheet edit log (Phase C11a).
// POST records an override to dnd_sheet_edits (attributed to the editor, flagged
// is_dm); GET lists a character's recent edits. Auth reuses getCharacterAccess:
// write access to log, read access to view.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { getCharacterAccess } from '@/lib/dnd/characters';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  if (!res.access.canWrite) {
    return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const field_path = body.field_path == null ? null : String(body.field_path);
  const scope = body.scope === 'temp' ? 'temp' : 'permanent';

  const { data, error } = await supabaseAdmin
    .from('dnd_sheet_edits')
    .insert({
      character_id: params.id,
      editor_user_id: session.userId,
      is_dm: res.access.isDM,
      field_path,
      old_value: body.old_value ?? null,
      new_value: body.new_value ?? null,
      scope,
    })
    .select('*')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not record edit.' }, { status: 500 });
  }
  return NextResponse.json({ edit: data });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });

  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 50)));
  const { data, error } = await supabaseAdmin
    .from('dnd_sheet_edits')
    .select('*')
    .eq('character_id', params.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ edits: data ?? [] });
}
