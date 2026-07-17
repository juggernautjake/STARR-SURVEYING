// app/dnd/_sheet/engine/effects.ts — the effects system (Phase C13, §6.18).
//
// Every item, feat, feature, spell, and condition can carry structured EFFECTS.
// An effect is `{ target, operation, value, condition? }`. Effects feed the
// derivation pipeline (C12): a target's final number is the best base/override
// plus all stacking `add` bonuses; conditional effects apply only when their
// condition is active (equipped, attuned, raging, concentrating, …). Advantage,
// resistance, and granted-proficiency effects are collected separately.
//
// Examples (from §6.18):
//   { target: 'attack_and_damage', operation: 'add', value: 2, condition: 'equipped' }
//   { target: 'ac', operation: 'set_base', value: 16 }
//   { target: 'dex_saves', operation: 'advantage' }
//   { target: 'proficiency', operation: 'grant_proficiency', value: 'longswords' }
//   { target: 'spell_save_dc', operation: 'add', value: 1 }
//   { target: 'resistance', operation: 'resistance', value: 'fire' }
//   { target: 'speed', operation: 'add', value: 10, condition: 'raging' }

export type EffectOperation =
  | 'add'
  | 'set'
  | 'set_base'
  | 'advantage'
  | 'disadvantage'
  | 'grant_proficiency'
  | 'resistance'
  | 'immunity'
  | 'vulnerability'
  | 'condition_advantage';

// A RUNTIME roster of every operation, kept exhaustive by `satisfies Record<EffectOperation, …>`: add a
// new operation to the union above and this object stops compiling until it's listed here too. The
// effect-builder guard then proves each one is reachable from the picker (assigned to some target), so an
// operation can never be added to the engine yet left unpickable in the UI.
const OPERATION_ROSTER = {
  add: 1, set: 1, set_base: 1, advantage: 1, disadvantage: 1,
  grant_proficiency: 1, resistance: 1, immunity: 1, vulnerability: 1, condition_advantage: 1,
} satisfies Record<EffectOperation, 1>;
export const EFFECT_OPERATIONS = Object.keys(OPERATION_ROSTER) as EffectOperation[];

export interface Effect {
  target: string;
  operation: EffectOperation;
  /** number for add/set/set_base; string (damage/skill/proficiency name) for the rest. */
  value?: number | string;
  /** Applies only when this condition is in the active set (unconditional if omitted). */
  condition?: string;
  /** Optional provenance for UI ("Flametongue", "Rage", …). */
  source?: string;
}

export interface EffectContext {
  /** Conditions currently true (equipped item ids/flags, 'raging', 'attuned', …). */
  active: Iterable<string>;
}

/** Keep only effects whose condition is met (or that are unconditional). */
export function activeEffects(effects: Effect[], ctx: EffectContext): Effect[] {
  const active = ctx.active instanceof Set ? ctx.active : new Set(ctx.active);
  return effects.filter((e) => !e.condition || active.has(e.condition));
}

const num = (v: Effect['value']): number => (typeof v === 'number' ? v : 0);

/**
 * Resolve a numeric target: the best base/override (max of the passed base and any
 * `set`/`set_base` values) plus the sum of all stacking `add` bonuses. Pass only
 * already-active effects (run activeEffects first) or rely on the caller.
 */
export function resolveNumeric(effects: Effect[], target: string, baseValue = 0): number {
  let override = baseValue;
  let bonus = 0;
  for (const e of effects) {
    if (e.target !== target) continue;
    if (e.operation === 'add') bonus += num(e.value);
    else if (e.operation === 'set' || e.operation === 'set_base') override = Math.max(override, num(e.value));
  }
  return override + bonus;
}

/** Advantage/disadvantage flags for a target (both true → they cancel to a flat roll). */
export function rollFlagsFor(effects: Effect[], target: string): { advantage: boolean; disadvantage: boolean } {
  let advantage = false;
  let disadvantage = false;
  for (const e of effects) {
    if (e.target !== target) continue;
    if (e.operation === 'advantage') advantage = true;
    else if (e.operation === 'disadvantage') disadvantage = true;
  }
  return { advantage, disadvantage };
}

/** Distinct string values for a collection operation (resistance/immunity/vulnerability/grant_proficiency). */
export function collectValues(effects: Effect[], operation: EffectOperation): string[] {
  const out = new Set<string>();
  for (const e of effects) {
    if (e.operation === operation && typeof e.value === 'string') out.add(e.value);
  }
  return [...out];
}

export const resistances = (effects: Effect[]) => collectValues(effects, 'resistance');
export const immunities = (effects: Effect[]) => collectValues(effects, 'immunity');
export const vulnerabilities = (effects: Effect[]) => collectValues(effects, 'vulnerability');
export const grantedProficiencies = (effects: Effect[]) => collectValues(effects, 'grant_proficiency');
