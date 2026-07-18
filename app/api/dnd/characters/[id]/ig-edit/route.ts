// app/api/dnd/characters/[id]/ig-edit/route.ts — an INCREMENTAL edit to an Intuitive Games character's
// sidecar (enter/leave a stance, apply/remove a condition), the counterpart to the rebuild-only ig-build
// route. Owner/assigned-player/DM only (the write chokepoint). Runs the pure applyIgEdit so the sheet and
// the AI change one thing in place without re-assembling the whole character.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { applyIgEdit, parseIgEdit, describeIgEdit } from '@/lib/dnd/systems/intuitive-games/edit';
import { isIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { character } = access.access;

  const data = (character.data ?? {}) as Record<string, unknown>;
  const ig = data.ig;
  if (!isIGCharacter(ig)) {
    return NextResponse.json({ error: 'This character has no Intuitive Games sheet to edit.' }, { status: 400 });
  }

  const parsed = parseIgEdit(await req.json().catch(() => ({})));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const nextIg = applyIgEdit(ig, parsed.edit);
  const nextData = { ...data, ig: nextIg };

  const { error } = await supabaseAdmin
    .from('dnd_characters')
    .update({ data: nextData })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    change: describeIgEdit(parsed.edit),
    stances: nextIg.combat.stances,
    conditions: nextIg.combat.conditions,
  });
}
