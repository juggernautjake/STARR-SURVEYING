// statgen/ig — the Intuitive Games ability-boost allocator (SG-3).
//
// IG's creation method is its OWN thing (not point-buy, not PF2 boosts): every ability starts at 10 and you
// apply EIGHT +2 boosts at level 1, with a per-ability creation cap of 14 — so at most TWO boosts land on any
// one ability (10 → 12 → 14). Ancestry adjustments (e.g. Gnome +Dexterity / −Strength) are SEPARATE racial
// modifiers applied on top of the boosts. This models both, purely, so the builder UI is a thin binding and
// the rules (8 boosts, cap 14, the +2 step, the modifier curve) are unit-tested.
// Source: `system-rules.ts` ("Ability scores start at 10 with eight +2 boosts at level 1, creation cap 14").
import type { IGAbilityKey } from '@/lib/dnd/systems/intuitive-games/model';
import { IG_ABILITIES } from '@/lib/dnd/systems/intuitive-games/model';

export type { IGAbilityKey };
export { IG_ABILITIES };

export const IG_START = 10;
export const IG_BOOST_STEP = 2;
export const IG_BOOST_COUNT = 8;
export const IG_CREATION_CAP = 14;
/** Cap 14 with a 10 base and +2 steps ⇒ at most two boosts per ability. */
export const IG_MAX_BOOSTS_PER_ABILITY = (IG_CREATION_CAP - IG_START) / IG_BOOST_STEP; // = 2

/** IG uses the 5e curve: floor((score − 10) / 2). */
export const igAbilityMod = (score: number) => Math.floor((score - IG_START) / 2);

/** How many of the eight boosts the player has put on each ability (0, 1 or 2). */
export type IGBoostAllocation = Record<IGAbilityKey, number>;

/** A ready blank: zero boosts on every ability (all scores start at 10). */
export function igBlankAllocation(): IGBoostAllocation {
  return { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 };
}

/** Total boosts spent across all abilities. */
export function igBoostsSpent(alloc: IGBoostAllocation): number {
  return IG_ABILITIES.reduce((sum, a) => sum + (alloc[a] || 0), 0);
}

/** Resolve final ability SCORES: 10 + 2·boosts (capped at 14 by the boost limit), then any ancestry
 *  adjustments (+2 / −2 racial mods) applied ON TOP — those are not part of the eight boosts and are not held
 *  to the creation cap, but the result is clamped to a sane 3–20 so a bad input can't produce a wild score. */
export function igResolveScores(
  alloc: IGBoostAllocation,
  adjustments?: Partial<Record<IGAbilityKey, number>>,
): Record<IGAbilityKey, number> {
  const out = {} as Record<IGAbilityKey, number>;
  for (const a of IG_ABILITIES) {
    const boosts = Math.max(0, Math.min(IG_MAX_BOOSTS_PER_ABILITY, alloc[a] || 0));
    const score = IG_START + boosts * IG_BOOST_STEP + (adjustments?.[a] ?? 0);
    out[a] = Math.max(3, Math.min(20, score));
  }
  return out;
}

export interface IGAllocationState {
  valid: boolean;
  errors: string[];
  spent: number;
  remaining: number;
}

/** Validate: exactly eight boosts spent, and no ability over its two-boost creation cap (score ≤ 14). */
export function igValidateAllocation(alloc: IGBoostAllocation): IGAllocationState {
  const errors: string[] = [];
  for (const a of IG_ABILITIES) {
    const b = alloc[a] || 0;
    if (b < 0) errors.push(`${a} has a negative boost count.`);
    if (b > IG_MAX_BOOSTS_PER_ABILITY) {
      errors.push(`${a} would exceed the creation cap of ${IG_CREATION_CAP} (max ${IG_MAX_BOOSTS_PER_ABILITY} boosts).`);
    }
  }
  const spent = igBoostsSpent(alloc);
  if (spent !== IG_BOOST_COUNT) {
    errors.push(`Spend all ${IG_BOOST_COUNT} boosts (spent ${spent}).`);
  }
  return { valid: errors.length === 0, errors, spent, remaining: IG_BOOST_COUNT - spent };
}
