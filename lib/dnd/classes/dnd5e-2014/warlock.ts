// lib/dnd/classes/dnd5e-2014/warlock.ts — Warlock, 2014 Player's Handbook.
//
// 2014 tells vs 2024: the Otherworldly Patron is chosen at level 1 (features at 1/6/10/14), the Pact
// Boon lands at 3, and only the three PHB patrons (Archfey, Fiend, Great Old One). Pact Magic — few
// slots, all at your highest rank, back on a SHORT rest — Eldritch Invocations, and Mystic Arcanum
// (ranks 6–9 at 11/13/15/17). ASI at 19, no Epic Boon.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { PACT_SLOTS, PACT_RANK } from '../slots';

export const WARLOCK_2014: ClassDefinition = {
  key: 'warlock',
  name: 'Warlock',
  system: 'dnd5e-2014',
  hitDie: 8,
  primaryAbility: ['cha'],
  savingThrows: ['wis', 'cha'],
  skillChoices: {
    count: 2,
    from: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'],
  },
  armorProficiencies: ['Light armor'],
  weaponProficiencies: ['Simple weapons'],
  asiLevels: [4, 8, 12, 16, 19],
  // Like the Sorcerer, the Warlock chooses its subclass (patron) at level 1.
  subclassLevel: 1,
  subclassLabel: 'Otherworldly Patron',
  description:
    'A wielder of magic derived from a bargain with an extraplanar entity — a patron whose gifts come as Pact Magic, arcane invocations, and a boon that reshapes how you fight or study.',
  startingEquipment: [
    'A light crossbow and 20 bolts, or any simple weapon',
    'A component pouch, or an arcane focus',
    'A Scholar\'s Pack, or a Dungeoneer\'s Pack',
    'Leather armor, any simple weapon, and two daggers',
  ],
  spellcasting: {
    kind: 'pact',
    ability: 'cha',
    preparedRule: 'Spells KNOWN: 2 at level 1, rising to 15 by level 20. Pact slots recharge on a SHORT or Long Rest and are always cast at your highest available rank.',
    cantripsKnown: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    spellsKnown: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
    pactSlots: PACT_SLOTS,
    pactRank: PACT_RANK,
  },
  features: [
    {
      level: 1,
      name: 'Otherworldly Patron',
      body:
        'You strike a bargain with an otherworldly being — **the Archfey**, **the Fiend**, or **the Great Old One**.\n\nYour patron grants features at level 1 and again at levels **6, 10, and 14**.',
      choice: 'subclass',
    },
    {
      level: 1,
      name: 'Pact Magic',
      body:
        'Your arcane research and the magic bestowed by your patron have given you facility with spells. **Charisma** is your spellcasting ability; your spell save DC = **8 + your Charisma modifier + your proficiency bonus**. You know **two cantrips** and **two** level 1 spells at level 1.\n\n**Pact Magic** is unlike other casting: you have **few slots** (1–4), they are **all the same rank** (your highest, from 1st up to 5th by level 9), and they **return on a Short or Long Rest**.',
    },
    {
      level: 2,
      name: 'Eldritch Invocations',
      body:
        'You gain fragments of forbidden knowledge that grant an ability or enhancement. You learn **two invocations** of your choice (such as Agonizing Blast, Devil\'s Sight, or Mask of Many Faces); some have level or Pact Boon prerequisites.\n\nThe number known rises with level — **3 at 5, 4 at 7, 5 at 9, 6 at 12, 7 at 15, and 8 at 18**. Whenever you gain a Warlock level you can replace one invocation you know with another you qualify for.',
    },
    {
      level: 3,
      name: 'Pact Boon',
      body:
        'Your patron bestows a gift. Choose one:\n· **Pact of the Chain** — you learn Find Familiar and can summon rarer forms (imp, pseudodragon, quasit, or sprite), and your familiar can forgo its attack so you can make one as a Bonus Action.\n· **Pact of the Blade** — you can create a pact weapon in your hand as an Action, using it as a spellcasting focus and counting as proficient with it.\n· **Pact of the Tome** — you gain a Book of Shadows holding three cantrips of your choice from any class\'s spell list.',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 8, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 11,
      name: 'Mystic Arcanum (6th level)',
      body: 'Your patron grants you a magical secret. Choose one **level 6 spell** from the Warlock list as an arcanum. You can cast it **once without a spell slot**, regaining that ability on a **Long Rest**.',
    },
    { level: 12, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 13, name: 'Mystic Arcanum (7th level)', body: 'Choose a **level 7** Warlock spell as an arcanum, castable once per Long Rest without a slot.' },
    { level: 15, name: 'Mystic Arcanum (8th level)', body: 'Choose a **level 8** Warlock spell as an arcanum, castable once per Long Rest without a slot.' },
    { level: 16, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 17, name: 'Mystic Arcanum (9th level)', body: 'Choose a **level 9** Warlock spell as an arcanum, castable once per Long Rest without a slot.' },
    { level: 19, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 20,
      name: 'Eldritch Master',
      body: 'You can draw on your inner reserve of mystical power. Once per day, you can spend **1 minute entreating your patron** to regain **all expended Pact Magic spell slots**. Once used, you must finish a Long Rest before doing so again.',
    },
  ],
};

export const WARLOCK_SUBCLASSES_2014: SubclassDefinition[] = [
  {
    key: 'archfey',
    name: 'The Archfey',
    classKey: 'warlock',
    system: 'dnd5e-2014',
    description: 'A pact with a lord or lady of the Feywild — glamour and misdirection, charming and frightening at a whim.',
    features: [
      {
        level: 1,
        name: 'Fey Presence',
        body: 'As an Action, you cause each creature in a **10-foot cube** originating from you to make a **Wisdom saving throw** or be **Charmed or Frightened** (your choice) until the end of your next turn. Once used, a Short or Long Rest is needed to use it again.',
      },
      {
        level: 6,
        name: 'Misty Escape',
        body: 'When you take damage, you can use your **Reaction to turn Invisible and teleport up to 60 feet** to an unoccupied space you can see. You remain Invisible until the start of your next turn or until you attack or cast a spell. Once used, a Short or Long Rest is needed.',
      },
      {
        level: 10,
        name: 'Beguiling Defenses',
        body: 'You are **immune to being Charmed**. When another creature tries to charm you, you can use your **Reaction to turn the effect back** on it: the creature must succeed on a **Wisdom saving throw** or be **Charmed by you for 1 minute**, unable to attack you and repeating the save at the end of each of its turns.',
      },
      {
        level: 14,
        name: 'Dark Delirium',
        body: 'As an Action, one creature within 60 feet makes a **Wisdom saving throw** or is **Charmed or Frightened** (your choice) for **1 minute**, lost in an illusory realm. Once used, a Short or Long Rest is needed.',
      },
    ],
  },
  {
    key: 'fiend',
    name: 'The Fiend',
    classKey: 'warlock',
    system: 'dnd5e-2014',
    description: 'A bargain with a devil, demon, or other lower-planar power — temporary vigor from every kill, uncanny luck, and infernal resilience.',
    features: [
      {
        level: 1,
        name: 'Dark One\'s Blessing',
        body: 'When you reduce a hostile creature to **0 Hit Points**, you gain **Temporary Hit Points equal to your Charisma modifier + your Warlock level** (minimum 1).',
      },
      {
        level: 6,
        name: 'Dark One\'s Own Luck',
        body: 'When you make an **ability check or a saving throw**, you can add a **1d10** to the roll. You can do so after seeing the roll but before the outcome. Once used, a Short or Long Rest is needed.',
      },
      {
        level: 10,
        name: 'Fiendish Resilience',
        body: 'You can choose one **damage type** whenever you finish a Short or Long Rest. You gain **Resistance** to that damage type until you choose a different one — except damage from magical or silvered weapons.',
      },
      {
        level: 14,
        name: 'Hurl Through Hell',
        body: 'When you hit a creature with an attack, you can instantly transport it through the lower planes. It disappears and hurtles through a nightmare landscape, returning at the end of your next turn to the space it left (or the nearest unoccupied space) and, unless it is a fiend, taking **10d10 psychic damage**. Once used, a Long Rest is needed.',
      },
    ],
  },
  {
    key: 'great-old-one',
    name: 'The Great Old One',
    classKey: 'warlock',
    system: 'dnd5e-2014',
    description: 'A tenuous link to an alien, unfathomable mind — telepathy, psychic wards, and the power to bind a broken thrall.',
    features: [
      {
        level: 1,
        name: 'Awakened Mind',
        body: 'You can **telepathically speak to any creature you can see within 30 feet**. You do not need to share a language, though the creature understands you only if it knows at least one language.',
      },
      {
        level: 6,
        name: 'Entropic Ward',
        body: 'When a creature makes an attack roll against you, you can use your **Reaction to impose Disadvantage** on it. If the attack misses, your **next attack roll against that creature has Advantage** before the end of your next turn. Once used, a Short or Long Rest is needed.',
      },
      {
        level: 10,
        name: 'Thought Shield',
        body: 'Your thoughts cannot be read by telepathy or other means unless you allow it. You also have **Resistance to psychic damage**, and whenever a creature deals psychic damage to you, it takes the **same amount**.',
      },
      {
        level: 14,
        name: 'Create Thrall',
        body: 'You can use an Action to touch an **Incapacitated humanoid**, which becomes **Charmed by you** until a Remedy ends the condition. The charmed target can telepathically communicate with you as long as you are on the same plane.',
      },
    ],
  },
];
