// lib/dnd/systems/pathfinder2e/data/classes.ts — the LEVEL 1–20 class progressions.
//
// content.ts already knew what a class looks like at level 1: key attribute, HP, the four initial
// proficiency ranks, the subclass label. That is where it stopped, which is why PF2_CATALOG_STATUS
// reported `classes.complete: false` with the note "not the full level 1–20 feature progression".
// This file is that progression: for each class, which levels raise which proficiency to which rank,
// which levels grant a class feat, and what the class actually gains at each level.
//
// WHY THIS IS THE LOAD-BEARING TRANCHE. Every other tranche describes things a character MIGHT have.
// This one describes what a character DOES have at their level, so a wrong number here is not a
// missing option — it is a wrong modifier on every d20 the sheet rolls for the rest of the campaign.
// `classFeatLevels` is worse still: eligibility.ts feeds it straight into pf2FeatLevelsFor as the
// class-feat schedule, so a wrong entry either hands out a feat slot that does not exist or refuses
// one that does.
//
// LICENSING: PF2 mechanics are ORC-licensed, which expressly permits reproducing rules mechanics.
// Reserved Material — Paizo trademarks, deities, characters, locations, lore, art — must never appear
// here. Every entry carries `source`. Mechanical facts and numbers, PARAPHRASED; never verbatim
// rulebook prose. Remaster terminology throughout (attribute boosts, spell RANKS, Reactive Strike),
// including for the four classes whose own books predate or sit outside the remaster.
//
// GROUND RULE 3 — NEVER INVENT A RULE, A LEVEL, OR A PROGRESSION. Applied here as three concrete
// habits, because "omit if unsure" needs a shape to be actionable:
//   1. Every proficiency step below was read off a class's own advancement table AND cross-checked
//      against what the named feature granting it actually says. Where the two disagreed, the step
//      was dropped and the feature kept as descriptive text — a feature with no `increases` entry is
//      a deliberate "we know this exists, we do not know its exact rank".
//   2. `classFeatLevels` is OMITTED, not guessed, where the schedule is genuinely ambiguous. Omitting
//      makes eligibility.ts fall back to the even-level default, which is the common case and
//      therefore the safe wrong answer if it is wrong at all. See the Summoner note.
//   3. Reduced casters carry `slotTableModelled: false` rather than a plausible table. eligibility.ts
//      deliberately returns a spell-rank ceiling of 0 for them; a refused legal spell is visible and
//      fixable, a silently over-generous ceiling is neither.
//
// WHAT `features` DELIBERATELY OMITS: the universal chassis every class shares — ancestry feats at
// 1/5/9/13/17, general feats at 3/7/11/15/19, skill feats at even levels, attribute boosts at
// 5/10/15/20, skill increases at odd levels from 3. Those are character rules, not class rules, and
// they already live in eligibility.ts. Repeating them twenty times would put the same fact in two
// places, which is how the two versions start to disagree. Classes that DEVIATE from that chassis
// (Rogue and Investigator take skill increases far more often) say so in `notes`.
import type { PF2AttributeKey, PF2Rank, PF2Tradition } from '../model';
import type { PF2Source } from '../defs';

// ── Shapes ────────────────────────────────────────────────────────────────────────────────────

/** One rank bump, with the class feature that causes it.
 *
 *  `via` is not decoration: a sheet that says "your Reflex save became expert at level 5" is
 *  auditable, and one that says "+2" is not. It is also how a reader checks this data against a
 *  rulebook without having to reverse-engineer which feature we meant. */
export interface PF2ProficiencyStep {
  level: number;
  rank: PF2Rank;
  /** The class feature granting it, as the class names it. */
  via: string;
  /** Scope, when the bump does not apply to the whole track (e.g. one weapon group only). */
  note?: string;
}

/** A proficiency from level 1 to 20. `increases` is ordered ascending and may be empty. */
export interface PF2ProficiencyTrack {
  initial: PF2Rank;
  increases: PF2ProficiencyStep[];
  /** Why the track is not the whole story — subclass-dependent steps, choice-dependent steps. */
  note?: string;
}

export interface PF2ClassFeature {
  level: number;
  name: string;
  /** Concise paraphrased mechanics. Never rulebook prose. */
  effect: string;
}

/** A subclass option. `progression` carries the steps that belong to the SUBCLASS rather than the
 *  class, which is the only honest way to model a Cleric: a cloistered cleric and a warpriest have
 *  different Fortitude, weapon and spell progressions, so neither belongs on the base track. */
export interface PF2Subclass {
  name: string;
  effect?: string;
  /** Tradition, for subclasses that set one (Sorcerer bloodlines, Witch patrons). */
  tradition?: PF2Tradition | 'varies';
  /** Key attribute, for subclasses that set one (Rogue rackets). */
  keyAttribute?: PF2AttributeKey;
  progression?: { level: number; effect: string }[];
  source: PF2Source;
}

export interface PF2ClassSpellcasting {
  /** 'varies' where a subclass chooses it (Sorcerer bloodline, Witch patron, Summoner eidolon). */
  tradition: PF2Tradition | 'varies';
  kind: 'prepared' | 'spontaneous';
  /** The attribute driving spell attack and spell DC. NOT always the class's key attribute — a Magus
   *  keys off Strength or Dexterity and casts off Intelligence. */
  attribute: PF2AttributeKey;
  /** 'full' = the standard caster table, a new top rank every odd level. 'reduced' = a class with its
   *  own smaller table (Magus, Summoner). */
  progression: 'full' | 'reduced';
  /** False means "we did not model the slot table", and eligibility.ts must not assume one. */
  slotTableModelled: boolean;
  /** For full casters: the character level at which each spell rank unlocks. */
  spellRankLevels?: Record<number, number>;
  /** The level-19 feature granting a single top-rank slot, where the class has one. */
  capstone?: { level: number; name: string; effect: string };
  /** Spell attack modifier / spell DC proficiency over 20 levels. */
  proficiency?: PF2ProficiencyTrack;
  note?: string;
}

export interface PF2ClassProgression {
  className: string;
  /** Some classes offer a choice; the array holds every legal option, best-known first. */
  keyAttribute: PF2AttributeKey[];
  hpPerLevel: number;
  perception: PF2ProficiencyTrack;
  saves: { fortitude: PF2ProficiencyTrack; reflex: PF2ProficiencyTrack; will: PF2ProficiencyTrack };
  attacks: PF2ProficiencyTrack;
  /** Armor and unarmored defense. PF2 advances them together for almost every class. */
  defenses: PF2ProficiencyTrack;
  /** Optional because two classes here genuinely have no class DC (Magus, Summoner). */
  classDc?: PF2ProficiencyTrack;
  spellcasting?: PF2ClassSpellcasting;
  /** The levels granting a class feat. OMITTED where uncertain — eligibility.ts then falls back to
   *  the even-level default, which is deliberately the safer wrong answer. */
  classFeatLevels?: number[];
  features: PF2ClassFeature[];
  /** What this class calls its subclass: Instinct, Racket, Bloodline, Doctrine, … */
  subclassName?: string;
  /** The levels at which the subclass grants something. */
  subclassLevels?: number[];
  subclasses?: PF2Subclass[];
  source: PF2Source;
  /** Anything a reader must know that the fields cannot carry, including our own known gaps. */
  notes?: string[];
}

// ── Shared constants ──────────────────────────────────────────────────────────────────────────

/** The default class-feat schedule. Most classes. */
const EVEN_LEVELS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];

/** The other schedule: a bonus class feat at level 1 on top of every even level. Confirmed
 *  class-table-by-class-table — this is NOT a martial/caster split, it just happens that none of the
 *  slot casters below get one. */
const ONE_AND_EVEN_LEVELS = [1, ...EVEN_LEVELS];

/** A full caster's spell-rank unlock schedule: rank 1 at level 1, then a new rank every odd level.
 *  Rank 10 is never on this table — it comes only from a class's level-19 capstone, one slot. */
const FULL_CASTER_RANKS: Record<number, number> = {
  1: 1, 2: 3, 3: 5, 4: 7, 5: 9, 6: 11, 7: 13, 8: 15, 9: 17,
};

/** Every full caster advances spell attack/DC identically. */
const fullCasterSpellProficiency = (): PF2ProficiencyTrack => ({
  initial: 'trained',
  increases: [
    { level: 7, rank: 'expert', via: 'Expert Spellcaster' },
    { level: 15, rank: 'master', via: 'Master Spellcaster' },
    { level: 19, rank: 'legendary', via: 'Legendary Spellcaster' },
  ],
});

// ── The progressions ──────────────────────────────────────────────────────────────────────────

export const PF2_CLASS_PROGRESSIONS: PF2ClassProgression[] = [
  // ══ ALCHEMIST ═══════════════════════════════════════════════════════════════════════════════
  {
    className: 'Alchemist',
    keyAttribute: ['INT'],
    hpPerLevel: 8,
    source: 'Player Core 2',
    perception: { initial: 'trained', increases: [{ level: 9, rank: 'expert', via: 'Perception Expertise' }] },
    saves: {
      fortitude: { initial: 'expert', increases: [{ level: 11, rank: 'master', via: 'Chemical Hardiness' }] },
      reflex: { initial: 'expert', increases: [{ level: 15, rank: 'master', via: 'Explosion Dodger' }] },
      will: { initial: 'trained', increases: [{ level: 7, rank: 'expert', via: 'Will Expertise' }] },
    },
    attacks: {
      initial: 'trained',
      increases: [
        { level: 7, rank: 'expert', via: 'Alchemical Weapon Expertise' },
        { level: 15, rank: 'master', via: 'Alchemical Weapon Mastery' },
      ],
      note: 'Simple weapons, alchemical bombs and unarmed attacks. The class never trains martial weapons.',
    },
    defenses: {
      initial: 'trained',
      increases: [
        { level: 13, rank: 'expert', via: 'Medium Armor Expertise' },
        { level: 19, rank: 'master', via: 'Medium Armor Mastery' },
      ],
      note: 'Light armor, medium armor and unarmored defense.',
    },
    classDc: {
      initial: 'trained',
      increases: [
        { level: 9, rank: 'expert', via: 'Alchemical Expertise' },
        { level: 17, rank: 'master', via: 'Alchemical Mastery' },
      ],
    },
    classFeatLevels: ONE_AND_EVEN_LEVELS,
    subclassName: 'Research Field',
    subclassLevels: [1, 5, 13],
    subclasses: [
      { name: 'Bomber', source: 'Player Core 2' },
      { name: 'Chirurgeon', source: 'Player Core 2' },
      { name: 'Mutagenist', source: 'Player Core 2' },
      { name: 'Toxicologist', source: 'Player Core 2' },
    ],
    features: [
      { level: 1, name: 'Alchemy', effect: 'Craft alchemical items from a formula book, both in advance and on the fly during an encounter, using versatile vials rather than a shopping list.' },
      { level: 1, name: 'Research Field', effect: 'The specialisation that decides your bonus formulas and the benefit your field discoveries build on.' },
      { level: 5, name: 'Field Discovery', effect: 'A stronger application of your research field.' },
      { level: 5, name: 'Powerful Alchemy', effect: 'Items you make on the fly use your class DC instead of the item’s own DC.' },
      { level: 7, name: 'Alchemical Weapon Expertise', effect: 'Expert with simple weapons, alchemical bombs and unarmed attacks.' },
      { level: 7, name: 'Will Expertise', effect: 'Expert Will saves.' },
      { level: 9, name: 'Alchemical Expertise', effect: 'Expert alchemist class DC.' },
      { level: 9, name: 'Double Brew', effect: 'Produce two items at once when improvising alchemy.' },
      { level: 9, name: 'Perception Expertise', effect: 'Expert Perception.' },
      { level: 11, name: 'Advanced Vials', effect: 'More versatile vials to spend each day.' },
      { level: 11, name: 'Chemical Hardiness', effect: 'Master Fortitude saves; a success becomes a critical success.' },
      { level: 13, name: 'Greater Field Discovery', effect: 'The strongest expression of your research field.' },
      { level: 13, name: 'Medium Armor Expertise', effect: 'Expert light armor, medium armor and unarmored defense.' },
      { level: 13, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 15, name: 'Alchemical Weapon Mastery', effect: 'Master with simple weapons, alchemical bombs and unarmed attacks.' },
      { level: 15, name: 'Explosion Dodger', effect: 'Master Reflex saves; a success becomes a critical success.' },
      { level: 17, name: 'Abundant Vials', effect: 'A further increase to your daily versatile vials.' },
      { level: 17, name: 'Alchemical Mastery', effect: 'Master alchemist class DC.' },
      { level: 19, name: 'Medium Armor Mastery', effect: 'Master light armor, medium armor and unarmored defense.' },
    ],
  },

  // ══ BARBARIAN ═══════════════════════════════════════════════════════════════════════════════
  {
    className: 'Barbarian',
    keyAttribute: ['STR'],
    hpPerLevel: 12,
    source: 'Player Core 2',
    perception: { initial: 'expert', increases: [{ level: 17, rank: 'master', via: 'Perception Mastery' }] },
    saves: {
      fortitude: {
        initial: 'expert',
        increases: [
          { level: 7, rank: 'master', via: 'Juggernaut' },
          { level: 13, rank: 'legendary', via: 'Greater Juggernaut' },
        ],
      },
      reflex: { initial: 'trained', increases: [{ level: 9, rank: 'expert', via: 'Reflex Expertise' }] },
      will: { initial: 'expert', increases: [{ level: 15, rank: 'master', via: 'Indomitable Will' }] },
    },
    attacks: {
      initial: 'trained',
      increases: [
        { level: 5, rank: 'expert', via: 'Brutality' },
        { level: 13, rank: 'master', via: 'Weapon Mastery' },
      ],
      note: 'Simple weapons, martial weapons and unarmed attacks.',
    },
    defenses: {
      initial: 'trained',
      increases: [
        { level: 13, rank: 'expert', via: 'Medium Armor Expertise' },
        { level: 19, rank: 'master', via: 'Armor Mastery' },
      ],
      note: 'Light armor, medium armor and unarmored defense.',
    },
    classDc: {
      initial: 'trained',
      increases: [
        { level: 11, rank: 'expert', via: 'Mighty Rage' },
        { level: 19, rank: 'master', via: 'Devastator' },
      ],
    },
    classFeatLevels: ONE_AND_EVEN_LEVELS,
    subclassName: 'Instinct',
    subclassLevels: [1],
    subclasses: [
      { name: 'Animal', source: 'Player Core 2' },
      { name: 'Dragon', source: 'Player Core 2' },
      { name: 'Fury', source: 'Player Core 2' },
      { name: 'Giant', source: 'Player Core 2' },
      { name: 'Spirit', source: 'Player Core 2' },
      { name: 'Superstition', source: 'Player Core 2' },
    ],
    features: [
      { level: 1, name: 'Rage', effect: 'Spend an action to rage: bonus damage and temporary Hit Points, at the cost of a penalty to AC and a bar on concentration actions.' },
      { level: 1, name: 'Quick-Tempered', effect: 'Enter a rage as part of moving into position rather than spending a separate action.' },
      { level: 1, name: 'Instinct', effect: 'The source of your rage. Sets your rage damage, your specialisation ability, an anathema, and the instinct feats open to you.' },
      { level: 3, name: 'Furious Footfalls', effect: 'A permanent increase to your Speed, larger while raging.' },
      { level: 5, name: 'Brutality', effect: 'Expert with simple weapons, martial weapons and unarmed attacks; while raging you gain critical specialization effects.' },
      { level: 7, name: 'Juggernaut', effect: 'Master Fortitude saves; a success becomes a critical success.' },
      { level: 7, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in, more while raging.' },
      { level: 9, name: 'Raging Resistance', effect: 'Resistance while raging to damage types tied to your instinct.' },
      { level: 9, name: 'Reflex Expertise', effect: 'Expert Reflex saves.' },
      { level: 11, name: 'Mighty Rage', effect: 'Expert barbarian class DC, and a stronger opening strike in a rage.' },
      { level: 13, name: 'Greater Juggernaut', effect: 'Legendary Fortitude saves; a critical failure becomes a failure, and a failed save against damage halves it.' },
      { level: 13, name: 'Medium Armor Expertise', effect: 'Expert light armor, medium armor and unarmored defense.' },
      { level: 13, name: 'Weapon Mastery', effect: 'Master with simple weapons, martial weapons and unarmed attacks.' },
      { level: 15, name: 'Indomitable Will', effect: 'Master Will saves; a success becomes a critical success.' },
      { level: 17, name: 'Perception Mastery', effect: 'Master Perception.' },
      { level: 17, name: 'Revitalizing Rage', effect: 'Recover Hit Points when you rage.' },
      { level: 19, name: 'Armor Mastery', effect: 'Master light armor, medium armor and unarmored defense.' },
      { level: 19, name: 'Devastator', effect: 'Master barbarian class DC; melee Strikes ignore up to 10 points of physical resistance.' },
    ],
  },

  // ══ BARD ════════════════════════════════════════════════════════════════════════════════════
  {
    className: 'Bard',
    keyAttribute: ['CHA'],
    hpPerLevel: 8,
    source: 'Player Core',
    perception: { initial: 'expert', increases: [{ level: 11, rank: 'master', via: 'Perception Mastery' }] },
    saves: {
      fortitude: { initial: 'trained', increases: [{ level: 9, rank: 'expert', via: 'Fortitude Expertise' }] },
      reflex: { initial: 'trained', increases: [{ level: 3, rank: 'expert', via: 'Reflex Expertise' }] },
      will: {
        initial: 'expert',
        increases: [
          { level: 9, rank: 'master', via: "Performer's Heart" },
          { level: 17, rank: 'legendary', via: "Greater Performer's Heart" },
        ],
      },
    },
    attacks: {
      initial: 'trained',
      increases: [{ level: 11, rank: 'expert', via: 'Bard Weapon Expertise' }],
      note: 'Simple weapons, martial weapons and unarmed attacks.',
    },
    defenses: {
      initial: 'trained',
      increases: [{ level: 13, rank: 'expert', via: 'Light Armor Expertise' }],
      note: 'Light armor and unarmored defense.',
    },
    classDc: { initial: 'trained', increases: [], note: 'No class feature raises the bard class DC; most bard effects use the spell DC.' },
    spellcasting: {
      tradition: 'occult',
      kind: 'spontaneous',
      attribute: 'CHA',
      progression: 'full',
      slotTableModelled: true,
      spellRankLevels: FULL_CASTER_RANKS,
      capstone: { level: 19, name: 'Magnum Opus', effect: 'A single rank-10 spell slot and two rank-10 spells in your repertoire.' },
      proficiency: fullCasterSpellProficiency(),
    },
    classFeatLevels: EVEN_LEVELS,
    subclassName: 'Muse',
    subclassLevels: [1],
    subclasses: [
      { name: 'Enigma', source: 'Player Core' },
      { name: 'Maestro', source: 'Player Core' },
      { name: 'Polymath', source: 'Player Core' },
      { name: 'Warrior', source: 'Player Core' },
    ],
    features: [
      { level: 1, name: 'Bard Spellcasting', effect: 'Spontaneous occult casting from a repertoire, keyed to Charisma.' },
      { level: 1, name: 'Spell Repertoire', effect: 'A fixed set of known spells, cast into any slot of sufficient rank.' },
      { level: 1, name: 'Composition Spells', effect: 'Focus spells performed as compositions, powered by Focus Points and usually granting allies a status bonus.' },
      { level: 1, name: 'Muse', effect: 'Grants a bonus class feat, a composition spell, and access to that muse’s feats.' },
      { level: 3, name: 'Reflex Expertise', effect: 'Expert Reflex saves.' },
      { level: 3, name: 'Signature Spells', effect: 'One spell of each rank can be heightened freely to any slot you have.' },
      { level: 7, name: 'Expert Spellcaster', effect: 'Expert spell attack modifier and spell DC.' },
      { level: 9, name: 'Fortitude Expertise', effect: 'Expert Fortitude saves.' },
      { level: 9, name: "Performer's Heart", effect: 'Master Will saves; a success becomes a critical success.' },
      { level: 11, name: 'Bard Weapon Expertise', effect: 'Expert with simple weapons, martial weapons and unarmed attacks, plus critical specialization while a composition is up.' },
      { level: 11, name: 'Perception Mastery', effect: 'Master Perception.' },
      { level: 13, name: 'Light Armor Expertise', effect: 'Expert light armor and unarmored defense.' },
      { level: 13, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 15, name: 'Master Spellcaster', effect: 'Master spell attack modifier and spell DC.' },
      { level: 17, name: "Greater Performer's Heart", effect: 'Legendary Will saves; a critical failure becomes a failure, and failed saves against damage are halved.' },
      { level: 19, name: 'Legendary Spellcaster', effect: 'Legendary spell attack modifier and spell DC.' },
      { level: 19, name: 'Magnum Opus', effect: 'A rank-10 spell slot and two rank-10 spells added to your repertoire.' },
    ],
  },

  // ══ CHAMPION ════════════════════════════════════════════════════════════════════════════════
  {
    className: 'Champion',
    keyAttribute: ['STR', 'DEX'],
    hpPerLevel: 10,
    source: 'Player Core 2',
    perception: { initial: 'trained', increases: [{ level: 11, rank: 'expert', via: 'Perception Expertise' }] },
    saves: {
      fortitude: { initial: 'expert', increases: [{ level: 9, rank: 'master', via: 'Sacred Body' }] },
      reflex: { initial: 'trained', increases: [{ level: 9, rank: 'expert', via: 'Reflex Expertise' }] },
      will: { initial: 'expert', increases: [{ level: 11, rank: 'master', via: 'Divine Will' }] },
    },
    attacks: {
      initial: 'trained',
      increases: [
        { level: 5, rank: 'expert', via: 'Weapon Expertise' },
        { level: 13, rank: 'master', via: 'Weapon Mastery' },
      ],
      note: 'Simple weapons, martial weapons and unarmed attacks.',
    },
    defenses: {
      initial: 'trained',
      increases: [
        { level: 7, rank: 'expert', via: 'Armor Expertise' },
        { level: 13, rank: 'master', via: 'Armor Mastery' },
        { level: 17, rank: 'legendary', via: 'Legendary Armor' },
      ],
      note: 'All armor categories including heavy, plus unarmored defense. The only class that reaches legendary armor.',
    },
    classDc: {
      initial: 'trained',
      increases: [
        { level: 9, rank: 'expert', via: 'Champion Expertise' },
        { level: 17, rank: 'master', via: 'Champion Mastery' },
      ],
      note: 'The same two features raise the spell attack modifier and spell DC used by devotion spells.',
    },
    classFeatLevels: ONE_AND_EVEN_LEVELS,
    subclassName: 'Cause',
    subclassLevels: [1],
    subclasses: [
      { name: 'Desecration', effect: 'Unholy sanctification.', source: 'Player Core 2' },
      { name: 'Grandeur', effect: 'Holy sanctification.', source: 'Player Core 2' },
      { name: 'Iniquity', effect: 'Unholy sanctification.', source: 'Player Core 2' },
      { name: 'Justice', source: 'Player Core 2' },
      { name: 'Liberation', source: 'Player Core 2' },
      { name: 'Obedience', source: 'Player Core 2' },
      { name: 'Redemption', effect: 'Holy sanctification.', source: 'Player Core 2' },
    ],
    features: [
      { level: 1, name: 'Deity and Cause', effect: 'Your deity sets edicts, anathema and a favored weapon; your cause sets your champion’s reaction and its own edicts.' },
      { level: 1, name: 'Devotion Spells', effect: 'Focus spells granted by your cause, cast with Focus Points rather than slots.' },
      { level: 1, name: 'Shield Block', effect: 'A reaction that spends the shield’s Hardness to absorb damage.' },
      { level: 3, name: 'Blessing of the Devoted', effect: 'A benefit tied to your cause.' },
      { level: 5, name: 'Weapon Expertise', effect: 'Expert with simple weapons, martial weapons and unarmed attacks.' },
      { level: 7, name: 'Armor Expertise', effect: 'Expert in all armor and unarmored defense, plus armor specialization effects.' },
      { level: 7, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 9, name: 'Champion Expertise', effect: 'Expert champion class DC, spell attack modifier and spell DC.' },
      { level: 9, name: 'Reflex Expertise', effect: 'Expert Reflex saves.' },
      { level: 9, name: 'Relentless Reaction', effect: 'Your champion’s reaction gains an added effect.' },
      { level: 9, name: 'Sacred Body', effect: 'Master Fortitude saves; a success becomes a critical success.' },
      { level: 11, name: 'Divine Will', effect: 'Master Will saves; a success becomes a critical success.' },
      { level: 11, name: 'Exalted Reaction', effect: 'Your champion’s reaction can benefit more than one creature.' },
      { level: 11, name: 'Perception Expertise', effect: 'Expert Perception.' },
      { level: 13, name: 'Armor Mastery', effect: 'Master in all armor and unarmored defense.' },
      { level: 13, name: 'Weapon Mastery', effect: 'Master with simple weapons, martial weapons and unarmed attacks.' },
      { level: 15, name: 'Greater Weapon Specialization', effect: 'The weapon specialization damage increases.' },
      { level: 17, name: 'Champion Mastery', effect: 'Master champion class DC, spell attack modifier and spell DC.' },
      { level: 17, name: 'Legendary Armor', effect: 'Legendary in all armor and unarmored defense.' },
      { level: 19, name: "Hero's Defiance", effect: 'A focus spell that keeps you conscious when a blow would drop you.' },
    ],
    notes: [
      'Champion casts devotion (focus) spells only — no spell slots — so it carries no `spellcasting` block. Its spell attack/DC track rides on Champion Expertise (9) and Champion Mastery (17); see the classDc note.',
    ],
  },

  // ══ CLERIC ══════════════════════════════════════════════════════════════════════════════════
  {
    className: 'Cleric',
    keyAttribute: ['WIS'],
    hpPerLevel: 8,
    source: 'Player Core',
    perception: { initial: 'trained', increases: [{ level: 5, rank: 'expert', via: 'Perception Expertise' }] },
    saves: {
      fortitude: {
        initial: 'trained',
        increases: [],
        note: 'Fortitude is DOCTRINE-dependent, not class-wide: a cloistered cleric becomes expert at 3, a warpriest is expert from level 1 and master at 15. See `subclasses`.',
      },
      reflex: { initial: 'trained', increases: [{ level: 11, rank: 'expert', via: 'Reflex Expertise' }] },
      will: { initial: 'expert', increases: [{ level: 9, rank: 'master', via: 'Resolute Faith' }] },
    },
    attacks: {
      initial: 'trained',
      increases: [],
      note: 'Attacks are DOCTRINE-dependent. Base: trained in simple weapons, the deity’s favored weapon and unarmed attacks. A cloistered cleric reaches expert at 11; a warpriest trains martial weapons at 3, reaches expert at 7 and master with the favored weapon at 19.',
    },
    defenses: {
      initial: 'trained',
      increases: [{ level: 13, rank: 'expert', via: 'Divine Defense' }],
      note: 'Unarmored defense. A warpriest additionally trains light and medium armor at level 1.',
    },
    classDc: { initial: 'trained', increases: [], note: 'No feature raises the cleric class DC; cleric effects use the spell DC.' },
    spellcasting: {
      tradition: 'divine',
      kind: 'prepared',
      attribute: 'WIS',
      progression: 'full',
      slotTableModelled: true,
      spellRankLevels: FULL_CASTER_RANKS,
      capstone: { level: 19, name: 'Miraculous Spell', effect: 'A single rank-10 spell slot.' },
      proficiency: {
        initial: 'trained',
        increases: [],
        note: 'DOCTRINE-dependent, unlike every other full caster. Cloistered: expert 7, master 15, legendary 19. Warpriest: expert 11, master 19 — a warpriest never reaches legendary.',
      },
      note: 'The divine font grants extra slots of the highest rank, filled only with the heal or harm spell.',
    },
    classFeatLevels: EVEN_LEVELS,
    subclassName: 'Doctrine',
    subclassLevels: [1, 3, 7, 11, 15, 19],
    subclasses: [
      {
        name: 'Cloistered Cleric',
        source: 'Player Core',
        progression: [
          { level: 1, effect: 'The Domain Initiate class feat.' },
          { level: 3, effect: 'Expert Fortitude saves.' },
          { level: 7, effect: 'Expert spell attack modifier and spell DC.' },
          { level: 11, effect: 'Expert with the deity’s favored weapon, simple weapons and unarmed attacks; critical hits with the favored weapon apply its critical specialization effect.' },
          { level: 15, effect: 'Master spell attack modifier and spell DC.' },
          { level: 19, effect: 'Legendary spell attack modifier and spell DC.' },
        ],
      },
      {
        name: 'Warpriest',
        source: 'Player Core',
        progression: [
          { level: 1, effect: 'Trained in light and medium armor, expert Fortitude saves, and the Shield Block feat.' },
          { level: 3, effect: 'Trained in martial weapons.' },
          { level: 7, effect: 'Expert with the deity’s favored weapon, martial weapons, simple weapons and unarmed attacks, with critical specialization on the favored weapon.' },
          { level: 11, effect: 'Expert spell attack modifier and spell DC.' },
          { level: 15, effect: 'Master Fortitude saves; a success becomes a critical success.' },
          { level: 19, effect: 'Master with the deity’s favored weapon, spell attack modifier and spell DC.' },
        ],
      },
    ],
    features: [
      { level: 1, name: 'Cleric Spellcasting', effect: 'Prepared divine casting keyed to Wisdom.' },
      { level: 1, name: 'Divine Font', effect: 'Extra top-rank slots each day that hold only heal or only harm, chosen to match your deity.' },
      { level: 1, name: 'Doctrine', effect: 'Cloistered cleric or warpriest — the choice that drives your armor, weapon, Fortitude and spellcasting progressions.' },
      { level: 5, name: 'Perception Expertise', effect: 'Expert Perception.' },
      { level: 9, name: 'Resolute Faith', effect: 'Master Will saves; a success becomes a critical success.' },
      { level: 11, name: 'Reflex Expertise', effect: 'Expert Reflex saves.' },
      { level: 13, name: 'Divine Defense', effect: 'Expert unarmored defense.' },
      { level: 13, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 19, name: 'Miraculous Spell', effect: 'A rank-10 spell slot.' },
    ],
  },

  // ══ DRUID ═══════════════════════════════════════════════════════════════════════════════════
  {
    className: 'Druid',
    keyAttribute: ['WIS'],
    hpPerLevel: 8,
    source: 'Player Core',
    perception: { initial: 'trained', increases: [{ level: 3, rank: 'expert', via: 'Perception Expertise' }] },
    saves: {
      fortitude: { initial: 'trained', increases: [{ level: 3, rank: 'expert', via: 'Fortitude Expertise' }] },
      reflex: { initial: 'trained', increases: [{ level: 5, rank: 'expert', via: 'Reflex Expertise' }] },
      will: { initial: 'expert', increases: [{ level: 11, rank: 'master', via: 'Wild Willpower' }] },
    },
    attacks: {
      initial: 'trained',
      increases: [{ level: 11, rank: 'expert', via: 'Weapon Expertise' }],
      note: 'Simple weapons and unarmed attacks only.',
    },
    defenses: {
      initial: 'trained',
      increases: [{ level: 13, rank: 'expert', via: 'Medium Armor Expertise' }],
      note: 'Light armor, medium armor and unarmored defense.',
    },
    classDc: { initial: 'trained', increases: [], note: 'No feature raises the druid class DC; druid effects use the spell DC.' },
    spellcasting: {
      tradition: 'primal',
      kind: 'prepared',
      attribute: 'WIS',
      progression: 'full',
      slotTableModelled: true,
      spellRankLevels: FULL_CASTER_RANKS,
      capstone: { level: 19, name: 'Primal Hierophant', effect: 'A single rank-10 spell slot that cannot be used for heightened lower-rank spells.' },
      proficiency: fullCasterSpellProficiency(),
    },
    classFeatLevels: EVEN_LEVELS,
    subclassName: 'Order',
    subclassLevels: [1],
    subclasses: [
      { name: 'Animal', source: 'Player Core' },
      { name: 'Leaf', source: 'Player Core' },
      { name: 'Storm', source: 'Player Core' },
      { name: 'Untamed', source: 'Player Core' },
    ],
    features: [
      { level: 1, name: 'Druid Spellcasting', effect: 'Prepared primal casting keyed to Wisdom.' },
      { level: 1, name: 'Druidic Order', effect: 'Grants a bonus class feat, an order focus spell, and a trained skill.' },
      { level: 1, name: 'Anathema', effect: 'Conduct that severs you from primal magic until you atone.' },
      { level: 1, name: 'Shield Block', effect: 'A reaction that spends the shield’s Hardness to absorb damage.' },
      { level: 1, name: 'Wildsong', effect: 'The druidic language, which you may not teach outside the tradition.' },
      { level: 3, name: 'Fortitude Expertise', effect: 'Expert Fortitude saves.' },
      { level: 3, name: 'Perception Expertise', effect: 'Expert Perception.' },
      { level: 5, name: 'Reflex Expertise', effect: 'Expert Reflex saves.' },
      { level: 7, name: 'Expert Spellcaster', effect: 'Expert spell attack modifier and spell DC.' },
      { level: 11, name: 'Weapon Expertise', effect: 'Expert with simple weapons and unarmed attacks.' },
      { level: 11, name: 'Wild Willpower', effect: 'Master Will saves; a success becomes a critical success.' },
      { level: 13, name: 'Medium Armor Expertise', effect: 'Expert light armor, medium armor and unarmored defense.' },
      { level: 13, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 15, name: 'Master Spellcaster', effect: 'Master spell attack modifier and spell DC.' },
      { level: 19, name: 'Legendary Spellcaster', effect: 'Legendary spell attack modifier and spell DC.' },
      { level: 19, name: 'Primal Hierophant', effect: 'A rank-10 spell slot.' },
    ],
  },

  // ══ FIGHTER ═════════════════════════════════════════════════════════════════════════════════
  {
    className: 'Fighter',
    keyAttribute: ['STR', 'DEX'],
    hpPerLevel: 10,
    source: 'Player Core',
    perception: { initial: 'expert', increases: [{ level: 7, rank: 'master', via: 'Battlefield Surveyor' }] },
    saves: {
      fortitude: { initial: 'expert', increases: [{ level: 9, rank: 'master', via: 'Battle Hardened' }] },
      reflex: { initial: 'expert', increases: [{ level: 15, rank: 'master', via: 'Tempered Reflexes' }] },
      will: { initial: 'trained', increases: [{ level: 3, rank: 'expert', via: 'Bravery' }] },
    },
    attacks: {
      initial: 'expert',
      increases: [
        { level: 5, rank: 'master', via: 'Fighter Weapon Mastery', note: 'One chosen weapon group only; advanced weapons in that group reach expert.' },
        { level: 13, rank: 'master', via: 'Weapon Legend', note: 'Simple, martial and unarmed reach master and advanced reach expert; one chosen group goes legendary (advanced in it, master).' },
        { level: 19, rank: 'legendary', via: 'Versatile Legend', note: 'Simple weapons, martial weapons and unarmed attacks; advanced weapons reach master.' },
      ],
      note: 'The only class that starts expert in attacks. Advanced weapons start trained, one rank behind the rest.',
    },
    defenses: {
      initial: 'trained',
      increases: [
        { level: 11, rank: 'expert', via: 'Armor Expertise' },
        { level: 17, rank: 'master', via: 'Armor Mastery' },
      ],
      note: 'All armor categories including heavy, plus unarmored defense.',
    },
    classDc: {
      initial: 'trained',
      increases: [
        { level: 11, rank: 'expert', via: 'Fighter Expertise' },
        { level: 19, rank: 'master', via: 'Versatile Legend' },
      ],
    },
    classFeatLevels: ONE_AND_EVEN_LEVELS,
    features: [
      { level: 1, name: 'Reactive Strike', effect: 'A reaction that strikes a creature within reach when it moves, uses a manipulate action, or makes a ranged attack; a critical hit can disrupt what it was doing. (Formerly Attack of Opportunity.)' },
      { level: 1, name: 'Shield Block', effect: 'A reaction that spends the shield’s Hardness to absorb damage.' },
      { level: 3, name: 'Bravery', effect: 'Expert Will saves; a success against fear becomes a critical success, and any frightened value you take is reduced.' },
      { level: 5, name: 'Fighter Weapon Mastery', effect: 'Master in one weapon group, expert in advanced weapons of that group, plus critical specialization with it.' },
      { level: 7, name: 'Battlefield Surveyor', effect: 'Master Perception, and a circumstance bonus to initiative rolled with Perception.' },
      { level: 7, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 9, name: 'Battle Hardened', effect: 'Master Fortitude saves; a success becomes a critical success.' },
      { level: 9, name: 'Combat Flexibility', effect: 'Choose an extra fighter feat each morning rather than being locked into one build.' },
      { level: 11, name: 'Armor Expertise', effect: 'Expert in all armor and unarmored defense, plus armor specialization effects.' },
      { level: 11, name: 'Fighter Expertise', effect: 'Expert fighter class DC.' },
      { level: 13, name: 'Weapon Legend', effect: 'Master in simple, martial and unarmed attacks, expert in advanced, and legendary in one chosen group.' },
      { level: 15, name: 'Greater Weapon Specialization', effect: 'The weapon specialization damage increases.' },
      { level: 15, name: 'Improved Flexibility', effect: 'Combat Flexibility grants a second daily feat.' },
      { level: 15, name: 'Tempered Reflexes', effect: 'Master Reflex saves; a success becomes a critical success.' },
      { level: 17, name: 'Armor Mastery', effect: 'Master in all armor and unarmored defense.' },
      { level: 19, name: 'Versatile Legend', effect: 'Legendary in simple weapons, martial weapons and unarmed attacks, master in advanced weapons, and master fighter class DC.' },
    ],
    notes: ['No subclass. The fighter’s defining level-1 choice is a weapon group, expressed through feats rather than a formal subclass.'],
  },

  // ══ INVESTIGATOR ════════════════════════════════════════════════════════════════════════════
  {
    className: 'Investigator',
    keyAttribute: ['INT'],
    hpPerLevel: 8,
    source: 'Player Core 2',
    perception: {
      initial: 'expert',
      increases: [
        { level: 7, rank: 'master', via: 'Vigilant Senses' },
        { level: 13, rank: 'legendary', via: 'Incredible Senses' },
      ],
    },
    saves: {
      fortitude: { initial: 'trained', increases: [{ level: 9, rank: 'expert', via: 'Fortitude Expertise' }] },
      reflex: { initial: 'expert', increases: [{ level: 15, rank: 'master', via: 'Savvy Reflexes' }] },
      will: {
        initial: 'expert',
        increases: [
          { level: 11, rank: 'master', via: 'Dogged Will' },
          { level: 17, rank: 'legendary', via: 'Greater Dogged Will' },
        ],
      },
    },
    attacks: {
      initial: 'trained',
      increases: [
        { level: 5, rank: 'expert', via: 'Weapon Expertise' },
        { level: 13, rank: 'master', via: 'Weapon Mastery' },
      ],
      note: 'Simple weapons, martial weapons and unarmed attacks.',
    },
    defenses: {
      initial: 'trained',
      increases: [
        { level: 13, rank: 'expert', via: 'Light Armor Expertise' },
        { level: 19, rank: 'master', via: 'Light Armor Mastery' },
      ],
      note: 'Light armor and unarmored defense.',
    },
    classDc: {
      initial: 'trained',
      increases: [
        { level: 9, rank: 'expert', via: 'Investigator Expertise' },
        { level: 19, rank: 'master', via: 'Master Detective' },
      ],
    },
    classFeatLevels: ONE_AND_EVEN_LEVELS,
    subclassName: 'Methodology',
    subclassLevels: [1],
    subclasses: [
      { name: 'Alchemical Sciences', source: 'Player Core 2' },
      { name: 'Empiricism', source: 'Player Core 2' },
      { name: 'Forensic Medicine', source: 'Player Core 2' },
      { name: 'Interrogation', source: 'Player Core 2' },
    ],
    features: [
      { level: 1, name: 'On the Case', effect: 'Pursue a lead and gain a persistent circumstance bonus to checks investigating it.' },
      { level: 1, name: 'Devise a Stratagem', effect: 'Roll the attack die in advance and substitute Intelligence for Strength or Dexterity on that Strike — the engine the whole class is built on.' },
      { level: 1, name: 'Methodology', effect: 'Your investigative specialism: a trained skill, a bonus feat, and a signature ability.' },
      { level: 1, name: 'Strategic Strike', effect: 'Extra precision damage on a Strike you devised a stratagem for; 1d6, rising to 5d6 by level 17.' },
      { level: 3, name: 'Keen Recollection', effect: 'Treat untrained Recall Knowledge checks as trained.' },
      { level: 3, name: 'Skillful Lesson', effect: 'A bonus skill feat, repeated at every odd level through 19.' },
      { level: 5, name: 'Weapon Expertise', effect: 'Expert with simple weapons, martial weapons and unarmed attacks.' },
      { level: 7, name: 'Vigilant Senses', effect: 'Master Perception.' },
      { level: 7, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 9, name: 'Fortitude Expertise', effect: 'Expert Fortitude saves.' },
      { level: 9, name: 'Investigator Expertise', effect: 'Expert investigator class DC.' },
      { level: 11, name: 'Deductive Improvisation', effect: 'Attempt skill actions that would otherwise require training you lack.' },
      { level: 11, name: 'Dogged Will', effect: 'Master Will saves; a success becomes a critical success.' },
      { level: 13, name: 'Incredible Senses', effect: 'Legendary Perception.' },
      { level: 13, name: 'Light Armor Expertise', effect: 'Expert light armor and unarmored defense.' },
      { level: 13, name: 'Weapon Mastery', effect: 'Master with simple weapons, martial weapons and unarmed attacks.' },
      { level: 15, name: 'Greater Weapon Specialization', effect: 'The weapon specialization damage increases.' },
      { level: 15, name: 'Savvy Reflexes', effect: 'Master Reflex saves.' },
      { level: 17, name: 'Greater Dogged Will', effect: 'Legendary Will saves; a critical failure becomes a failure, and failed saves against damage are halved.' },
      { level: 19, name: 'Light Armor Mastery', effect: 'Master light armor and unarmored defense.' },
      { level: 19, name: 'Master Detective', effect: 'Master investigator class DC, plus faster deductions about a lead.' },
    ],
    notes: [
      'Deviates from the standard chassis: the investigator gains a SKILL INCREASE at level 2 and at every level thereafter, not only at odd levels from 3.',
      'Skillful Lesson grants a bonus skill feat at every odd level from 3 through 19, on top of the usual even-level skill feats.',
    ],
  },

  // ══ KINETICIST ══════════════════════════════════════════════════════════════════════════════
  {
    className: 'Kineticist',
    keyAttribute: ['CON'],
    hpPerLevel: 8,
    source: 'Rage of Elements',
    perception: { initial: 'trained', increases: [{ level: 9, rank: 'expert', via: 'Perception Expertise' }] },
    saves: {
      fortitude: {
        initial: 'expert',
        increases: [
          { level: 7, rank: 'master', via: 'Kinetic Durability' },
          { level: 15, rank: 'legendary', via: 'Greater Kinetic Durability' },
        ],
      },
      reflex: { initial: 'expert', increases: [{ level: 11, rank: 'master', via: 'Kinetic Quickness' }] },
      will: { initial: 'trained', increases: [{ level: 3, rank: 'expert', via: 'Will Expertise' }] },
    },
    attacks: {
      initial: 'trained',
      increases: [{ level: 11, rank: 'expert', via: 'Weapon Expertise' }],
      note: 'Simple weapons and unarmed attacks. Elemental Blast is an impulse governed by the class DC, not by this track.',
    },
    defenses: {
      initial: 'trained',
      increases: [
        { level: 13, rank: 'expert', via: 'Light Armor Expertise' },
        { level: 19, rank: 'master', via: 'Light Armor Mastery' },
      ],
      note: 'Light armor and unarmored defense.',
    },
    classDc: {
      initial: 'trained',
      increases: [
        { level: 7, rank: 'expert', via: 'Kinetic Expertise' },
        { level: 15, rank: 'master', via: 'Kinetic Mastery' },
        { level: 19, rank: 'legendary', via: 'Kinetic Legend' },
      ],
      note: 'The only class here whose class DC reaches legendary — impulses are its entire offence, so the class DC does the work a caster’s spell DC would.',
    },
    classFeatLevels: ONE_AND_EVEN_LEVELS,
    subclassName: 'Kinetic Gate',
    subclassLevels: [1, 5, 9, 13, 17],
    subclasses: [
      { name: 'Single Gate', effect: 'One element, two rank-1 impulse feats, and an impulse junction — a benefit that triggers on multi-action impulses of that element.', source: 'Rage of Elements' },
      { name: 'Dual Gate', effect: 'Two elements with one rank-1 impulse feat each, trading the impulse junction for breadth.', source: 'Rage of Elements' },
    ],
    features: [
      { level: 1, name: 'Kinetic Gate', effect: 'Single Gate or Dual Gate. Elements available: air, earth, fire, metal, water, wood.' },
      { level: 1, name: 'Kinetic Aura', effect: 'Channel your elements into an aura that powers your impulses while it is up.' },
      { level: 1, name: 'Impulses', effect: 'Elemental abilities keyed to your class DC, starting with Elemental Blast and Base Kinesis. Impulses are not spells and use no slots.' },
      { level: 3, name: 'Extract Element', effect: 'Pull your element out of a creature that is made of or wielding it.' },
      { level: 3, name: 'Will Expertise', effect: 'Expert Will saves.' },
      { level: 5, name: "Gate's Threshold", effect: 'Either deepen an element you have (an impulse feat plus a gate junction) or add a new element. Repeats at 9, 13 and 17.' },
      { level: 7, name: 'Kinetic Durability', effect: 'Master Fortitude saves; a success becomes a critical success.' },
      { level: 7, name: 'Kinetic Expertise', effect: 'Expert kineticist class DC.' },
      { level: 9, name: 'Perception Expertise', effect: 'Expert Perception.' },
      { level: 11, name: 'Kinetic Quickness', effect: 'Master Reflex saves; a success becomes a critical success.' },
      { level: 11, name: 'Reflow Elements', effect: 'Swap out impulse feats during a long rest.' },
      { level: 11, name: 'Weapon Expertise', effect: 'Expert with simple weapons and unarmed attacks.' },
      { level: 13, name: 'Light Armor Expertise', effect: 'Expert light armor and unarmored defense.' },
      { level: 13, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 15, name: 'Greater Kinetic Durability', effect: 'Legendary Fortitude saves.' },
      { level: 15, name: 'Kinetic Mastery', effect: 'Master kineticist class DC.' },
      { level: 17, name: 'Double Reflow', effect: 'Reflow two impulse feats instead of one.' },
      { level: 19, name: 'Final Gate', effect: 'The capstone expansion of your kinetic gate.' },
      { level: 19, name: 'Kinetic Legend', effect: 'Legendary kineticist class DC.' },
      { level: 19, name: 'Light Armor Mastery', effect: 'Master light armor and unarmored defense.' },
    ],
    notes: [
      'No `spellcasting` block by design: impulses are not spells, consume no slots and are gated by the class DC. Handing the kineticist a spell-rank ceiling would be wrong in both directions.',
      'Key attribute is Constitution — the only class here with that key, and a thing sheets get wrong.',
    ],
  },

  // ══ MAGUS ═══════════════════════════════════════════════════════════════════════════════════
  {
    className: 'Magus',
    keyAttribute: ['STR', 'DEX'],
    hpPerLevel: 8,
    source: 'Secrets of Magic',
    perception: { initial: 'trained', increases: [{ level: 9, rank: 'expert', via: 'Alertness' }] },
    saves: {
      fortitude: { initial: 'expert', increases: [{ level: 15, rank: 'master', via: 'Juggernaut' }] },
      reflex: { initial: 'trained', increases: [{ level: 5, rank: 'expert', via: 'Lightning Reflexes' }] },
      will: { initial: 'expert', increases: [{ level: 9, rank: 'master', via: 'Resolve' }] },
    },
    attacks: {
      initial: 'trained',
      increases: [
        { level: 5, rank: 'expert', via: 'Weapon Expertise' },
        { level: 13, rank: 'master', via: 'Weapon Mastery' },
      ],
      note: 'Simple weapons, martial weapons and unarmed attacks.',
    },
    defenses: {
      initial: 'trained',
      increases: [
        { level: 11, rank: 'expert', via: 'Medium Armor Expertise' },
        { level: 17, rank: 'master', via: 'Medium Armor Mastery' },
      ],
      note: 'Light armor, medium armor and unarmored defense.',
    },
    spellcasting: {
      tradition: 'arcane',
      kind: 'prepared',
      attribute: 'INT',
      progression: 'reduced',
      slotTableModelled: false,
      proficiency: {
        initial: 'trained',
        increases: [
          { level: 9, rank: 'expert', via: 'Expert Spellcaster' },
          { level: 17, rank: 'master', via: 'Master Spellcaster' },
        ],
        note: 'Stops at master — a magus never reaches legendary spellcasting.',
      },
      note: 'REDUCED CASTER, TABLE NOT MODELLED. The magus has its own small slot table, further complicated by Studious Spells adding slots at a lower rank. It was not reproducible with confidence, so it is omitted rather than approximated: eligibility.ts returns a rank ceiling of 0 for an unmodelled reduced caster, which refuses legal spells visibly instead of permitting illegal ones silently.',
    },
    classFeatLevels: EVEN_LEVELS,
    subclassName: 'Hybrid Study',
    subclassLevels: [1],
    subclasses: [
      { name: 'Inexorable Iron', source: 'Secrets of Magic' },
      { name: 'Laughing Shadow', source: 'Secrets of Magic' },
      { name: 'Sparkling Targe', source: 'Secrets of Magic' },
      { name: 'Starlit Span', source: 'Secrets of Magic' },
      { name: 'Twisting Tree', source: 'Secrets of Magic' },
    ],
    features: [
      { level: 1, name: 'Spellstrike', effect: 'Charge a Strike with a spell so that one attack roll delivers both.' },
      { level: 1, name: 'Arcane Cascade', effect: 'A stance entered after a Spellstrike that adds damage to subsequent Strikes.' },
      { level: 1, name: 'Conflux Spells', effect: 'Focus spells granted by your hybrid study.' },
      { level: 1, name: 'Hybrid Study', effect: 'The blend of weapon and magic that defines your style; grants a conflux spell and a bonus feat.' },
      { level: 5, name: 'Lightning Reflexes', effect: 'Expert Reflex saves.' },
      { level: 5, name: 'Weapon Expertise', effect: 'Expert with simple weapons, martial weapons and unarmed attacks.' },
      { level: 7, name: 'Studious Spells', effect: 'Extra prepared slots at a lower rank, refreshed daily.' },
      { level: 7, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 9, name: 'Alertness', effect: 'Expert Perception.' },
      { level: 9, name: 'Expert Spellcaster', effect: 'Expert spell attack modifier and spell DC.' },
      { level: 9, name: 'Resolve', effect: 'Master Will saves; a success becomes a critical success.' },
      { level: 11, name: 'Medium Armor Expertise', effect: 'Expert light armor, medium armor and unarmored defense.' },
      { level: 13, name: 'Weapon Mastery', effect: 'Master with simple weapons, martial weapons and unarmed attacks.' },
      { level: 15, name: 'Greater Weapon Specialization', effect: 'The weapon specialization damage increases.' },
      { level: 15, name: 'Juggernaut', effect: 'Master Fortitude saves; a success becomes a critical success.' },
      { level: 17, name: 'Master Spellcaster', effect: 'Master spell attack modifier and spell DC.' },
      { level: 17, name: 'Medium Armor Mastery', effect: 'Master light armor, medium armor and unarmored defense.' },
      { level: 19, name: 'Double Spellstrike', effect: 'Spellstrike twice before it needs recharging.' },
      { level: 20, name: 'Attribute boosts', effect: 'The standard level-20 boosts; listed only because the magus has no level-20 class feature of its own.' },
    ],
    notes: [
      'NOT REMASTERED. The magus has no Player Core edition, so its own book is the current text; remaster vocabulary is used here (spell RANKS, attribute boosts) but the mechanics are as printed.',
      'No class DC: the magus has none, and its abilities key off the spell DC. `classDc` is deliberately absent rather than set to trained.',
      'Key attribute (Strength or Dexterity) is NOT the spellcasting attribute (Intelligence). A sheet that conflates them will compute every spell DC wrong.',
    ],
  },

  // ══ MONK ════════════════════════════════════════════════════════════════════════════════════
  {
    className: 'Monk',
    keyAttribute: ['STR', 'DEX'],
    hpPerLevel: 10,
    source: 'Player Core 2',
    perception: { initial: 'trained', increases: [{ level: 5, rank: 'expert', via: 'Perception Expertise' }] },
    saves: {
      fortitude: { initial: 'expert', increases: [], note: 'See the Path to Perfection note — the monk’s save advancement is CHOSEN, not fixed.' },
      reflex: { initial: 'expert', increases: [], note: 'See the Path to Perfection note.' },
      will: { initial: 'expert', increases: [], note: 'See the Path to Perfection note.' },
    },
    attacks: {
      initial: 'trained',
      increases: [
        { level: 5, rank: 'expert', via: 'Expert Strikes' },
        { level: 13, rank: 'master', via: 'Master Strikes' },
      ],
      note: 'Unarmed attacks and simple weapons only — the monk never trains martial weapons as a class.',
    },
    defenses: {
      initial: 'expert',
      increases: [
        { level: 13, rank: 'master', via: 'Graceful Mastery' },
        { level: 17, rank: 'legendary', via: 'Graceful Legend' },
      ],
      note: 'Unarmored defense only, and expert from level 1 — the monk is untrained in every armor category.',
    },
    classDc: {
      initial: 'trained',
      increases: [
        { level: 9, rank: 'expert', via: 'Monk Expertise' },
        { level: 17, rank: 'master', via: 'Graceful Legend' },
      ],
      note: 'The same two features raise a monk’s qi spell attack modifier and spell DC, where they have qi spells.',
    },
    classFeatLevels: ONE_AND_EVEN_LEVELS,
    features: [
      { level: 1, name: 'Flurry of Blows', effect: 'Two unarmed Strikes for one action, counting as one attack for the multiple attack penalty.' },
      { level: 1, name: 'Powerful Fist', effect: 'Your fist deals a larger die than an ordinary one and you take no penalty for unarmed lethal damage.' },
      { level: 3, name: 'Incredible Movement', effect: '+10 feet Speed while unarmored, rising by 5 feet at 7, 11, 15 and 19.' },
      { level: 3, name: 'Mystic Strikes', effect: 'Unarmed attacks count as magical.' },
      { level: 5, name: 'Expert Strikes', effect: 'Expert with unarmed attacks and simple weapons.' },
      { level: 5, name: 'Perception Expertise', effect: 'Expert Perception.' },
      { level: 7, name: 'Path to Perfection', effect: 'Master in ONE saving throw of your choice; a success on it becomes a critical success.' },
      { level: 7, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 9, name: 'Metal Strikes', effect: 'Unarmed attacks count as cold iron and silver.' },
      { level: 9, name: 'Monk Expertise', effect: 'Expert monk class DC, and expert qi spellcasting if you have qi spells.' },
      { level: 11, name: 'Second Path to Perfection', effect: 'Master in a SECOND saving throw of your choice.' },
      { level: 13, name: 'Graceful Mastery', effect: 'Master unarmored defense.' },
      { level: 13, name: 'Master Strikes', effect: 'Master with unarmed attacks and simple weapons.' },
      { level: 15, name: 'Greater Weapon Specialization', effect: 'The weapon specialization damage increases.' },
      { level: 15, name: 'Third Path to Perfection', effect: 'Raise one of your two mastered saves to LEGENDARY; a critical failure on it becomes a failure and failed saves against damage are halved.' },
      { level: 17, name: 'Adamantine Strikes', effect: 'Unarmed attacks count as adamantine.' },
      { level: 17, name: 'Graceful Legend', effect: 'Legendary unarmored defense and master monk class DC (and master qi spellcasting, if any).' },
      { level: 19, name: 'Perfected Form', effect: 'A fortune effect on attack rolls: reroll a low first attack of your turn once per round.' },
    ],
    notes: [
      'SAVES ARE CHOSEN, NOT FIXED. All three start expert. Path to Perfection (7) makes one of them master, Second Path (11) a different one master, Third Path (15) raises one of those two to legendary. Because the choice is the player’s, the three save tracks carry no `increases` — writing one in would assert a choice the character has not made.',
      'No subclass. A monk’s identity comes from stances and feats, not a formal subclass, and qi spells are optional feat purchases rather than a class-wide spellcasting block.',
    ],
  },

  // ══ ORACLE ══════════════════════════════════════════════════════════════════════════════════
  {
    className: 'Oracle',
    keyAttribute: ['CHA'],
    hpPerLevel: 8,
    source: 'Player Core 2',
    perception: { initial: 'trained', increases: [{ level: 11, rank: 'expert', via: 'Oracular Senses' }] },
    saves: {
      fortitude: { initial: 'trained', increases: [{ level: 9, rank: 'expert', via: 'Magical Fortitude' }] },
      reflex: { initial: 'trained', increases: [{ level: 13, rank: 'expert', via: "Premonition's Reflexes" }] },
      will: {
        initial: 'expert',
        increases: [
          { level: 7, rank: 'master', via: 'Mysterious Resolve' },
          { level: 17, rank: 'legendary', via: 'Greater Mysterious Resolve' },
        ],
      },
    },
    attacks: {
      initial: 'trained',
      increases: [{ level: 11, rank: 'expert', via: 'Weapon Expertise' }],
      note: 'Simple weapons and unarmed attacks.',
    },
    defenses: {
      initial: 'trained',
      increases: [{ level: 13, rank: 'expert', via: 'Light Armor Expertise' }],
      note: 'Light armor and unarmored defense.',
    },
    classDc: { initial: 'trained', increases: [], note: 'No feature raises the oracle class DC; oracle effects use the spell DC.' },
    spellcasting: {
      tradition: 'divine',
      kind: 'spontaneous',
      attribute: 'CHA',
      progression: 'full',
      slotTableModelled: true,
      spellRankLevels: FULL_CASTER_RANKS,
      capstone: { level: 19, name: 'Oracular Clarity', effect: 'A rank-10 spell slot.' },
      proficiency: fullCasterSpellProficiency(),
    },
    classFeatLevels: EVEN_LEVELS,
    subclassName: 'Mystery',
    subclassLevels: [1, 11, 17],
    subclasses: [
      { name: 'Ancestors', source: 'Player Core 2' },
      { name: 'Battle', source: 'Player Core 2' },
      { name: 'Bones', source: 'Player Core 2' },
      { name: 'Cosmos', source: 'Player Core 2' },
      { name: 'Flames', source: 'Player Core 2' },
      { name: 'Life', source: 'Player Core 2' },
      { name: 'Lore', source: 'Player Core 2' },
      { name: 'Tempest', source: 'Player Core 2' },
    ],
    features: [
      { level: 1, name: 'Oracle Spellcasting', effect: 'Spontaneous divine casting from a repertoire, keyed to Charisma.' },
      { level: 1, name: 'Mystery', effect: 'The power you channel: bonus spells, a trained skill, revelation spells, and the curse that escalates as you use them.' },
      { level: 3, name: 'Signature Spells', effect: 'One spell of each rank can be heightened freely to any slot you have.' },
      { level: 7, name: 'Expert Spellcaster', effect: 'Expert spell attack modifier and spell DC.' },
      { level: 7, name: 'Mysterious Resolve', effect: 'Master Will saves; a success becomes a critical success.' },
      { level: 9, name: 'Magical Fortitude', effect: 'Expert Fortitude saves.' },
      { level: 11, name: 'Divine Access', effect: 'Add spells associated with your mystery to your repertoire.' },
      { level: 11, name: 'Major Curse', effect: 'Your curse can escalate to a more severe stage in exchange for greater power.' },
      { level: 11, name: 'Oracular Senses', effect: 'Expert Perception.' },
      { level: 11, name: 'Weapon Expertise', effect: 'Expert with simple weapons and unarmed attacks.' },
      { level: 13, name: 'Light Armor Expertise', effect: 'Expert light armor and unarmored defense.' },
      { level: 13, name: "Premonition's Reflexes", effect: 'Expert Reflex saves.' },
      { level: 13, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 15, name: 'Master Spellcaster', effect: 'Master spell attack modifier and spell DC.' },
      { level: 17, name: 'Extreme Curse', effect: 'The final and most dangerous stage of your curse.' },
      { level: 17, name: 'Greater Mysterious Resolve', effect: 'Legendary Will saves; a critical failure becomes a failure and failed saves against damage are halved.' },
      { level: 19, name: 'Legendary Spellcaster', effect: 'Legendary spell attack modifier and spell DC.' },
      { level: 19, name: 'Oracular Clarity', effect: 'A rank-10 spell slot.' },
    ],
  },

  // ══ RANGER ══════════════════════════════════════════════════════════════════════════════════
  {
    className: 'Ranger',
    keyAttribute: ['STR', 'DEX'],
    hpPerLevel: 10,
    source: 'Player Core',
    perception: {
      initial: 'expert',
      increases: [
        { level: 7, rank: 'master', via: 'Perception Mastery' },
        { level: 15, rank: 'legendary', via: 'Perception Legend' },
      ],
    },
    saves: {
      fortitude: { initial: 'expert', increases: [{ level: 11, rank: 'master', via: "Warden's Endurance" }] },
      reflex: {
        initial: 'expert',
        increases: [
          { level: 7, rank: 'master', via: 'Natural Reflexes' },
          { level: 15, rank: 'legendary', via: 'Greater Natural Reflexes' },
        ],
      },
      will: { initial: 'trained', increases: [{ level: 3, rank: 'expert', via: 'Will Expertise' }] },
    },
    attacks: {
      initial: 'trained',
      increases: [
        { level: 5, rank: 'expert', via: 'Ranger Weapon Expertise' },
        { level: 13, rank: 'master', via: 'Martial Weapon Mastery' },
      ],
      note: 'Simple weapons, martial weapons and unarmed attacks.',
    },
    defenses: {
      initial: 'trained',
      increases: [
        { level: 11, rank: 'expert', via: 'Medium Armor Expertise' },
        { level: 19, rank: 'master', via: 'Medium Armor Mastery' },
      ],
      note: 'Light armor, medium armor and unarmored defense.',
    },
    classDc: {
      initial: 'trained',
      increases: [
        { level: 9, rank: 'expert', via: 'Ranger Expertise' },
        { level: 17, rank: 'master', via: 'Masterful Hunter' },
      ],
      note: 'Both features also raise the spell attack modifier and spell DC of a ranger who has picked up spellcasting through feats.',
    },
    classFeatLevels: ONE_AND_EVEN_LEVELS,
    subclassName: "Hunter's Edge",
    subclassLevels: [1],
    subclasses: [
      { name: 'Flurry', effect: 'A reduced multiple attack penalty against your hunted prey.', source: 'Player Core' },
      { name: 'Outwit', effect: 'A circumstance bonus to knowledge, deception, intimidation and AC against your hunted prey.', source: 'Player Core' },
      { name: 'Precision', effect: 'Extra precision damage on the first hit against your hunted prey each round.', source: 'Player Core' },
    ],
    features: [
      { level: 1, name: 'Hunt Prey', effect: 'Designate a target; ignore the usual range-increment penalty against it and gain a bonus to track and perceive it.' },
      { level: 1, name: "Hunter's Edge", effect: 'The benefit you gain against hunted prey — Flurry, Outwit or Precision.' },
      { level: 3, name: 'Will Expertise', effect: 'Expert Will saves.' },
      { level: 5, name: 'Ranger Weapon Expertise', effect: 'Expert with simple weapons, martial weapons and unarmed attacks, plus critical specialization with weapons in your chosen groups.' },
      { level: 5, name: 'Trackless Journey', effect: 'Move at full Speed while Tracking, and hide your own trail in your chosen terrain.' },
      { level: 7, name: 'Natural Reflexes', effect: 'Master Reflex saves; a success becomes a critical success.' },
      { level: 7, name: 'Perception Mastery', effect: 'Master Perception.' },
      { level: 7, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 9, name: "Nature's Edge", effect: 'Enemies in natural difficult terrain are off-guard to you.' },
      { level: 9, name: 'Ranger Expertise', effect: 'Expert ranger class DC.' },
      { level: 11, name: 'Medium Armor Expertise', effect: 'Expert light armor, medium armor and unarmored defense.' },
      { level: 11, name: 'Unimpeded Journey', effect: 'Ignore difficult terrain of natural origin.' },
      { level: 11, name: "Warden's Endurance", effect: 'Master Fortitude saves; a success becomes a critical success.' },
      { level: 13, name: 'Martial Weapon Mastery', effect: 'Master with simple weapons, martial weapons and unarmed attacks.' },
      { level: 15, name: 'Greater Natural Reflexes', effect: 'Legendary Reflex saves.' },
      { level: 15, name: 'Greater Weapon Specialization', effect: 'The weapon specialization damage increases.' },
      { level: 15, name: 'Perception Legend', effect: 'Legendary Perception.' },
      { level: 17, name: 'Masterful Hunter', effect: 'Master ranger class DC, and a stronger version of your hunter’s edge.' },
      { level: 19, name: 'Medium Armor Mastery', effect: 'Master light armor, medium armor and unarmored defense.' },
      { level: 19, name: 'Swift Prey', effect: 'Hunt Prey as a free action at the start of your turn.' },
    ],
  },

  // ══ ROGUE ═══════════════════════════════════════════════════════════════════════════════════
  {
    className: 'Rogue',
    keyAttribute: ['DEX'],
    hpPerLevel: 8,
    source: 'Player Core',
    perception: {
      initial: 'expert',
      increases: [
        { level: 7, rank: 'master', via: 'Perception Mastery' },
        { level: 13, rank: 'legendary', via: 'Perception Legend' },
      ],
    },
    saves: {
      fortitude: { initial: 'trained', increases: [{ level: 9, rank: 'expert', via: 'Rogue Resilience' }] },
      reflex: {
        initial: 'expert',
        increases: [
          { level: 7, rank: 'master', via: 'Evasive Reflexes' },
          { level: 13, rank: 'legendary', via: 'Greater Rogue Reflexes' },
        ],
      },
      will: { initial: 'expert', increases: [{ level: 17, rank: 'master', via: 'Agile Mind' }] },
    },
    attacks: {
      initial: 'trained',
      increases: [
        { level: 5, rank: 'expert', via: 'Weapon Tricks' },
        { level: 13, rank: 'master', via: 'Master Tricks' },
      ],
      note: 'Simple weapons, martial weapons and unarmed attacks.',
    },
    defenses: {
      initial: 'trained',
      increases: [
        { level: 13, rank: 'expert', via: 'Light Armor Expertise' },
        { level: 19, rank: 'master', via: 'Light Armor Mastery' },
      ],
      note: 'Light armor and unarmored defense.',
    },
    classDc: {
      initial: 'trained',
      increases: [
        { level: 11, rank: 'expert', via: 'Rogue Expertise' },
        { level: 19, rank: 'master', via: 'Master Strike' },
      ],
    },
    classFeatLevels: ONE_AND_EVEN_LEVELS,
    subclassName: 'Racket',
    subclassLevels: [1],
    subclasses: [
      { name: 'Thief', keyAttribute: 'DEX', effect: 'Add Dexterity rather than Strength to damage with finesse melee weapons.', source: 'Player Core' },
      { name: 'Ruffian', keyAttribute: 'STR', effect: 'Sneak attack with simple weapons of any damage die, and trained in medium armor.', source: 'Player Core' },
      { name: 'Scoundrel', keyAttribute: 'CHA', effect: 'Feinting makes the target off-guard to more than just you.', source: 'Player Core' },
      { name: 'Mastermind', keyAttribute: 'INT', effect: 'Successfully Recalling Knowledge about a creature makes it off-guard to you.', source: 'Player Core' },
    ],
    features: [
      { level: 1, name: "Rogue's Racket", effect: 'Your style of rogue. Sets your key attribute, a bonus skill/feat, and a signature trick.' },
      { level: 1, name: 'Sneak Attack', effect: 'Extra precision damage against off-guard targets: 1d6, rising to 4d6 by level 17.' },
      { level: 1, name: 'Surprise Attack', effect: 'Creatures that have not acted yet are off-guard to you in the first round.' },
      { level: 3, name: 'Deny Advantage', effect: 'Lower-level foes cannot make you off-guard through flanking or similar tricks.' },
      { level: 5, name: 'Weapon Tricks', effect: 'Expert with simple weapons, martial weapons and unarmed attacks, plus critical specialization against off-guard targets.' },
      { level: 7, name: 'Evasive Reflexes', effect: 'Master Reflex saves; a success becomes a critical success.' },
      { level: 7, name: 'Perception Mastery', effect: 'Master Perception.' },
      { level: 7, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 9, name: 'Debilitating Strike', effect: 'A sneak attack can also impose a debilitation on the target.' },
      { level: 9, name: 'Rogue Resilience', effect: 'Expert Fortitude saves.' },
      { level: 11, name: 'Rogue Expertise', effect: 'Expert rogue class DC.' },
      { level: 13, name: 'Greater Rogue Reflexes', effect: 'Legendary Reflex saves.' },
      { level: 13, name: 'Light Armor Expertise', effect: 'Expert light armor and unarmored defense.' },
      { level: 13, name: 'Master Tricks', effect: 'Master with simple weapons, martial weapons and unarmed attacks.' },
      { level: 13, name: 'Perception Legend', effect: 'Legendary Perception.' },
      { level: 15, name: 'Double Debilitation', effect: 'Apply two debilitations at once.' },
      { level: 15, name: 'Greater Weapon Specialization', effect: 'The weapon specialization damage increases.' },
      { level: 17, name: 'Agile Mind', effect: 'Master Will saves; a success becomes a critical success.' },
      { level: 19, name: 'Light Armor Mastery', effect: 'Master light armor and unarmored defense.' },
      { level: 19, name: 'Master Strike', effect: 'Master rogue class DC; a sneak attack can incapacitate outright on a failed Fortitude save.' },
    ],
    notes: [
      'Deviates from the standard chassis in two ways: a SKILL FEAT at level 1 and at every level thereafter (not only even levels), and a SKILL INCREASE at level 2 and every level thereafter (not only odd levels from 3). This is the class’s defining perk and the reason a generic feat-budget calculation understates a rogue.',
      'Key attribute is set by the racket, so `keyAttribute` here is the Thief default; see `subclasses`.',
    ],
  },

  // ══ SORCERER ════════════════════════════════════════════════════════════════════════════════
  {
    className: 'Sorcerer',
    keyAttribute: ['CHA'],
    hpPerLevel: 6,
    source: 'Player Core 2',
    perception: { initial: 'trained', increases: [{ level: 11, rank: 'expert', via: 'Perception Expertise' }] },
    saves: {
      fortitude: { initial: 'trained', increases: [{ level: 5, rank: 'expert', via: 'Magical Fortitude' }] },
      reflex: { initial: 'trained', increases: [{ level: 9, rank: 'expert', via: 'Reflex Expertise' }] },
      will: { initial: 'expert', increases: [{ level: 17, rank: 'master', via: 'Majestic Will' }] },
    },
    attacks: {
      initial: 'trained',
      increases: [{ level: 11, rank: 'expert', via: 'Weapon Expertise' }],
      note: 'Simple weapons and unarmed attacks.',
    },
    defenses: {
      initial: 'trained',
      increases: [{ level: 13, rank: 'expert', via: 'Defensive Robes' }],
      note: 'Unarmored defense only — the sorcerer is untrained in every armor category.',
    },
    classDc: { initial: 'trained', increases: [], note: 'No feature raises the sorcerer class DC; sorcerer effects use the spell DC.' },
    spellcasting: {
      tradition: 'varies',
      kind: 'spontaneous',
      attribute: 'CHA',
      progression: 'full',
      slotTableModelled: true,
      spellRankLevels: FULL_CASTER_RANKS,
      capstone: { level: 19, name: 'Bloodline Paragon', effect: 'A rank-10 spell slot and a rank-10 spell in your repertoire.' },
      proficiency: fullCasterSpellProficiency(),
      note: 'The BLOODLINE sets the tradition, so it is not fixed at the class level. content.ts defaults a sorcerer to arcane for the sheet; that is a default, not a rule.',
    },
    classFeatLevels: EVEN_LEVELS,
    subclassName: 'Bloodline',
    subclassLevels: [1],
    subclasses: [
      { name: 'Aberrant', tradition: 'occult', source: 'Player Core 2' },
      { name: 'Angelic', tradition: 'divine', source: 'Player Core 2' },
      { name: 'Demonic', tradition: 'divine', source: 'Player Core 2' },
      { name: 'Diabolic', tradition: 'divine', source: 'Player Core 2' },
      { name: 'Draconic', tradition: 'varies', effect: 'The tradition depends on the kind of dragon.', source: 'Player Core 2' },
      { name: 'Elemental', tradition: 'primal', source: 'Player Core 2' },
      { name: 'Fey', tradition: 'primal', source: 'Player Core 2' },
      { name: 'Hag', tradition: 'occult', source: 'Player Core 2' },
      { name: 'Imperial', tradition: 'arcane', source: 'Player Core 2' },
      { name: 'Undead', tradition: 'divine', source: 'Player Core 2' },
    ],
    features: [
      { level: 1, name: 'Bloodline', effect: 'Sets your tradition, grants bloodline spells and extra spells known, and adds two trained skills.' },
      { level: 1, name: 'Sorcerer Spellcasting', effect: 'Spontaneous casting from a repertoire, keyed to Charisma. More slots per rank than any other caster.' },
      { level: 1, name: 'Spell Repertoire', effect: 'A fixed set of known spells, cast into any slot of sufficient rank.' },
      { level: 1, name: 'Sorcerous Potency', effect: 'Your bloodline magic adds damage or effect to the spells it powers.' },
      { level: 3, name: 'Signature Spells', effect: 'One spell of each rank can be heightened freely to any slot you have.' },
      { level: 5, name: 'Magical Fortitude', effect: 'Expert Fortitude saves.' },
      { level: 7, name: 'Expert Spellcaster', effect: 'Expert spell attack modifier and spell DC.' },
      { level: 9, name: 'Reflex Expertise', effect: 'Expert Reflex saves.' },
      { level: 11, name: 'Perception Expertise', effect: 'Expert Perception.' },
      { level: 11, name: 'Weapon Expertise', effect: 'Expert with simple weapons and unarmed attacks.' },
      { level: 13, name: 'Defensive Robes', effect: 'Expert unarmored defense.' },
      { level: 13, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 15, name: 'Master Spellcaster', effect: 'Master spell attack modifier and spell DC.' },
      { level: 17, name: 'Majestic Will', effect: 'Master Will saves; a success becomes a critical success.' },
      { level: 19, name: 'Bloodline Paragon', effect: 'A rank-10 spell slot and a rank-10 spell known.' },
      { level: 19, name: 'Legendary Spellcaster', effect: 'Legendary spell attack modifier and spell DC.' },
    ],
  },

  // ══ SUMMONER ════════════════════════════════════════════════════════════════════════════════
  {
    className: 'Summoner',
    keyAttribute: ['CHA'],
    hpPerLevel: 10,
    source: 'Secrets of Magic',
    perception: { initial: 'trained', increases: [{ level: 3, rank: 'expert', via: 'Shared Vigilance' }] },
    saves: {
      fortitude: { initial: 'expert', increases: [{ level: 11, rank: 'master', via: 'Twin Juggernauts' }] },
      reflex: { initial: 'trained', increases: [{ level: 9, rank: 'expert', via: 'Shared Reflexes' }] },
      will: { initial: 'expert', increases: [{ level: 15, rank: 'master', via: 'Shared Resolve' }] },
    },
    attacks: {
      initial: 'trained',
      increases: [{ level: 11, rank: 'expert', via: 'Simple Weapon Expertise' }],
      note: 'Simple weapons and unarmed attacks — the SUMMONER’s own attacks. The eidolon advances on its own separate track (expert unarmed at 5, master at 13).',
    },
    defenses: {
      initial: 'trained',
      increases: [{ level: 13, rank: 'expert', via: 'Defensive Robes' }],
      note: 'Unarmored defense only. The eidolon has its own defense track (expert at 11, master at 19).',
    },
    spellcasting: {
      tradition: 'varies',
      kind: 'spontaneous',
      attribute: 'CHA',
      progression: 'reduced',
      slotTableModelled: false,
      proficiency: {
        initial: 'trained',
        increases: [
          { level: 9, rank: 'expert', via: 'Expert Spellcaster' },
          { level: 17, rank: 'master', via: 'Master Spellcaster' },
        ],
        note: 'Stops at master — a summoner never reaches legendary spellcasting.',
      },
      note: 'REDUCED CASTER, TABLE NOT MODELLED. The eidolon sets the tradition. The summoner’s slot table is much smaller than a full caster’s and was not reproducible with confidence, so it is omitted: eligibility.ts returns a rank ceiling of 0 rather than a wrong one.',
    },
    subclassName: 'Eidolon',
    subclassLevels: [1],
    features: [
      { level: 1, name: 'Eidolon', effect: 'A bonded outsider that acts on your shared action pool; its type sets your spell tradition.' },
      { level: 1, name: 'Link Spells', effect: 'Focus spells shared between you and your eidolon.' },
      { level: 1, name: 'Spell Repertoire', effect: 'A fixed set of known spells, cast spontaneously.' },
      { level: 3, name: 'Shared Vigilance', effect: 'Expert Perception, shared with your eidolon.' },
      { level: 3, name: 'Unlimited Signature Spells', effect: 'Every spell you know can be heightened freely.' },
      { level: 5, name: 'Eidolon Unarmed Expertise', effect: 'The eidolon becomes expert with its unarmed attacks.' },
      { level: 7, name: 'Eidolon Symbiosis', effect: 'A benefit that passes between you and your eidolon.' },
      { level: 7, name: 'Eidolon Weapon Specialization', effect: 'The eidolon deals extra damage with attacks it is expert or better in.' },
      { level: 9, name: 'Expert Spellcaster', effect: 'Expert spell attack modifier and spell DC.' },
      { level: 9, name: 'Shared Reflexes', effect: 'Expert Reflex saves.' },
      { level: 11, name: 'Eidolon Defensive Expertise', effect: 'The eidolon becomes expert in unarmored defense.' },
      { level: 11, name: 'Simple Weapon Expertise', effect: 'Expert with simple weapons and unarmed attacks.' },
      { level: 11, name: 'Twin Juggernauts', effect: 'Master Fortitude saves for you and your eidolon; a success becomes a critical success.' },
      { level: 13, name: 'Defensive Robes', effect: 'Expert unarmored defense.' },
      { level: 13, name: 'Eidolon Unarmed Mastery', effect: 'The eidolon becomes master with its unarmed attacks.' },
      { level: 13, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 15, name: 'Shared Resolve', effect: 'Master Will saves; a success becomes a critical success.' },
      { level: 17, name: 'Eidolon Transcendence', effect: 'The eidolon gains a capstone ability tied to its type.' },
      { level: 17, name: 'Master Spellcaster', effect: 'Master spell attack modifier and spell DC.' },
      { level: 19, name: 'Eidolon Defensive Mastery', effect: 'The eidolon becomes master in unarmored defense.' },
      { level: 19, name: 'Instant Manifestation', effect: 'Manifest your eidolon as a reaction.' },
    ],
    notes: [
      'NOT REMASTERED. No Player Core edition exists; remaster vocabulary is used here but the mechanics are as printed.',
      '`classFeatLevels` IS DELIBERATELY OMITTED. The summoner takes summoner feats at even levels, but level 1 grants an EVOLUTION feat — a slot that only evolution feats can fill, not a general class-feat slot. Modelling it as a class feat would over-grant; modelling it as absent would under-grant if the sheet treats evolution feats as class feats. Omitting falls back to the even-level default, which is correct for every general class feat and merely silent about the extra slot.',
      'No class DC: the summoner has none. Its abilities key off the spell DC.',
      'Eidolon types were not enumerated — the option list is long, book-scattered and partly Reserved Material, so it is left to the builder’s freeform escape hatch.',
    ],
  },

  // ══ SWASHBUCKLER ════════════════════════════════════════════════════════════════════════════
  {
    className: 'Swashbuckler',
    keyAttribute: ['DEX'],
    hpPerLevel: 10,
    source: 'Player Core 2',
    perception: { initial: 'expert', increases: [{ level: 11, rank: 'master', via: 'Perception Mastery' }] },
    saves: {
      fortitude: { initial: 'trained', increases: [{ level: 3, rank: 'expert', via: 'Fortitude Expertise' }] },
      reflex: {
        initial: 'expert',
        increases: [
          { level: 7, rank: 'master', via: 'Confident Evasion' },
          { level: 13, rank: 'legendary', via: 'Assured Evasion' },
        ],
      },
      will: { initial: 'expert', increases: [{ level: 17, rank: 'master', via: 'Reinforced Ego' }] },
    },
    attacks: {
      initial: 'trained',
      increases: [
        { level: 5, rank: 'expert', via: 'Weapon Expertise' },
        { level: 13, rank: 'master', via: 'Weapon Mastery' },
      ],
      note: 'Simple weapons, martial weapons and unarmed attacks.',
    },
    defenses: {
      initial: 'trained',
      increases: [
        { level: 13, rank: 'expert', via: 'Light Armor Expertise' },
        { level: 19, rank: 'master', via: 'Light Armor Mastery' },
      ],
      note: 'Light armor and unarmored defense.',
    },
    classDc: {
      initial: 'trained',
      increases: [
        { level: 9, rank: 'expert', via: 'Swashbuckler Expertise' },
        { level: 19, rank: 'master', via: 'Eternal Confidence' },
      ],
    },
    classFeatLevels: ONE_AND_EVEN_LEVELS,
    subclassName: 'Style',
    subclassLevels: [1, 3, 7, 15],
    subclasses: [
      { name: 'Battledancer', effect: 'Trained in Performance; gains panache through it.', source: 'Player Core 2' },
      { name: 'Braggart', effect: 'Trained in Intimidation; gains panache through it.', source: 'Player Core 2' },
      { name: 'Fencer', effect: 'Trained in Deception; gains panache through it.', source: 'Player Core 2' },
      { name: 'Gymnast', effect: 'Trained in Athletics; gains panache through it.', source: 'Player Core 2' },
      { name: 'Rascal', effect: 'Trained in Thievery; gains panache through it.', source: 'Player Core 2' },
      { name: 'Wit', effect: 'Trained in Diplomacy; gains panache through it.', source: 'Player Core 2' },
    ],
    features: [
      { level: 1, name: 'Panache', effect: 'A state gained by flashy success that grants a Speed bonus and switches on your finishers.' },
      { level: 1, name: 'Precise Strike', effect: 'Extra damage while you have panache, larger on a finisher; 2d6 at level 1 rising to 6d6 by 17.' },
      { level: 1, name: "Swashbuckler's Style", effect: 'The skill you use to gain panache, plus its stylish action.' },
      { level: 1, name: 'Confident Finisher', effect: 'A finisher that deals half your precise strike damage even on a miss.' },
      { level: 3, name: 'Fortitude Expertise', effect: 'Expert Fortitude saves.' },
      { level: 3, name: 'Opportune Riposte', effect: 'A reaction Strike when a foe critically fails an attack against you.' },
      { level: 3, name: 'Vivacious Speed', effect: 'A Speed bonus while you have panache, growing at 7, 11, 15 and 19.' },
      { level: 5, name: 'Weapon Expertise', effect: 'Expert with simple weapons, martial weapons and unarmed attacks.' },
      { level: 7, name: 'Confident Evasion', effect: 'Master Reflex saves; a success becomes a critical success.' },
      { level: 7, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 9, name: 'Exemplary Finisher', effect: 'Your style adds a benefit to your finishers.' },
      { level: 9, name: 'Swashbuckler Expertise', effect: 'Expert swashbuckler class DC.' },
      { level: 11, name: 'Continuous Flair', effect: 'Panache lasts longer before it drains away.' },
      { level: 11, name: 'Perception Mastery', effect: 'Master Perception.' },
      { level: 13, name: 'Assured Evasion', effect: 'Legendary Reflex saves.' },
      { level: 13, name: 'Light Armor Expertise', effect: 'Expert light armor and unarmored defense.' },
      { level: 13, name: 'Weapon Mastery', effect: 'Master with simple weapons, martial weapons and unarmed attacks.' },
      { level: 15, name: 'Greater Weapon Specialization', effect: 'The weapon specialization damage increases.' },
      { level: 15, name: 'Keen Flair', effect: 'A stronger source of panache.' },
      { level: 17, name: 'Reinforced Ego', effect: 'Master Will saves; a success becomes a critical success.' },
      { level: 19, name: 'Eternal Confidence', effect: 'Master swashbuckler class DC, and panache that no longer runs out.' },
      { level: 19, name: 'Light Armor Mastery', effect: 'Master light armor and unarmored defense.' },
    ],
  },

  // ══ THAUMATURGE ═════════════════════════════════════════════════════════════════════════════
  {
    className: 'Thaumaturge',
    keyAttribute: ['CHA'],
    hpPerLevel: 8,
    source: 'Dark Archives',
    perception: { initial: 'expert', increases: [{ level: 9, rank: 'master', via: 'Perception Expertise' }] },
    saves: {
      fortitude: { initial: 'expert', increases: [{ level: 15, rank: 'master', via: 'Earned Resilience' }] },
      reflex: { initial: 'trained', increases: [{ level: 3, rank: 'expert', via: 'Reflex Expertise' }] },
      will: {
        initial: 'expert',
        increases: [
          { level: 7, rank: 'master', via: 'Disciplined Mind' },
          { level: 13, rank: 'legendary', via: 'Perfected Mind' },
        ],
      },
    },
    attacks: {
      initial: 'trained',
      increases: [
        { level: 5, rank: 'expert', via: 'Weapon Expertise' },
        { level: 13, rank: 'master', via: 'Weapon Mastery' },
      ],
      note: 'Simple weapons, martial weapons and unarmed attacks.',
    },
    defenses: {
      initial: 'trained',
      increases: [
        { level: 11, rank: 'expert', via: 'Medium Armor Expertise' },
        { level: 19, rank: 'master', via: 'Medium Armor Mastery' },
      ],
      note: 'Light armor, medium armor and unarmored defense.',
    },
    classDc: {
      initial: 'trained',
      increases: [
        { level: 9, rank: 'expert', via: 'Thaumaturgic Expertise' },
        { level: 17, rank: 'master', via: 'Thaumaturgic Mastery' },
      ],
    },
    classFeatLevels: ONE_AND_EVEN_LEVELS,
    subclassName: 'Implement',
    subclassLevels: [1, 5, 7, 11, 15, 17],
    subclasses: [
      { name: 'Amulet', source: 'Dark Archives' },
      { name: 'Bell', source: 'Dark Archives' },
      { name: 'Chalice', source: 'Dark Archives' },
      { name: 'Lantern', source: 'Dark Archives' },
      { name: 'Mirror', source: 'Dark Archives' },
      { name: 'Regalia', source: 'Dark Archives' },
      { name: 'Tome', source: 'Dark Archives' },
      { name: 'Wand', source: 'Dark Archives' },
      { name: 'Weapon', source: 'Dark Archives' },
    ],
    features: [
      { level: 1, name: 'Esoteric Lore', effect: 'Recall Knowledge about any creature using your class’s own lore skill, and learn its weakness.' },
      { level: 1, name: 'First Implement and Esoterica', effect: 'Your first implement, plus the trinkets that let you exploit a discovered weakness.' },
      { level: 1, name: "Implement's Empowerment", effect: 'Extra damage when you Strike while holding your implement and esoterica.' },
      { level: 3, name: 'Reflex Expertise', effect: 'Expert Reflex saves.' },
      { level: 5, name: 'Second Implement', effect: 'A second implement, with its initiate benefit.' },
      { level: 5, name: 'Weapon Expertise', effect: 'Expert with simple weapons, martial weapons and unarmed attacks.' },
      { level: 7, name: 'Disciplined Mind', effect: 'Master Will saves; a success becomes a critical success.' },
      { level: 7, name: 'Implement Adept', effect: 'The adept benefit of one implement.' },
      { level: 7, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 9, name: 'Intensify Vulnerability', effect: 'The weakness you exploit becomes larger.' },
      { level: 9, name: 'Perception Expertise', effect: 'Master Perception.' },
      { level: 9, name: 'Thaumaturgic Expertise', effect: 'Expert thaumaturge class DC.' },
      { level: 11, name: 'Medium Armor Expertise', effect: 'Expert light armor, medium armor and unarmored defense.' },
      { level: 11, name: 'Second Adept', effect: 'The adept benefit of a second implement.' },
      { level: 13, name: 'Perfected Mind', effect: 'Legendary Will saves.' },
      { level: 13, name: 'Weapon Mastery', effect: 'Master with simple weapons, martial weapons and unarmed attacks.' },
      { level: 15, name: 'Earned Resilience', effect: 'Master Fortitude saves.' },
      { level: 15, name: 'Greater Weapon Specialization', effect: 'The weapon specialization damage increases.' },
      { level: 15, name: 'Third Implement', effect: 'A third implement, with its initiate benefit.' },
      { level: 17, name: 'Implement Paragon', effect: 'The paragon benefit of your first implement.' },
      { level: 17, name: 'Thaumaturgic Mastery', effect: 'Master thaumaturge class DC.' },
      { level: 19, name: 'Medium Armor Mastery', effect: 'Master light armor, medium armor and unarmored defense.' },
      { level: 19, name: 'Unlimited Esoterica', effect: 'Your esoterica never run out.' },
    ],
    notes: [
      'Perception Expertise (9) is named for expertise but grants MASTER — the thaumaturge already starts expert. The feature name is kept as printed rather than corrected, because a reader checking this against the book will search for the printed name.',
      'The `Shield` implement is omitted: it comes from a later book than the rest and its interaction with the shield rules was not confirmable.',
    ],
  },

  // ══ WITCH ═══════════════════════════════════════════════════════════════════════════════════
  {
    className: 'Witch',
    keyAttribute: ['INT'],
    hpPerLevel: 6,
    source: 'Player Core',
    perception: { initial: 'trained', increases: [{ level: 11, rank: 'expert', via: 'Perception Expertise' }] },
    saves: {
      fortitude: { initial: 'trained', increases: [{ level: 5, rank: 'expert', via: 'Magical Fortitude' }] },
      reflex: { initial: 'trained', increases: [{ level: 9, rank: 'expert', via: 'Reflex Expertise' }] },
      will: { initial: 'expert', increases: [{ level: 17, rank: 'master', via: 'Will of the Pupil' }] },
    },
    attacks: {
      initial: 'trained',
      increases: [{ level: 11, rank: 'expert', via: 'Weapon Expertise' }],
      note: 'Simple weapons and unarmed attacks.',
    },
    defenses: {
      initial: 'trained',
      increases: [{ level: 13, rank: 'expert', via: 'Defensive Robes' }],
      note: 'Unarmored defense only — the witch is untrained in every armor category.',
    },
    classDc: { initial: 'trained', increases: [], note: 'No feature raises the witch class DC; witch effects use the spell DC.' },
    spellcasting: {
      tradition: 'varies',
      kind: 'prepared',
      attribute: 'INT',
      progression: 'full',
      slotTableModelled: true,
      spellRankLevels: FULL_CASTER_RANKS,
      capstone: { level: 19, name: "Patron's Gift", effect: 'A rank-10 spell slot.' },
      proficiency: fullCasterSpellProficiency(),
      note: 'The PATRON sets the tradition, so it is not fixed at the class level. content.ts defaults a witch to occult for the sheet; that is a default, not a rule.',
    },
    classFeatLevels: EVEN_LEVELS,
    subclassName: 'Patron',
    subclassLevels: [1, 6, 12, 18],
    subclasses: [
      { name: "Faith's Flamekeeper", tradition: 'divine', source: 'Player Core' },
      { name: 'Silence in Snow', tradition: 'primal', source: 'Player Core' },
      { name: 'Spinner of Threads', tradition: 'occult', source: 'Player Core' },
      { name: 'Starless Shadow', tradition: 'occult', source: 'Player Core' },
      { name: 'The Inscribed One', tradition: 'arcane', source: 'Player Core' },
      { name: 'The Resentment', tradition: 'occult', source: 'Player Core' },
      { name: 'Wilding Steward', tradition: 'primal', source: 'Player Core' },
    ],
    features: [
      { level: 1, name: 'Patron', effect: 'Sets your spell tradition, grants a familiar ability and a lesson, and adds a spell to your spellbook.' },
      { level: 1, name: 'Familiar', effect: 'The creature that carries your magic; it holds your spells and delivers your hexes.' },
      { level: 1, name: 'Witch Spellcasting', effect: 'Prepared casting keyed to Intelligence, from a familiar rather than a book.' },
      { level: 1, name: 'Hexes', effect: 'Focus spells cast through your familiar, powered by Focus Points.' },
      { level: 5, name: 'Magical Fortitude', effect: 'Expert Fortitude saves.' },
      { level: 6, name: 'Familiar Ability', effect: 'An extra familiar ability, repeated at 12 and 18.' },
      { level: 7, name: 'Expert Spellcaster', effect: 'Expert spell attack modifier and spell DC.' },
      { level: 9, name: 'Reflex Expertise', effect: 'Expert Reflex saves.' },
      { level: 11, name: 'Perception Expertise', effect: 'Expert Perception.' },
      { level: 11, name: 'Weapon Expertise', effect: 'Expert with simple weapons and unarmed attacks.' },
      { level: 13, name: 'Defensive Robes', effect: 'Expert unarmored defense.' },
      { level: 13, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 15, name: 'Master Spellcaster', effect: 'Master spell attack modifier and spell DC.' },
      { level: 17, name: 'Will of the Pupil', effect: 'Master Will saves; a success becomes a critical success.' },
      { level: 19, name: 'Legendary Spellcaster', effect: 'Legendary spell attack modifier and spell DC.' },
      { level: 19, name: "Patron's Gift", effect: 'A rank-10 spell slot.' },
    ],
  },

  // ══ WIZARD ══════════════════════════════════════════════════════════════════════════════════
  {
    className: 'Wizard',
    keyAttribute: ['INT'],
    hpPerLevel: 6,
    source: 'Player Core',
    perception: { initial: 'trained', increases: [{ level: 11, rank: 'expert', via: 'Perception Expertise' }] },
    saves: {
      fortitude: { initial: 'trained', increases: [{ level: 9, rank: 'expert', via: 'Magical Fortitude' }] },
      reflex: { initial: 'trained', increases: [{ level: 5, rank: 'expert', via: 'Reflex Expertise' }] },
      will: { initial: 'expert', increases: [{ level: 17, rank: 'master', via: 'Prodigious Will' }] },
    },
    attacks: {
      initial: 'trained',
      increases: [{ level: 11, rank: 'expert', via: 'Wizard Weapon Expertise' }],
      note: 'Simple weapons and unarmed attacks.',
    },
    defenses: {
      initial: 'trained',
      increases: [{ level: 13, rank: 'expert', via: 'Defensive Robes' }],
      note: 'Unarmored defense only — the wizard is untrained in every armor category.',
    },
    classDc: { initial: 'trained', increases: [], note: 'No feature raises the wizard class DC; wizard effects use the spell DC.' },
    spellcasting: {
      tradition: 'arcane',
      kind: 'prepared',
      attribute: 'INT',
      progression: 'full',
      slotTableModelled: true,
      spellRankLevels: FULL_CASTER_RANKS,
      capstone: { level: 19, name: "Archwizard's Spellcraft", effect: 'A rank-10 spell slot.' },
      proficiency: fullCasterSpellProficiency(),
      note: 'The arcane school grants an extra slot per rank usable only for that school’s spells.',
    },
    classFeatLevels: EVEN_LEVELS,
    subclassName: 'Arcane Thesis',
    subclassLevels: [1],
    subclasses: [
      { name: 'Improved Familiar Attunement', source: 'Player Core' },
      { name: 'Metamagical Experimentation', source: 'Player Core' },
      { name: 'Spell Blending', source: 'Player Core' },
      { name: 'Spell Substitution', source: 'Player Core' },
      { name: 'Experimental Spellshaping', source: 'Player Core' },
    ],
    features: [
      { level: 1, name: 'Wizard Spellcasting', effect: 'Prepared arcane casting from a spellbook, keyed to Intelligence.' },
      { level: 1, name: 'Arcane School', effect: 'A curriculum granting an extra slot per rank for that school’s spells and a school focus spell. Player Core options: Ars Grammatica, Battle Magic, Civic Wizardry, the Boundary, Mentalism, Protean Form, Unified Magical Theory.' },
      { level: 1, name: 'Arcane Bond', effect: 'Draw on a bonded item to recast a spell you already used today.' },
      { level: 1, name: 'Arcane Thesis', effect: 'Your original research; the second level-1 choice, independent of the school.' },
      { level: 5, name: 'Reflex Expertise', effect: 'Expert Reflex saves.' },
      { level: 7, name: 'Expert Spellcaster', effect: 'Expert spell attack modifier and spell DC.' },
      { level: 9, name: 'Magical Fortitude', effect: 'Expert Fortitude saves.' },
      { level: 11, name: 'Perception Expertise', effect: 'Expert Perception.' },
      { level: 11, name: 'Wizard Weapon Expertise', effect: 'Expert with simple weapons and unarmed attacks.' },
      { level: 13, name: 'Defensive Robes', effect: 'Expert unarmored defense.' },
      { level: 13, name: 'Weapon Specialization', effect: 'Extra damage with weapons you are expert or better in.' },
      { level: 15, name: 'Master Spellcaster', effect: 'Master spell attack modifier and spell DC.' },
      { level: 17, name: 'Prodigious Will', effect: 'Master Will saves; a success becomes a critical success.' },
      { level: 19, name: "Archwizard's Spellcraft", effect: 'A rank-10 spell slot.' },
      { level: 19, name: 'Legendary Spellcaster', effect: 'Legendary spell attack modifier and spell DC.' },
    ],
    notes: [
      'The wizard makes TWO level-1 choices — an arcane school and an arcane thesis. `subclassName` names the thesis (matching content.ts’s `subclassLabel`); the school is carried as the level-1 feature so neither is lost.',
    ],
  },
];

// ── Lookups ───────────────────────────────────────────────────────────────────────────────────

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** Case-insensitive lookup, matching the house style of pf2Class/pf2Ancestry in content.ts. */
export function pf2ClassProgression(name: string): PF2ClassProgression | null {
  return PF2_CLASS_PROGRESSIONS.find((c) => norm(c.className) === norm(name)) ?? null;
}

/** The class-feat schedule to hand `pf2FeatLevelsFor`, or undefined to let it use its default.
 *
 *  Exists so callers never reach into the object and read `classFeatLevels` themselves: undefined
 *  here means "we do not know", and the caller passing undefined straight through is exactly the
 *  fallback behaviour eligibility.ts documents. Reading the field directly invites someone to
 *  "helpfully" default it to the even levels at the call site, which would turn an honest gap into
 *  a silent assertion. */
export function pf2ClassFeatLevels(name: string): number[] | undefined {
  return pf2ClassProgression(name)?.classFeatLevels;
}

/** Every proficiency rank a class holds at a given level, for the sheet.
 *
 *  Walks the `increases` arrays rather than storing 20 rows per class per track: the steps are the
 *  source of truth, and a derived table would be a second copy to keep in sync. */
export function pf2RankAtLevel(track: PF2ProficiencyTrack, level: number): PF2Rank {
  let rank = track.initial;
  for (const step of track.increases) if (step.level <= level) rank = step.rank;
  return rank;
}

/** The highest spell rank a class can cast at a level, or 0 for non-casters and unmodelled reduced
 *  casters. The deliberate 0 is the same contract as `pf2MaxSpellRank` in eligibility.ts. */
export function pf2MaxSpellRankFromProgression(className: string, level: number): number {
  const sc = pf2ClassProgression(className)?.spellcasting;
  if (!sc || !sc.slotTableModelled || !sc.spellRankLevels) return 0;
  let max = 0;
  for (const [rank, unlock] of Object.entries(sc.spellRankLevels)) {
    if (level >= unlock) max = Math.max(max, Number(rank));
  }
  return max;
}

// ── Coverage, honestly ────────────────────────────────────────────────────────────────────────

/** What this tranche does NOT cover. Kept next to the data for the same reason PF2_KNOWN_GAPS is:
 *  a gap recorded only in a planning doc is a gap nobody finds. */
export const PF2_CLASS_PROGRESSION_GAPS: string[] = [
  'Monk save progression is player-CHOSEN (Path to Perfection at 7/11/15), so the three save tracks carry no increases. A sheet must ask which saves were chosen.',
  'Cleric Fortitude, attack and spellcasting progressions are doctrine-dependent and live on the subclass, not the base tracks.',
  'Magus and Summoner slot tables are NOT modelled (`slotTableModelled: false`); both are reduced casters and both return a spell-rank ceiling of 0 until someone models them.',
  'Summoner `classFeatLevels` is omitted because of the level-1 evolution-feat slot; the even-level default applies.',
  'Eidolon and Summoner subclass options are not enumerated.',
  'Subclass option lists are Player Core / Player Core 2 (plus the class’s own book for Magus, Summoner, Thaumaturge, Kineticist). Options from adventure paths, Lost Omens volumes and later splatbooks are excluded rather than partially listed.',
  'Per-subclass feature text is summarised, not itemised: only the Cleric doctrines carry a level-by-level `progression`, because only they change the base tracks.',
  'Focus-point pools, spell-slot COUNTS per rank, and skill-increase schedules are not modelled here — only which spell ranks unlock when.',
  'Eidolon proficiency tracks (its own attacks and defenses) are described in notes but not modelled as tracks.',
];
