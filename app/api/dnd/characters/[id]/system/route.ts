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
import { normalizeSystem, systemLabel, isSystemAvailable } from '@/lib/dnd/systems';
import { readVariants, hasVariant, switchActive, installTransposed, installTransposedNewSlot, switchToSlot, addSheetSlot, deleteVariant, renameVariant, readActiveSlotMeta, withActiveSlotMeta, type ActiveSheet } from '@/lib/dnd/system-variants';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

// The transpose system prompt. Vanilla-first always; `allowCustom` decides whether the AI may create
// BALANCED custom content to preserve the character where no vanilla option fits (Area TR3). It's told to
// read the target system's rules (provided in the grounding) FIRST, then build.
const TRANSPOSE_BASE =
  'You are transposing an existing tabletop RPG character into a DIFFERENT game system, as faithfully as ' +
  'possible. First READ and understand the TARGET system’s rules from the grounding provided. Then study the ' +
  'FULL source character given below — its concept, name, level, role, ability scores, saves, skills, ' +
  'proficiencies, every feature/trait/feat, every attack and weapon, every spell, stances, resources and ' +
  'notable inventory — and rebuild a character that can do essentially the SAME things and hits the same ' +
  'persona, but expressed ENTIRELY with the TARGET system’s rules, feats, spells, actions, weapons and ' +
  'numbers — never the source system’s. PREFER the target system’s VANILLA options wherever they fit.\n' +
  'You MUST emit a COMPLETE, PLAYABLE sheet, not a stub. Always emit edits that set: the six ability scores ' +
  '(raw scores like 16, appropriate to the class + level), AC, SPEED, and MAX HP AND CURRENT HP set to a ' +
  'value appropriate for the class and level in the target system (NEVER leave HP at 1 — a level-N character ' +
  'has many hit points; compute them from the target class’s hit die + CON across all N levels), save ' +
  'proficiencies, trained skills, the class/subclass/species (set_meta + set_level), the main attacks/weapons ' +
  'with real damage dice, the class + species/ancestry features with full rules text, and known spells with ' +
  'full text if the character casts. Match the source character’s POWER LEVEL: a capable level-N source ' +
  'becomes a capable level-N target. Call edit_sheet ONCE with the full set of edits.';

const TRANSPOSE_VANILLA_ONLY =
  ' Use ONLY existing target-system content — never invent new classes, ancestries, feats, spells or ' +
  'abilities. When a source mechanic has no faithful target equivalent, choose the closest legal ' +
  'target-system option and note the substitution in `summary` so the user can review it. Leave `custom` empty.';

const TRANSPOSE_ALLOW_CUSTOM =
  ' Take a HARD, thorough look at EVERYTHING the source character can do — every ability, feat, trait, ' +
  'race/ancestry trait, proficiency, stat, spell, weapon, attack and stance — and make sure the rebuilt ' +
  'character can do essentially all of the same things in the target system. Prefer vanilla target-system ' +
  'content, but wherever no vanilla option can faithfully preserve a signature ability, weapon, spell, stance ' +
  'or the character’s vibe, you SHOULD create the BALANCED custom element needed (class, subclass, ancestry, ' +
  'feat, stance, spell, feature, attack or item) so nothing is lost. Fill in as much as is needed to match ' +
  'the persona and capabilities. Make custom content fun and cool, but every custom element MUST (a) use the ' +
  'target system’s own mechanics and format, (b) be BALANCED against comparable vanilla content of the same ' +
  'level/tier (and the party level if a campaign level is given), and (c) be clearly named. Do NOT invent ' +
  'content when a vanilla option already works. You MUST record EVERY invented element in the `custom` array ' +
  '(type, name, note) AND prefix each in `summary` with "CUSTOM:", so the user sees exactly what is homebrew.';

function transposeSystemPrompt(allowCustom: boolean): string {
  return TRANSPOSE_BASE + (allowCustom ? TRANSPOSE_ALLOW_CUSTOM : TRANSPOSE_VANILLA_ONLY);
}

/** A COMPLETE, readable digest of the source character so the AI can faithfully recreate everything it can do
 *  (Area MV/transpose quality). Unlike a name-only summary, this carries the descriptions, numbers and rules
 *  text the AI needs to preserve each ability — the difference between a stub and a real transposition. */
function sheetDigest(c: Character): string {
  const mod = (n: number) => Math.floor((n - 10) / 2);
  const profSaves = Object.entries(c.saves).filter(([, s]) => s.proficient).map(([k]) => k);
  const skills = Object.entries(c.skills)
    .filter(([, s]) => s.prof !== 'none')
    .map(([k, s]) => `${k}${s.prof === 'expertise' ? ' (expertise)' : ''}`);
  return JSON.stringify({
    identity: {
      name: c.meta.name, level: c.meta.level, role: c.meta.role, kicker: c.meta.kicker,
      className: c.meta.className, subclass: c.meta.subclass, species: c.meta.species,
      background: c.meta.background, alignment: c.meta.alignment, profession: c.meta.profession,
    },
    abilities: c.abilities,
    abilityMods: Object.fromEntries(Object.entries(c.abilities).map(([k, v]) => [k, mod(v as number)])),
    saveProficiencies: profSaves,
    skillProficiencies: skills,
    combat: {
      ac: c.combat.ac, speed: c.combat.speed, maxHp: c.combat.maxHp, hitDiceSize: c.combat.hitDiceSize,
      hitDiceTotal: c.combat.hitDiceTotal, conditions: c.combat.conditions ?? [], exhaustion: c.combat.exhaustion,
    },
    attacks: c.attacks.map((a) => ({ name: a.name, ability: a.ability, bonusToHit: a.bonusToHit, damage: a.damage, damageType: a.damageType, notes: a.notes })),
    features: c.features.map((f) => ({ name: f.name, text: (f.body ?? []).join(' ') })),
    traits: c.traits ?? [],
    spellcasting: c.spellcasting ? { ability: c.spellcasting.ability } : undefined,
    spells: (c.spells ?? []).map((s) => ({ name: s.name, level: s.level, school: s.school, text: s.description })),
    resources: c.resources.map((r) => ({ name: r.name, max: r.max })),
    inventory: c.inventory.map((i) => ({ name: i.name, kind: i.kind, equipped: i.equipped, desc: i.desc })),
    feats: (c.build?.choices ?? []).filter((ch) => ch.featKey || ch.homebrew).map((ch) => ch.featKey ?? ch.homebrew?.name),
    customContent: (c.homebrewClasses ?? []).map((h) => h.name),
  });
}

/** The generic HP a level-N character of the given hit die + CON should have (target-system agnostic): a full
 *  first die + average of the die each later level, plus CON per level. A safety net so a transposed sheet is
 *  never left at the blank seed's 1 HP when the AI forgets to set it (the bug the owner hit). */
function fallbackMaxHp(level: number, hitDie: number, conMod: number): number {
  const die = hitDie >= 4 ? hitDie : 8;
  const avg = Math.floor(die / 2) + 1; // 5 for d8, 6 for d10, …
  const lv = Math.max(1, level);
  return Math.max(1, die + conMod + (lv - 1) * (avg + conMod));
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
  // Consent from the transpose prompt (Area TR2/TR3): may the AI create balanced custom content? Defaults
  // false (strict vanilla) so a missing/legacy caller never silently invents content.
  const allowCustom = body?.allowCustom === true;

  // The active sheet's slot metadata (kind/name/slotId) persists in the system_variants jsonb (MV2b) since the
  // character columns have no such fields; fold it onto the live active sheet.
  const activeMeta = readActiveSlotMeta(row.system_variants);
  const active: ActiveSheet = {
    system: normalizeSystem(row.system),
    data: row.data ?? blankCharacter(row.name),
    sheet_type: row.sheet_type || 'default',
    custom_layout: row.custom_layout,
    custom_css: row.custom_css ?? '',
    ...(activeMeta.slotId ? { slotId: activeMeta.slotId } : {}),
    kind: activeMeta.kind,
    ...(activeMeta.name ? { name: activeMeta.name } : {}),
  };
  const variants = readVariants(row.system_variants);

  // ── Switch to a SPECIFIC stored slot (Area MV2b) — a character can hold multiple sheets per system. ──
  if (typeof body?.slotId === 'string' && body.slotId) {
    let next;
    try { next = switchToSlot(active, variants, body.slotId); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'No such sheet.' }, { status: 400 }); }
    const { error } = await supabaseAdmin
      .from('dnd_characters')
      .update({
        system: next.active.system,
        data: next.active.data,
        sheet_type: next.active.sheet_type,
        custom_layout: next.active.custom_layout ?? { blocks: [] },
        custom_css: next.active.custom_css ?? '',
        system_variants: withActiveSlotMeta(next.variants, next.active),
      })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, kind: 'switch-slot', slotId: body.slotId, system: next.active.system });
  }

  // ── Add a new (blank) sheet slot for a playable system, without switching to it (Area MV2b). ──
  if (body?.action === 'add') {
    if (!isSystemAvailable(target)) return NextResponse.json({ error: 'That system is not available to build.' }, { status: 400 });
    const kind = body?.kind === 'custom' ? 'custom' : 'vanilla';
    const { variants: withNew, slotId } = addSheetSlot(variants, {
      system: target, kind,
      name: typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : undefined,
      data: blankCharacter(row.name), // a fresh blank sheet in the target system
    });
    const { error } = await supabaseAdmin
      .from('dnd_characters')
      .update({ system_variants: withActiveSlotMeta(withNew, active) }) // active sheet unchanged
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, kind: 'add-sheet', slotId, system: target, sheetKind: kind });
  }

  // The active sheet's slot id as the UI sees it (matches listSheets): its real slotId or the `active:` marker.
  const activeSlotId = active.slotId ?? `active:${active.system}`;

  // ── Rename a sheet (Area MV) — the active one (via its meta) or a stored slot. ──
  if (body?.action === 'rename' && typeof body?.slotId === 'string') {
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (body.slotId === activeSlotId) {
      const renamedActive: ActiveSheet = { ...active, name: name || undefined };
      const { error } = await supabaseAdmin
        .from('dnd_characters')
        .update({ system_variants: withActiveSlotMeta(variants, renamedActive) }) // active columns unchanged
        .eq('id', params.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, kind: 'rename', slotId: body.slotId });
    }
    if (!(body.slotId in variants)) return NextResponse.json({ error: 'No such sheet.' }, { status: 400 });
    const next = renameVariant(variants, body.slotId, name);
    const { error } = await supabaseAdmin
      .from('dnd_characters')
      .update({ system_variants: withActiveSlotMeta(next, active) })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, kind: 'rename', slotId: body.slotId });
  }

  // ── Delete a STORED sheet (Area MV) — never the active one (switch away first). ──
  if (body?.action === 'delete' && typeof body?.slotId === 'string') {
    if (body.slotId === activeSlotId) return NextResponse.json({ error: 'Switch to another sheet before deleting this one.' }, { status: 400 });
    if (!(body.slotId in variants)) return NextResponse.json({ error: 'No such sheet.' }, { status: 400 });
    const next = deleteVariant(variants, body.slotId);
    const { error } = await supabaseAdmin
      .from('dnd_characters')
      .update({ system_variants: withActiveSlotMeta(next, active) })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, kind: 'delete', slotId: body.slotId });
  }

  // A forced transpose (Area MV): build ANOTHER sheet for `target` via the AI, as a NEW slot, keeping any
  // sheet the system already has (e.g. a custom version beside the vanilla one, or a second same-system build).
  // Unlike a plain system change it neither no-ops when target is the current system nor switches to an
  // existing variant — it always produces a fresh, now-active sheet.
  const forceNewSheet = body?.action === 'transpose';

  // Already active — nothing to do (unless we're explicitly building an additional sheet for it).
  if (target === active.system && !forceNewSheet) return NextResponse.json({ ok: true, kind: 'noop', system: target });

  // ── Existing variant → just switch (snapshot current, load target). ─────────────────
  if (hasVariant(active, variants, target) && !forceNewSheet) {
    const next = switchActive(active, variants, target);
    const { error } = await supabaseAdmin
      .from('dnd_characters')
      .update({
        system: next.active.system,
        data: next.active.data,
        sheet_type: next.active.sheet_type,
        custom_layout: next.active.custom_layout ?? { blocks: [] },
        custom_css: next.active.custom_css ?? '',
        system_variants: withActiveSlotMeta(next.variants, next.active),
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

  // The campaign's party level, if this character is in one — so custom content can be balanced to it.
  const partyLevel = typeof body?.partyLevel === 'number' ? body.partyLevel : undefined;

  type CustomEntry = { type: string; name: string; note?: string };
  let result;
  try {
    result = await dndToolCall<{ summary?: string; edits: SheetEdit[]; custom?: CustomEntry[] }>({
      system: [transposeSystemPrompt(allowCustom), grounding?.instruction].filter(Boolean).join('\n\n'),
      user: [
        `Target system: ${label}. Rebuild this character under ${label} only.`,
        allowCustom
          ? 'Custom content IS permitted where no vanilla option fits. Be thorough — preserve EVERY signature ability, weapon, spell and stance, inventing balanced homebrew where needed, and record each in `custom`.'
          : 'Custom content is NOT permitted — use only official target-system content.',
        typeof partyLevel === 'number' ? `Campaign party level: ${partyLevel} — balance any custom content to this.` : null,
        `Source character (system: ${systemLabel(active.system)}). Recreate everything it can do:\n${sheetDigest(source)}`,
        grounding?.block || null,
      ].filter(Boolean).join('\n\n'),
      tools: [SHEET_EDIT_TOOL],
      toolChoice: { type: 'tool', name: 'edit_sheet' },
      maxTokens: 8192, // a full character (all stats, features, spells + any custom content) needs the room
      temperature: 0.4,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Transposition failed.' }, { status: 502 });
  }
  const edits = result?.input?.edits;
  if (!Array.isArray(edits) || edits.length === 0) return NextResponse.json({ error: 'The AI did not produce a transposed sheet.' }, { status: 502 });
  const customList = Array.isArray(result?.input?.custom) ? result.input.custom.filter((c) => c && c.name) : [];

  // Start from a blank sheet carrying the concept forward, then apply the target-system edits.
  const seed = blankCharacter(source.meta.name);
  seed.meta = { ...seed.meta, level: source.meta.level, species: source.meta.species, role: source.meta.role };
  const transposed = applySheetEdits(seed, edits);

  // ── HP safety net (Area MV/transpose quality) — the blank seed carries 1 HP; if the AI didn't set a real
  //    max HP the sheet would read "1 hp" (the bug the owner hit twice). Repair it from the level + hit die. ──
  const lvl = Math.max(1, transposed.meta.level || source.meta.level || 1);
  const conMod = Math.floor(((transposed.abilities?.con ?? 10) - 10) / 2);
  if (!transposed.combat.maxHp || transposed.combat.maxHp <= 1) {
    transposed.combat.maxHp = fallbackMaxHp(lvl, transposed.combat.hitDiceSize || 8, conMod);
  }
  // Full up on creation: a freshly-built sheet should start at full HP, not the seed's 1.
  if (!transposed.combat.currentHp || transposed.combat.currentHp <= 1 || transposed.combat.currentHp > transposed.combat.maxHp) {
    transposed.combat.currentHp = transposed.combat.maxHp;
  }
  if (!transposed.combat.hitDiceTotal || transposed.combat.hitDiceTotal < 1) transposed.combat.hitDiceTotal = lvl;
  if (!transposed.combat.hitDiceRemaining || transposed.combat.hitDiceRemaining > transposed.combat.hitDiceTotal) transposed.combat.hitDiceRemaining = transposed.combat.hitDiceTotal;

  // ── Flag every AI-invented element on the sheet (Area MV) — so the built character shows CLEARLY what is
  //    custom vs vanilla. Match the `custom` list by name against features/attacks/spells/inventory. ──
  if (customList.length) {
    const isCustom = (n: string) => customList.some((c) => c.name.trim().toLowerCase() === n.trim().toLowerCase());
    transposed.features = transposed.features.map((f) => (isCustom(f.name) ? { ...f, customized: true } : f));
    transposed.attacks = transposed.attacks.map((a) => (isCustom(a.name) ? { ...a, customized: true } : a));
    transposed.spells = (transposed.spells ?? []).map((s) => (isCustom(s.name) ? { ...s, customized: true } : s));
    transposed.inventory = transposed.inventory.map((i) => (isCustom(i.name) ? { ...i, customized: true } : i));
  }
  // Label the new sheet Vanilla/Custom by the consent (Area MV). A forced transpose ADDS a slot (keeping any
  // existing sheet for the system); a plain transpose installs it as the system's sheet.
  const kind = allowCustom ? 'custom' : 'vanilla';
  const newName = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : undefined;
  const next = forceNewSheet
    ? installTransposedNewSlot(active, variants, target, transposed, { kind, name: newName })
    : installTransposed(active, variants, target, transposed, { kind });

  const { error } = await supabaseAdmin
    .from('dnd_characters')
    .update({
      system: next.active.system,
      data: next.active.data,
      sheet_type: next.active.sheet_type,
      custom_layout: next.active.custom_layout ?? { blocks: [] },
      custom_css: next.active.custom_css ?? '',
      system_variants: withActiveSlotMeta(next.variants, next.active),
    })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Safety net (Slice 3): confirm the transposed sheet actually fits the target system.
  const violations = validateCharacterForSystem(transposed, target);
  return NextResponse.json({
    ok: true, kind: 'transpose', system: target, allowedCustom: allowCustom,
    summary: result?.input?.summary ?? null, editCount: edits.length, violations,
    custom: customList, // every AI-invented element (type, name, note) — shown to the user + flagged on the sheet
    hp: transposed.combat.maxHp, // surfaced so the client can confirm HP was built (never the 1-HP stub)
  });
}
