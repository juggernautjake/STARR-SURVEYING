// app/api/dnd/characters/[id]/system/route.ts — switch or transpose a character's active
// game system (Phase V, Slice 13). A character can hold sheets in several systems at once;
// this endpoint makes `system` the active one. If a variant for the target already exists it
// just SWITCHES (snapshotting the current active sheet first, so nothing is lost). If not, it
// TRANSPOSES: the AI builds a fresh sheet in the TARGET system's rules (grounded — target
// rules only, never the source system's), installs it, and switches to it. Owner/DM-scoped
// (Slice 8b) — it only ever writes this one character.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { dndToolCall, dndAiConfigured } from '@/lib/dnd/ai';
import { applySheetEdits, SHEET_EDIT_TOOL, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { systemGroundingBlock } from '@/lib/dnd/grounding';
import { validateCharacterForSystem } from '@/lib/dnd/system-validate';
import { normalizeSystem, systemLabel } from '@/lib/dnd/systems';
import { readVariants, hasVariant, switchActive, installTransposed, type ActiveSheet } from '@/lib/dnd/system-variants';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

const TRANSPOSE_SYSTEM =
  'You are transposing an existing tabletop RPG character into a DIFFERENT game system, as faithfully as ' +
  'possible. You receive the source character (JSON digest) and must rebuild it under the TARGET system. ' +
  'Call edit_sheet with the full set of edits to construct the target-system sheet: keep the concept, ' +
  'name, level intent, role and signature abilities, but express EVERY mechanic using ONLY the target ' +
  'system’s rules, feats, spells, actions, weapons and numbers — never the source system’s, never invented. ' +
  'When a source mechanic has no faithful target equivalent, choose the closest legal target-system option ' +
  'and note the substitution in `unmapped` so the user can review it.';

function sheetDigest(c: Character): string {
  return JSON.stringify({
    name: c.meta.name, level: c.meta.level, className: c.meta.className, species: c.meta.species, subclass: c.meta.subclass,
    abilities: c.abilities,
    combat: { ac: c.combat.ac, maxHp: c.combat.maxHp, speed: c.combat.speed },
    saves: Object.fromEntries(Object.entries(c.saves).filter(([, s]) => s.proficient).map(([k]) => [k, true])),
    attacks: c.attacks.map((a) => a.name),
    features: c.features.map((f) => f.name),
    spells: (c.spells ?? []).map((s) => s.name),
    inventory: c.inventory.map((i) => i.name),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const row = access.access.character as unknown as {
    id: string; name: string; data: Character | null; system?: string; sheet_type: string;
    custom_layout?: unknown; custom_css?: string | null; system_variants?: unknown;
  };

  const body = await req.json().catch(() => ({}));
  const target = normalizeSystem(body?.system);

  const active: ActiveSheet = {
    system: normalizeSystem(row.system),
    data: row.data ?? blankCharacter(row.name),
    sheet_type: row.sheet_type || 'default',
    custom_layout: row.custom_layout,
    custom_css: row.custom_css ?? '',
  };
  const variants = readVariants(row.system_variants);

  // Already active — nothing to do.
  if (target === active.system) return NextResponse.json({ ok: true, kind: 'noop', system: target });

  // ── Existing variant → just switch (snapshot current, load target). ─────────────────
  if (hasVariant(active, variants, target)) {
    const next = switchActive(active, variants, target);
    const { error } = await supabaseAdmin
      .from('dnd_characters')
      .update({
        system: next.active.system,
        data: next.active.data,
        sheet_type: next.active.sheet_type,
        custom_layout: next.active.custom_layout ?? { blocks: [] },
        custom_css: next.active.custom_css ?? '',
        system_variants: next.variants,
      })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, kind: 'switch', system: target });
  }

  // ── No variant yet → transpose (AI builds the target-system sheet). ─────────────────
  if (!dndAiConfigured()) return NextResponse.json({ error: 'AI is not configured — cannot transpose to a new system.' }, { status: 503 });
  const label = systemLabel(target);
  const source = (active.data as Character | null) ?? blankCharacter(row.name);
  const grounding = await systemGroundingBlock(target, `transpose ${source.meta.name} into ${label}`).catch(() => null);

  let result;
  try {
    result = await dndToolCall<{ summary?: string; edits: SheetEdit[] }>({
      system: [TRANSPOSE_SYSTEM, grounding?.instruction].filter(Boolean).join('\n\n'),
      user: [
        `Target system: ${label}. Rebuild this character under ${label} only.`,
        `Source character (system: ${systemLabel(active.system)}):\n${sheetDigest(source)}`,
        grounding?.block || null,
      ].filter(Boolean).join('\n\n'),
      tools: [SHEET_EDIT_TOOL],
      toolChoice: { type: 'tool', name: 'edit_sheet' },
      maxTokens: 4096,
      temperature: 0.4,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Transposition failed.' }, { status: 502 });
  }
  const edits = result?.input?.edits;
  if (!Array.isArray(edits) || edits.length === 0) return NextResponse.json({ error: 'The AI did not produce a transposed sheet.' }, { status: 502 });

  // Start from a blank sheet carrying the concept forward, then apply the target-system edits.
  const seed = blankCharacter(source.meta.name);
  seed.meta = { ...seed.meta, level: source.meta.level, species: source.meta.species, role: source.meta.role };
  const transposed = applySheetEdits(seed, edits);
  const next = installTransposed(active, variants, target, transposed);

  const { error } = await supabaseAdmin
    .from('dnd_characters')
    .update({
      system: next.active.system,
      data: next.active.data,
      sheet_type: next.active.sheet_type,
      custom_layout: next.active.custom_layout ?? { blocks: [] },
      custom_css: next.active.custom_css ?? '',
      system_variants: next.variants,
    })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Safety net (Slice 3): confirm the transposed sheet actually fits the target system.
  const violations = validateCharacterForSystem(transposed, target);
  return NextResponse.json({ ok: true, kind: 'transpose', system: target, summary: result?.input?.summary ?? null, editCount: edits.length, violations });
}
