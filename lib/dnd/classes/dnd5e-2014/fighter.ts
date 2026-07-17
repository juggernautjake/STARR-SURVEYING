// lib/dnd/classes/dnd5e-2014/fighter.ts — Fighter, 2014 Player's Handbook.
//
// 2014 tells vs 2024: Fighting Style is a class feature chosen at 1 (not a feat), subclass ("Martial
// Archetype") at 3 with features at 3/7/10/15/18, extra ASIs at 6 and 14 PLUS one at 19 (no Epic
// Boon), Extra Attack scaling to THREE extra at 20, and only the three PHB archetypes. The Eldritch
// Knight is restricted to Abjuration & Evocation (the 2024 version dropped that limit).
import type { ClassDefinition, SubclassDefinition } from '../types';
import { THIRD_CASTER_SLOTS } from '../slots';

export const FIGHTER_2014: ClassDefinition = {
  key: 'fighter',
  name: 'Fighter',
  system: 'dnd5e-2014',
  hitDie: 10,
  primaryAbility: ['str', 'dex'],
  savingThrows: ['str', 'con'],
  skillChoices: {
    count: 2,
    from: ['acrobatics', 'animal', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'],
  },
  armorProficiencies: ['Light armor', 'Medium armor', 'Heavy armor', 'Shields'],
  weaponProficiencies: ['Simple weapons', 'Martial weapons'],
  // Fighter's hallmark: extra ASIs at 6 and 14 on top of the usual 4/8/12/16, plus the 2014 slot at 19.
  asiLevels: [4, 6, 8, 12, 14, 16, 19],
  subclassLevel: 3,
  subclassLabel: 'Martial Archetype',
  description:
    'A master of martial combat, skilled with every weapon and armor. Fighters share an unparalleled mastery with weapons and armor, and a thorough knowledge of the skills of combat.',
  startingEquipment: [
    'Chain mail, or leather armor, longbow, and 20 arrows',
    'A martial weapon and a shield, or two martial weapons',
    'A light crossbow and 20 bolts, or two handaxes',
    'A Dungeoneer\'s Pack, or an Explorer\'s Pack',
  ],
  resources: [
    {
      id: 'second-wind',
      name: 'Second Wind',
      // One use at every level; back on a Short Rest.
      perLevel: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      resetOn: 'short',
      note: 'You regain the use when you finish a Short or Long Rest.',
    },
    {
      id: 'action-surge',
      name: 'Action Surge',
      // None at 1, one at 2–16, two at 17–20.
      perLevel: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2],
      resetOn: 'short',
    },
    {
      id: 'indomitable',
      name: 'Indomitable',
      // None until 9, one at 9–12, two at 13–16, three at 17–20.
      perLevel: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3],
      resetOn: 'long',
    },
  ],
  features: [
    {
      level: 1,
      name: 'Fighting Style',
      body:
        'You adopt a particular style of fighting as your specialty. Choose one option — you cannot take the same option twice, even if you get to choose again:\n· **Archery** — +2 to attack rolls with ranged weapons.\n· **Defense** — +1 to AC while wearing armor.\n· **Dueling** — +2 to damage when wielding a melee weapon in one hand and no other weapons.\n· **Great Weapon Fighting** — reroll 1s and 2s on damage dice for a two-handed or versatile melee weapon.\n· **Protection** — when a creature attacks a target within 5 feet of you, you can use your Reaction to impose Disadvantage (you must be wielding a Shield).\n· **Two-Weapon Fighting** — add your ability modifier to the damage of your off-hand attack.',
      choice: 'fighting-style',
    },
    {
      level: 1,
      name: 'Second Wind',
      body:
        'You have a limited well of stamina you can draw on. On your turn, you can use a **Bonus Action** to regain Hit Points equal to **1d10 + your Fighter level**.\n\nOnce you use this feature, you must finish a **Short or Long Rest** before you can use it again.',
    },
    {
      level: 2,
      name: 'Action Surge',
      body:
        'You can push yourself beyond your normal limits for a moment. On your turn, you can take **one additional action**.\n\nOnce you use this feature, you must finish a Short or Long Rest before you can use it again. At **level 17** you can use it **twice** before a rest, but only once on a turn.',
    },
    {
      level: 3,
      name: 'Martial Archetype',
      body:
        'You choose an archetype that you strive to emulate in your combat styles and techniques — **Champion**, **Battle Master**, or **Eldritch Knight**.\n\nYour choice grants features at level 3 and again at levels **7, 10, 15, and 18**.',
      choice: 'subclass',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 5,
      name: 'Extra Attack',
      body: 'You can attack **twice**, instead of once, whenever you take the **Attack action** on your turn. The number of attacks increases to **three at level 11** and **four at level 20**.',
    },
    { level: 6, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 8, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 9,
      name: 'Indomitable',
      body:
        'You can **reroll a saving throw** that you fail. If you do, you must use the new roll.\n\nYou can use this feature **once**, rising to **twice at level 13** and **three times at level 17**. You regain all expended uses when you finish a **Long Rest**.',
    },
    { level: 12, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 14, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 16, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 19, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 20,
      name: 'Extra Attack (3)',
      body: 'Your Extra Attack feature lets you attack **four times** whenever you take the Attack action on your turn.',
    },
  ],
};

// Eldritch Knight uses the shared third-caster table; exported so a builder can resolve a
// Fighter/Eldritch Knight's slots without special-casing the subclass. The 2014 EK is limited to
// Abjuration & Evocation spells (with a couple of free-choice exceptions), unlike the 2024 version.
export const ELDRITCH_KNIGHT_SPELLCASTING_2014: NonNullable<ClassDefinition['spellcasting']> = {
  kind: 'third',
  ability: 'int',
  preparedRule:
    'Spells KNOWN (not prepared): 3 at Fighter level 3, rising to 13 by level 20, chosen from the Wizard list — mostly Abjuration & Evocation. Swap one when you gain a Fighter level.',
  cantripsKnown: [0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  spellsKnown: [0, 0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13],
  slots: THIRD_CASTER_SLOTS,
};

export const FIGHTER_SUBCLASSES_2014: SubclassDefinition[] = [
  {
    key: 'champion',
    name: 'Champion',
    classKey: 'fighter',
    system: 'dnd5e-2014',
    description: 'Raw physical excellence — wider critical hits, all-round athleticism, and a refusal to fall.',
    features: [
      { level: 3, name: 'Improved Critical', body: 'Your weapon attacks score a **critical hit on a roll of 19 or 20**.' },
      {
        level: 7,
        name: 'Remarkable Athlete',
        body:
          'You can add **half your proficiency bonus** (rounded up) to any **Strength, Dexterity, or Constitution** check you make that does not already use your proficiency bonus.\n\nIn addition, when you make a running long jump, the distance you can cover increases by a number of feet equal to your **Strength modifier**.',
      },
      { level: 10, name: 'Additional Fighting Style', body: 'You can choose a **second option** from the Fighting Style class feature.' },
      { level: 15, name: 'Superior Critical', body: 'Your weapon attacks score a **critical hit on a roll of 18–20**.' },
      {
        level: 18,
        name: 'Survivor',
        body:
          'You attain the pinnacle of resilience in battle. At the **start of each of your turns**, you regain Hit Points equal to **5 + your Constitution modifier** if you have no more than **half your Hit Points** left. You do not gain this benefit if you have 0 Hit Points.',
      },
    ],
  },
  {
    key: 'battle-master',
    name: 'Battle Master',
    classKey: 'fighter',
    system: 'dnd5e-2014',
    description: 'A student of the martial arts — maneuvers fueled by superiority dice that trip, disarm, rally, and outthink the enemy.',
    features: [
      {
        level: 3,
        name: 'Combat Superiority',
        body:
          'You learn **maneuvers** fueled by **superiority dice**.\n· **Maneuvers** — you learn **three** of your choice (such as Trip Attack, Riposte, Precision Attack); you learn 2 more at levels **7, 10, and 15** (5, 7, then 9 total). You can swap one whenever you reach a Fighter level.\n· **Superiority dice** — you have **four d8s**. You regain all expended dice when you finish a **Short or Long Rest**. You gain a fifth die at level 7 and a sixth at level 15.\n· **Saving throws** — some maneuvers require the target to save. The DC = **8 + your proficiency bonus + your Strength or Dexterity modifier** (your choice).',
      },
      {
        level: 3,
        name: 'Student of War',
        body: 'You gain proficiency with **one type of artisan\'s tools** of your choice.',
      },
      {
        level: 7,
        name: 'Know Your Enemy',
        body: 'If you spend at least **1 minute** observing or interacting with another creature outside combat, you can learn certain information about its capabilities compared to your own — such as its relative Strength, Dexterity, Constitution, AC, current Hit Points, class levels, or Fighter levels.',
      },
      { level: 10, name: 'Improved Combat Superiority', body: 'Your **superiority dice turn into d10s**.' },
      {
        level: 15,
        name: 'Relentless',
        body: 'When you **roll initiative** and have no superiority dice remaining, you regain **one** superiority die.',
      },
      { level: 18, name: 'Improved Combat Superiority', body: 'Your **superiority dice turn into d12s**.' },
    ],
  },
  {
    key: 'eldritch-knight',
    name: 'Eldritch Knight',
    classKey: 'fighter',
    system: 'dnd5e-2014',
    description: 'A warrior who braids Wizard magic — mostly Abjuration and Evocation — into swordplay, casting and striking in the same breath.',
    features: [
      {
        level: 3,
        name: 'Spellcasting',
        body:
          'You learn to cast spells from the **Wizard spell list**, drawing mostly on **Abjuration and Evocation**. **Intelligence** is your spellcasting ability; your spell save DC = **8 + your Intelligence modifier + your proficiency bonus**.\n· **Cantrips** — you know **two** Wizard cantrips (a third at level 10).\n· **Spells known** — you know **three** level 1 Wizard spells, at least two of which must be Abjuration or Evocation, rising to **13 by level 20**. When you learn a new one at levels 8, 14, and 20 it can be from **any school**; every other spell you learn must be Abjuration or Evocation.\n· **Slots** — you use the **third-caster** table (first slot at level 3, capping at rank 4).',
      },
      {
        level: 3,
        name: 'Weapon Bond',
        body:
          'You perform a ritual to bond with a weapon. Once bonded, you cannot be **disarmed** of it unless you are Incapacitated, and you can **summon it to your hand as a Bonus Action** if it is on the same plane. You can bond with up to two weapons but summon only one at a time.',
      },
      {
        level: 7,
        name: 'War Magic',
        body: 'When you use your **Action** to cast a **cantrip**, you can make **one weapon attack as a Bonus Action**.',
      },
      {
        level: 10,
        name: 'Eldritch Strike',
        body: 'When you **hit a creature with a weapon attack**, that creature has **Disadvantage on the next saving throw** it makes against a spell you cast before the end of your next turn.',
      },
      {
        level: 15,
        name: 'Arcane Charge',
        body: 'When you use **Action Surge**, you can **teleport up to 30 feet** to an unoccupied space you can see, either before or after the additional action.',
      },
      {
        level: 18,
        name: 'Improved War Magic',
        body: 'When you use your **Action** to cast a **spell** (not just a cantrip), you can make **one weapon attack as a Bonus Action**.',
      },
    ],
  },
];
