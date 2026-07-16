// lib/dnd/backgrounds/apply.ts — apply a 2024 background to a character, rules-legally (Slice 4).
//
// The 2024 background is where the ability increases live, and the rule is exact: you distribute either
// **+2 to one of the background's three abilities and +1 to another**, or **+1 to each of the three**.
// You can't put the points anywhere else, and you can't invent a different spread. This is the pure
// gate the creation UI consumes — same tested-core-first shape as the feat eligibility work — so a
// background can never grant an increase the rules don't allow.
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';
import type { Background } from './dnd5e-2024';

/** How many points the player is assigning to each of the background's abilities. */
export type AbilityAssignment = Partial<Record<AbilityKey, number>>;

export interface AssignmentValidation {
  ok: boolean;
  error?: string;
}

/**
 * Validate an ability-point assignment against a background's three abilities and the 2024 spread rules
 * (either {2,1} across two of them, or {1,1,1} across all three).
 */
export function validateAbilityAssignment(bg: Background, assignment: AbilityAssignment): AssignmentValidation {
  const allowed = new Set(bg.abilityScores);
  const entries = Object.entries(assignment).filter(([, v]) => (v ?? 0) !== 0) as [AbilityKey, number][];

  for (const [ability, amount] of entries) {
    if (!allowed.has(ability)) {
      return { ok: false, error: `${ability.toUpperCase()} is not one of ${bg.name}'s abilities (${bg.abilityScores.map((a) => a.toUpperCase()).join(', ')}).` };
    }
    if (amount < 0) return { ok: false, error: 'You cannot assign a negative increase.' };
  }

  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total !== 3) return { ok: false, error: 'A background grants 3 points: +2/+1 to two abilities, or +1/+1/+1 to three.' };

  const amounts = entries.map(([, v]) => v).sort((a, b) => b - a);
  const isTwoOne = amounts.length === 2 && amounts[0] === 2 && amounts[1] === 1;
  const isOneOneOne = amounts.length === 3 && amounts.every((a) => a === 1);
  if (!isTwoOne && !isOneOneOne) {
    return { ok: false, error: 'The spread must be +2/+1 (two abilities) or +1/+1/+1 (three abilities).' };
  }
  return { ok: true };
}

export interface BackgroundGrants {
  abilityIncreases: AbilityAssignment;
  originFeat: string;
  spellList?: 'arcane' | 'divine' | 'primal';
  skills: string[];
  tool: string;
  equipment: string;
}

/**
 * The complete set of things a background grants a character, given a VALID assignment. Throws if the
 * assignment is illegal — callers validate first (the UI shows the error live); this never silently
 * applies a bad spread.
 */
export function backgroundGrants(bg: Background, assignment: AbilityAssignment): BackgroundGrants {
  const v = validateAbilityAssignment(bg, assignment);
  if (!v.ok) throw new Error(v.error);
  // Normalise to only the non-zero, allowed increases.
  const abilityIncreases: AbilityAssignment = {};
  for (const a of bg.abilityScores) {
    const amt = assignment[a] ?? 0;
    if (amt > 0) abilityIncreases[a] = amt;
  }
  return {
    abilityIncreases,
    originFeat: bg.originFeat,
    spellList: bg.spellList,
    skills: [...bg.skillProficiencies],
    tool: bg.toolProficiency,
    equipment: bg.equipment,
  };
}

/** Apply a background's ability increases onto a base ability map (capped at 20 at level 1). */
export function applyAbilityIncreases(
  base: Record<AbilityKey, number>,
  increases: AbilityAssignment,
  cap = 20,
): Record<AbilityKey, number> {
  const out = { ...base };
  for (const [ability, amount] of Object.entries(increases) as [AbilityKey, number][]) {
    if (out[ability] == null) continue;
    out[ability] = Math.min(cap, out[ability] + amount);
  }
  return out;
}

/**
 * Move from a previously-applied background assignment to a new one on a live ability map — the store
 * keeps abilities as running totals (like ASIs), so switching background or re-spreading must REMOVE
 * the old increases before adding the new. Deliberately UNCLAMPED so the round-trip is exact: subtract
 * the prior spread, add the next; picking A then B then A leaves the scores byte-identical to A. (At
 * creation the totals never approach 20, so no cap is needed and clamping would break reversibility.)
 * Pass `next = {}` to simply undo a background's increases (e.g. clearing the background).
 */
export function reconcileBackgroundIncreases(
  abilities: Record<AbilityKey, number>,
  prev: AbilityAssignment | undefined,
  next: AbilityAssignment,
): Record<AbilityKey, number> {
  const out = { ...abilities };
  for (const [ability, amount] of Object.entries(prev ?? {}) as [AbilityKey, number][]) {
    if (out[ability] != null) out[ability] = out[ability] - amount;
  }
  for (const [ability, amount] of Object.entries(next) as [AbilityKey, number][]) {
    if (out[ability] != null) out[ability] = out[ability] + amount;
  }
  return out;
}
