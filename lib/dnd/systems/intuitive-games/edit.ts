// lib/dnd/systems/intuitive-games/edit.ts — the PURE, incremental edit operations for an Intuitive Games
// character sidecar (IGCharacter). The bespoke IG sheet was rebuild-only; these let the sheet AND the AI
// change one thing in place — enter/leave a stance, apply/remove a condition — without re-running the whole
// builder. Pure + immutable (returns a new IGCharacter) so it's unit-testable and the API route + the AI
// tool are thin wrappers over the same logic. Stance is one-active-at-a-time (combat.stances holds the
// active stance; ig.stances holds the known set). Nothing here invents rules — it only moves names around.

import type { IGCharacter } from './model';
import { findIGFeat } from './feats';

export type IGEdit =
  | { op: 'set_active_stance'; name: string }
  | { op: 'clear_stance' }
  | { op: 'add_condition'; name: string }
  | { op: 'remove_condition'; name: string }
  | { op: 'add_feat'; name: string }
  | { op: 'remove_feat'; name: string }
  | { op: 'add_power'; name: string }
  | { op: 'remove_power'; name: string }
  | { op: 'set_defensive_power'; name: string };

/** The op names the AI tool + API accept. */
export const IG_EDIT_OPS = ['set_active_stance', 'clear_stance', 'add_condition', 'remove_condition', 'add_feat', 'remove_feat', 'add_power', 'remove_power', 'set_defensive_power'] as const;
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
    default:
      return ig;
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
    default: return 'No change.';
  }
}
