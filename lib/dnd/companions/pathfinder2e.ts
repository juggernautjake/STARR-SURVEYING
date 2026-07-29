// lib/dnd/companions/pathfinder2e.ts — animal companions and familiars for Pathfinder 2e (P5-4, audit C-7).
//
// Companions existed for 5e 2024 (`./dnd5e-2024.ts`) and Intuitive Games only. PF2 has more companion
// content than either — a four-step animal-companion ladder, familiars on five classes, and a whole
// archetype — and none of it was reachable as anything but individual feat rows.
//
// EVERYTHING HERE IS DERIVED, NOT AUTHORED. Every rule string below is the `effect` text of a feat already
// catalogued in `data/feats-class.ts`, which carries its own `source`. Nothing in this file states a rule
// that is not already in the repo with a book attached — the same discipline `lib/dnd/languages/index.ts`
// used for PF2's language list, and for the same reason: a hand-written companion rule would look exactly
// as plausible as a correct one, and there would be no way to tell them apart later.
//
// GROUND RULE 3 — what this deliberately does NOT claim is recorded in `PF2_COMPANION_STATUS`, not left
// to be inferred from absence.
import { PF2_FEATS_CLASS_ARCHETYPE } from '../systems/pathfinder2e/data/feats-class';
import type { CompanionRuleSet } from './dnd5e-2024';

/** One rung of a companion's advancement, as the feat that grants it states it. */
export interface PF2CompanionStep {
  /** The feat's name — also how a player finds it in the feat picker. */
  feat: string;
  level: number;
  className: string;
  effect: string;
  source: string;
}

/**
 * The animal-companion ladder, in the order it is climbed.
 *
 * Ordered by the LEVEL the feats themselves carry rather than by a list written here, so a class whose
 * companion feats sit at unusual levels comes out right and cannot drift from the feat picker.
 */
const LADDER_FEATS = ['Animal Companion', 'Mature Animal Companion', 'Incredible Companion', 'Specialized Companion'];

/** Feats that grant or improve a familiar. Named individually because "familiar" also appears in the text
 *  of feats that merely mention one, and matching on the word would sweep those in. */
const FAMILIAR_FEATS = ['Familiar', 'Alchemical Familiar', 'Leshy Familiar', 'Enhanced Familiar', 'Familiar Master Dedication'];

const byName = (names: string[]) =>
  PF2_FEATS_CLASS_ARCHETYPE
    .filter((f) => names.includes(f.name))
    .map((f): PF2CompanionStep => ({
      feat: f.name,
      level: f.level,
      className: f.className ?? '',
      effect: f.effect,
      source: f.source,
    }))
    .sort((a, b) => a.level - b.level || a.className.localeCompare(b.className) || a.feat.localeCompare(b.feat));

/** Every catalogued animal-companion feat, across every class that gets one. */
export const PF2_ANIMAL_COMPANION_STEPS: PF2CompanionStep[] = byName(LADDER_FEATS);

/** Every catalogued familiar feat. */
export const PF2_FAMILIAR_STEPS: PF2CompanionStep[] = byName(FAMILIAR_FEATS);

/** The classes that can take an animal companion, derived from who actually has the level-1 feat. */
export const PF2_ANIMAL_COMPANION_CLASSES: string[] = [
  ...new Set(PF2_ANIMAL_COMPANION_STEPS.filter((s) => s.feat === 'Animal Companion' && s.className).map((s) => s.className)),
].sort();

/** The classes that can gain a familiar. */
export const PF2_FAMILIAR_CLASSES: string[] = [
  ...new Set(PF2_FAMILIAR_STEPS.filter((s) => s.className).map((s) => s.className)),
].sort();

/**
 * The ladder one class climbs, in level order.
 *
 * An unknown class returns `[]` rather than the generic ladder: a class that cannot take an animal
 * companion must not be shown one, and "every class has the same ladder" is exactly the kind of plausible
 * default that turns into a rules error on a sheet.
 */
export function pf2AnimalCompanionLadder(className: string): PF2CompanionStep[] {
  const n = className.trim().toLowerCase();
  return PF2_ANIMAL_COMPANION_STEPS.filter((s) => s.className.toLowerCase() === n);
}

/** The familiar feats one class can take, in level order. */
export function pf2FamiliarFeats(className: string): PF2CompanionStep[] {
  const n = className.trim().toLowerCase();
  return PF2_FAMILIAR_STEPS.filter((s) => s.className.toLowerCase() === n);
}

/** Every rule statement for a set of steps, deduplicated — the same feat appears once per class. */
const rulesFrom = (steps: PF2CompanionStep[]): string[] => {
  const seen = new Map<string, string>();
  for (const s of steps) if (!seen.has(s.feat)) seen.set(s.feat, `${s.feat} (level ${s.level}): ${s.effect}`);
  return [...seen.values()];
};

/** Shared with the 5e module's shape so the grounding and rules-store layers treat all systems alike. */
export const PF2_ANIMAL_COMPANION_RULES: CompanionRuleSet = {
  kind: 'primal-companion',
  name: 'Animal Companion',
  grantedBy: 'the Animal Companion class feat',
  classes: PF2_ANIMAL_COMPANION_CLASSES,
  rules: rulesFrom(PF2_ANIMAL_COMPANION_STEPS),
  source: 'Player Core',
};

export const PF2_FAMILIAR_RULES: CompanionRuleSet = {
  kind: 'familiar',
  name: 'Familiar',
  grantedBy: 'a familiar class feat, or the Familiar Master archetype',
  classes: PF2_FAMILIAR_CLASSES,
  rules: rulesFrom(PF2_FAMILIAR_STEPS),
  source: 'Player Core',
};

export const PF2_COMPANION_RULE_SETS: CompanionRuleSet[] = [PF2_ANIMAL_COMPANION_RULES, PF2_FAMILIAR_RULES];

/** The companion options a class can access. Unknown classes get [] — never invented. */
export function pf2CompanionsForClass(cls: string): CompanionRuleSet[] {
  const n = cls.trim().toLowerCase();
  return PF2_COMPANION_RULE_SETS.filter((r) => r.classes.some((c) => c.toLowerCase() === n));
}

/**
 * Honest coverage. Three real holes, each named rather than left to be inferred from absence.
 *
 * The animal TYPES (bear, bird, wolf, …) are the conspicuous one. Each is a statblock — size, six ability
 * modifiers, unarmed attack, senses, a Support benefit — and transcribing a dozen of them from memory is
 * precisely the failure Ground Rule 3 exists to prevent: the numbers would look right, feed a sheet that
 * computes from them, and be wrong in ways nobody would catch. They need a source, not an afternoon.
 */
export const PF2_COMPANION_STATUS = {
  /** The ladder runs 1 → 4 → 8 in the catalogued feats. The rules have a fourth rung — Specialized
   *  Companion, around level 14 — and NO feat row for it exists in `feats-class.ts`, so it is absent here
   *  too. Derivation is why that is visible at all: an authored ladder would have listed four rungs from
   *  memory and looked complete. */
  laddersComplete: false,
  ladderTopRung: 'Incredible Companion (level 8)',
  /** Bear, bird, wolf, … — the per-animal statblocks the player chooses between. */
  animalTypesCatalogued: false,
  /** The list a familiar picks its abilities from each day. */
  familiarAbilitiesCatalogued: false,
  /** The Summoner's eidolon — a second full statblock, and its own subsystem. */
  eidolonCatalogued: false,
  note:
    'The advancement ladder is DERIVED from the catalogued feats and currently ends at Incredible Companion (8); the rules’ Specialized Companion rung has no feat row in the repo, so it is absent here too. Per-animal statblocks, the familiar ability list, and the Summoner’s eidolon are NOT catalogued — their absence does not mean a companion has no stats. The eidolon is a second statblock and is blocked on the same creature model the bestiary needs.',
} as const;
