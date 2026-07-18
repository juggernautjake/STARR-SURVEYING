// lib/dnd/systems/intuitive-games/edit.ts — the PURE, incremental edit operations for an Intuitive Games
// character sidecar (IGCharacter). The bespoke IG sheet was rebuild-only; these let the sheet AND the AI
// change one thing in place — enter/leave a stance, apply/remove a condition — without re-running the whole
// builder. Pure + immutable (returns a new IGCharacter) so it's unit-testable and the API route + the AI
// tool are thin wrappers over the same logic. Stance is one-active-at-a-time (combat.stances holds the
// active stance; ig.stances holds the known set). Nothing here invents rules — it only moves names around.

import type { IGCharacter } from './model';
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
  | { op: 'set_defensive_power'; name: string }
  | { op: 'apply_damage'; amount: number; nonlethal?: boolean }
  | { op: 'heal'; amount: number };

/** The op names the AI tool + API accept. */
export const IG_EDIT_OPS = ['set_active_stance', 'clear_stance', 'add_condition', 'remove_condition', 'add_feat', 'remove_feat', 'add_power', 'remove_power', 'set_defensive_power', 'apply_damage', 'heal'] as const;
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
  // set_defensive_power accepts an empty name — that clears the single defensive-power slot.
  if (op === 'set_defensive_power') return { edit: { op: 'set_defensive_power', name } };
  // HP ops carry a numeric `amount`, not a `name`.
  if (op === 'apply_damage' || op === 'heal') {
    const amount = Math.max(0, Math.round(Number(o.amount) || 0));
    if (!amount) return { error: `The "${op}" edit needs a positive "amount".` };
    if (op === 'apply_damage') return { edit: { op, amount, nonlethal: o.nonlethal === true } };
    return { edit: { op, amount } };
  }
  if (!name) return { error: `The "${op}" edit needs a non-empty "name".` };
  return { edit: { op, name } as IGEdit };
}

/** A short human description of an edit (for the audit trail / AI echo). */
export function describeIgEdit(edit: IGEdit): string {
  switch (edit.op) {
    case 'set_active_stance': return `Entered the ${edit.name} Stance.`;
    case 'clear_stance': return 'Left the active stance.';
    case 'add_condition': return `Applied the ${edit.name} condition.`;
    case 'remove_condition': return `Removed the ${edit.name} condition.`;
    case 'add_feat': return `Added the ${edit.name} feat.`;
    case 'remove_feat': return `Removed the ${edit.name} feat.`;
    case 'add_power': return `Learned the ${edit.name} power.`;
    case 'remove_power': return `Removed the ${edit.name} power.`;
    case 'set_defensive_power': return edit.name ? `Set the defensive power to ${edit.name}.` : 'Cleared the defensive power.';
    case 'apply_damage': return `Took ${edit.amount} ${edit.nonlethal ? 'nonlethal ' : ''}damage.`;
    case 'heal': return `Healed ${edit.amount} HP.`;
    default: return 'No change.';
  }
}
