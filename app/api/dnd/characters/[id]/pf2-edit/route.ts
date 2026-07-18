// app/api/dnd/characters/[id]/pf2-edit/route.ts — an INCREMENTAL in-play edit to a Pathfinder 2e character's
// sidecar (apply damage / heal / temp HP / the dying-wounded death track), the PF2 counterpart to the
// rebuild-only pf2-build route and to ig-edit. Owner/assigned-player/DM only (the write chokepoint). Runs the
// pure applyPf2Edit so the sheet and the AI change one thing in place without re-assembling the character.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { applyPf2Edit, parsePf2Edit, describePf2Edit } from '@/lib/dnd/systems/pathfinder2e/edit';
import { isPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { character } = access.access;

  const data = (character.data ?? {}) as Record<string, unknown>;
  const pf2 = data.pf2e;
  if (!isPF2Character(pf2)) {
    return NextResponse.json({ error: 'This character has no Pathfinder 2e sheet to edit.' }, { status: 400 });
  }

  const parsed = parsePf2Edit(await req.json().catch(() => ({})));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const nextPf2 = applyPf2Edit(pf2, parsed.edit);
  const nextData = { ...data, pf2e: nextPf2 };

  const { error } = await supabaseAdmin
    .from('dnd_characters')
    .update({ data: nextData })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    change: describePf2Edit(parsed.edit),
    currentHp: nextPf2.combat.currentHp,
    tempHp: nextPf2.combat.tempHp,
    dyingValue: nextPf2.combat.dyingValue,
    woundedValue: nextPf2.combat.woundedValue,
  });
}
