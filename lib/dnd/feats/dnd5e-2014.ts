// lib/dnd/feats/dnd5e-2014.ts — D&D 5e (2014 edition) feats as structured data.
//
// LICENSING BASIS. Everything here comes from the **SRD 5.1, released by Wizards of the Coast under
// CC-BY-4.0**, cross-checked against Wizards' own free 2014 Basic Rules PDF. Nothing in this file was
// taken from a licensed commercial platform (D&D Beyond, Roll20) or from an aggregator with a
// contested redistribution basis. All prose is paraphrased in our own words; only mechanical numbers
// and rules-term names are reproduced, and those are facts, not expression.
//
// NEVER-INVENT RULE (same as everywhere in lib/dnd): if a number or a rule could not be confirmed in
// a clean source, it is OMITTED rather than guessed. This file is deliberately, honestly short — see
// FEATS_2014_STATUS below and read it before assuming something is missing by mistake.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE DOES NOT REUSE THE 2024 `Feat` TYPE
//
// The 2024 model in ./dnd5e-2024.ts is built around `FeatCategory` = origin | general |
// fighting-style | epic-boon. Those TRACKS DO NOT EXIST IN 2014. Reusing that type would force every
// 2014 feat to claim a category it does not have, which is exactly the class of edition bleed the
// 2024 file's header warns about — in the opposite direction.
//
// The actual 2014 shape is much simpler, and it is the whole shape:
//   · Feats are an OPTIONAL rule (2014 PHB / Basic Rules). A DM may run a game without them at all.
//   · A character takes a feat **instead of** an Ability Score Improvement, at the levels their class
//     grants an ASI. There is no other route — no background feat, no free level-1 feat, no
//     fighting-style feat, no epic boon.
//   · Some feats have a prerequisite (an ability score, wearing/proficiency with armor, or
//     spellcasting). You must meet it to take the feat and to keep its benefits.
//   · Some feats include a +1 ability increase as one of their bullets; it is not a tier-wide rule
//     the way the 2024 General/Epic tiers are.
// So: a dedicated `Feat2014` type, and a dedicated `FEAT_SLOT_2014` constant that encodes the single
// legal slot. `eligibility.ts` is 2024-typed by construction; if 2014 feats are ever wired into the
// builder, add a system-keyed dispatcher there rather than widening the 2024 type (Ground Rule 1).
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';

/**
 * The ONLY way a 2014 character gains a feat: by forgoing an Ability Score Improvement at a level
 * their class grants one. Exported as a constant rather than a union because there is nothing to
 * choose between — encoding it makes the absence of 2024's tracks explicit and greppable.
 */
export const FEAT_SLOT_2014 = 'asi' as const;
export type FeatSlot2014 = typeof FEAT_SLOT_2014;

/** A gate on taking a 2014 feat. All present prerequisites must hold, and must KEEP holding. */
export interface FeatPrerequisite2014 {
  /** A minimum ability score, e.g. Strength 13+ for Grappler. */
  ability?: { key: AbilityKey; min: number };
  /** A named capability the character must already have, e.g. 'spellcasting', 'proficiency:heavy-armor'. */
  needs?: string;
  /** Human-readable prerequisite, shown in the UI verbatim (covers anything not machine-checked). */
  text?: string;
}

export interface Feat2014 {
  key: string;
  name: string;
  system: 'dnd5e-2014';
  /**
   * NOTE: there is intentionally NO `category` field. 2014 feats are one undifferentiated list;
   * origin / general / fighting-style / epic-boon are a 2024 structure and must not appear here.
   */
  /** Absent for feats with no prerequisite. */
  prerequisites?: FeatPrerequisite2014[];
  /** Can be taken more than once. 2014's default is NO; only a few feats say otherwise. */
  repeatable?: boolean;
  /**
   * The +1 (or +2) ability bump some 2014 feats include as one of their bullets. Unlike 2024 this is
   * a per-feat detail, not a property of a tier — most 2014 feats grant nothing here.
   */
  abilityIncrease?: { choices: AbilityKey[]; amount: number; max?: number };
  /** Proficiencies / options the feat grants, for wiring into the sheet (kept light; text is truth). */
  grants?: {
    skills?: string[];
    skillChoices?: { count: number; from: 'any' | string[] };
    tools?: string[];
    toolChoices?: { count: number };
    languages?: number;
  };
  /** One-line summary for pickers. */
  summary: string;
  /** Full rules text, paraphrased (markdown-lite: **bold**, · bullets). */
  benefit: string;
  /** Where this entry's mechanics were verified. */
  source: 'SRD 5.1' | 'Basic Rules 2014';
}

/**
 * Every 2014 feat we can publish. This list has exactly ONE entry, and that is correct — see
 * FEATS_2014_STATUS. Do not pad it.
 */
export const FEATS_2014: Feat2014[] = [
  {
    key: 'grappler',
    name: 'Grappler',
    system: 'dnd5e-2014',
    prerequisites: [{ ability: { key: 'str', min: 13 }, text: 'Strength 13 or higher' }],
    summary: 'Advantage on attacks against creatures you grapple, and an action to pin one.',
    benefit:
      'You are practised at close-quarters wrestling, and you gain the following benefits.\n\n· **Grappling Advantage** — You have **advantage** on attack rolls against a creature you are grappling.\n· **Pin** — You can use your **action** to try to pin a creature you have grappled. Make another grapple check; on a success, you and the creature are both **restrained** until the grapple ends.',
    source: 'SRD 5.1',
  },
];

/**
 * HONEST COVERAGE STATEMENT. Read this before treating the list above as incomplete-by-accident.
 *
 * The SRD 5.1 reproduces exactly one feat — Grappler. The rest of the 2014 feat list (Alert, Great
 * Weapon Master, Lucky, Polearm Master, Sentinel, Sharpshooter, War Caster, Resilient, Tough, the
 * armor/weapon-training feats, the half-feats, and so on) is Player's Handbook content that Wizards
 * did NOT place in the SRD and did NOT publish in the free Basic Rules. It is therefore not
 * available to us from any source we are willing to use, and inventing or paraphrasing it out of a
 * licensed platform is not an option. One feat is the correct, complete answer for this catalog.
 */
export const FEATS_2014_STATUS = {
  system: 'dnd5e-2014' as const,
  totalFeats: FEATS_2014.length,
  sources: ['SRD 5.1 (CC-BY-4.0)', 'D&D Basic Rules 2014 (free, Wizards of the Coast)'],
  /** True: this catalog covers everything our clean sources contain. */
  completeForSources: true,
  /** False: it is NOT the full 2014 PHB feat list, and cannot be. */
  completeForEdition: false,
  note:
    'The SRD 5.1 contains a single feat (Grappler), and the free 2014 Basic Rules describe feats as an optional rule without reprinting the list. Every other 2014 feat is Player\'s Handbook-only content outside the CC-BY licence, so it is deliberately absent rather than missing. Feats in 2014 are an optional rule taken in place of an Ability Score Improvement; there are no origin, general, fighting-style or epic-boon tracks (those are 2024 structures).',
  missingCategories: [
    'The ~40 remaining 2014 PHB feats (PHB-only, not in SRD 5.1 or the Basic Rules)',
  ],
} as const;

// ── Lookups ─────────────────────────────────────────────────────────────────

const FEAT_BY_KEY = new Map(FEATS_2014.map((f) => [f.key, f]));

/** Resolve a 2014 feat by key. Scoped to dnd5e-2014 by construction. */
export function findFeat2014(key: string): Feat2014 | undefined {
  return FEAT_BY_KEY.get(key);
}

/** Whether a 2014 feat grants an ability score increase. */
export function featGrantsAbilityIncrease2014(feat: Feat2014): boolean {
  return !!feat.abilityIncrease && feat.abilityIncrease.amount > 0;
}
