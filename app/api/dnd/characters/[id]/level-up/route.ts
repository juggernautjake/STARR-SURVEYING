// app/api/dnd/characters/[id]/level-up/route.ts — AI-assisted level-up for an EXISTING character (Area LU,
// owner 2026-07-18). The DM/owner asks to level the character up; Claude fills the level_up_character tool,
// choosing STANDARD class features (from the standard options we ground it with) or inventing balanced CUSTOM
// content for a custom/highly-modified class. The route grounds → calls the tool → applies the validated draft
// → persists. Mirrors the ai-edit route's write-chokepoint (owner/assigned-player/DM only). Never lets the AI
// write the sheet directly — parseLevelUpToolCall normalizes and applyLevelUpDraft applies.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { dndToolCall, dndAiConfigured } from '@/lib/dnd/ai';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import { normalizeSystem } from '@/lib/dnd/systems';
import { characterDigest } from '@/lib/dnd/character-digest';
import { findClass, subclassesFor } from '@/lib/dnd/classes/registry';
import { standardLevelUpOptions } from '@/lib/dnd/classes/level-up-draft';
import { LEVEL_UP_TOOL, parseLevelUpToolCall, applyLevelUpDraft } from '@/lib/dnd/classes/level-up-ai';
import { systemGroundingBlock } from '@/lib/dnd/grounding';
import type { Character } from '@/app/dnd/_sheet/types';
import type { CharacterSystem } from '@/lib/dnd/systems';

const SYSTEM_PROMPT =
  'You level a Dungeons & Dragons (or the character\'s own system) character up by exactly ONE level. Call the ' +
  'level_up_character tool. If STANDARD OPTIONS are provided, prefer them (mode "vanilla") — grant the features ' +
  'the class/subclass gives at the new level and take any ability-score improvement it owes. If the character ' +
  'is custom or highly modified (no standard options, or the player asks for custom), invent BALANCED homebrew ' +
  'features/feats/buffs that fit the character\'s class, subclass, and species (mode "custom"). Always set the HP ' +
  'gained (use the class average + the character\'s Constitution modifier) and stay in the character\'s own system.';

/** Describe the standard options as grounding text the model reads. */
function describeStandard(opts: ReturnType<typeof standardLevelUpOptions> | null, toLevel: number): string {
  if (!opts || opts.empty) {
    return `STANDARD OPTIONS: none published for this class at level ${toLevel} — invent balanced custom content that fits the character (mode "custom").`;
  }
  const gained = opts.gained.length ? `Features gained: ${opts.gained.map((f) => f.name).join(', ')}.` : 'No fixed features this level.';
  const owed = opts.outstanding.length ? ` Choices owed: ${opts.outstanding.map((c) => `${c.kind} (level ${c.level})`).join(', ')}.` : '';
  return `STANDARD OPTIONS for level ${toLevel} (prefer these, mode "vanilla"): ${gained}${owed}`;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const instruction = typeof body?.instruction === 'string' ? body.instruction.trim() : '';
  const preferCustom = body?.mode === 'custom';

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const row = access.access.character;

  const current: Character = (row.data as unknown as Character | null) ?? blankCharacter(row.name);
  const system = normalizeSystem((row as { system?: string }).system);
  const fromLevel = Math.max(1, current.meta?.level || 1);
  if (fromLevel >= 20) return NextResponse.json({ error: 'This character is already level 20.' }, { status: 400 });
  const toLevel = fromLevel + 1;

  // Standard options — only when the character's class resolves to a full ClassDefinition (official OR
  // homebrew). A fully-custom character (no def) grounds the model to invent custom content instead.
  const def = findClass(system, current.meta?.className ?? '');
  const standard = def
    ? standardLevelUpOptions(def, { from: fromLevel, to: toLevel, recorded: [], subclasses: subclassesFor(system, def.key) })
    : null;

  const grounding = await systemGroundingBlock(system, `level up ${current.meta?.className ?? ''}`).catch(() => null);

  let result;
  try {
    result = await dndToolCall<Record<string, unknown>>({
      system: [SYSTEM_PROMPT, grounding?.instruction].filter(Boolean).join('\n\n'),
      user: [
        `Level up this character from level ${fromLevel} to ${toLevel}.`,
        `Current sheet:\n${characterDigest(current, system as CharacterSystem)}`,
        describeStandard(standard, toLevel),
        preferCustom ? 'The player has asked for CUSTOM content this level (mode "custom").' : null,
        instruction ? `Player guidance: ${instruction}` : null,
        grounding?.block || null,
      ].filter(Boolean).join('\n\n'),
      tools: [LEVEL_UP_TOOL],
      toolChoice: { type: 'tool', name: 'level_up_character' },
      maxTokens: 2048,
      temperature: 0.5,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI call failed.' }, { status: 502 });
  }

  if (result?.name !== 'level_up_character') {
    return NextResponse.json({ error: 'The AI did not produce a level-up.' }, { status: 502 });
  }

  const draft = parseLevelUpToolCall(result.input, fromLevel);
  const next = applyLevelUpDraft(current, draft);

  const { error } = await supabaseAdmin
    .from('dnd_characters')
    .update({ data: next, updated_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    fromLevel,
    toLevel,
    mode: draft.mode,
    hpGained: draft.hpGained,
    abilityIncreases: draft.abilityIncreases,
    featuresAdded: draft.features.map((f) => f.name),
    notes: draft.notes ?? null,
  });
}
