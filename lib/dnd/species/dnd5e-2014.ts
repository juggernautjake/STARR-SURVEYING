// lib/dnd/species/dnd5e-2014.ts — the nine D&D 5e (2014) RACES, as structured data (Slice 14-S7).
//
// LICENSING BASIS. Everything here comes from the **SRD 5.1, released by Wizards of the Coast under
// CC-BY-4.0**, cross-checked against Wizards' own free 2014 Basic Rules PDF. Nothing was taken from
// a licensed commercial platform (D&D Beyond, Roll20) or from an aggregator with a contested
// redistribution basis. All prose is paraphrased in our own words; only mechanical numbers and
// rules-term names are reproduced, and those are facts, not expression. Trait text is held to the
// same ~320-character house limit the spell catalog uses — the limit is a copyright guard, not a
// style preference: a creeping word count is the signal that someone has started transcribing.
//
// NEVER-INVENT RULE: a number or rule that could not be confirmed in a clean source is OMITTED
// rather than guessed. See RACES_2014_STATUS at the bottom before assuming something is missing by
// mistake — several absences here are deliberate and correct.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE DOES NOT REUSE THE 2024 `Species` TYPE
//
// This is THE 2014-vs-2024 difference in this area, and the one most likely to be silently lost by
// copying the 2024 shape:
//
//   **2014 RACES GRANT ABILITY SCORE INCREASES. 2024 SPECIES DO NOT.**
//
// In 2024 the increases moved to the BACKGROUND (see ../backgrounds/dnd5e-2024.ts), and the `Species`
// type in ./dnd5e-2024.ts deliberately has NO ability field at all — `species.test.ts` asserts that
// no 2024 species smuggles one in under any name. That assertion is correct and must stay correct,
// so the 2014 data cannot live in that type: there is nowhere legal to put a dwarf's Constitution +2.
//
// Widening `Species` to carry an optional ability field would break the guard in the worst way — it
// would still pass (2024 entries would simply leave it unset) while removing the compiler's ability
// to stop a 2014 value being pasted into the 2024 list. So 2014 gets its own `Race2014` type, the
// same decision `WeaponDef2014` made by omitting weapon mastery and `Feat2014` made by omitting
// `FeatCategory`. Consumers reach both through a system-keyed dispatcher (`./view.ts`), never by
// widening one edition's module — Ground Rule 1.
//
// A second, smaller shape difference that follows from the same principle: 2014 SUBRACES are not
// 2024 lineages. A 2024 lineage is a choice made inside one species that grants spells; a 2014
// subrace is a nested package that grants its OWN further ability increase (Hill Dwarf's Wisdom +1)
// on top of the parent race's. `Subrace2014` therefore carries `abilityIncreases` too; `lineages?:
// string[]` on the 2024 type is a list of names with no mechanics and could not have held this.
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';

/** The only two sizes any SRD 5.1 race has. 2024's "Small or Medium" (Aasimar, Human, Tiefling) is a
 *  2024 invention and deliberately has no representation here. */
export type RaceSize2014 = 'Small' | 'Medium';

/** A fixed ability score increase a race or subrace grants at character creation. */
export interface RaceAbilityIncrease2014 {
  ability: AbilityKey;
  amount: number;
}

/**
 * A FREE-CHOICE ability increase — the player picks which abilities receive it. Only the Half-Elf
 * has one in SRD 5.1 ("+1 to two other abilities of your choice"), so this is deliberately narrow
 * rather than a general-purpose spread engine; 2014 has no other case to generalise from.
 */
export interface RaceAbilityChoice2014 {
  /** How much each chosen ability gains. */
  amount: number;
  /** How many different abilities the player chooses. */
  count: number;
  /** Abilities the choice may NOT be spent on (Half-Elf already has its Charisma +2). */
  excluding?: AbilityKey[];
  /** Shown to the player verbatim, because the machine-readable fields above cannot phrase it. */
  text: string;
}

export interface RaceTrait2014 {
  name: string;
  text: string;
}

/** A 2014 subrace: a nested package with its OWN ability increase plus extra traits. Unlike a 2024
 *  lineage (a name in a list), a subrace is mechanically load-bearing, so it is a full record. */
export interface Subrace2014 {
  key: string;
  name: string;
  /** Stacks ON TOP of the parent race's increases. Hill Dwarf = Constitution +2 (Dwarf) AND Wisdom +1. */
  abilityIncreases: RaceAbilityIncrease2014[];
  traits: RaceTrait2014[];
  source: RaceSource2014;
}

export type RaceSource2014 = 'SRD 5.1' | 'Basic Rules 2014';

export interface Race2014 {
  key: string;
  name: string;
  system: 'dnd5e-2014';
  /**
   * The racial ability score increases. **Never empty for a 2014 race** — every race in the edition
   * grants at least one, and `races-2014.test.ts` asserts it. This field is the entire reason this
   * type exists separately from `Species` (2024), which has no equivalent by design.
   */
  abilityIncreases: RaceAbilityIncrease2014[];
  /** Present only for the Half-Elf. See RaceAbilityChoice2014. */
  abilityChoice?: RaceAbilityChoice2014;
  size: RaceSize2014;
  /** Walking speed in feet. Dwarves, gnomes and halflings are 25 in 2014; 2024 raised the small
   *  races to 30, which is one of the confirmed edition differences recorded in `editionNote`. */
  speed: number;
  /** Darkvision range in feet, when the race has it. Absent means the race genuinely has none —
   *  the 2014 Dragonborn, Halfling and Human do not, and that is not an omission. */
  darkvision?: number;
  /** Languages the race grants outright. */
  languages: string[];
  /** Free language picks on top of `languages`, phrased for the player. */
  extraLanguages?: string;
  traits: RaceTrait2014[];
  subraces?: Subrace2014[];
  /**
   * How this race differs from its 2024 counterpart, where the difference is CONFIRMED. Populated
   * only against data we hold or a permitted source — never from recollection. 14-S5's standing
   * rule: a fabricated contrast is worse than a missing one, because it is presented to the player
   * as a verified fact about their edition.
   */
  editionNote?: string;
  source: RaceSource2014;
}

// ─────────────────────────────────────────────────────────────────────────────
// The catalog. Nine races — exactly the nine SRD 5.1 carries, which is also exactly the nine
// `SYSTEM_RULES['dnd5e-2014'].content.species` has always listed by name with no data behind it.
// Four of them have a subrace in SRD 5.1; the rest genuinely have none there (see the status note).
// ─────────────────────────────────────────────────────────────────────────────

export const RACES_2014: Race2014[] = [
  {
    key: 'dragonborn',
    name: 'Dragonborn',
    system: 'dnd5e-2014',
    abilityIncreases: [{ ability: 'str', amount: 2 }, { ability: 'cha', amount: 1 }],
    size: 'Medium',
    speed: 30,
    // No darkvision in 2014 — deliberately absent, and one of the sharper edition differences.
    languages: ['Common', 'Draconic'],
    traits: [
      {
        name: 'Draconic Ancestry',
        text: 'You choose a kind of dragon as your ancestor. That choice fixes both the damage type of your breath weapon and the damage type you resist, and it sets whether your breath is a line or a cone.',
      },
      {
        name: 'Breath Weapon',
        text: 'As an action you exhale destructive energy in the line or cone set by your ancestry. Creatures in the area save (DC 8 + your Constitution modifier + proficiency bonus) for half damage: 2d6, rising to 3d6 at 6th level, 4d6 at 11th and 5d6 at 16th. Regained on a short or long rest.',
      },
      {
        name: 'Damage Resistance',
        text: 'You have resistance to the damage type set by your draconic ancestry.',
      },
    ],
    editionNote:
      '2014\'s dragonborn grants Strength +2 and Charisma +1, has NO darkvision, and breathes for 2d6 rising to 5d6 at 16th level, once per short or long rest. 2024\'s Dragonborn grants no ability increase, has 60-foot darkvision, scales 1d10 to 4d10 with proficiency-bonus uses, and gains spectral flight at level 5.',
    source: 'SRD 5.1',
  },
  {
    key: 'dwarf',
    name: 'Dwarf',
    system: 'dnd5e-2014',
    abilityIncreases: [{ ability: 'con', amount: 2 }],
    size: 'Medium',
    speed: 25,
    darkvision: 60,
    languages: ['Common', 'Dwarvish'],
    traits: [
      {
        name: 'Darkvision',
        text: 'You see in dim light within 60 feet as though it were bright light, and in darkness as though it were dim light. You cannot make out colour in darkness, only shades of grey.',
      },
      {
        name: 'Dwarven Resilience',
        text: 'You have advantage on saving throws against poison, and you have resistance to poison damage.',
      },
      {
        name: 'Dwarven Combat Training',
        text: 'You are proficient with the battleaxe, handaxe, light hammer and warhammer.',
      },
      {
        name: 'Tool Proficiency',
        text: "You are proficient with one artisan's tool of your choice: smith's tools, brewer's supplies or mason's tools.",
      },
      {
        name: 'Stonecunning',
        text: 'Whenever you make an Intelligence (History) check about the origin of stonework, you are treated as proficient and add double your proficiency bonus, instead of any proficiency bonus you would normally apply.',
      },
      {
        name: 'Speed',
        text: 'Your walking speed is 25 feet, and — unlike other races — it is not reduced by wearing heavy armour.',
      },
    ],
    subraces: [
      {
        key: 'hill-dwarf',
        name: 'Hill Dwarf',
        abilityIncreases: [{ ability: 'wis', amount: 1 }],
        traits: [
          {
            name: 'Dwarven Toughness',
            text: 'Your hit point maximum increases by 1, and it increases by 1 again every time you gain a level.',
          },
        ],
        source: 'SRD 5.1',
      },
    ],
    editionNote:
      "2014's dwarf grants Constitution +2, walks 25 feet (never slowed by heavy armour) and has 60-foot darkvision. 2024's Dwarf grants no ability increase, walks 30 feet and sees 120 feet in the dark, and its Stonecunning became a bonus-action tremorsense rather than a doubled History check.",
    source: 'SRD 5.1',
  },
  {
    key: 'elf',
    name: 'Elf',
    system: 'dnd5e-2014',
    abilityIncreases: [{ ability: 'dex', amount: 2 }],
    size: 'Medium',
    speed: 30,
    darkvision: 60,
    languages: ['Common', 'Elvish'],
    traits: [
      {
        name: 'Darkvision',
        text: 'Accustomed to twilit forests and the night sky, you see in dim light within 60 feet as though it were bright light, and in darkness as though it were dim light — in shades of grey only.',
      },
      { name: 'Keen Senses', text: 'You are proficient in the Perception skill.' },
      {
        name: 'Fey Ancestry',
        text: 'You have advantage on saving throws against being charmed, and magic cannot put you to sleep.',
      },
      {
        name: 'Trance',
        text: 'You do not sleep. Instead you meditate deeply, half-aware, for 4 hours a day, and gain the same benefit a human gains from 8 hours of sleep.',
      },
    ],
    subraces: [
      {
        key: 'high-elf',
        name: 'High Elf',
        abilityIncreases: [{ ability: 'int', amount: 1 }],
        traits: [
          {
            name: 'Elf Weapon Training',
            text: 'You are proficient with the longsword, shortsword, shortbow and longbow.',
          },
          {
            name: 'Cantrip',
            text: 'You know one cantrip of your choice from the wizard spell list. Intelligence is your spellcasting ability for it.',
          },
          {
            name: 'Extra Language',
            text: 'You can speak, read and write one extra language of your choice.',
          },
        ],
        source: 'SRD 5.1',
      },
    ],
    editionNote:
      "2014's elf grants Dexterity +2 and Perception proficiency outright, and its subraces are fixed packages that add their own ability increase. 2024's Elf grants no ability increase, lets you choose Insight, Perception or Survival, and its lineages grant cantrips and levelled spells instead of weapon training.",
    source: 'SRD 5.1',
  },
  {
    key: 'gnome',
    name: 'Gnome',
    system: 'dnd5e-2014',
    abilityIncreases: [{ ability: 'int', amount: 2 }],
    size: 'Small',
    speed: 25,
    darkvision: 60,
    languages: ['Common', 'Gnomish'],
    traits: [
      {
        name: 'Darkvision',
        text: 'Used to life underground, you see in dim light within 60 feet as though it were bright light, and in darkness as though it were dim light — in shades of grey only.',
      },
      {
        name: 'Gnome Cunning',
        text: 'You have advantage on all Intelligence, Wisdom and Charisma saving throws against magic.',
      },
    ],
    subraces: [
      {
        key: 'rock-gnome',
        name: 'Rock Gnome',
        abilityIncreases: [{ ability: 'con', amount: 1 }],
        traits: [
          {
            name: "Artificer's Lore",
            text: 'Whenever you make an Intelligence (History) check about a magic item, an alchemical object or a technological device, you add twice your proficiency bonus instead of any bonus you would normally apply.',
          },
          {
            name: 'Tinker',
            text: "You are proficient with tinker's tools. With those tools and 1 hour of work you can spend 10 gp of materials to build a Tiny clockwork device, such as a toy, a fire starter or a music box. It stops working after 24 hours unless you maintain it.",
          },
        ],
        source: 'SRD 5.1',
      },
    ],
    editionNote:
      "2014's gnome grants Intelligence +2 and walks 25 feet. 2024's Gnome grants no ability increase, walks 30 feet, and its lineages grant spells. The saving-throw trait also narrowed: 2014's Gnome Cunning applies only against MAGIC, while 2024's applies to Intelligence, Wisdom and Charisma saves generally.",
    source: 'SRD 5.1',
  },
  {
    key: 'half-elf',
    name: 'Half-Elf',
    system: 'dnd5e-2014',
    abilityIncreases: [{ ability: 'cha', amount: 2 }],
    abilityChoice: {
      amount: 1,
      count: 2,
      excluding: ['cha'],
      text: 'Two other ability scores of your choice each increase by 1.',
    },
    size: 'Medium',
    speed: 30,
    darkvision: 60,
    languages: ['Common', 'Elvish'],
    extraLanguages: 'One extra language of your choice.',
    traits: [
      {
        name: 'Darkvision',
        text: 'Thanks to your elf blood, you see in dim light within 60 feet as though it were bright light, and in darkness as though it were dim light — in shades of grey only.',
      },
      {
        name: 'Fey Ancestry',
        text: 'You have advantage on saving throws against being charmed, and magic cannot put you to sleep.',
      },
      { name: 'Skill Versatility', text: 'You gain proficiency in two skills of your choice.' },
    ],
    editionNote:
      "2014 has Half-Elf as a race in its own right: Charisma +2 plus +1 to two other abilities you choose. The 2024 Player's Handbook has NO Half-Elf species — a character of mixed ancestry picks either parent's species and describes the rest — so this race has no 2024 counterpart to compare against.",
    source: 'SRD 5.1',
  },
  {
    key: 'half-orc',
    name: 'Half-Orc',
    system: 'dnd5e-2014',
    abilityIncreases: [{ ability: 'str', amount: 2 }, { ability: 'con', amount: 1 }],
    size: 'Medium',
    speed: 30,
    darkvision: 60,
    languages: ['Common', 'Orc'],
    traits: [
      {
        name: 'Darkvision',
        text: 'Thanks to your orc blood, you see in dim light within 60 feet as though it were bright light, and in darkness as though it were dim light — in shades of grey only.',
      },
      { name: 'Menacing', text: 'You gain proficiency in the Intimidation skill.' },
      {
        name: 'Relentless Endurance',
        text: 'When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. You cannot use this trait again until you finish a long rest.',
      },
      {
        name: 'Savage Attacks',
        text: "When you score a critical hit with a melee weapon attack, you roll one of the weapon's damage dice one additional time and add it to the extra damage of the critical hit.",
      },
    ],
    editionNote:
      "2014 has Half-Orc as a race in its own right (Strength +2, Constitution +1). The 2024 Player's Handbook removed it as a standalone species; its Relentless Endurance survives, essentially unchanged, on the 2024 Orc — which itself grants no ability increase and has 120-foot darkvision rather than 60.",
    source: 'SRD 5.1',
  },
  {
    key: 'halfling',
    name: 'Halfling',
    system: 'dnd5e-2014',
    abilityIncreases: [{ ability: 'dex', amount: 2 }],
    size: 'Small',
    speed: 25,
    languages: ['Common', 'Halfling'],
    traits: [
      {
        name: 'Lucky',
        text: 'When you roll a 1 on the d20 for an attack roll, an ability check or a saving throw, you can reroll the die, and you must use the new roll.',
      },
      { name: 'Brave', text: 'You have advantage on saving throws against being frightened.' },
      {
        name: 'Halfling Nimbleness',
        text: 'You can move through the space of any creature that is of a size larger than yours.',
      },
    ],
    subraces: [
      {
        key: 'lightfoot-halfling',
        name: 'Lightfoot Halfling',
        abilityIncreases: [{ ability: 'cha', amount: 1 }],
        traits: [
          {
            name: 'Naturally Stealthy',
            text: 'You can attempt to hide even when you are obscured only by a creature that is at least one size larger than you.',
          },
        ],
        source: 'SRD 5.1',
      },
    ],
    editionNote:
      "2014's halfling grants Dexterity +2 and walks 25 feet; 2024's Halfling grants no ability increase and walks 30. Naturally Stealthy is a SUBRACE trait in 2014 (Lightfoot only) but a baseline trait every 2024 Halfling has, and 2024's Luck rerolls a 1 on any D20 Test rather than the three named roll kinds.",
    source: 'SRD 5.1',
  },
  {
    key: 'human',
    name: 'Human',
    system: 'dnd5e-2014',
    abilityIncreases: [
      { ability: 'str', amount: 1 }, { ability: 'dex', amount: 1 }, { ability: 'con', amount: 1 },
      { ability: 'int', amount: 1 }, { ability: 'wis', amount: 1 }, { ability: 'cha', amount: 1 },
    ],
    size: 'Medium',
    speed: 30,
    languages: ['Common'],
    extraLanguages: 'One extra language of your choice.',
    // The base human's ONLY mechanical benefit is the +1 to everything, which lives in
    // `abilityIncreases` rather than as a trait line. `traits` is empty on purpose — see the status
    // note on Variant Human, which is the trait-bearing version and is not in our sources.
    traits: [],
    editionNote:
      "2014's human is the plainest race in the edition: +1 to every one of the six abilities and nothing else. 2024's Human grants no ability increases at all and instead gives three traits — Resourceful (Heroic Inspiration on a long rest), Skillful (one skill) and Versatile (an Origin feat).",
    source: 'SRD 5.1',
  },
  {
    key: 'tiefling',
    name: 'Tiefling',
    system: 'dnd5e-2014',
    abilityIncreases: [{ ability: 'int', amount: 1 }, { ability: 'cha', amount: 2 }],
    size: 'Medium',
    speed: 30,
    darkvision: 60,
    languages: ['Common', 'Infernal'],
    traits: [
      {
        name: 'Darkvision',
        text: 'You see in dim light within 60 feet as though it were bright light, and in darkness as though it were dim light — in shades of grey only.',
      },
      { name: 'Hellish Resistance', text: 'You have resistance to fire damage.' },
      {
        name: 'Infernal Legacy',
        text: 'You know the thaumaturgy cantrip. At 3rd level you can cast hellish rebuke once per long rest, as a 2nd-level spell. At 5th level you can cast darkness once per long rest. Charisma is your spellcasting ability for all three.',
      },
    ],
    editionNote:
      "2014's tiefling grants Intelligence +1 and Charisma +2, and its Infernal Legacy is FIXED: thaumaturgy, then hellish rebuke at 3rd level and darkness at 5th. 2024's Tiefling grants no ability increase and instead chooses among Abyssal, Chthonic and Infernal legacies, each with its own damage resistance and spell list.",
    source: 'SRD 5.1',
  },
];

/**
 * HONEST COVERAGE STATEMENT. Read this before treating anything above as missing by accident.
 *
 * The nine races are the COMPLETE 2014 race list as SRD 5.1 and the free Basic Rules carry it, and
 * they match the nine names `SYSTEM_RULES['dnd5e-2014']` has always listed. What is deliberately
 * absent is the SUBRACES: SRD 5.1 reproduces exactly one subrace each for Dwarf, Elf, Gnome and
 * Halfling, and none for the other five. Mountain Dwarf, Wood Elf, Drow, Stout Halfling, Forest
 * Gnome and Variant Human are Player's Handbook content that Wizards did not place in the SRD and
 * did not print in the Basic Rules. They are not available to us from any source we are willing to
 * use, so they are absent rather than missing, and a player who wants one authors it as homebrew
 * (Ground Rule 4) in exactly this shape.
 *
 * Also deliberately absent: the flavour tables (age, alignment, height/weight, names). They are
 * prose rather than mechanics, so reproducing them would be transcription with no mechanical payoff.
 */
export const RACES_2014_STATUS = {
  system: 'dnd5e-2014' as const,
  totalRaces: RACES_2014.length,
  totalSubraces: RACES_2014.reduce((n, r) => n + (r.subraces?.length ?? 0), 0),
  sources: ['SRD 5.1 (CC-BY-4.0)', 'D&D Basic Rules 2014 (free, Wizards of the Coast)'],
  /** True: every race our clean sources contain is here, with its real traits. */
  completeForSources: true,
  /** False: the PHB's additional subraces are not here and cannot be. */
  completeForEdition: false,
  note:
    'All nine SRD 5.1 races with their real 2014 traits, including the racial ability score increases that 2024 moved to the background. SRD 5.1 carries one subrace each for Dwarf (Hill), Elf (High), Gnome (Rock) and Halfling (Lightfoot); the remaining PHB subraces and the Variant Human are outside the CC-BY licence and are deliberately absent rather than guessed.',
  missingCategories: [
    "PHB-only subraces (Mountain Dwarf, Wood Elf, Drow, Stout Halfling, Forest Gnome, and the Variant Human's feat-at-level-1 option)",
    'Flavour tables (age, alignment, height and weight, naming conventions) — prose, not mechanics',
  ],
} as const;

// ── Lookups ─────────────────────────────────────────────────────────────────

const RACE_BY_KEY = new Map(RACES_2014.map((r) => [r.key, r]));

const norm = (s: string) => s.trim().toLowerCase();

/** Resolve a 2014 race by key. Scoped to dnd5e-2014 BY CONSTRUCTION (this module holds only 2014
 *  races); callers reach it through the system-keyed dispatcher in ./view.ts so a 2024 or PF2 sheet
 *  never receives one — a bare `dwarf` means different numbers in every system (Ground Rule 1). */
export function findRace2014(key: string): Race2014 | undefined {
  return RACE_BY_KEY.get(norm(key));
}

/** What a name resolved to: the race, plus the subrace when the name WAS a subrace. */
export interface ResolvedRace2014 {
  race: Race2014;
  subrace?: Subrace2014;
}

/**
 * Resolve a stored species name to a race (and subrace, if the player recorded one). A 2014 sheet
 * stores a free-text name, and both "Dwarf" and "Hill Dwarf" are things a player legitimately
 * types — so both must resolve, and the subrace answer must carry the PARENT's traits too, since a
 * Hill Dwarf is a dwarf first. Matching is on key or display name, case-insensitively.
 */
export function resolveRace2014(nameOrKey: string | null | undefined): ResolvedRace2014 | undefined {
  const q = norm(nameOrKey ?? '');
  if (!q) return undefined;

  const direct = RACES_2014.find((r) => r.key === q || norm(r.name) === q);
  if (direct) return { race: direct };

  for (const race of RACES_2014) {
    const sub = race.subraces?.find((s) => s.key === q || norm(s.name) === q);
    if (sub) return { race, subrace: sub };
  }
  return undefined;
}

/**
 * The FULL set of ability increases a resolved race grants — parent plus subrace, summed per
 * ability. This is the function that carries the headline edition difference into the rest of the
 * app, and it is deliberately the only way to get the number: reading `race.abilityIncreases`
 * alone silently drops a Hill Dwarf's Wisdom +1.
 *
 * The free-choice half (Half-Elf's "+1 to two others") is NOT folded in — the player has not
 * chosen yet, and inventing a choice on their behalf would be exactly the fabrication this file
 * exists to avoid. Callers read `race.abilityChoice` and ask.
 */
export function raceAbilityIncreases2014(resolved: ResolvedRace2014): Partial<Record<AbilityKey, number>> {
  const out: Partial<Record<AbilityKey, number>> = {};
  const all = [...resolved.race.abilityIncreases, ...(resolved.subrace?.abilityIncreases ?? [])];
  for (const inc of all) out[inc.ability] = (out[inc.ability] ?? 0) + inc.amount;
  return out;
}

/** The full trait list for a resolved race: parent traits, then the subrace's. Order matters — a
 *  subrace refines a race, so its traits read last. */
export function raceTraits2014(resolved: ResolvedRace2014): RaceTrait2014[] {
  return [...resolved.race.traits, ...(resolved.subrace?.traits ?? [])];
}
