// app/api/dnd/characters/[id]/ai-edit/route.ts — AI sheet build/edit (Phase I2). The
// DM (or owner) sends a natural-language instruction; Claude calls the edit_sheet tool
// (schema = our edit vocabulary), we apply the edits to the character's data, persist,
// and log each edit to dnd_sheet_edits. Powers G2 (build) and I3 (refine).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { dndToolCall, dndAiConfigured } from '@/lib/dnd/ai';
import { applySheetEdits, editPath, SHEET_EDIT_TOOL, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

const SYSTEM =
  'You are a D&D 5e character architect. You receive a character sheet (JSON) and an instruction. ' +
  'Call the edit_sheet tool with the minimal, valid set of structured edits that satisfies the instruction. ' +
  'Ability scores are raw values (e.g. 16), never modifiers. When asked to build a full NPC from scratch, ' +
  'produce a complete, playable, level-appropriate kit: name, level, all six abilities, AC/HP/speed, save ' +
  'proficiencies, a few skills, one or more attacks, signature features, and notable inventory.';

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

  const { data: ch } = await supabaseAdmin.from('dnd_characters').select('id, campaign_id, owner_user_id, name, data').eq('id', params.id).maybeSingle();
  if (!ch) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  const row = ch as { id: string; campaign_id: string; owner_user_id: string | null; name: string; data: Character | null };
  const isDM = (await getCampaignRole(row.campaign_id)) === 'dm';
  const isOwner = row.owner_user_id === session.userId;
  if (!isDM && !isOwner) return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });

  const current: Character = row.data ?? blankCharacter(row.name);

  let result;
  try {
    result = await dndToolCall<{ summary?: string; edits: SheetEdit[] }>({
      system: SYSTEM,
      user: `Current sheet:\n${sheetDigest(current)}\n\nInstruction: ${String(instruction).trim()}`,
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
