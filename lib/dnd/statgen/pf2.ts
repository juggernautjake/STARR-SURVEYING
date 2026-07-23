// statgen/pf2 — the Pathfinder 2e attribute-BOOST allocator (SG-2).
//
// PF2 doesn't roll or point-buy: every attribute starts at +0 and you apply staged sets of boosts —
// ancestry (its printed boosts + one flaw, OR the "two free boosts, no flaw" alternative), background
// (one boost from a pair + one free), class (its key attribute), and four free boosts — with the rules that
// (a) each boost in ONE set must target a DIFFERENT attribute, and (b) a boost past +4 is "partial" (two of
// them = +1). The partial rule already lives in `pf2ApplyBoosts`; this module adds the staged-set model, the
// per-slot restrictions, the flaw, and validation — pure, so the builder UI is a thin binding and the rules
// are unit-tested. It also fixes the long-standing gap that ancestry FLAWS were never applied (the builder
// read the flaw-less seed); the flaw-aware data is `data/ancestries.ts`.
import type { PF2AttributeKey } from '@/lib/dnd/systems/pathfinder2e/model';
import { PF2_ATTRIBUTES } from '@/lib/dnd/systems/pathfinder2e/model';
import { pf2ApplyBoosts } from '@/lib/dnd/systems/pathfinder2e/builder';

export type { PF2AttributeKey };
export { PF2_ATTRIBUTES };

/** The (score) presentation of a modifier, for a UI that wants to show 10/12/… next to +0/+1. */
export const pf2ModToScore = (mod: number) => 10 + mod * 2;

/** A single free boost's restriction: `null` = any attribute, an array = must be one of these. */
export type Restriction = PF2AttributeKey[] | null;

/** One stage of boosts. `fixed` are boosts with a predetermined target (ancestry's printed boosts, a class's
 *  single key attribute); `slots` are the player-chosen boosts, one entry per slot, each optionally
 *  restricted. Modelling per-SLOT restrictions is what lets a background be exactly "one of these two + one
 *  free" rather than "two from a list". */
export interface BoostSet {
  key: string;
  label: string;
  fixed: PF2AttributeKey[];
  slots: Restriction[];
}

/** The player's chosen targets for each set's free slots, keyed by set key, in slot order. */
export type BoostAllocation = Record<string, PF2AttributeKey[]>;

export interface Validation {
  valid: boolean;
  errors: string[];
}

const ZERO = (): Record<PF2AttributeKey, number> => ({ STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 });

/** Resolve the final attribute modifiers: the ancestry flaw first (−1 to the modifier = −2 score), then each
 *  set's boosts (fixed then chosen) in order through `pf2ApplyBoosts` (which handles the +4 partial rule). */
export function pf2ResolveAttributes(sets: BoostSet[], allocation: BoostAllocation, flaw?: PF2AttributeKey | null): Record<PF2AttributeKey, number> {
  let a = ZERO();
  if (flaw) a[flaw] -= 1;
  for (const set of sets) {
    const boosts = [...set.fixed, ...(allocation[set.key] ?? [])];
    a = pf2ApplyBoosts(a, boosts);
  }
  return a;
}

/** Validate an allocation: every slot filled, each restricted slot within its options, and no attribute
 *  boosted twice WITHIN one set (fixed + chosen). Cross-set repeats are legal — that's how you reach +4. */
export function pf2ValidateAllocation(sets: BoostSet[], allocation: BoostAllocation): Validation {
  const errors: string[] = [];
  for (const set of sets) {
    const chosen = allocation[set.key] ?? [];
    if (chosen.length !== set.slots.length) {
      errors.push(`${set.label}: choose ${set.slots.length} boost${set.slots.length === 1 ? '' : 's'} (chose ${chosen.length}).`);
    }
    set.slots.forEach((restriction, i) => {
      const pick = chosen[i];
      if (pick && restriction && !restriction.includes(pick)) {
        errors.push(`${set.label}: ${pick} isn't an allowed choice for that boost.`);
      }
    });
    const all = [...set.fixed, ...chosen].filter(Boolean) as PF2AttributeKey[];
    const seen = new Set<string>();
    for (const x of all) {
      if (seen.has(x)) {
        errors.push(`${set.label}: each boost must target a different attribute (${x} appears twice).`);
        break;
      }
      seen.add(x);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ── Set builders from catalog data ──────────────────────────────────────────────────────────────────────

/** The ancestry set + its flaw. `useAlternate` takes the universal "two free boosts, no flaw" option instead
 *  of the printed spread (`PF2_ALTERNATE_BOOSTS_RULE`). */
export function pf2AncestrySet(
  boosts: readonly (PF2AttributeKey | 'free')[],
  flaw: PF2AttributeKey | undefined,
  useAlternate: boolean,
): { set: BoostSet; flaw: PF2AttributeKey | null } {
  if (useAlternate) {
    return { set: { key: 'ancestry', label: 'Ancestry', fixed: [], slots: [null, null] }, flaw: null };
  }
  const fixed = boosts.filter((b): b is PF2AttributeKey => b !== 'free');
  const freeCount = boosts.filter((b) => b === 'free').length;
  return { set: { key: 'ancestry', label: 'Ancestry', fixed, slots: Array(freeCount).fill(null) }, flaw: flaw ?? null };
}

/** The background set: one boost chosen from `attributeChoice`, plus one free boost. */
export function pf2BackgroundSet(attributeChoice: readonly PF2AttributeKey[]): BoostSet {
  return { key: 'background', label: 'Background', fixed: [], slots: [attributeChoice.length ? [...attributeChoice] : null, null] };
}

/** The class set: a single boost to the key attribute. A class with ONE key attribute makes it fixed; a class
 *  offering a choice (`keyOptions.length > 1`) makes it a restricted slot the player fills. */
export function pf2ClassSet(keyOptions: readonly PF2AttributeKey[]): BoostSet {
  if (keyOptions.length === 1) return { key: 'class', label: 'Class key attribute', fixed: [keyOptions[0]], slots: [] };
  return { key: 'class', label: 'Class key attribute', fixed: [], slots: [keyOptions.length ? [...keyOptions] : null] };
}

/** The four free level-1 boosts, each to a different attribute. */
export const pf2FreeSet = (): BoostSet => ({ key: 'free', label: 'Free boosts', fixed: [], slots: [null, null, null, null] });

/** Assemble the four standard level-1 boost sets (ancestry / background / class / free) from catalog data. */
export function pf2StandardSets(input: {
  ancestryBoosts: readonly (PF2AttributeKey | 'free')[];
  ancestryFlaw?: PF2AttributeKey;
  useAlternate?: boolean;
  backgroundChoice: readonly PF2AttributeKey[];
  classKeyOptions: readonly PF2AttributeKey[];
}): { sets: BoostSet[]; flaw: PF2AttributeKey | null } {
  const anc = pf2AncestrySet(input.ancestryBoosts, input.ancestryFlaw, !!input.useAlternate);
  const sets = [anc.set, pf2BackgroundSet(input.backgroundChoice), pf2ClassSet(input.classKeyOptions), pf2FreeSet()];
  return { sets, flaw: anc.flaw };
}
