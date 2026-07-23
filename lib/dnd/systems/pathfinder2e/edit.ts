// lib/dnd/systems/pathfinder2e/edit.ts — the PURE, incremental in-play edits for a Pathfinder 2e character
// sidecar (PF2Character). PF2 had a build/picks tool but NO way to change one thing in place — the AI could
// assemble a character but not apply the most common in-play changes (damage, healing, the dying/wounded
// death track). These pure, immutable ops close that (Area SQ4), mirroring the IG edit vocabulary. Nothing
// here invents rules; it only moves the character's own HP + death-track numbers, clamped to legal ranges.
//
// HP note: PF2's stored `currentHp` uses 0 to mean "full/unset" (the sheet renders maxHp then). Damage/heal
// therefore resolve against the EFFECTIVE current (currentHp || maxHp) and write a real value back.
import type { PF2Character, PF2AttributeKey, PF2Feat, PF2KnownSpell, PF2Rank } from './model';
import { PF2_ATTRIBUTES } from './model';
import { pf2MaxHp } from './rules';
import type { DownedDamageModel } from '@/lib/dnd/preferences';

export type PF2Edit =
  | { op: 'apply_damage'; amount: number; crit?: boolean }
  | { op: 'heal'; amount: number }
  | { op: 'set_temp_hp'; amount: number }
  | { op: 'set_dying'; value: number }
  | { op: 'set_wounded'; value: number }
  // Hero Points (0–3) — spend to reroll a check or (at 3) avoid death. A core always-on PF2 resource.
  | { op: 'set_hero_points'; value: number }
  // Focus Points (0–3) — the pool focus spells are cast from; refills to max on a 10-minute Refocus.
  | { op: 'set_focus_points'; value: number }
  // Set (or, with value 0, clear) a PF2 condition by name — Frightened 2, Sickened 1, Prone. The sheet folds
  // active conditions into rolls under PF2's non-stacking penalty rule.
  | { op: 'set_condition'; name: string; value: number }
  // Set one attribute MODIFIER directly (PF2 tracks modifiers in play, not scores) — e.g. STR +4. Clamped to the
  // legal −5..12 range. Parity with the IG set_ability edit; lets the AI adjust a stat in place.
  | { op: 'set_attribute'; attribute: PF2AttributeKey; value: number }
  // ── Content-adding ops (PF2 buildout S13) ─────────────────────────────────────────────────────
  // PF2 previously had NO way to add content — only in-play state changes — which is why the
  // vanilla-rules audit found "nothing to gate" here. These are the ops the rules gate checks.
  // `offRules` is SERVER-SET by that gate, never supplied by the AI or the client, or "this isn't
  // off-rules" becomes a claim the caller makes rather than a fact we check.
  | { op: 'add_feat'; name: string; level?: number; track?: PF2Feat['track']; traits?: string[]; body?: string; offRules?: string }
  | { op: 'remove_feat'; name: string }
  | { op: 'add_spell'; name: string; rank: number; prepared?: boolean; focus?: boolean; offRules?: string }
  | { op: 'remove_spell'; name: string }
  // ── Editing what the character already holds (S15) ────────────────────────────────────────────
  // Retuning an element the character legitimately holds is a CUSTOMISATION, not a fresh
  // acquisition, so these are never re-gated against the catalog — see gatePf2Edit. `customized`
  // is stamped by the apply step rather than the caller, so it cannot be faked off.
  | { op: 'update_spell'; name: string; to?: string; rank?: number; prepared?: boolean; effect?: string }
  | { op: 'update_feat'; name: string; to?: string; level?: number; track?: PF2Feat['track']; body?: string }
  // ── Weapons (S15d) ────────────────────────────────────────────────────────────────────────────
  // A Strike on the sheet. `damage` is the BASE die ("1d8"); traits, striking runes and the crit
  // rules are resolved at render by pf2ResolveStrike rather than baked into a string, so an edited
  // weapon computes instead of merely displaying.
  | { op: 'add_attack'; name: string; attribute?: PF2AttributeKey; damage?: string; damageType?: string; traits?: string[]; weaponBonus?: number; striking?: string; runes?: string[] }
  | { op: 'update_attack'; name: string; to?: string; attribute?: PF2AttributeKey; damage?: string; damageType?: string; traits?: string[]; weaponBonus?: number; striking?: string; runes?: string[] }
  | { op: 'remove_attack'; name: string }
  // ── Armor (S15d) ──────────────────────────────────────────────────────────────────────────────
  // Armor is a single worn set, not a list, so this SETS rather than adds. Every field feeds
  // `pf2ArmorClass` directly, which is why the editor exists at all: armor that displays but does
  // not move AC is worse than no armor field.
  | { op: 'set_armor'; name?: string; acBonus?: number; dexCap?: number | null; checkPenalty?: number; rank?: PF2Rank; runes?: string[] };

/** Options governing house-rule-configurable behavior of an edit. */
export interface PF2EditOptions {
  /** Downed-damage model (the downedDamageModel preference). 'official' (default) — damage to an already-
   *  dying creature raises its Dying value (by 1, or 2 on a crit), per PF2 RAW. 'off' — a downed creature's
   *  Dying only advances from failed recovery saves, never from fresh damage. */
  downedDamageModel?: DownedDamageModel;
}

/** The op names the AI tool + API accept. */
export const PF2_EDIT_OPS = ['apply_damage', 'heal', 'set_temp_hp', 'set_dying', 'set_wounded', 'set_hero_points', 'set_focus_points', 'set_condition', 'set_attribute', 'add_feat', 'remove_feat', 'add_spell', 'remove_spell', 'update_spell', 'update_feat', 'add_attack', 'update_attack', 'remove_attack', 'set_armor'] as const;

/** The legal range for a PF2 attribute MODIFIER (level-20 apex ≈ +7–8; the cap is generous headroom). */
const ATTR_MIN = -5;
const ATTR_MAX = 12;
export type PF2EditOp = (typeof PF2_EDIT_OPS)[number];

const DYING_MAX = 4; // PF2: Dying 4 = dead.
const HERO_POINTS_MAX = 3; // PF2: you can hold at most 3 Hero Points.
const FOCUS_POINTS_MAX = 3; // PF2: the focus pool caps at 3.

/** Apply one edit, returning a NEW PF2Character (input never mutated). A no-op edit returns the input. */
export function applyPf2Edit(pf2: PF2Character, edit: PF2Edit, opts: PF2EditOptions = {}): PF2Character {
  const downedDamageModel: DownedDamageModel = opts.downedDamageModel ?? 'official';
  const combat = { ...pf2.combat };
  const maxHp = pf2MaxHp(pf2);
  // Stored currentHp uses 0 to mean "full" — UNLESS the character is Dying, in which case 0 is genuinely 0 HP
  // (the death track disambiguates the two meanings of a stored 0). This is the effective current HP.
  const effCur = combat.currentHp || (combat.dyingValue > 0 ? 0 : maxHp);

  switch (edit.op) {
    case 'apply_damage': {
      // Damage is soaked by temp HP first (PF2), then reduces real HP; currentHp floors at 0.
      const amount = Math.max(0, Math.round(edit.amount || 0));
      if (!amount) return pf2;
      const temp = Number(combat.tempHp) || 0;
      const fromTemp = Math.min(temp, amount);
      combat.tempHp = temp - fromTemp;
      const next = Math.max(0, effCur - (amount - fromTemp));
      combat.currentHp = next;
      // PF2: reduced to 0 HP → you fall unconscious and gain Dying equal to 1 + your Wounded value.
      // This fires on the transition to 0 (`effCur > 0`).
      if (next === 0 && effCur > 0) {
        combat.dyingValue = Math.min(DYING_MAX, Math.max(combat.dyingValue, (Number(combat.woundedValue) || 0) + 1));
      } else if (next === 0 && effCur === 0 && combat.dyingValue > 0 && downedDamageModel === 'official') {
        // PF2 RAW: a creature that is ALREADY dying and takes damage increases its Dying value by 1, or by 2
        // on a critical hit. The downedDamageModel preference gates this — 'off' leaves a downed PC's death
        // clock to advance only on failed recovery saves (a gentler house rule).
        combat.dyingValue = Math.min(DYING_MAX, combat.dyingValue + (edit.crit ? 2 : 1));
      }
      return { ...pf2, combat };
    }
    case 'heal': {
      const amount = Math.max(0, Math.round(edit.amount || 0));
      if (!amount) return pf2;
      combat.currentHp = Math.min(maxHp, effCur + amount);
      // PF2: regaining HP while Dying removes the Dying condition — AND each time you LOSE the Dying condition
      // you increase your Wounded value by 1 (so the next drop is more dangerous). Both apply here.
      if (combat.currentHp > 0 && combat.dyingValue) {
        combat.dyingValue = 0;
        combat.woundedValue = (Number(combat.woundedValue) || 0) + 1;
      }
      return { ...pf2, combat };
    }
    case 'set_temp_hp': {
      combat.tempHp = Math.max(0, Math.round(edit.amount || 0));
      return { ...pf2, combat };
    }
    case 'set_dying': {
      // Dying is 0–4 (4 = dead). Setting Dying to 0+ is legal; the wounded value is unchanged here.
      combat.dyingValue = Math.max(0, Math.min(DYING_MAX, Math.round(edit.value || 0)));
      return { ...pf2, combat };
    }
    case 'set_wounded': {
      combat.woundedValue = Math.max(0, Math.round(edit.value || 0));
      return { ...pf2, combat };
    }
    case 'set_hero_points': {
      // 0–3 is the RAW range (start a session with 1, GM awards more, spend to reroll / avoid death).
      combat.heroPoints = Math.max(0, Math.min(HERO_POINTS_MAX, Math.round(edit.value || 0)));
      return { ...pf2, combat };
    }
    case 'set_focus_points': {
      // The focus pool holds at most 3 (RAW cap); a spent point returns via a 10-minute Refocus.
      const v = Math.max(0, Math.min(FOCUS_POINTS_MAX, Math.round(edit.value || 0)));
      return { ...pf2, spellcasting: { ...pf2.spellcasting, focusPoints: v } };
    }
    case 'set_condition': {
      // Upsert the condition by name; value 0 removes it. Values clamp to 0–10 (well past any real cap).
      const name = edit.name.trim();
      const value = Math.max(0, Math.min(10, Math.round(edit.value || 0)));
      const list = (combat.conditions ?? []).filter((c) => c.name.toLowerCase() !== name.toLowerCase());
      if (value > 0) list.push({ name, value });
      combat.conditions = list;
      return { ...pf2, combat };
    }
    case 'set_attribute': {
      if (!(PF2_ATTRIBUTES as readonly string[]).includes(edit.attribute) || !Number.isFinite(edit.value)) return pf2;
      const value = Math.min(ATTR_MAX, Math.max(ATTR_MIN, Math.round(edit.value)));
      return { ...pf2, attributes: { ...pf2.attributes, [edit.attribute]: value } };
    }
    case 'add_feat': {
      const name = edit.name.trim();
      if (!name) return pf2;
      // Upsert by name so re-adding refines rather than duplicating, matching every other add op
      // in the platform.
      const feat: PF2Feat = {
        id: `pf2-feat-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
        name,
        level: Math.max(1, Math.min(20, Math.round(edit.level ?? pf2.identity.level ?? 1))),
        track: edit.track ?? 'class',
        traits: edit.traits ?? [],
        body: edit.body ?? '',
        ...(edit.offRules ? { offRules: edit.offRules } : {}),
      };
      return { ...pf2, feats: [...(pf2.feats ?? []).filter((f) => f.name.toLowerCase() !== name.toLowerCase()), feat] };
    }
    case 'remove_feat': {
      const name = edit.name.trim();
      if (!name) return pf2;
      return { ...pf2, feats: (pf2.feats ?? []).filter((f) => f.name.toLowerCase() !== name.toLowerCase()) };
    }
    case 'add_spell': {
      const name = edit.name.trim();
      if (!name) return pf2;
      const spell: PF2KnownSpell = {
        name,
        rank: Math.max(0, Math.min(10, Math.round(edit.rank || 0))),
        ...(edit.prepared ? { prepared: true } : {}),
        ...(edit.focus ? { focus: true } : {}),
        ...(edit.offRules ? { offRules: edit.offRules } : {}),
      };
      const kept = (pf2.spellcasting.spells ?? []).filter((s) => s.name.toLowerCase() !== name.toLowerCase());
      return { ...pf2, spellcasting: { ...pf2.spellcasting, spells: [...kept, spell] } };
    }
    case 'remove_spell': {
      const name = edit.name.trim();
      if (!name) return pf2;
      const kept = (pf2.spellcasting.spells ?? []).filter((s) => s.name.toLowerCase() !== name.toLowerCase());
      // Drop the array entirely when it empties, so a character who never had spells is stored
      // exactly as before these ops existed.
      const next = { ...pf2.spellcasting };
      if (kept.length) next.spells = kept; else delete next.spells;
      return { ...pf2, spellcasting: next };
    }
    case 'update_spell': {
      const name = edit.name.trim().toLowerCase();
      const list = pf2.spellcasting.spells ?? [];
      const idx = list.findIndex((s) => s.name.toLowerCase() === name);
      if (idx === -1) return pf2; // nothing to update — never silently CREATE from an update
      const cur = list[idx];
      const next: PF2KnownSpell = {
        ...cur,
        ...(edit.to?.trim() ? { name: edit.to.trim() } : {}),
        ...(Number.isFinite(edit.rank as number) ? { rank: Math.max(0, Math.min(10, Math.round(edit.rank as number))) } : {}),
        ...(edit.prepared != null ? { prepared: edit.prepared } : {}),
        // Stamped here, not accepted from the caller — a hand-tuned element must not be able to
        // present itself as pristine.
        customized: true,
      };
      // `effect` is an OVERRIDE — absent means "use the catalog entry". So an emptied box must
      // DELETE the key rather than store "", or the spell renders as having no rules text at all
      // instead of falling back to the catalogue. Storing the blank is the obvious implementation
      // and it silently destroys the spell's rules; IG-S1 settled this exact question and the same
      // answer applies here. Clearing it is also the ONLY way to undo a customisation.
      if (edit.effect != null) {
        if (edit.effect.trim()) next.effect = edit.effect;
        else delete next.effect;
      }
      const spells = [...list];
      spells[idx] = next;
      return { ...pf2, spellcasting: { ...pf2.spellcasting, spells } };
    }
    case 'update_feat': {
      const name = edit.name.trim().toLowerCase();
      const idx = (pf2.feats ?? []).findIndex((f) => f.name.toLowerCase() === name);
      if (idx === -1) return pf2;
      const cur = pf2.feats[idx];
      const next: PF2Feat = {
        ...cur,
        ...(edit.to?.trim() ? { name: edit.to.trim() } : {}),
        ...(Number.isFinite(edit.level as number) ? { level: Math.max(1, Math.min(20, Math.round(edit.level as number))) } : {}),
        ...(edit.track ? { track: edit.track } : {}),
        // NOT symmetric with `update_spell`'s effect, deliberately. `PF2KnownSpell.effect` is an
        // OVERRIDE — absent falls back to the catalog — so emptying it must clear it. `PF2Feat.body`
        // is the feat's stored TEXT, copied from the catalog by `add_feat` and with nothing behind
        // it, so there is no catalogue text to fall back TO. Emptying it therefore stores the empty
        // text the player asked for. Making this "clear" would restore nothing and just make the
        // field impossible to blank. The asymmetry is in the shapes, not in the handling.
        ...(edit.body != null ? { body: edit.body } : {}),
        customized: true,
      };
      const feats = [...pf2.feats];
      feats[idx] = next;
      return { ...pf2, feats };
    }
    case 'add_attack': {
      const name = edit.name.trim();
      if (!name) return pf2;
      const attack = {
        id: `pf2-atk-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
        name,
        attribute: edit.attribute ?? 'STR',
        // A new Strike inherits the character's own attack proficiency rather than assuming
        // trained — a Fighter's weapons should not silently downgrade when one is added.
        rank: pf2.combat.attackRank,
        weaponBonus: Math.max(0, Math.min(3, Math.round(edit.weaponBonus ?? 0))),
        damage: edit.damage ?? '1d4',
        damageType: edit.damageType ?? '',
        traits: edit.traits ?? [],
        ...(edit.striking ? { striking: edit.striking } : {}),
        ...(edit.runes?.length ? { runes: edit.runes } : {}),
      } as PF2Character['attacks'][number];
      return { ...pf2, attacks: [...(pf2.attacks ?? []).filter((a) => a.name.toLowerCase() !== name.toLowerCase()), attack] };
    }
    case 'update_attack': {
      const name = edit.name.trim().toLowerCase();
      const idx = (pf2.attacks ?? []).findIndex((a) => a.name.toLowerCase() === name);
      if (idx === -1) return pf2; // never CREATE from an update
      const cur = pf2.attacks[idx];
      const next = {
        ...cur,
        ...(edit.to?.trim() ? { name: edit.to.trim() } : {}),
        ...(edit.attribute ? { attribute: edit.attribute } : {}),
        ...(edit.damage ? { damage: edit.damage } : {}),
        ...(edit.damageType != null ? { damageType: edit.damageType } : {}),
        ...(edit.traits ? { traits: edit.traits } : {}),
        ...(Number.isFinite(edit.weaponBonus as number) ? { weaponBonus: Math.max(0, Math.min(3, Math.round(edit.weaponBonus as number))) } : {}),
        ...(edit.striking ? { striking: edit.striking } : {}),
        ...(edit.runes ? { runes: edit.runes } : {}),
        customized: true,
      } as PF2Character['attacks'][number];
      const attacks = [...pf2.attacks];
      attacks[idx] = next;
      return { ...pf2, attacks };
    }
    case 'remove_attack': {
      const name = edit.name.trim().toLowerCase();
      if (!name) return pf2;
      return { ...pf2, attacks: (pf2.attacks ?? []).filter((a) => a.name.toLowerCase() !== name) };
    }
    case 'set_armor': {
      // Only the fields supplied are touched, so changing a rune's AC bonus does not silently
      // reset the Dex cap. `dexCap: null` is MEANINGFUL (uncapped/unarmored) and must survive the
      // partial-update logic, which is why it is checked with `!== undefined` rather than a
      // truthiness test that would swallow both null and 0.
      if (edit.name !== undefined) combat.armorName = edit.name.trim();
      if (edit.acBonus !== undefined && Number.isFinite(edit.acBonus)) {
        combat.acItemBonus = Math.max(0, Math.min(10, Math.round(edit.acBonus)));
      }
      if (edit.dexCap !== undefined) {
        combat.dexCap = edit.dexCap === null ? null : Math.max(0, Math.min(10, Math.round(edit.dexCap)));
      }
      if (edit.checkPenalty !== undefined && Number.isFinite(edit.checkPenalty)) {
        // A check penalty is a PENALTY: stored ≤ 0, so a caller passing 2 means −2 rather than a
        // bonus that would silently improve four skills.
        combat.armorCheckPenalty = -Math.abs(Math.round(edit.checkPenalty));
      }
      if (edit.rank) combat.armorRank = edit.rank;
      // An EMPTY rune list clears rather than being ignored, so unetching the last rune returns the
      // armor to its hand-entered bonus instead of stranding a bonus the character no longer has.
      // Same reasoning as IG-S1's "an emptied override CLEARS": absent means "don't touch", empty
      // means "there are none", and collapsing the two makes a removal impossible to express.
      if (edit.runes !== undefined) combat.armorRunes = edit.runes;
      return { ...pf2, combat };
    }
    default: {
      const _exhaustive: never = edit;
      void _exhaustive;
      return pf2;
    }
  }
}

/** Validate + normalize a raw payload into a PF2Edit, or an error string. */
export function parsePf2Edit(raw: unknown): { edit: PF2Edit } | { error: string } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const op = typeof o.op === 'string' ? o.op.trim() : '';
  if (!(PF2_EDIT_OPS as readonly string[]).includes(op)) {
    return { error: `Unknown edit op "${op}". Valid: ${PF2_EDIT_OPS.join(', ')}.` };
  }
  if (op === 'apply_damage' || op === 'heal' || op === 'set_temp_hp') {
    const amount = Math.max(0, Math.round(Number(o.amount) || 0));
    if ((op === 'apply_damage' || op === 'heal') && !amount) return { error: `The "${op}" edit needs a positive "amount".` };
    return { edit: { op, amount } };
  }
  if (op === 'set_condition') {
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) return { error: 'The "set_condition" edit needs a condition "name".' };
    const value = Math.max(0, Math.min(10, Math.round(Number(o.value) || 0)));
    return { edit: { op, name, value } };
  }
  if (op === 'set_attribute') {
    const attribute = String(o.attribute ?? '').trim().toUpperCase() as PF2AttributeKey;
    if (!(PF2_ATTRIBUTES as readonly string[]).includes(attribute)) return { error: `set_attribute needs an "attribute" of ${PF2_ATTRIBUTES.join('/')}.` };
    const v = Number(o.value);
    if (!Number.isFinite(v)) return { error: 'set_attribute needs a numeric "value" (the modifier).' };
    return { edit: { op, attribute, value: Math.min(ATTR_MAX, Math.max(ATTR_MIN, Math.round(v))) } };
  }
  // ── Content-adding ops (S13) ──────────────────────────────────────────────────────────────────
  // `offRules` is deliberately NOT read from the payload on any of these. It is stamped by the
  // rules gate after its own check; accepting it here would let a caller declare its own content
  // "not off-rules" — a claim rather than a fact.
  if (op === 'add_feat') {
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) return { error: 'The "add_feat" edit needs a feat "name".' };
    const TRACKS = ['ancestry', 'class', 'skill', 'general', 'archetype', 'feature'] as const;
    const rawTrack = String(o.track ?? '').trim().toLowerCase();
    const track = (TRACKS as readonly string[]).includes(rawTrack) ? (rawTrack as PF2Feat['track']) : undefined;
    const lvl = Number(o.level);
    return {
      edit: {
        op, name,
        ...(Number.isFinite(lvl) ? { level: Math.max(1, Math.min(20, Math.round(lvl))) } : {}),
        ...(track ? { track } : {}),
        ...(Array.isArray(o.traits) ? { traits: o.traits.map((t) => String(t ?? '').trim()).filter(Boolean) } : {}),
        ...(typeof o.body === 'string' ? { body: o.body } : {}),
      },
    };
  }
  if (op === 'add_spell') {
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) return { error: 'The "add_spell" edit needs a spell "name".' };
    const rank = Number(o.rank);
    if (!Number.isFinite(rank)) return { error: 'The "add_spell" edit needs a numeric "rank" (0 = cantrip).' };
    return {
      edit: {
        op, name, rank: Math.max(0, Math.min(10, Math.round(rank))),
        ...(o.prepared === true ? { prepared: true } : {}),
        ...(o.focus === true ? { focus: true } : {}),
      },
    };
  }
  if (op === 'update_spell' || op === 'update_feat') {
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) return { error: `The "${op}" edit needs the CURRENT "name" of the element to change.` };
    const to = typeof o.to === 'string' ? o.to.trim() : undefined;
    if (op === 'update_spell') {
      const rank = Number(o.rank);
      return {
        edit: {
          op, name,
          ...(to ? { to } : {}),
          ...(Number.isFinite(rank) ? { rank: Math.max(0, Math.min(10, Math.round(rank))) } : {}),
          ...(typeof o.prepared === 'boolean' ? { prepared: o.prepared } : {}),
          ...(typeof o.effect === 'string' ? { effect: o.effect } : {}),
        },
      };
    }
    const TRACKS = ['ancestry', 'class', 'skill', 'general', 'archetype', 'feature'] as const;
    const rawTrack = String(o.track ?? '').trim().toLowerCase();
    const track = (TRACKS as readonly string[]).includes(rawTrack) ? (rawTrack as PF2Feat['track']) : undefined;
    const lvl = Number(o.level);
    return {
      edit: {
        op, name,
        ...(to ? { to } : {}),
        ...(Number.isFinite(lvl) ? { level: Math.max(1, Math.min(20, Math.round(lvl))) } : {}),
        ...(track ? { track } : {}),
        ...(typeof o.body === 'string' ? { body: o.body } : {}),
      },
    };
  }
  if (op === 'add_attack' || op === 'update_attack') {
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) return { error: `The "${op}" edit needs a weapon "name".` };
    const attr = String(o.attribute ?? '').trim().toUpperCase();
    const bonus = Number(o.weaponBonus);
    const STRIKING = ['none', 'striking', 'greater', 'major'];
    const striking = String(o.striking ?? '').trim().toLowerCase();
    return {
      edit: {
        op, name,
        ...(typeof o.to === 'string' && o.to.trim() ? { to: o.to.trim() } : {}),
        ...((PF2_ATTRIBUTES as readonly string[]).includes(attr) ? { attribute: attr as PF2AttributeKey } : {}),
        ...(typeof o.damage === 'string' && o.damage.trim() ? { damage: o.damage.trim() } : {}),
        ...(typeof o.damageType === 'string' ? { damageType: o.damageType.trim() } : {}),
        ...(Array.isArray(o.traits) ? { traits: o.traits.map((t) => String(t ?? '').trim()).filter(Boolean) } : {}),
        // Potency runes cap at +3; a larger value is a mistake, not a house rule, so clamp rather
        // than store it.
        ...(Number.isFinite(bonus) ? { weaponBonus: Math.max(0, Math.min(3, Math.round(bonus))) } : {}),
        ...(STRIKING.includes(striking) ? { striking } : {}),
        ...(Array.isArray(o.runes) ? { runes: o.runes.map((r) => String(r ?? '').trim()).filter(Boolean) } : {}),
      } as PF2Edit,
    };
  }
  if (op === 'set_armor') {
    const RANKS = ['untrained', 'trained', 'expert', 'master', 'legendary'];
    const rank = String(o.rank ?? '').trim().toLowerCase();
    const ac = Number(o.acBonus);
    const cp = Number(o.checkPenalty);
    // `dexCap: null` means uncapped and must reach the apply step intact, so null is forwarded
    // rather than filtered out with the absent case.
    const dexCapGiven = o.dexCap !== undefined;
    const dexNum = Number(o.dexCap);
    return {
      edit: {
        op,
        ...(typeof o.name === 'string' ? { name: o.name.trim() } : {}),
        ...(Number.isFinite(ac) ? { acBonus: Math.max(0, Math.min(10, Math.round(ac))) } : {}),
        ...(dexCapGiven ? { dexCap: o.dexCap === null || !Number.isFinite(dexNum) ? null : Math.max(0, Math.min(10, Math.round(dexNum))) } : {}),
        ...(Number.isFinite(cp) ? { checkPenalty: -Math.abs(Math.round(cp)) } : {}),
        ...(RANKS.includes(rank) ? { rank: rank as PF2Rank } : {}),
        // Rune names are free text by design: the catalog resolves the ones it knows and reports
        // the ones it does not (`pf2ResolveRunes`), so homebrew runes stay expressible under
        // Ground Rule 4 rather than being rejected at the door. Blanks are dropped so a stray
        // empty box cannot become a rune named "".
        ...(Array.isArray(o.runes)
          ? { runes: (o.runes as unknown[]).map((r) => String(r ?? '').trim()).filter(Boolean) }
          : {}),
      } as PF2Edit,
    };
  }
  if (op === 'remove_attack') {
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) return { error: 'The "remove_attack" edit needs a weapon "name".' };
    return { edit: { op, name } };
  }
  if (op === 'remove_feat' || op === 'remove_spell') {
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) return { error: `The "${op}" edit needs a "name".` };
    return { edit: { op, name } };
  }

  // set_dying / set_wounded carry a `value` (0 is legal — it clears the track).
  const value = Math.max(0, Math.round(Number(o.value) || 0));
  return { edit: { op, value } as PF2Edit };
}

/** A short human description of an edit (for the audit trail / AI echo). */
export function describePf2Edit(edit: PF2Edit): string {
  switch (edit.op) {
    case 'apply_damage': return `Took ${edit.amount} damage.`;
    case 'heal': return `Healed ${edit.amount} HP.`;
    case 'set_temp_hp': return edit.amount ? `Gained ${edit.amount} temporary HP.` : 'Cleared temporary HP.';
    case 'set_dying': return edit.value ? `Now Dying ${edit.value}.` : 'No longer Dying.';
    case 'set_wounded': return edit.value ? `Now Wounded ${edit.value}.` : 'No longer Wounded.';
    case 'set_hero_points': return `${edit.value} Hero Point${edit.value === 1 ? '' : 's'}.`;
    case 'set_focus_points': return `${edit.value} Focus Point${edit.value === 1 ? '' : 's'}.`;
    case 'set_condition': return edit.value ? `Now ${edit.name} ${edit.value}.` : `No longer ${edit.name}.`;
    case 'set_attribute': return `Set ${edit.attribute} to ${edit.value >= 0 ? '+' : ''}${edit.value}.`;
    case 'add_feat': return `Gained the ${edit.name} feat${edit.offRules ? ` (off-rules: ${edit.offRules})` : ''}.`;
    case 'remove_feat': return `Lost the ${edit.name} feat.`;
    case 'add_spell': return `Learned ${edit.name}${edit.rank === 0 ? ' (cantrip)' : ` (rank ${edit.rank})`}${edit.offRules ? ` — off-rules: ${edit.offRules}` : ''}.`;
    case 'remove_spell': return `Lost ${edit.name}.`;
    case 'update_spell': return `Customised ${edit.name}${edit.to ? ` → ${edit.to}` : ''}.`;
    case 'update_feat': return `Customised the ${edit.name} feat${edit.to ? ` → ${edit.to}` : ''}.`;
    case 'add_attack': return `Added the weapon ${edit.name}.`;
    case 'update_attack': return `Customised ${edit.name}${edit.to ? ` → ${edit.to}` : ''}.`;
    case 'remove_attack': return `Removed the weapon ${edit.name}.`;
    case 'set_armor': return edit.name ? `Now wearing ${edit.name}.` : 'Updated armor.';
    default: return 'No change.';
  }
}
