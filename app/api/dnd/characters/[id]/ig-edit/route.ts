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
import { gateIgEdit, markIgOffRules } from '@/lib/dnd/systems/intuitive-games/rules-gate';
import { readActiveSlotMeta } from '@/lib/dnd/system-variants';
import { isAuditableBespokeEdit, bespokeFieldPath } from '@/lib/dnd/audit/bespoke-ops';

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

  // Rules gate (IG S2) — the same check the AI path runs. Gating only the AI would make "use the
  // manual control instead" a way around the rules, which is the exact shape of hole this work
  // exists to close. Server-derived: the variant from the character's own stored metadata, the
  // DM flag from the access check.
  const igVariant = readActiveSlotMeta((character as { system_variants?: unknown }).system_variants).kind ?? 'vanilla';
  const gate = gateIgEdit(ig, parsed.edit, {
    enforce: !access.access.isDM && igVariant === 'vanilla',
    unboundReason: access.access.isDM ? 'dm-grant' : igVariant === 'custom' ? 'custom-character' : undefined,
  });
  if (!gate.edit) return NextResponse.json({ error: gate.refusal ?? 'That edit was refused.' }, { status: 400 });

  const nextIg = gate.offRules && gate.edit.op === 'add_power'
    ? markIgOffRules(applyIgEdit(ig, gate.edit), gate.edit.name, gate.offRules)
    : applyIgEdit(ig, gate.edit);
  const nextData = { ...data, ig: nextIg };

  const { error } = await supabaseAdmin
    .from('dnd_characters')
    .update({ data: nextData })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit the BUILD edits to the DM's review queue. This route wrote nothing at all before, while the AI
  // path (`ai-edit`'s `edit_ig_sheet` branch) has always inserted an `ig:<op>` row — so adding a feat, a
  // power, an attack or an ability change on the sheet was invisible to the DM, and adding the same thing
  // by asking the AI was not. This file's own header makes the argument for the mirror case ("gating only
  // the AI would make 'use the manual control instead' a way around the rules"); the same is true of the
  // review queue. Off-rules content taken through the escape hatch matters most here — that is exactly
  // what the queue exists to surface.
  //
  // PLAY edits stay out, per the boundary the shared sheet settled: a stance switch or a condition applied
  // mid-fight is not a build change, and logging them would bury the ones that are. Best-effort, matching
  // the AI path: a failed audit must not fail the player's edit.
  if (isAuditableBespokeEdit('intuitive-games', gate.edit.op)) {
    await supabaseAdmin.from('dnd_sheet_edits').insert({
      character_id: params.id, editor_user_id: session.userId, is_dm: access.access.isDM,
      field_path: bespokeFieldPath('intuitive-games', gate.edit.op), old_value: null, new_value: null,
      scope: 'permanent', source: 'manual',
      summary: describeIgEdit(gate.edit) + (gate.offRules ? ` — off-rules: ${gate.offRules}` : ''),
    }).then(() => {}, (e: unknown) => { console.error('[dnd] background write failed', e); });
  }

  return NextResponse.json({
    ok: true,
    change: describeIgEdit(parsed.edit),
    stances: nextIg.combat.stances,
    conditions: nextIg.combat.conditions,
  });
}
