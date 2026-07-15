// app/api/dnd/characters/[id]/ai-edit/route.ts — AI sheet build/edit (Phase I2). The
// DM (or owner) sends a natural-language instruction; Claude calls the edit_sheet tool
// (schema = our edit vocabulary), we apply the edits to the character's data, persist,
// and log each edit to dnd_sheet_edits. Powers G2 (build) and I3 (refine).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { dndToolCall, dndAiConfigured } from '@/lib/dnd/ai';
import { applySheetEdits, editPath, SHEET_EDIT_TOOL, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { systemGroundingBlock } from '@/lib/dnd/grounding';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

// A system-agnostic architect prompt; the per-character system grounding (Slice 3) is
// folded in below so edits stay strictly within the character's chosen ruleset and never
// borrow from — or invent — another system's mechanics (Slice 8: the grounded edit path).
const SYSTEM =
  'You are a tabletop RPG character architect. You receive a character sheet (JSON) and an instruction, ' +
  'and you make ONLY the change the user asked for — adding or altering feats, abilities, mechanics, ' +
  'transformations, spells, attacks, features, resources, stats, or inventory. Call the edit_sheet tool ' +
  'with the minimal, valid set of structured edits that satisfies the instruction. Ability scores are raw ' +
  'values (e.g. 16), never modifiers. When asked to build a full character from scratch, produce a complete, ' +
  'playable, level-appropriate kit: name, level, all six abilities, AC/HP/speed, save proficiencies, a few ' +
  'skills, one or more attacks, signature features, and notable inventory. Do not touch anything the user did ' +
  'not ask about.';

function sheetDigest(c: Character): string {
  return JSON.stringify({
    name: c.meta.name, level: c.meta.level, className: c.meta.className, species: c.meta.species,
    abilities: c.abilities,
    combat: { ac: c.combat.ac, maxHp: c.combat.maxHp, speed: c.combat.speed },
    saves: Object.fromEntries(Object.entries(c.saves).filter(([, s]) => s.proficient).map(([k]) => [k, true])),
    attacks: c.attacks.map((a) => a.name),
    features: c.features.map((f) => f.name),
    inventory: c.inventory.map((i) => i.name),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 });

  const { instruction } = await req.json().catch(() => ({}));
  if (!instruction || !String(instruction).trim()) return NextResponse.json({ error: 'An instruction is required.' }, { status: 400 });

  // The single write chokepoint (Slice 8b boundary): keyed to THIS character id + the
  // caller's owner/assigned-player/DM authorization. No path writes elsewhere.
  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const row = access.access.character;
  const isDM = access.access.isDM;
  const instr = String(instruction).trim();

  const current: Character = (row.data as unknown as Character | null) ?? blankCharacter(row.name);

  // System grounding (Slice 3/8): edits must stay inside the character's chosen system —
  // no cross-system rules, no invented mechanics.
  const grounding = await systemGroundingBlock((row as { system?: string }).system, instr).catch(() => null);

  let result;
  try {
    result = await dndToolCall<{ summary?: string; edits: SheetEdit[] }>({
      system: [SYSTEM, grounding?.instruction].filter(Boolean).join('\n\n'),
      user: [
        `Current sheet:\n${sheetDigest(current)}`,
        grounding?.block || null,
        `Instruction: ${instr}`,
      ].filter(Boolean).join('\n\n'),
      tools: [SHEET_EDIT_TOOL],
      toolChoice: { type: 'tool', name: 'edit_sheet' },
      maxTokens: 4096,
      temperature: 0.4,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI call failed.' }, { status: 502 });
  }
  const edits = result?.input?.edits;
  if (!Array.isArray(edits) || edits.length === 0) return NextResponse.json({ error: 'The AI did not return any edits.' }, { status: 502 });

  const updated = applySheetEdits(current, edits);
  const { error: upErr } = await supabaseAdmin.from('dnd_characters').update({ data: updated, name: updated.meta.name || row.name }).eq('id', params.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Audit each edit (best-effort — don't fail the request if logging fails).
  await supabaseAdmin.from('dnd_sheet_edits').insert(
    edits.map((e) => ({ character_id: params.id, editor_user_id: session.userId, is_dm: isDM, field_path: editPath(e), old_value: null, new_value: e as unknown, scope: 'permanent' })),
  ).then(() => {}, () => {});

  return NextResponse.json({ ok: true, summary: result?.input?.summary ?? null, editCount: edits.length, name: updated.meta.name });
}
