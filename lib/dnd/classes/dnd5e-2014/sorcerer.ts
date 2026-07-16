// lib/dnd/classes/dnd5e-2014/sorcerer.ts — Sorcerer, 2014 Player's Handbook.
//
// 2014 tells vs 2024: the Sorcerous Origin is chosen at level 1 (origin features at 1/6/14/18), a d6
// hit die, spells KNOWN (not prepared), Metamagic learned at 3/10/17, and only the two PHB origins.
// Sorcery Points equal your Sorcerer level from level 2. ASI at 19, no Epic Boon.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { FULL_CASTER_SLOTS } from '../slots';

export const SORCERER_2014: ClassDefinition = {
  key: 'sorcerer',
  name: 'Sorcerer',
  system: 'dnd5e-2014',
  hitDie: 6,
  primaryAbility: ['cha'],
  savingThrows: ['con', 'cha'],
  skillChoices: {
    count: 2,
    from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'],
  },
  armorProficiencies: [],
  weaponProficiencies: ['Daggers', 'Darts', 'Slings', 'Quarterstaffs', 'Light crossbows'],
  asiLevels: [4, 8, 12, 16, 19],
  // The Sorcerer's defining quirk: the subclass is chosen at level 1, not 3.
  subclassLevel: 1,
  subclassLabel: 'Sorcerous Origin',
  description:
    'A spellcaster who draws on inherent magic from a gift or bloodline — raw power shaped by force of personality, bent and twisted through Metamagic into effects no studied wizard can match.',
  startingEquipment: [
    'A light crossbow and 20 bolts, or any simple weapon',
    'A component pouch, or an arcane focus',
    'A Dungeoneer\'s Pack, or an Explorer\'s Pack',
    'Two daggers',
  ],
  spellcasting: {
    kind: 'full',
    ability: 'cha',
    preparedRule: 'Spells KNOWN (a Sorcerer does not prepare): 2 at level 1, rising to 15 by level 20. Swap one when you gain a Sorcerer level.',
    cantripsKnown: [0, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
    spellsKnown: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
    slots: FULL_CASTER_SLOTS,
  },
  resources: [
    {
      id: 'sorcery-points',
      name: 'Sorcery Points',
      // Sorcery points equal your Sorcerer level, starting at level 2.
      perLevel: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      resetOn: 'long',
    },
  ],
  features: [
    {
      level: 1,
      name: 'Sorcerous Origin',
      body:
        'You choose the source of your innate magic — **Draconic Bloodline** or **Wild Magic**.\n\nYour choice grants features at level 1 and again at levels **6, 14, and 18**.',
      choice: 'subclass',
    },
    {
      level: 1,
      name: 'Spellcasting',
      body:
        'An event in your past, or in the life of a parent or ancestor, left an indelible mark on you, infusing you with arcane magic. **Charisma** is your spellcasting ability; your spell save DC = **8 + your Charisma modifier + your proficiency bonus**. You know **four cantrips** (five at 4, six at 10) and **two** level 1 spells at level 1, rising to **fifteen** spells known by level 20. You use the **full-caster** slot table.',
    },
    {
      level: 2,
      name: 'Font of Magic',
      body:
        'You tap into a deep wellspring of magic, measured in **Sorcery Points** (equal to your Sorcerer level). You can convert them into spell slots as a Bonus Action (2/3/5/6/7 points for a level 1–5 slot), and convert unused spell slots back into Sorcery Points. You regain all spent points on a **Long Rest**.',
    },
    {
      level: 3,
      name: 'Metamagic',
      body:
        'You gain the ability to twist your spells by spending Sorcery Points. You learn **two** Metamagic options (such as Twinned Spell, Quickened Spell, Subtle Spell, or Careful Spell); you learn one more at **level 10** and another at **level 17**. You can use only one Metamagic option on a single spell unless noted otherwise.',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 8, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 12, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 16, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 19, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 20,
      name: 'Sorcerous Restoration',
      body: 'When you finish a **Short Rest**, you regain **4 expended Sorcery Points**.',
    },
  ],
};

export const SORCERER_SUBCLASSES_2014: SubclassDefinition[] = [
  {
    key: 'draconic-bloodline',
    name: 'Draconic Bloodline',
    classKey: 'sorcerer',
    system: 'dnd5e-2014',
    description: 'Dragon blood in your veins — tougher hide, an affinity for one damage type, and eventually wings and draconic presence.',
    features: [
      {
        level: 1,
        name: 'Dragon Ancestor',
        body: 'You choose a **dragon ancestor** (its type sets a damage affinity). You can speak, read, and write **Draconic**, and you double your proficiency bonus on Charisma checks when interacting with dragons.',
      },
      {
        level: 1,
        name: 'Draconic Resilience',
        body: 'Your **Hit Point maximum increases by 1 per Sorcerer level**. In addition, when you are not wearing armor, your **base AC = 13 + your Dexterity modifier** (your scales harden).',
      },
      {
        level: 6,
        name: 'Elemental Affinity',
        body: 'When you cast a spell that deals damage of the type associated with your dragon ancestry, add your **Charisma modifier** to one damage roll. You can also spend **1 Sorcery Point** to gain **Resistance** to that damage type for 1 hour.',
      },
      {
        level: 14,
        name: 'Dragon Wings',
        body: 'As a Bonus Action, you sprout **dragon wings** and gain a **flying speed equal to your current speed**, provided you are not wearing armor incompatible with them. They last until you dismiss them.',
      },
      {
        level: 18,
        name: 'Draconic Presence',
        body: 'As an Action, you can spend **5 Sorcery Points** to exude a 60-foot aura of awe or fear for 1 minute. Each hostile creature that starts its turn in it must succeed on a **Wisdom saving throw** or be **Charmed (awe) or Frightened (fear)** until the aura ends.',
      },
    ],
  },
  {
    key: 'wild-magic',
    name: 'Wild Magic',
    classKey: 'sorcerer',
    system: 'dnd5e-2014',
    description: 'Chaos itself flows through your spells — a surge table that can backfire or bless, and luck you can bend at will.',
    features: [
      {
        level: 1,
        name: 'Wild Magic Surge',
        body: 'Immediately after you cast a Sorcerer spell of level 1 or higher, the DM can have you roll on the **Wild Magic Surge table** (a 1 on a d20 triggers a random magical effect).',
      },
      {
        level: 1,
        name: 'Tides of Chaos',
        body: 'You can gain **Advantage on one attack roll, ability check, or saving throw**. Once you do, you must finish a Long Rest before using it again — unless the DM has you roll on the Wild Magic Surge table first, which restores the use.',
      },
      {
        level: 6,
        name: 'Bend Luck',
        body: 'When another creature you can see makes an attack roll, ability check, or saving throw, you can use your **Reaction and spend 2 Sorcery Points** to roll **1d4** and apply it as a bonus or penalty to that roll.',
      },
      {
        level: 14,
        name: 'Controlled Chaos',
        body: 'Whenever you roll on the Wild Magic Surge table, you can **roll twice and use either result**.',
      },
      {
        level: 18,
        name: 'Spell Bombardment',
        body: 'When you roll damage for a spell and roll the **highest number possible on any of the dice**, choose one of those dice, **roll it again**, and add it to the damage. You can use this feature only once per turn.',
      },
    ],
  },
];
