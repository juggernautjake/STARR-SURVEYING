// lib/dnd/systems/pathfinder2e/edit.ts — the PURE, incremental in-play edits for a Pathfinder 2e character
// sidecar (PF2Character). PF2 had a build/picks tool but NO way to change one thing in place — the AI could
// assemble a character but not apply the most common in-play changes (damage, healing, the dying/wounded
// death track). These pure, immutable ops close that (Area SQ4), mirroring the IG edit vocabulary. Nothing
// here invents rules; it only moves the character's own HP + death-track numbers, clamped to legal ranges.
//
// HP note: PF2's stored `currentHp` uses 0 to mean "full/unset" (the sheet renders maxHp then). Damage/heal
// therefore resolve against the EFFECTIVE current (currentHp || maxHp) and write a real value back.
import type { PF2Character, PF2AttributeKey } from './model';
import { PF2_ATTRIBUTES } from './model';
import { pf2MaxHp } from './rules';
import type { DownedDamageModel } from '@/lib/dnd/preferences';

export type PF2Edit =
  | { op: 'apply_damage'; amount: number; crit?: boolean }
  | { op: 'heal'; amount: number }
  | { op: 'set_temp_hp'; amount: number }
  | { op: 'set_dying'; value: number }
  | { op: 'set_wounded'; value: number }
  // Set (or, with value 0, clear) a PF2 condition by name — Frightened 2, Sickened 1, Prone. The sheet folds
  // active conditions into rolls under PF2's non-stacking penalty rule.
  | { op: 'set_condition'; name: string; value: number }
  // Set one attribute MODIFIER directly (PF2 tracks modifiers in play, not scores) — e.g. STR +4. Clamped to the
  // legal −5..12 range. Parity with the IG set_ability edit; lets the AI adjust a stat in place.
  | { op: 'set_attribute'; attribute: PF2AttributeKey; value: number };

/** Options governing house-rule-configurable behavior of an edit. */
export interface PF2EditOptions {
  /** Downed-damage model (the downedDamageModel preference). 'official' (default) — damage to an already-
   *  dying creature raises its Dying value (by 1, or 2 on a crit), per PF2 RAW. 'off' — a downed creature's
   *  Dying only advances from failed recovery saves, never from fresh damage. */
  downedDamageModel?: DownedDamageModel;
}

/** The op names the AI tool + API accept. */
export const PF2_EDIT_OPS = ['apply_damage', 'heal', 'set_temp_hp', 'set_dying', 'set_wounded', 'set_condition', 'set_attribute'] as const;

/** The legal range for a PF2 attribute MODIFIER (level-20 apex ≈ +7–8; the cap is generous headroom). */
const ATTR_MIN = -5;
const ATTR_MAX = 12;
export type PF2EditOp = (typeof PF2_EDIT_OPS)[number];

const DYING_MAX = 4; // PF2: Dying 4 = dead.

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
    case 'set_condition': return edit.value ? `Now ${edit.name} ${edit.value}.` : `No longer ${edit.name}.`;
    case 'set_attribute': return `Set ${edit.attribute} to ${edit.value >= 0 ? '+' : ''}${edit.value}.`;
    default: return 'No change.';
  }
}
