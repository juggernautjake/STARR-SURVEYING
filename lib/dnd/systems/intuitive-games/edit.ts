// lib/dnd/systems/intuitive-games/edit.ts — the PURE, incremental edit operations for an Intuitive Games
// character sidecar (IGCharacter). The bespoke IG sheet was rebuild-only; these let the sheet AND the AI
// change one thing in place — enter/leave a stance, apply/remove a condition — without re-running the whole
// builder. Pure + immutable (returns a new IGCharacter) so it's unit-testable and the API route + the AI
// tool are thin wrappers over the same logic. Stance is one-active-at-a-time (combat.stances holds the
// active stance; ig.stances holds the known set). Nothing here invents rules — it only moves names around.

import type { IGCharacter, IGAbilityKey } from './model';
import { findIGFeat } from './feats';
import { igMaxHp } from './rules';

export type IGEdit =
  | { op: 'set_active_stance'; name: string }
  | { op: 'clear_stance' }
  | { op: 'add_condition'; name: string }
  | { op: 'remove_condition'; name: string }
  | { op: 'add_feat'; name: string }
  | { op: 'remove_feat'; name: string }
  | { op: 'add_power'; name: string }
  | { op: 'remove_power'; name: string }
  // LEARN a stance, i.e. add it to `ig.stances` (the known set) — distinct from `set_active_stance`,
  // which sets `combat.stances` (the one currently held). Added for CX-13: the library can grant a
  // stance, and until now the known set was writable ONLY at build time, so the sheet could enter a
  // stance it had no way to record ever having learned. Deliberately ungated, exactly as
  // `set_active_stance` is — a level-1 trait may be taken as "a new stance", so holding one off your
  // class list is legal play (eligibility.ts states this).
  | { op: 'add_stance'; name: string }
  | { op: 'set_defensive_power'; name: string }
  | { op: 'apply_damage'; amount: number; nonlethal?: boolean }
  | { op: 'heal'; amount: number }
  | { op: 'set_ability'; ability: IGAbilityKey; value: number }
  // ── Editing and authoring (IG parity with PF2 S15) ───────────────────────────────────────────
  // IG could ADD catalogued content and remove it, but never CHANGE what it held or author
  // anything new — the 2024 and PF2 sheets both can. `customized` is stamped by the apply step,
  // never taken from the caller, so a hand-tuned element cannot present itself as pristine.
  | { op: 'update_power'; name: string; to?: string; effect?: string }
  | { op: 'update_feat'; name: string; to?: string; effect?: string }
  // Attacks: IG had no way to add or edit a weapon at all, so a character's Strikes were fixed at
  // build time. `damage` is the base die; the sheet's own maths adds ability and bonuses.
  | { op: 'add_attack'; name: string; weaponType?: string; ability?: IGAbilityKey; damage?: string; properties?: string; proficient?: boolean; bonusToHit?: number; bonusDamage?: number }
  | { op: 'update_attack'; name: string; to?: string; weaponType?: string; ability?: IGAbilityKey; damage?: string; properties?: string; proficient?: boolean; bonusToHit?: number; bonusDamage?: number }
  | { op: 'remove_attack'; name: string };

/** The op names the AI tool + API accept. */
export const IG_EDIT_OPS = ['set_active_stance', 'clear_stance', 'add_stance', 'add_condition', 'remove_condition', 'add_feat', 'remove_feat', 'add_power', 'remove_power', 'set_defensive_power', 'apply_damage', 'heal', 'set_ability', 'update_power', 'update_feat', 'add_attack', 'update_attack', 'remove_attack'] as const;

/** The IG ability keys + the sane bounds a set_ability edit clamps to. */
const IG_ABILITY_KEYS: readonly IGAbilityKey[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const ABILITY_MIN = 1;
const ABILITY_MAX = 30;
export type IGEditOp = typeof IG_EDIT_OPS[number];

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Apply one edit, returning a NEW IGCharacter (the input is never mutated). Unknown/no-op edits return the
 *  input unchanged, so a bad payload can't corrupt the sheet. */
export function applyIgEdit(ig: IGCharacter, edit: IGEdit): IGCharacter {
  const combat = { ...ig.combat };
  switch (edit.op) {
    case 'set_active_stance': {
      const name = edit.name.trim();
      if (!name) return ig;
      // One stance is active at a time — entering a stance replaces any current one.
      combat.stances = [name];
      return { ...ig, combat };
    }
    case 'clear_stance': {
      if (combat.stances.length === 0) return ig;
      combat.stances = [];
      return { ...ig, combat };
    }
    case 'add_stance': {
      // Adds to the KNOWN set (`ig.stances`), never to `combat.stances` — being taught a stance is
      // not the same as standing in it, and conflating the two would silently drop whatever stance
      // the character was already holding.
      const name = edit.name.trim();
      if (!name || ig.stances.some((s) => eq(s, name))) return ig;
      return { ...ig, stances: [...ig.stances, name] };
    }
    case 'add_condition': {
      const name = edit.name.trim();
      if (!name || combat.conditions.some((c) => eq(c, name))) return ig;
      combat.conditions = [...combat.conditions, name];
      return { ...ig, combat };
    }
    case 'remove_condition': {
      const name = edit.name.trim();
      if (!name || !combat.conditions.some((c) => eq(c, name))) return ig;
      combat.conditions = combat.conditions.filter((c) => !eq(c, name));
      return { ...ig, combat };
    }
    case 'add_feat': {
      const name = edit.name.trim();
      if (!name) return ig;
      const feats = { general: [...ig.feats.general], combat: [...ig.feats.combat] };
      if (feats.general.some((f) => eq(f, name)) || feats.combat.some((f) => eq(f, name))) return ig; // already have it
      // Route to the right bucket by the feat's real category; a custom/unknown feat defaults to General.
      const bucket = findIGFeat(name)?.category === 'Combat' ? 'combat' : 'general';
      feats[bucket] = [...feats[bucket], name];
      return { ...ig, feats };
    }
    case 'remove_feat': {
      const name = edit.name.trim();
      if (!name) return ig;
      const inEither = ig.feats.general.some((f) => eq(f, name)) || ig.feats.combat.some((f) => eq(f, name));
      if (!inEither) return ig;
      return { ...ig, feats: { general: ig.feats.general.filter((f) => !eq(f, name)), combat: ig.feats.combat.filter((f) => !eq(f, name)) } };
    }
    case 'set_defensive_power': {
      // A character has one defensive power (a reaction). Setting it replaces the current one; an
      // empty name clears it. Single field, so it mirrors set/clear_stance rather than add/remove.
      const name = edit.name.trim();
      if (combat.defensivePower === name) return ig;
      combat.defensivePower = name;
      return { ...ig, combat };
    }
    case 'add_power': {
      const name = edit.name.trim();
      if (!name || ig.powers.some((p) => eq(p, name))) return ig;
      return { ...ig, powers: [...ig.powers, name] };
    }
    case 'remove_power': {
      const name = edit.name.trim();
      if (!name || !ig.powers.some((p) => eq(p, name))) return ig;
      return { ...ig, powers: ig.powers.filter((p) => !eq(p, name)) };
    }
    case 'apply_damage': {
      // HP tracks damage TAKEN (currentHp = maxHp − lethal). Damage raises the lethal (or nonlethal) pool;
      // lethal is capped at maxHp so currentHp floors at 0 (down), never a phantom negative.
      const amount = Math.max(0, Math.round(edit.amount || 0));
      if (!amount) return ig;
      const hp = { ...ig.combat.hitPoints };
      if (edit.nonlethal) hp.nonlethal = (Number(hp.nonlethal) || 0) + amount;
      else hp.lethal = Math.min(igMaxHp(ig), (Number(hp.lethal) || 0) + amount);
      return { ...ig, combat: { ...combat, hitPoints: hp } };
    }
    case 'heal': {
      // Healing removes lethal damage first (the HP that matters for "am I up?"), then any nonlethal.
      const amount = Math.max(0, Math.round(edit.amount || 0));
      if (!amount) return ig;
      const hp = { ...ig.combat.hitPoints };
      const lethal = Number(hp.lethal) || 0;
      const healedLethal = Math.min(lethal, amount);
      hp.lethal = lethal - healedLethal;
      const rest = amount - healedLethal;
      if (rest > 0) hp.nonlethal = Math.max(0, (Number(hp.nonlethal) || 0) - rest);
      return { ...ig, combat: { ...combat, hitPoints: hp } };
    }
    case 'update_power':
    case 'update_feat': {
      const from = edit.name.trim();
      if (!from) return ig;
      const isPower = edit.op === 'update_power';
      const list = isPower ? ig.powers : [...ig.feats.general, ...ig.feats.combat];
      if (!list.some((x) => eq(x, from))) return ig; // never CREATE from an update
      const to = edit.to?.trim() || from;

      let next: IGCharacter = ig;
      if (!eq(to, from)) {
        // Rename in place, keeping position — remove + re-add would reorder the list and, for a
        // feat, could move it to the wrong category bucket.
        next = isPower
          ? { ...ig, powers: ig.powers.map((p) => (eq(p, from) ? to : p)) }
          : {
              ...ig,
              feats: {
                general: ig.feats.general.map((f) => (eq(f, from) ? to : f)),
                combat: ig.feats.combat.map((f) => (eq(f, from) ? to : f)),
              },
            };
      }

      // Carry any existing markers across the rename, so an edit cannot launder away the record
      // of how the content arrived.
      const moveKey = (m?: Record<string, string>) => {
        if (!m || eq(to, from) || m[from] === undefined) return m;
        const { [from]: v, ...rest } = m;
        return { ...rest, [to]: v };
      };
      const offRules = moveKey(next.offRules);
      const custom = { ...(moveKey(next.customEffects) ?? {}) };
      if (edit.effect != null) {
        if (edit.effect.trim()) custom[to] = edit.effect.trim();
        // An emptied override CLEARS rather than storing a blank, so the element falls back to its
        // catalogue text instead of rendering as having no rules at all.
        else delete custom[to];
      }

      const out: IGCharacter = { ...next };
      if (offRules && Object.keys(offRules).length) out.offRules = offRules; else delete out.offRules;
      if (Object.keys(custom).length) out.customEffects = custom; else delete out.customEffects;
      return out;
    }
    case 'add_attack': {
      const name = edit.name.trim();
      if (!name) return ig;
      const attack = {
        id: `ig-atk-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
        name,
        weaponType: edit.weaponType ?? '',
        properties: edit.properties ?? '',
        proficient: edit.proficient ?? true,
        weaponFocus: false,
        weaponSpecialization: false,
        ability: edit.ability ?? 'STR',
        bonusToHit: Math.round(edit.bonusToHit ?? 0),
        bonusDamage: Math.round(edit.bonusDamage ?? 0),
        damage: edit.damage ?? '1d6',
      };
      return { ...ig, combat: { ...combat, attacks: [...(ig.combat.attacks ?? []).filter((a) => !eq(a.name, name)), attack] } };
    }
    case 'update_attack': {
      const from = edit.name.trim();
      const idx = (ig.combat.attacks ?? []).findIndex((a) => eq(a.name, from));
      if (idx === -1) return ig;
      const cur = ig.combat.attacks[idx];
      const next = {
        ...cur,
        ...(edit.to?.trim() ? { name: edit.to.trim() } : {}),
        ...(edit.weaponType != null ? { weaponType: edit.weaponType } : {}),
        ...(edit.ability ? { ability: edit.ability } : {}),
        ...(edit.damage ? { damage: edit.damage } : {}),
        ...(edit.properties != null ? { properties: edit.properties } : {}),
        ...(edit.proficient != null ? { proficient: edit.proficient } : {}),
        ...(Number.isFinite(edit.bonusToHit as number) ? { bonusToHit: Math.round(edit.bonusToHit as number) } : {}),
        ...(Number.isFinite(edit.bonusDamage as number) ? { bonusDamage: Math.round(edit.bonusDamage as number) } : {}),
      };
      const attacks = [...ig.combat.attacks];
      attacks[idx] = next;
      return { ...ig, combat: { ...combat, attacks } };
    }
    case 'remove_attack': {
      const name = edit.name.trim();
      if (!name) return ig;
      return { ...ig, combat: { ...combat, attacks: (ig.combat.attacks ?? []).filter((a) => !eq(a.name, name)) } };
    }
    case 'set_ability': {
      // Set one ability score directly (IGS6 — make core stats interactable). Clamped to a sane range; an
      // unknown key or non-finite value is a no-op (parseIgEdit already guards, this is belt-and-braces).
      if (!IG_ABILITY_KEYS.includes(edit.ability) || !Number.isFinite(edit.value)) return ig;
      const value = Math.min(ABILITY_MAX, Math.max(ABILITY_MIN, Math.round(edit.value)));
      return { ...ig, abilities: { ...ig.abilities, [edit.ability]: value } };
    }
    default: {
      // Compile-time exhaustiveness: EVERY IGEdit op must have a case above, or an op the AI can emit
      // would silently no-op (the AI reports success while the IG sheet is unchanged — breaking "editable
      // for all stances/feats/conditions"). A new union op without a handler fails to compile here. The
      // runtime `return ig` still stands for a malformed payload that slips past parseIgEdit.
      const _exhaustive: never = edit;
      void _exhaustive;
      return ig;
    }
  }
}

/** Validate + normalize a raw request payload into an IGEdit, or return an error string. Keeps the route +
 *  AI tool from having to trust their input. */
export function parseIgEdit(raw: unknown): { edit: IGEdit } | { error: string } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const op = typeof o.op === 'string' ? o.op.trim() : '';
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!(IG_EDIT_OPS as readonly string[]).includes(op)) {
    return { error: `Unknown edit op "${op}". Valid: ${IG_EDIT_OPS.join(', ')}.` };
  }
  if (op === 'clear_stance') return { edit: { op: 'clear_stance' } };

  // ── Editing and authoring (IG parity with PF2 S15) ────────────────────────────────────────────
  if (op === 'update_power' || op === 'update_feat') {
    if (!name) return { error: `The "${op}" edit needs the CURRENT "name" of the element to change.` };
    const to = typeof o.to === 'string' ? o.to.trim() : undefined;
    return {
      edit: {
        op, name,
        ...(to ? { to } : {}),
        // `effect` is forwarded even when empty — an emptied override CLEARS the customisation,
        // which is a different intent from not supplying the field at all.
        ...(typeof o.effect === 'string' ? { effect: o.effect } : {}),
      } as IGEdit,
    };
  }
  if (op === 'add_attack' || op === 'update_attack') {
    if (!name) return { error: `The "${op}" edit needs a weapon "name".` };
    const ability = String(o.ability ?? '').trim().toUpperCase();
    const hit = Number(o.bonusToHit);
    const dmg = Number(o.bonusDamage);
    return {
      edit: {
        op, name,
        ...(typeof o.to === 'string' && o.to.trim() ? { to: o.to.trim() } : {}),
        ...(typeof o.weaponType === 'string' ? { weaponType: o.weaponType.trim() } : {}),
        ...(IG_ABILITY_KEYS.includes(ability as IGAbilityKey) ? { ability: ability as IGAbilityKey } : {}),
        ...(typeof o.damage === 'string' && o.damage.trim() ? { damage: o.damage.trim() } : {}),
        ...(typeof o.properties === 'string' ? { properties: o.properties.trim() } : {}),
        ...(typeof o.proficient === 'boolean' ? { proficient: o.proficient } : {}),
        ...(Number.isFinite(hit) ? { bonusToHit: Math.round(hit) } : {}),
        ...(Number.isFinite(dmg) ? { bonusDamage: Math.round(dmg) } : {}),
      } as IGEdit,
    };
  }
  if (op === 'remove_attack') {
    if (!name) return { error: 'The "remove_attack" edit needs a weapon "name".' };
    return { edit: { op, name } };
  }
  // set_defensive_power accepts an empty name — that clears the single defensive-power slot.
  if (op === 'set_defensive_power') return { edit: { op: 'set_defensive_power', name } };
  // HP ops carry a numeric `amount`, not a `name`.
  if (op === 'apply_damage' || op === 'heal') {
    const amount = Math.max(0, Math.round(Number(o.amount) || 0));
    if (!amount) return { error: `The "${op}" edit needs a positive "amount".` };
    if (op === 'apply_damage') return { edit: { op, amount, nonlethal: o.nonlethal === true } };
    return { edit: { op, amount } };
  }
  // set_ability carries an ability key + a numeric value (not a name).
  if (op === 'set_ability') {
    const ability = String(o.ability ?? '').trim().toUpperCase() as IGAbilityKey;
    if (!IG_ABILITY_KEYS.includes(ability)) return { error: `set_ability needs an "ability" of ${IG_ABILITY_KEYS.join('/')}.` };
    const value = Number(o.value);
    if (!Number.isFinite(value)) return { error: 'set_ability needs a numeric "value".' };
    return { edit: { op, ability, value: Math.min(ABILITY_MAX, Math.max(ABILITY_MIN, Math.round(value))) } };
  }
  if (!name) return { error: `The "${op}" edit needs a non-empty "name".` };
  return { edit: { op, name } as IGEdit };
}

/** A short human description of an edit (for the audit trail / AI echo). */
export function describeIgEdit(edit: IGEdit): string {
  switch (edit.op) {
    case 'set_active_stance': return `Entered the ${edit.name} Stance.`;
    case 'clear_stance': return 'Left the active stance.';
    case 'add_stance': return `Learned the ${edit.name} Stance.`;
    case 'add_condition': return `Applied the ${edit.name} condition.`;
    case 'remove_condition': return `Removed the ${edit.name} condition.`;
    case 'add_feat': return `Added the ${edit.name} feat.`;
    case 'remove_feat': return `Removed the ${edit.name} feat.`;
    case 'add_power': return `Learned the ${edit.name} power.`;
    case 'remove_power': return `Removed the ${edit.name} power.`;
    case 'set_defensive_power': return edit.name ? `Set the defensive power to ${edit.name}.` : 'Cleared the defensive power.';
    case 'apply_damage': return `Took ${edit.amount} ${edit.nonlethal ? 'nonlethal ' : ''}damage.`;
    case 'heal': return `Healed ${edit.amount} HP.`;
    case 'set_ability': return `Set ${edit.ability} to ${edit.value}.`;
    case 'update_power': return `Customised the ${edit.name} power${edit.to ? ` → ${edit.to}` : ''}.`;
    case 'update_feat': return `Customised the ${edit.name} feat${edit.to ? ` → ${edit.to}` : ''}.`;
    case 'add_attack': return `Added the weapon ${edit.name}.`;
    case 'update_attack': return `Customised ${edit.name}${edit.to ? ` → ${edit.to}` : ''}.`;
    case 'remove_attack': return `Removed the weapon ${edit.name}.`;
    default: return 'No change.';
  }
}
