// lib/dnd/backgrounds/index.ts — the system-keyed background dispatcher (Slice 14-S7).
//
// GROUND RULE 1: content is reached through a per-system dispatcher, never by widening one system's
// module. `spellCatalog()` in ../spells/index.ts and `featEligibilityForSystem()` in
// ../feats/eligibility.ts are the shapes this follows.
//
// The two catalogs behind it have INCOMPATIBLE types on purpose (see each file's header), because
// the single most consequential 2014-vs-2024 difference lives exactly here:
//
//   · **2024** — the background grants the ability score increases (+2/+1 or +1/+1/+1) and an
//     Origin feat. `Background` carries `abilityScores` and `originFeat`.
//   · **2014** — the background grants NEITHER. The ability increases come from the RACE.
//     `Background2014` has no such fields at all.
//
// So this dispatcher does not return a raw union that every caller has to narrow. It returns a
// normalised `BackgroundView` with `grantsAbilityIncreases` as an explicit boolean — because the
// question a caller actually asks is "may I run the ability-spread flow for this sheet?", and the
// honest answer for 2014 is no. Answering it by checking `system === 'dnd5e-2024'` at each call
// site is how the check gets forgotten at the one site that matters.
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';
import { BACKGROUNDS_2024, type Background } from './dnd5e-2024';
import { BACKGROUNDS_2014, BACKGROUNDS_2014_STATUS, type Background2014 } from './dnd5e-2014';

export type { Background } from './dnd5e-2024';
export type { Background2014 } from './dnd5e-2014';
export { BACKGROUNDS_2014, BACKGROUNDS_2014_STATUS, findBackground2014 } from './dnd5e-2014';

/** A background normalised across editions, for consumers that must serve both. */
export interface BackgroundView {
  key: string;
  name: string;
  system: string;
  /**
   * The abilities a spread may be assigned across. **Empty for 2014**, and that emptiness is the
   * rule rather than missing data — pair it with `grantsAbilityIncreases` before acting on it.
   */
  abilityScores: AbilityKey[];
  /** Whether this edition's backgrounds move ability scores at all. False for 2014. */
  grantsAbilityIncreases: boolean;
  /** 2024 only — the Origin feat key. 2014 backgrounds grant no feat. */
  originFeat?: string;
  skillProficiencies: string[];
  toolProficiencies: string[];
  languages?: string;
  equipment: string;
  /** 2014 only — 2024 folded the narrative feature into the Origin feat. */
  feature?: { name: string; text: string };
  editionNote?: string;
}

function view2024(b: Background): BackgroundView {
  return {
    key: b.key, name: b.name, system: b.system,
    abilityScores: [...b.abilityScores],
    grantsAbilityIncreases: true,
    originFeat: b.originFeat,
    skillProficiencies: [...b.skillProficiencies],
    // The 2024 type holds one tool as a string (sometimes a category like "one Gaming Set of your
    // choice"); normalise to the array shape 2014 uses so a consumer renders one code path.
    toolProficiencies: b.toolProficiency ? [b.toolProficiency] : [],
    equipment: b.equipment,
  };
}

function view2014(b: Background2014): BackgroundView {
  return {
    key: b.key, name: b.name, system: b.system,
    // Deliberately empty, not omitted: a reader who sees `[]` next to `grantsAbilityIncreases:
    // false` learns the 2014 rule. An absent field would just look unfinished.
    abilityScores: [],
    grantsAbilityIncreases: false,
    skillProficiencies: [...b.skillProficiencies],
    toolProficiencies: [...b.toolProficiencies],
    languages: b.languages,
    equipment: b.equipment,
    feature: { ...b.feature },
    editionNote: b.editionNote,
  };
}

/** Every catalogued background for a system, normalised. Unknown or uncatalogued systems get [] —
 *  never another system's backgrounds, and never a 5e default (`system-bleed.test.ts`). */
export function backgroundsForSystem(system: string | null | undefined): BackgroundView[] {
  switch (system) {
    case 'dnd5e-2024': return BACKGROUNDS_2024.map(view2024);
    case 'dnd5e-2014': return BACKGROUNDS_2014.map(view2014);
    default: return [];
  }
}

/** Resolve one background within a system by key or display name (case-insensitive). */
export function findBackgroundForSystem(
  system: string | null | undefined,
  keyOrName: string,
): BackgroundView | undefined {
  const q = keyOrName.trim().toLowerCase();
  return backgroundsForSystem(system).find((b) => b.key === q || b.name.toLowerCase() === q);
}

/**
 * Does this system's background model move ability scores?
 *
 * This is the guard for the 2024 ability-spread flow (`validateAbilityAssignment`,
 * `backgroundGrants`, `reconcileBackgroundIncreases` in ./apply.ts — all of which are 2024 rules
 * expressed in code, taking a 2024 `Background`). Running any of them for a 2014 character would
 * hand that character 2024's ability model on top of the racial increases 2014 already gave them.
 *
 * Unknown systems return **false**, which is the safe direction here: the failure mode of a wrong
 * `true` is silently editing someone's ability scores, and the failure mode of a wrong `false` is a
 * flow that is simply not offered. PF2 and IG have their own background/ancestry models and reach
 * them through their own subsystems.
 */
export function backgroundsGrantAbilityIncreases(system: string | null | undefined): boolean {
  return system === 'dnd5e-2024';
}

/** Coverage for a system's background catalog, reported honestly (Ground Rule 2). */
export interface BackgroundCoverage {
  system: string;
  total: number;
  /** Every background the permitted sources carry is catalogued. */
  completeForSources: boolean;
  /** The catalog is the full published list for the edition. */
  completeForEdition: boolean;
  note: string;
}

export function backgroundCoverage(system: string | null | undefined): BackgroundCoverage {
  switch (system) {
    case 'dnd5e-2024':
      return {
        system: 'dnd5e-2024', total: BACKGROUNDS_2024.length,
        completeForSources: true, completeForEdition: true,
        note: "All 16 Player's Handbook (2024) backgrounds. Each grants three ability-score options, an Origin feat, two skills, a tool and starting equipment.",
      };
    case 'dnd5e-2014':
      return {
        system: 'dnd5e-2014', total: BACKGROUNDS_2014.length,
        completeForSources: BACKGROUNDS_2014_STATUS.completeForSources,
        completeForEdition: BACKGROUNDS_2014_STATUS.completeForEdition,
        note: BACKGROUNDS_2014_STATUS.note,
      };
    default:
      return {
        system: String(system ?? 'unknown'), total: 0,
        completeForSources: false, completeForEdition: false,
        note: 'No background catalog for this system.',
      };
  }
}
