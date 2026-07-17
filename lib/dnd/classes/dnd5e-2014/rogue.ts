// lib/dnd/classes/dnd5e-2014/rogue.ts — Rogue, 2014 Player's Handbook.
//
// 2014 tells vs 2024: subclass ("Roguish Archetype") at 3 with features at 3/9/13/17, an extra ASI
// at 10, a d8 hit die, and the three PHB archetypes only. Reliable Talent at 11, Blindsense at 14,
// Slippery Mind (WIS saves) at 15, Elusive at 18, Stroke of Luck at 20. The Arcane Trickster leans
// Enchantment & Illusion (a restriction the 2024 book relaxed).
import type { ClassDefinition, SubclassDefinition } from '../types';
import { THIRD_CASTER_SLOTS } from '../slots';

export const ROGUE_2014: ClassDefinition = {
  key: 'rogue',
  name: 'Rogue',
  system: 'dnd5e-2014',
  hitDie: 8,
  primaryAbility: ['dex'],
  savingThrows: ['dex', 'int'],
  skillChoices: {
    count: 4,
    from: [
      'acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation',
      'perception', 'performance', 'persuasion', 'sleight', 'stealth',
    ],
  },
  armorProficiencies: ['Light armor'],
  weaponProficiencies: ['Simple weapons', 'Hand crossbows', 'Longswords', 'Rapiers', 'Shortswords'],
  toolProficiencies: ['Thieves\' tools'],
  // Rogues get an extra ASI at 10, plus the usual 4/8/12/16 and the 2014 slot at 19.
  asiLevels: [4, 8, 10, 12, 16, 19],
  subclassLevel: 3,
  subclassLabel: 'Roguish Archetype',
  description:
    'A scoundrel who uses stealth and trickery to overcome obstacles and enemies, relying on skill, precision, and a knack for finding the vulnerable spot rather than brute force.',
  startingEquipment: [
    'A rapier, or a shortsword',
    'A shortbow and quiver of 20 arrows, or a shortsword',
    'A Burglar\'s Pack, Dungeoneer\'s Pack, or Explorer\'s Pack',
    'Leather armor, two daggers, and thieves\' tools',
  ],
  features: [
    {
      level: 1,
      name: 'Expertise',
      body:
        'Choose **two** of your skill proficiencies, or one skill and your proficiency with **thieves\' tools**. Your **proficiency bonus is doubled** for any ability check you make using either.\n\nAt **level 6** you choose two more of your proficiencies to gain this benefit.',
      choice: 'expertise',
    },
    {
      level: 1,
      name: 'Sneak Attack',
      body:
        'Once per turn, you can deal an extra **1d6 damage** to one creature you hit with an attack if you have **Advantage** on the attack roll, using a **finesse or ranged weapon**.\n\nYou do not need Advantage if another enemy of the target is within 5 feet of it, that enemy is not Incapacitated, and you do not have Disadvantage on the attack.\n\nThe extra damage rises by **1d6 at every odd level** — 2d6 at 3, 3d6 at 5, and so on up to **10d6 at level 19**.',
    },
    {
      level: 1,
      name: 'Thieves\' Cant',
      body:
        'You know **Thieves\' Cant**, a secret mix of dialect, jargon, and code that lets you hide messages in a seemingly normal conversation. You also understand a set of secret signs and symbols used to convey short, simple messages.',
    },
    {
      level: 2,
      name: 'Cunning Action',
      body:
        'Your quick thinking and agility let you act fast. You can take a **Bonus Action** on each of your turns to **Dash, Disengage, or Hide**.',
    },
    {
      level: 3,
      name: 'Roguish Archetype',
      body:
        'You choose an archetype that you emulate — **Thief**, **Assassin**, or **Arcane Trickster**.\n\nYour choice grants features at level 3 and again at levels **9, 13, and 17**.',
      choice: 'subclass',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 5,
      name: 'Uncanny Dodge',
      body: 'When an attacker you can see hits you with an attack, you can use your **Reaction to halve the attack\'s damage** against you.',
    },
    { level: 6, name: 'Expertise', body: 'Choose **two more** of your proficiencies (skills or thieves\' tools) to double your proficiency bonus with.', choice: 'expertise' },
    {
      level: 7,
      name: 'Evasion',
      body:
        'When you are subjected to an effect that lets you make a **Dexterity saving throw** to take only half damage, you instead take **no damage on a success** and **half damage on a failure**.',
    },
    { level: 8, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 10, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 11,
      name: 'Reliable Talent',
      body: 'Whenever you make an ability check that lets you add your **proficiency bonus**, you can **treat a d20 roll of 9 or lower as a 10**.',
    },
    { level: 12, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 14,
      name: 'Blindsense',
      body: 'If you are able to hear, you are aware of the location of any **Hidden or Invisible creature within 10 feet** of you.',
    },
    {
      level: 15,
      name: 'Slippery Mind',
      body: 'You gain proficiency in **Wisdom saving throws**.',
    },
    { level: 16, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 18,
      name: 'Elusive',
      body: 'No attack roll has **Advantage against you** while you are not Incapacitated.',
    },
    { level: 19, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 20,
      name: 'Stroke of Luck',
      body:
        'You have an uncanny knack for succeeding when you need to. If your attack **misses** a target within range, you can **turn the miss into a hit**. Alternatively, if you fail an **ability check**, you can treat the d20 roll as a **20**.\n\nOnce you use this feature, you cannot use it again until you finish a **Short or Long Rest**.',
    },
  ],
};

// Arcane Trickster casting (shared third-caster table), exported like the Eldritch Knight block. The
// 2014 Arcane Trickster draws mainly on Enchantment & Illusion from the Wizard list.
export const ARCANE_TRICKSTER_SPELLCASTING_2014: NonNullable<ClassDefinition['spellcasting']> = {
  kind: 'third',
  ability: 'int',
  preparedRule:
    'Spells KNOWN: 3 at Rogue level 3, rising to 13 by level 20, from the Wizard list — mostly Enchantment & Illusion. Swap one when you gain a Rogue level.',
  cantripsKnown: [0, 0, 0, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  spellsKnown: [0, 0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13],
  slots: THIRD_CASTER_SLOTS,
};

export const ROGUE_SUBCLASSES_2014: SubclassDefinition[] = [
  {
    key: 'thief',
    name: 'Thief',
    classKey: 'rogue',
    system: 'dnd5e-2014',
    description: 'A nimble burglar — faster hands, a climber\'s ease, and the wits to make any magic item work.',
    features: [
      {
        level: 3,
        name: 'Fast Hands',
        body: 'You can use the **Bonus Action granted by your Cunning Action** to make a Dexterity (Sleight of Hand) check, use your thieves\' tools to disarm a trap or open a lock, or take the **Use an Object** action.',
      },
      {
        level: 3,
        name: 'Second-Story Work',
        body: 'Climbing no longer costs you extra movement. In addition, when you make a running jump, the distance you cover increases by a number of feet equal to your **Dexterity modifier**.',
      },
      {
        level: 9,
        name: 'Supreme Sneak',
        body: 'You have **Advantage on a Dexterity (Stealth) check** if you move no more than half your speed on the same turn.',
      },
      {
        level: 13,
        name: 'Use Magic Device',
        body: 'You **ignore all class, race, and level requirements** on the use of magic items.',
      },
      {
        level: 17,
        name: 'Thief\'s Reflexes',
        body: 'You can take **two turns during the first round of any combat**. You take your first turn at your normal initiative and your second turn at your initiative minus 10. You cannot use this feature when you are Surprised.',
      },
    ],
  },
  {
    key: 'assassin',
    name: 'Assassin',
    classKey: 'rogue',
    system: 'dnd5e-2014',
    description: 'A killer of the shadows — deadliest against the unready, and a master of disguise and impersonation.',
    features: [
      {
        level: 3,
        name: 'Bonus Proficiencies',
        body: 'You gain proficiency with the **disguise kit** and the **poisoner\'s kit**.',
      },
      {
        level: 3,
        name: 'Assassinate',
        body:
          'You have **Advantage on attack rolls** against any creature that has not yet taken a turn in combat. In addition, any hit you score against a creature that is **Surprised** is a **critical hit**.',
      },
      {
        level: 9,
        name: 'Infiltration Expertise',
        body: 'You can spend **seven days and 25 gp** to establish a **false identity** — history, profession, and affiliations — that is documented and difficult to disprove.',
      },
      {
        level: 13,
        name: 'Impostor',
        body: 'You can **unerringly mimic another person\'s speech, writing, and behavior**. You must spend at least three hours studying the target. Others must succeed on a Wisdom (Insight) check contested by your Charisma (Deception) to detect the ruse.',
      },
      {
        level: 17,
        name: 'Death Strike',
        body:
          'When you attack and hit a creature that is **Surprised**, it must make a **Constitution saving throw** (DC = 8 + your Dexterity modifier + your proficiency bonus). On a failure, you **double the damage** of the attack against it.',
      },
    ],
  },
  {
    key: 'arcane-trickster',
    name: 'Arcane Trickster',
    classKey: 'rogue',
    system: 'dnd5e-2014',
    description: 'A rogue who laces larceny with Wizard magic — Enchantment and Illusion, a spectral Mage Hand, and sharper sneak attacks.',
    features: [
      {
        level: 3,
        name: 'Spellcasting',
        body:
          'You learn spells from the **Wizard spell list**, drawing mainly on **Enchantment and Illusion**. **Intelligence** is your spellcasting ability; your spell save DC = **8 + your Intelligence modifier + your proficiency bonus**.\n· **Cantrips** — you know **three** Wizard cantrips (one must be **Mage Hand**); a fourth at level 10.\n· **Spells known** — you know **three** level 1 Wizard spells, at least two of which must be Enchantment or Illusion, rising to **13 by level 20**. The spells you learn at levels 8, 14, and 20 can be from **any school**.\n· **Slots** — you use the **third-caster** table (first slot at level 3, capping at rank 4).',
      },
      {
        level: 3,
        name: 'Mage Hand Legerdemain',
        body:
          'When you cast **Mage Hand**, you can make the spectral hand **Invisible**, and you can use it to stow or retrieve an object, pick locks and disarm traps at range, and perform sleight of hand — using it as a Bonus Action controlled by your Dexterity (Sleight of Hand) or thieves\' tools.',
      },
      {
        level: 9,
        name: 'Magical Ambush',
        body: 'If you are **Hidden** from a creature when you cast a spell on it, the creature has **Disadvantage** on any saving throw it makes against the spell this turn.',
      },
      {
        level: 13,
        name: 'Versatile Trickster',
        body: 'You can use **Mage Hand** to distract a creature within 5 feet of the spectral hand. As a Bonus Action, you gain **Advantage on attack rolls** against that creature until the end of the turn.',
      },
      {
        level: 17,
        name: 'Spell Thief',
        body:
          'When a creature casts a spell that targets you or includes you in its area, you can use your **Reaction** to force it to make a saving throw (DC = your spell save DC). On a failure, you **negate the spell\'s effect** against you and **steal the knowledge of that spell** for **8 hours**, provided you can cast spells and it is of a rank you can cast. Once you use this feature, you cannot again until you finish a **Long Rest**.',
      },
    ],
  },
];
