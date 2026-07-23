// statgen/dnd5e — ability-score GENERATION for the two 5e editions (SG-1).
//
// The manual builder needs the three vanilla 5e methods — standard array, point buy, and 4d6-drop-lowest —
// as pure functions so the UI is a thin binding and the maths is unit-tested (deterministic dice via an
// injected roll). Racial ASI (2014) and background increases (2024) are APPLIED on top; the catalog-specific
// "which race/background grants what" resolution lives in the builder UI, this module just does the arithmetic
// and the rules validation. Ability increases through a background are handled by `backgrounds/apply.ts`
// (`applyAbilityIncreases`/`reconcileBackgroundIncreases`); this file re-exports the generic apply for the UI.
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';
import { applyAbilityIncreases } from '@/lib/dnd/backgrounds/apply';

export const ABILITIES_5E: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** The 5e ability modifier: floor((score − 10) / 2). Shared by both editions. */
export const abilityMod5e = (score: number) => Math.floor((score - 10) / 2);

// ── Standard array ──────────────────────────────────────────────────────────────────────────────────────
/** The one fixed set of six values a player assigns, each once. */
export const STANDARD_ARRAY_5E = [15, 14, 13, 12, 10, 8] as const;

export interface Validation {
  valid: boolean;
  errors: string[];
}

/** A standard-array assignment is valid iff the six chosen scores are exactly the array (a permutation). */
export function validateStandardArray(assignment: Record<AbilityKey, number>): Validation {
  const errors: string[] = [];
  const chosen = ABILITIES_5E.map((a) => assignment[a]);
  const want = [...STANDARD_ARRAY_5E].sort((x, y) => x - y);
  const got = [...chosen].sort((x, y) => x - y);
  if (got.length !== want.length || want.some((v, i) => v !== got[i])) {
    errors.push(`Standard array must use exactly ${STANDARD_ARRAY_5E.join(', ')} — one value per ability.`);
  }
  return { valid: errors.length === 0, errors };
}

// ── Point buy ───────────────────────────────────────────────────────────────────────────────────────────
export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;
/** The 5e point-buy cost of each purchasable score. Scores outside 8–15 are not purchasable. */
export const POINT_BUY_COST: Readonly<Record<number, number>> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};

/** Cost of a single score, or null if it isn't a legal point-buy value (outside 8–15). */
export function pointBuyCostOf(score: number): number | null {
  return Object.prototype.hasOwnProperty.call(POINT_BUY_COST, score) ? POINT_BUY_COST[score] : null;
}

/** Total points spent by an assignment (unpurchasable scores count as 0 here; validation flags them). */
export function pointBuySpent(assignment: Record<AbilityKey, number>): number {
  return ABILITIES_5E.reduce((sum, a) => sum + (pointBuyCostOf(assignment[a]) ?? 0), 0);
}

export interface PointBuyState extends Validation {
  spent: number;
  remaining: number;
}

/** Validate a point-buy assignment: every score in 8–15 and total cost ≤ 27. */
export function validatePointBuy(assignment: Record<AbilityKey, number>): PointBuyState {
  const errors: string[] = [];
  for (const a of ABILITIES_5E) {
    const score = assignment[a];
    if (pointBuyCostOf(score) === null) {
      errors.push(`${a.toUpperCase()} ${score} is outside point-buy range (${POINT_BUY_MIN}–${POINT_BUY_MAX}).`);
    }
  }
  const spent = pointBuySpent(assignment);
  if (spent > POINT_BUY_BUDGET) errors.push(`Over budget: spent ${spent} of ${POINT_BUY_BUDGET} points.`);
  return { valid: errors.length === 0, errors, spent, remaining: POINT_BUY_BUDGET - spent };
}

// ── Rolling (4d6 drop lowest) ───────────────────────────────────────────────────────────────────────────
export interface RollResult {
  /** The four d6 as rolled, descending, so `[0..2]` are the kept three and `[3]` is the dropped one. */
  dice: [number, number, number, number];
  dropped: number;
  total: number;
}

const defaultD6 = () => Math.floor(Math.random() * 6) + 1;

/** One 4d6-drop-lowest roll. `roll` is injected (defaults to a real d6) so tests are deterministic and the
 *  digital roller can feed its own four dice straight in. */
export function roll4d6DropLowest(roll: () => number = defaultD6): RollResult {
  const four = [roll(), roll(), roll(), roll()].sort((a, b) => b - a) as [number, number, number, number];
  const dropped = four[3];
  return { dice: four, dropped, total: four[0] + four[1] + four[2] };
}

/** Score four given d6 faces (from the digital roller or manual entry) with the drop-lowest rule applied. */
export function scoreFourDice(a: number, b: number, c: number, d: number): RollResult {
  return roll4d6DropLowest(((): (() => number) => {
    const seq = [a, b, c, d];
    let i = 0;
    return () => seq[i++];
  })());
}

/** Six 4d6-drop-lowest rolls — the standard set a player then assigns to abilities. */
export function rollAbilityScores(roll: () => number = defaultD6): RollResult[] {
  return Array.from({ length: 6 }, () => roll4d6DropLowest(roll));
}

// ── Applying increases ──────────────────────────────────────────────────────────────────────────────────
/** Add racial (2014) or background (2024) increases onto generated base scores, clamped to `cap` (20 at
 *  creation). Thin re-export of the shared apply so the builder has ONE arithmetic for increases. */
export function applyAbilityIncreases5e(
  base: Record<AbilityKey, number>,
  increases: Partial<Record<AbilityKey, number>>,
  cap = 20,
): Record<AbilityKey, number> {
  return applyAbilityIncreases(base, increases, cap);
}

/** A ready-to-fill blank assignment: every ability at the point-buy floor (8), a sensible starting point. */
export function blankPointBuy(): Record<AbilityKey, number> {
  return { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
}
