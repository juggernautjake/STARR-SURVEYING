// lib/dnd/feats/dnd5e-2024.ts — 2024 Player's Handbook feats as structured data (Slice 4).
//
// Feats come in four categories: Origin, General, Fighting Style, Epic Boon. This module defines the
// shared shape and the FULL Origin category; General / Fighting Style / Epic Boon land in later slices.
//
// The load-bearing 2024 rule, and the trap this data exists to make impossible: **Origin feats grant
// NO ability score increase** (and neither do Fighting Style feats). Only General and Epic Boon feats
// carry the +1. In 2014 many feats bumped an ability as a rider; in 2024 the ability math moved to
// backgrounds and the General/Epic tiers. Encoding `abilityIncrease` per feat — and asserting Origin
// feats never set it — is how we keep a 2014 assumption from silently creeping back in.
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';

export type FeatCategory = 'origin' | 'general' | 'fighting-style' | 'epic-boon';

/** A gate on taking a feat. All present prerequisites must hold. */
export interface FeatPrerequisite {
  /** Minimum TOTAL character level. General feats need 4+, Epic Boon needs 19+. */
  minLevel?: number;
  /** A minimum ability score, e.g. Strength 13+ for Grappler. */
  ability?: { key: AbilityKey; min: number };
  /** A named capability the character must already have, e.g. 'spellcasting'. */
  needs?: string;
  /** Human-readable prerequisite, shown in the UI verbatim (covers anything not machine-checked). */
  text?: string;
}

export interface Feat {
  key: string;
  name: string;
  category: FeatCategory;
  system: 'dnd5e-2024';
  /** Can be taken more than once (Skilled, most Epic Boons cannot; some feats can). */
  repeatable?: boolean;
  /** Empty/absent for Origin feats — they have no prerequisites. */
  prerequisites?: FeatPrerequisite[];
  /**
   * The ability increase this feat grants. **Origin and Fighting Style feats MUST NOT set this** (the
   * 2024 rule). General feats grant +1 to one ability chosen from `choices`; Epic Boons grant +1 that
   * can push a score to 30.
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
  /** Full rules text (markdown-lite: **bold**, · bullets — matching the class feature `body` style). */
  benefit: string;
}

/**
 * The ten 2024 Origin feats. Every character gets one from their Background at level 1. None grants an
 * ability score increase — that is the invariant `feats.test.ts` pins.
 */
export const ORIGIN_FEATS_2024: Feat[] = [
  {
    key: 'alert', name: 'Alert', category: 'origin', system: 'dnd5e-2024',
    summary: 'Add your Proficiency Bonus to Initiative and swap Initiative with a willing ally.',
    benefit:
      'You gain the following benefits.\n\n· **Initiative Proficiency** — When you roll Initiative, you can add your **Proficiency Bonus** to the roll.\n· **Initiative Swap** — Immediately after you roll Initiative, you can swap your Initiative with the Initiative of one willing ally in the same combat. You can\'t make this swap if you or the ally has the Incapacitated condition.',
  },
  {
    key: 'crafter', name: 'Crafter', category: 'origin', system: 'dnd5e-2024',
    grants: { toolChoices: { count: 3 } },
    summary: 'Tool proficiencies, a 20% discount on nonmagical gear, and faster crafting.',
    benefit:
      'You gain the following benefits.\n\n· **Tool Proficiency** — You gain proficiency with **three** different Artisan\'s Tools of your choice.\n· **Discount** — Whenever you buy a nonmagical item, you receive a **20 percent** discount on it.\n· **Fast Crafting** — When you finish a Long Rest, you can craft one piece of gear from a list of options tied to the Artisan\'s Tools you are proficient with, provided you have the raw materials.',
  },
  {
    key: 'healer', name: 'Healer', category: 'origin', system: 'dnd5e-2024',
    grants: { tools: ["Herbalism Kit"] },
    summary: 'Battlefield healing with a Healer\'s Kit — and reroll 1s on healing dice.',
    benefit:
      'You gain the following benefits.\n\n· **Battle Medic** — If you have a Healer\'s Kit, you can expend one use of it and take a **Utilize** action to tend to a creature within 5 feet and restore **1d6 + 4** Hit Points to it, plus additional Hit Points equal to its number of Hit Dice. It then can\'t regain Hit Points from this feat again until it finishes a Short or Long Rest.\n· **Healing Rerolls** — Whenever you roll a die to restore Hit Points with a spell or this feat\'s Battle Medic, you can reroll the die if it rolls a **1**, and you must use the new roll.',
  },
  {
    key: 'lucky', name: 'Lucky', category: 'origin', system: 'dnd5e-2024',
    summary: 'A pool of Luck Points to gain Advantage on rolls or impose Disadvantage on attackers.',
    benefit:
      'You have a number of **Luck Points** equal to your **Proficiency Bonus** and can spend them on the following benefits. You regain your expended Luck Points when you finish a Long Rest.\n\n· **Advantage** — When you roll a d20 for a D20 Test, you can spend 1 Luck Point to give yourself **Advantage** on the roll.\n· **Disadvantage** — When a creature rolls a d20 for an attack roll against you, you can spend 1 Luck Point to impose **Disadvantage** on that roll.',
  },
  {
    key: 'magic-initiate-arcane', name: 'Magic Initiate (Arcane)', category: 'origin', system: 'dnd5e-2024',
    repeatable: true,
    summary: 'Two cantrips and a level-1 spell from a chosen spell list.',
    benefit:
      'You gain the following benefits. When you choose this feat, pick a spellcasting class list — Arcane (Wizard).\n\n· **Two Cantrips** — You learn **two cantrips** of your choice from that class\'s spell list.\n· **Level 1 Spell** — Choose a **level 1 spell** from that same list. You always have it prepared. You can cast it once without a spell slot, regaining that use on a Long Rest; you can also cast it using any spell slots you have.\n· **Spellcasting Ability** — Intelligence, Wisdom, or Charisma (matching the chosen list). You can change this feat\'s prepared level 1 spell whenever you gain a level.\n\n*This feat can be taken more than once, choosing a different spell list each time.*',
  },
  {
    key: 'musician', name: 'Musician', category: 'origin', system: 'dnd5e-2024',
    grants: { toolChoices: { count: 3 } },
    summary: 'Musical instrument proficiencies and Heroic Inspiration for your allies.',
    benefit:
      'You gain the following benefits.\n\n· **Instrument Training** — You gain proficiency with **three** Musical Instruments of your choice.\n· **Encouraging Song** — As you finish a Short or Long Rest, you can play a song on a Musical Instrument you have and give **Heroic Inspiration** to allies who hear it, up to a number equal to your **Proficiency Bonus** (you can include yourself).',
  },
  {
    key: 'savage-attacker', name: 'Savage Attacker', category: 'origin', system: 'dnd5e-2024',
    summary: 'Once per turn, reroll a weapon\'s damage dice and keep the higher total.',
    benefit:
      'You\'ve trained to deal particularly damaging strikes. Once per turn when you hit a target with a weapon, you can roll the weapon\'s damage dice **twice** and use either roll against the target.',
  },
  {
    key: 'skilled', name: 'Skilled', category: 'origin', system: 'dnd5e-2024',
    repeatable: true, grants: { skillChoices: { count: 3, from: 'any' } },
    summary: 'Proficiency in any three skills or tools of your choice.',
    benefit:
      'You gain proficiency in any combination of **three** skills or tools of your choice.\n\n*This feat can be taken more than once.*',
  },
  {
    key: 'tavern-brawler', name: 'Tavern Brawler', category: 'origin', system: 'dnd5e-2024',
    summary: 'Stronger unarmed strikes, a d4 damage die, and a Push option.',
    benefit:
      'You gain the following benefits.\n\n· **Enhanced Unarmed Strike** — When you hit with an **Unarmed Strike** and deal damage, you can deal Bludgeoning damage equal to **1d4 + your Strength modifier** instead of the normal damage.\n· **Damage Rerolls** — Whenever you roll a damage die for your Unarmed Strike, you can reroll the die if it rolls a **1**, and you must use the new roll.\n· **Improvised Weaponry** — You have proficiency with Improvised Weapons.\n· **Push** — When you hit a creature with an Unarmed Strike as part of the Attack action on your turn, you can deal damage and also push the target 5 feet away (once per turn).',
  },
  {
    key: 'tough', name: 'Tough', category: 'origin', system: 'dnd5e-2024',
    summary: 'Your Hit Point maximum increases by twice your level.',
    benefit:
      'Your Hit Point maximum increases by an amount equal to **twice your character level** when you gain this feat. Whenever you gain a level thereafter, your Hit Point maximum increases by an additional **2** Hit Points.',
  },
];

/**
 * The ten 2024 Fighting Style feats. A martial class grants one as a class feature; they can also be
 * taken through the (rare) General-feat access some builds have. Like Origin feats they grant **no
 * ability score increase** — the second no-ASI category, which `feats.test.ts` also pins.
 */
export const FIGHTING_STYLE_FEATS_2024: Feat[] = [
  {
    key: 'fs-archery', name: 'Archery', category: 'fighting-style', system: 'dnd5e-2024',
    summary: '+2 bonus to attack rolls you make with Ranged weapons.',
    benefit: 'You gain a **+2 bonus** to attack rolls you make with Ranged weapons.',
  },
  {
    key: 'fs-blind-fighting', name: 'Blind Fighting', category: 'fighting-style', system: 'dnd5e-2024',
    summary: 'Blindsight with a range of 10 feet.',
    benefit:
      'You have **Blindsight** with a range of **10 feet**. Within that range, you can effectively see anything that isn\'t behind Total Cover, even if you have the Blinded condition or are in Darkness. Moreover, you can see a creature that has the Invisible condition.',
  },
  {
    key: 'fs-defense', name: 'Defense', category: 'fighting-style', system: 'dnd5e-2024',
    summary: '+1 bonus to AC while wearing armor.',
    benefit: 'While you are wearing armor, you gain a **+1 bonus** to Armor Class.',
  },
  {
    key: 'fs-dueling', name: 'Dueling', category: 'fighting-style', system: 'dnd5e-2024',
    summary: '+2 damage with a one-handed melee weapon and no other weapon.',
    benefit:
      'When you are wielding a Melee weapon in one hand and no other weapons, you gain a **+2 bonus** to damage rolls with that weapon.',
  },
  {
    key: 'fs-great-weapon-fighting', name: 'Great Weapon Fighting', category: 'fighting-style', system: 'dnd5e-2024',
    summary: 'Reroll 1s and 2s on damage dice for two-handed melee weapons.',
    benefit:
      'When you roll damage for an attack you make with a Melee weapon that you are wielding with **two hands**, you can treat any **1 or 2** on a damage die as a **3**. The weapon must have the Two-Handed or Versatile property to gain this benefit.',
  },
  {
    key: 'fs-interception', name: 'Interception', category: 'fighting-style', system: 'dnd5e-2024',
    summary: 'Reaction to reduce damage to a creature near you.',
    benefit:
      'When a creature you can see hits another creature that is within 5 feet of you with an attack, you can take a **Reaction** to reduce the damage that the target takes by **1d10 plus your Proficiency Bonus** (to a minimum of 0). You must be wielding a Shield or a Simple or Martial weapon to use this Reaction.',
  },
  {
    key: 'fs-protection', name: 'Protection', category: 'fighting-style', system: 'dnd5e-2024',
    summary: 'Reaction to impose Disadvantage on an attack against a nearby ally.',
    benefit:
      'When a creature you can see attacks a creature other than you that is within 5 feet of you, you can take a **Reaction** to impose **Disadvantage** on the attack roll. You must be wielding a Shield.',
  },
  {
    key: 'fs-thrown-weapon-fighting', name: 'Thrown Weapon Fighting', category: 'fighting-style', system: 'dnd5e-2024',
    summary: 'Draw thrown weapons faster and +2 to their damage.',
    benefit:
      'When you make an attack with a weapon that has the Thrown property, you can draw the weapon as part of the attack. In addition, when you hit with a Ranged attack using a Thrown weapon, you gain a **+2 bonus** to the damage roll.',
  },
  {
    key: 'fs-two-weapon-fighting', name: 'Two-Weapon Fighting', category: 'fighting-style', system: 'dnd5e-2024',
    summary: 'Add your ability modifier to the off-hand attack\'s damage.',
    benefit:
      'When you make an attack as part of the Light property or the Nick property and hit, you can add your **ability modifier** to the damage of that attack if you aren\'t already adding it to the damage.',
  },
  {
    key: 'fs-unarmed-fighting', name: 'Unarmed Fighting', category: 'fighting-style', system: 'dnd5e-2024',
    summary: 'Stronger Unarmed Strikes and damage to grappled foes.',
    benefit:
      'Your Unarmed Strikes can deal Bludgeoning damage equal to **1d6 + your Strength modifier** on a hit. If you aren\'t wielding any weapons or a Shield when you make the attack roll, the d6 becomes a **d8**. At the start of each of your turns, you can deal **1d4** Bludgeoning damage to one creature Grappled by you.',
  },
];

/** Every feat currently defined for 2024 (Origin + Fighting Style; General/Epic Boon in later slices). */
export const FEATS_2024: Feat[] = [...ORIGIN_FEATS_2024, ...FIGHTING_STYLE_FEATS_2024];

/** The categories that, per the 2024 rules, grant NO ability score increase. */
export const NO_ASI_CATEGORIES: FeatCategory[] = ['origin', 'fighting-style'];

export function featsByCategory(category: FeatCategory): Feat[] {
  return FEATS_2024.filter((f) => f.category === category);
}

export function findFeat(key: string): Feat | undefined {
  return FEATS_2024.find((f) => f.key === key);
}

/** Whether a feat grants an ability score increase — false for every Origin and Fighting Style feat. */
export function featGrantsAbilityIncrease(feat: Feat): boolean {
  return !!feat.abilityIncrease && feat.abilityIncrease.amount > 0;
}
