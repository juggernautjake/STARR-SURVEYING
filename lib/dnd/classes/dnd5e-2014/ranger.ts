// lib/dnd/classes/dnd5e-2014/ranger.ts — Ranger, 2014 Player's Handbook.
//
// 2014 tells vs 2024: the (in)famous **Favored Enemy** and **Natural Explorer** at 1 (the 2024 book
// replaced these with Favored Enemy = a Hunter's Mark you always know, and Deft Explorer), a Fighting
// Style at 2, half-caster spells KNOWN from 2, subclass ("Ranger Archetype") at 3 with features at
// 3/7/11/15, and only Hunter + Beast Master. ASI at 19, no Epic Boon.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { HALF_CASTER_SLOTS } from '../slots';

export const RANGER_2014: ClassDefinition = {
  key: 'ranger',
  name: 'Ranger',
  system: 'dnd5e-2014',
  hitDie: 10,
  primaryAbility: ['dex', 'wis'],
  savingThrows: ['str', 'dex'],
  skillChoices: {
    count: 3,
    from: ['animal', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'],
  },
  armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
  weaponProficiencies: ['Simple weapons', 'Martial weapons'],
  asiLevels: [4, 8, 12, 16, 19],
  subclassLevel: 3,
  subclassLabel: 'Ranger Archetype',
  description:
    'A warrior of the wilderness, skilled in tracking, survival, and combat against the monstrous foes that threaten the edges of civilization — blending martial prowess with primal magic.',
  startingEquipment: [
    'Scale mail, or leather armor',
    'Two shortswords, or two simple melee weapons',
    'A Dungeoneer\'s Pack, or an Explorer\'s Pack',
    'A longbow and a quiver of 20 arrows',
  ],
  spellcasting: {
    kind: 'half',
    ability: 'wis',
    preparedRule:
      'Spells KNOWN (a Ranger does not prepare): 2 at level 2, rising to 11 by level 20. Swap one when you gain a Ranger level. No cantrips.',
    // No cantrips for the 2014 Ranger.
    spellsKnown: [0, 0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
    slots: HALF_CASTER_SLOTS,
  },
  features: [
    {
      level: 1,
      name: 'Favored Enemy',
      body:
        'You have significant experience studying, tracking, hunting, and even talking to a certain type of enemy. Choose a **favored enemy type** (such as beasts, fey, humanoids, or undead).\n\nYou have **Advantage on Wisdom (Survival) checks to track** your favored enemies, as well as on Intelligence checks to recall information about them. You also learn one language of your choice that they speak.\n\nYou choose **one additional favored enemy** at levels **6 and 14**.',
    },
    {
      level: 1,
      name: 'Natural Explorer',
      body:
        'You are a master of navigating the natural world. Choose one type of **favored terrain** — arctic, coast, desert, forest, grassland, mountain, swamp, or the Underdark.\n\nWhile traveling in your favored terrain: difficult terrain does not slow your group; you cannot become lost except by magic; you remain alert to danger even while foraging or tracking; you can move stealthily at a normal pace when alone; you find twice as much food while foraging; and you learn the exact number, sizes, and how long ago creatures passed.\n\nYou choose **additional favored terrains** at levels **6 and 10**.',
    },
    {
      level: 2,
      name: 'Fighting Style',
      body:
        'You adopt a style of fighting as your specialty. Choose one: **Archery** (+2 to ranged attack rolls), **Defense** (+1 AC while wearing armor), **Dueling** (+2 damage with a one-handed melee weapon and no other weapon), or **Two-Weapon Fighting** (add your ability modifier to the off-hand attack\'s damage).',
      choice: 'fighting-style',
    },
    {
      level: 2,
      name: 'Spellcasting',
      body:
        'You have learned to channel the magical essence of nature to cast spells. **Wisdom** is your spellcasting ability; your spell save DC = **8 + your Wisdom modifier + your proficiency bonus**.\n\nYou know **two** level 1 Ranger spells at level 2 (no cantrips), rising to **eleven** known by level 20. You can swap one known spell for another whenever you gain a Ranger level. You use the **half-caster** slot table (first slots at level 2).',
    },
    {
      level: 3,
      name: 'Ranger Archetype',
      body:
        'You choose an archetype you strive to emulate — **Hunter** or **Beast Master**.\n\nYour choice grants features at level 3 and again at levels **7, 11, and 15**.',
      choice: 'subclass',
    },
    {
      level: 3,
      name: 'Primeval Awareness',
      body:
        'You can spend a spell slot (as an Action) to focus your awareness on the region around you. For 1 minute per level of the slot, you sense whether **aberrations, celestials, dragons, elementals, fey, fiends, or undead** are present within **1 mile** (or 6 miles in your favored terrain), though not their location or number.',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 5,
      name: 'Extra Attack',
      body: 'You can attack **twice**, instead of once, whenever you take the **Attack action** on your turn.',
    },
    { level: 8, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 8,
      name: 'Land\'s Stride',
      body:
        'Moving through **nonmagical difficult terrain** costs you no extra movement. You can also pass through nonmagical plants without being slowed and without taking damage from thorns, spines, or similar. In addition, you have **Advantage on saving throws** against plants magically created or manipulated to impede movement.',
    },
    {
      level: 10,
      name: 'Hide in Plain Sight',
      body:
        'You can spend **1 minute** creating camouflage from natural materials and pressing it to yourself. So camouflaged, you can try to hide by pressing against a solid surface, gaining a **+10 bonus to Dexterity (Stealth) checks** as long as you remain there without moving or taking actions.',
    },
    { level: 12, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 14,
      name: 'Vanish',
      body: 'You can use the **Hide action as a Bonus Action** on your turn. Also, you cannot be tracked by nonmagical means unless you choose to leave a trail.',
    },
    { level: 16, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 18,
      name: 'Feral Senses',
      body:
        'You gain preternatural senses that help you fight creatures you cannot see. When you attack a creature you cannot see, your inability to see it does not impose Disadvantage on your attack rolls. You are also aware of the location of any **Invisible creature within 30 feet**, provided you are not Blinded or Deafened.',
    },
    { level: 19, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 20,
      name: 'Foe Slayer',
      body:
        'Once on each of your turns, you can add your **Wisdom modifier** to the attack roll or the damage roll of an attack you make against one of your **favored enemies**. You can choose to use this feature before or after the roll, but before any effects of the roll are applied.',
    },
  ],
};

export const RANGER_SUBCLASSES_2014: SubclassDefinition[] = [
  {
    key: 'hunter',
    name: 'Hunter',
    classKey: 'ranger',
    system: 'dnd5e-2014',
    description: 'A stalker of the world\'s deadliest game — techniques tuned to fell single giants, whole hordes, and everything between.',
    features: [
      {
        level: 3,
        name: 'Hunter\'s Prey',
        body:
          'Choose one:\n· **Colossus Slayer** — once per turn, deal an extra **1d8 damage** to a creature below its Hit Point maximum that you hit with a weapon attack.\n· **Giant Killer** — when a Large or larger creature within 5 feet hits or misses you, you can use your Reaction to attack it after its attack.\n· **Horde Breaker** — once per turn, when you attack, you can make **another attack** against a different creature within 5 feet of the target and within range.',
      },
      {
        level: 7,
        name: 'Defensive Tactics',
        body:
          'Choose one:\n· **Escape the Horde** — Opportunity Attacks against you have Disadvantage.\n· **Multiattack Defense** — when a creature hits you with an attack, you gain **+4 AC** against all further attacks by that creature this turn.\n· **Steel Will** — you have Advantage on saving throws against being Frightened.',
      },
      {
        level: 11,
        name: 'Multiattack',
        body:
          'Choose one:\n· **Volley** — you can use an Action to make a ranged attack against any number of creatures within 10 feet of a point you can see, one attack roll per creature.\n· **Whirlwind Attack** — you can use an Action to make a melee attack against any number of creatures within 5 feet, one roll per creature.',
      },
      {
        level: 15,
        name: 'Superior Hunter\'s Defense',
        body:
          'Choose one:\n· **Evasion** — a Dexterity save for half damage instead takes no damage on a success, half on a failure.\n· **Stand Against the Tide** — when a creature misses you with a melee attack, you can use your Reaction to force it to repeat the attack against another creature of your choice.\n· **Uncanny Dodge** — use your Reaction to halve the damage of an attack that hits you.',
      },
    ],
  },
  {
    key: 'beast-master',
    name: 'Beast Master',
    classKey: 'ranger',
    system: 'dnd5e-2014',
    description: 'A ranger bonded to a wild companion, fighting as one — the beast a full participant in the hunt.',
    features: [
      {
        level: 3,
        name: 'Ranger\'s Companion',
        body:
          'You gain a **beast companion** (a beast no larger than Medium with a challenge rating of 1/4 or lower) that accompanies you and obeys your commands. It adds your **proficiency bonus** to its AC, attack rolls, damage rolls, and saving throws it is proficient in, and its Hit Point maximum becomes **four times your Ranger level** if higher. In combat you can command it with a Bonus Action to Attack, Dash, Disengage, Dodge, or Help.',
      },
      {
        level: 7,
        name: 'Exceptional Training',
        body: 'On any of your turns when your companion does not attack, you can use a **Bonus Action** to command it to take the Dash, Disengage, Dodge, or Help action. Its attacks also count as **magical** for overcoming Resistance and Immunity.',
      },
      {
        level: 11,
        name: 'Bestial Fury',
        body: 'When you command your companion to take the **Attack action**, it can make **two attacks**, or use its Multiattack if it has one.',
      },
      {
        level: 15,
        name: 'Share Spells',
        body: 'When you cast a spell targeting yourself, you can also affect your companion if it is within 30 feet of you.',
      },
    ],
  },
];
