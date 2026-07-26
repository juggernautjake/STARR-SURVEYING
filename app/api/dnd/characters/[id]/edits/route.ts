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

  // WHO made the edit, by name. The rows carry `editor_user_id` (a uuid) and `is_dm`, and nothing in the
  // repo ever resolved either to a person — so the review queue could only say "DM" or "player". On a
  // campaign with three players that answers the wrong question: a DM reviewing a change wants to know
  // WHICH player made it, and the plan doc's "8d6 → 10d6, by Jacob" was blocked on exactly this.
  //
  // Resolved here rather than by a PostgREST embed: `dnd_sheet_edits.editor_user_id` has an FK to
  // `dnd_users`, but the rows are already capped at 200 and the distinct editors on one character are a
  // handful, so one `in` lookup is cheaper than an embed on every row — and it leaves the row shape
  // additive, so every existing consumer is untouched.
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = [...new Set(rows.map((r) => r.editor_user_id).filter((v): v is string => typeof v === 'string' && !!v))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: users } = await supabaseAdmin.from('dnd_users').select('id, display_name').in('id', ids);
    for (const u of users ?? []) {
      const { id, display_name: name } = u as { id: string; display_name?: string | null };
      if (name && name.trim()) names.set(id, name.trim());
    }
  }
  return NextResponse.json({
    edits: rows.map((r) => {
      const uid = typeof r.editor_user_id === 'string' ? r.editor_user_id : null;
      // `editor_name` is absent, never a placeholder, when the user is gone — the column is
      // `ON DELETE SET NULL`, so a deleted account legitimately has no name to show and the UI falls
      // back to its DM/player wording rather than printing "Unknown" as though it were someone.
      return uid && names.has(uid) ? { ...r, editor_name: names.get(uid) } : r;
    }),
  });
}
