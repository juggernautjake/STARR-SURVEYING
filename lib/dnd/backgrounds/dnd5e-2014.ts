// lib/dnd/backgrounds/dnd5e-2014.ts — the D&D 5e (2014) backgrounds our sources actually carry.
//
// LICENSING BASIS. SRD 5.1 (CC-BY-4.0), cross-checked against Wizards' free 2014 Basic Rules PDF.
// Paraphrased, never transcribed; the ~320-character house limit applies to the feature text for
// the same reason it applies everywhere else — it is a copyright guard, not a style preference.
//
// **THIS FILE HAS ONE ENTRY, AND THAT IS THE CORRECT ANSWER.** SRD 5.1 is far more limited on
// backgrounds than the PHB: it reproduces the general background rules and exactly ONE worked
// example, the Acolyte. The other twelve PHB backgrounds (Charlatan, Criminal, Entertainer, Folk
// Hero, Guild Artisan, Hermit, Noble, Outlander, Sage, Sailor, Soldier, Urchin) are not in the SRD
// and not in the Basic Rules. Padding this list from memory of the PHB would be inventing rules and
// presenting them to a player as verified 2014 content. See BACKGROUNDS_2014_STATUS.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE DOES NOT REUSE THE 2024 `Background` TYPE
//
// The 2024 type's very first field group is `abilityScores: AbilityKey[]` and `originFeat: string`,
// because **in 2024 the background is where the ability increases and the Origin feat live**. In
// 2014 a background grants NEITHER. It grants two skill proficiencies, some tool or language
// proficiencies, equipment, and a narrative feature — and nothing numeric beyond that. The ability
// increases come from the RACE (see ../species/dnd5e-2014.ts).
//
// Reusing the 2024 type would force every 2014 background to name three abilities it does not grant
// and an Origin feat that does not exist in the edition, which is precisely the bleed Ground Rule 1
// exists to stop — and `backgrounds.test.ts` asserts that every `Background` carries both fields, so
// a 2014 entry could not satisfy it honestly anyway. `Background2014` therefore has NO ability field
// at all: not an optional one, not an empty array. The absence is the rule.
export type BackgroundSource2014 = 'SRD 5.1' | 'Basic Rules 2014';

/** The narrative benefit a 2014 background grants. Every 2014 background has exactly one. */
export interface BackgroundFeature2014 {
  name: string;
  text: string;
}

export interface Background2014 {
  key: string;
  name: string;
  system: 'dnd5e-2014';
  /**
   * NOTE: there is intentionally NO `abilityScores` field and NO `originFeat`. Both are 2024
   * structures. A 2014 background moves no ability score; see the header.
   */
  /** Exactly two skill proficiencies (keys into `SKILLS`). */
  skillProficiencies: string[];
  /** Tool proficiencies granted, if any. The Acolyte has none — an empty array, not an omission. */
  toolProficiencies: string[];
  /** Language picks, phrased for the player (2014 backgrounds often grant free choices). */
  languages?: string;
  /** The starting-equipment line, paraphrased. */
  equipment: string;
  feature: BackgroundFeature2014;
  /** Populated only where a 2014-vs-2024 difference is CONFIRMED (14-S5's standing rule). */
  editionNote?: string;
  source: BackgroundSource2014;
}

export const BACKGROUNDS_2014: Background2014[] = [
  {
    key: 'acolyte',
    name: 'Acolyte',
    system: 'dnd5e-2014',
    skillProficiencies: ['insight', 'religion'],
    toolProficiencies: [],
    languages: 'Two languages of your choice.',
    equipment:
      'A holy symbol, a prayer book or prayer wheel, 5 sticks of incense, vestments, a set of common clothes, and a belt pouch holding 15 gp.',
    feature: {
      name: 'Shelter of the Faithful',
      text: 'You and your companions can expect free healing and care at a temple or shrine of your faith, though you must supply any material components a spell needs. Priests will support you where it costs them nothing dangerous, and a community sharing your religion may offer modest aid.',
    },
    editionNote:
      "2014's Acolyte grants two skills (Insight, Religion), two languages, equipment and the Shelter of the Faithful feature — and no ability increase. 2024's Acolyte grants the same two skills but also three ability-score options, the Magic Initiate (Divine) origin feat and a tool proficiency, because 2024 moved the ability increases from the race to the background.",
    source: 'SRD 5.1',
  },
];

/**
 * HONEST COVERAGE STATEMENT — and a short list here is the correct outcome, not a stalled slice.
 *
 * SRD 5.1's background section describes the general rules (proficiencies, languages, equipment, a
 * feature, and suggested personality traits/ideals/bonds/flaws) and then reproduces a single worked
 * background: the Acolyte. The free 2014 Basic Rules do the same. Every other 2014 background is
 * Player's Handbook-only content outside the CC-BY licence, so it is unavailable from any source we
 * are willing to use — and no amount of searching changes that, because the material was never
 * released. A player who wants Soldier or Criminal authors it as homebrew (Ground Rule 4).
 *
 * One entry is therefore complete for our sources and openly incomplete for the edition, which is
 * exactly the shape FEATS_2014_STATUS reports for the same reason (SRD 5.1 has one feat, Grappler).
 */
export const BACKGROUNDS_2014_STATUS = {
  system: 'dnd5e-2014' as const,
  totalBackgrounds: BACKGROUNDS_2014.length,
  sources: ['SRD 5.1 (CC-BY-4.0)', 'D&D Basic Rules 2014 (free, Wizards of the Coast)'],
  /** True: this catalog covers every background our clean sources contain. */
  completeForSources: true,
  /** False: it is NOT the 2014 PHB's thirteen backgrounds, and cannot be. */
  completeForEdition: false,
  /** The load-bearing edition fact, stated as data so a consumer can act on it rather than a comment. */
  grantsAbilityIncreases: false,
  note:
    'SRD 5.1 reproduces exactly one background (Acolyte) alongside the general background rules; the free 2014 Basic Rules do the same. The other twelve PHB backgrounds are outside the CC-BY licence and are deliberately absent rather than invented. Note that a 2014 background grants NO ability score increases — those come from the race, the opposite of 2024.',
  missingCategories: [
    'The twelve remaining 2014 PHB backgrounds (Charlatan, Criminal, Entertainer, Folk Hero, Guild Artisan, Hermit, Noble, Outlander, Sage, Sailor, Soldier, Urchin) — PHB-only, not in SRD 5.1 or the Basic Rules',
    'Suggested personality traits, ideals, bonds and flaws tables — prose flavour rather than mechanics',
  ],
} as const;

// ── Lookups ─────────────────────────────────────────────────────────────────

const BY_KEY = new Map(BACKGROUNDS_2014.map((b) => [b.key, b]));

/** Resolve a 2014 background by key or display name (case-insensitive). Scoped to dnd5e-2014 by
 *  construction; callers reach it through `./index.ts`, never by importing across editions. */
export function findBackground2014(keyOrName: string): Background2014 | undefined {
  const q = keyOrName.trim().toLowerCase();
  return BY_KEY.get(q) ?? BACKGROUNDS_2014.find((b) => b.name.toLowerCase() === q);
}
