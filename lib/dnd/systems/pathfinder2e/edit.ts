// lib/dnd/systems/pathfinder2e/edit.ts — the PURE, incremental in-play edits for a Pathfinder 2e character
// sidecar (PF2Character). PF2 had a build/picks tool but NO way to change one thing in place — the AI could
// assemble a character but not apply the most common in-play changes (damage, healing, the dying/wounded
// death track). These pure, immutable ops close that (Area SQ4), mirroring the IG edit vocabulary. Nothing
// here invents rules; it only moves the character's own HP + death-track numbers, clamped to legal ranges.
//
// HP note: PF2's stored `currentHp` uses 0 to mean "full/unset" (the sheet renders maxHp then). Damage/heal
// therefore resolve against the EFFECTIVE current (currentHp || maxHp) and write a real value back.
import type { PF2Character } from './model';
import { pf2MaxHp } from './rules';

export type PF2Edit =
  | { op: 'apply_damage'; amount: number }
  | { op: 'heal'; amount: number }
  | { op: 'set_temp_hp'; amount: number }
  | { op: 'set_dying'; value: number }
  | { op: 'set_wounded'; value: number };

/** The op names the AI tool + API accept. */
export const PF2_EDIT_OPS = ['apply_damage', 'heal', 'set_temp_hp', 'set_dying', 'set_wounded'] as const;
export type PF2EditOp = (typeof PF2_EDIT_OPS)[number];

const DYING_MAX = 4; // PF2: Dying 4 = dead.

/** Apply one edit, returning a NEW PF2Character (input never mutated). A no-op edit returns the input. */
export function applyPf2Edit(pf2: PF2Character, edit: PF2Edit): PF2Character {
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
      if (next === 0 && effCur > 0) combat.dyingValue = Math.min(DYING_MAX, Math.max(combat.dyingValue, (Number(combat.woundedValue) || 0) + 1));
      return { ...pf2, combat };
    }
    case 'heal': {
      const amount = Math.max(0, Math.round(edit.amount || 0));
      if (!amount) return pf2;
      combat.currentHp = Math.min(maxHp, effCur + amount);
      // PF2: regaining HP while Dying removes the Dying condition (you're conscious/stable again).
      if (combat.currentHp > 0 && combat.dyingValue) combat.dyingValue = 0;
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
    default: return 'No change.';
  }
}
