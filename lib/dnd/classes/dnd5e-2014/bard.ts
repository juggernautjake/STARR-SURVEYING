// lib/dnd/classes/dnd5e-2014/bard.ts — Bard, 2014 Player's Handbook.
//
// 2014 tells vs 2024: Bard College at 3 (features at 3/6/14), Magical Secrets at 10/14/18 (the 2024
// book made those universal at different levels and added a base-class version), Song of Rest, and
// only the two PHB colleges (Lore, Valor). Full caster, CHA, spells KNOWN. Bardic Inspiration die
// scales d6→d12; uses = your Charisma modifier. ASI at 19, no Epic Boon.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { FULL_CASTER_SLOTS } from '../slots';

export const BARD_2014: ClassDefinition = {
  key: 'bard',
  name: 'Bard',
  system: 'dnd5e-2014',
  hitDie: 8,
  primaryAbility: ['cha'],
  savingThrows: ['dex', 'cha'],
  // A Bard chooses ANY three skills.
  skillChoices: {
    count: 3,
    from: [
      'acrobatics', 'animal', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation',
      'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion',
      'sleight', 'stealth', 'survival',
    ],
  },
  armorProficiencies: ['Light armor'],
  weaponProficiencies: ['Simple weapons', 'Hand crossbows', 'Longswords', 'Rapiers', 'Shortswords'],
  toolProficiencies: ['Three musical instruments of your choice'],
  asiLevels: [4, 8, 12, 16, 19],
  subclassLevel: 3,
  subclassLabel: 'Bard College',
  description:
    'A master of song, speech, and the magic they contain — inspiring allies, unnerving foes, and borrowing a little of every kind of magic there is.',
  startingEquipment: [
    'A rapier, a longsword, or any simple weapon',
    'A Diplomat\'s Pack, or an Entertainer\'s Pack',
    'A lute, or any other musical instrument',
    'Leather armor and a dagger',
  ],
  spellcasting: {
    kind: 'full',
    ability: 'cha',
    preparedRule: 'Spells KNOWN (a Bard does not prepare): 4 at level 1, rising to 22 by level 20. Swap one when you gain a Bard level; Magical Secrets add spells from ANY class.',
    cantripsKnown: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    spellsKnown: [0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
    slots: FULL_CASTER_SLOTS,
  },
  features: [
    {
      level: 1,
      name: 'Spellcasting',
      body:
        'You have learned to untangle and reshape the fabric of reality in harmony with your music. **Charisma** is your spellcasting ability; your spell save DC = **8 + your Charisma modifier + your proficiency bonus**. You know **two cantrips** and **four** spells at level 1 (up to 22 known by level 20), drawn from the Bard list, and you use the **full-caster** slot table.',
    },
    {
      level: 1,
      name: 'Bardic Inspiration',
      body:
        'As a **Bonus Action**, you can give one creature within 60 feet that can hear you a **Bardic Inspiration die (a d6)**. Within the next 10 minutes, it can add the die to one ability check, attack roll, or saving throw it makes.\n\nYou can use this **a number of times equal to your Charisma modifier** (minimum once), regaining all uses on a **Long Rest** (or a Short Rest from level 5). The die grows to **d8 at 5, d10 at 10, and d12 at 15**.',
    },
    {
      level: 2,
      name: 'Jack of All Trades',
      body: 'You can add **half your proficiency bonus** (rounded down) to any ability check you make that does not already include your proficiency bonus.',
    },
    {
      level: 2,
      name: 'Song of Rest',
      body: 'If you or friendly creatures who can hear your performance regain Hit Points at the end of a **Short Rest** by spending Hit Dice, each of them regains an extra **1d6** Hit Points. The die grows to **1d8 at 9, 1d10 at 13, and 1d12 at 17**.',
    },
    {
      level: 3,
      name: 'Bard College',
      body:
        'You delve into the advanced techniques of a bard college — the **College of Lore** or the **College of Valor**.\n\nYour choice grants features at level 3 and again at levels **6 and 14**.',
      choice: 'subclass',
    },
    {
      level: 3,
      name: 'Expertise',
      body: 'Choose **two** of your skill proficiencies; your **proficiency bonus is doubled** for ability checks using either. You choose **two more at level 10**.',
      choice: 'expertise',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 5,
      name: 'Font of Inspiration',
      body: 'You now regain all expended uses of **Bardic Inspiration** when you finish a **Short or Long Rest**.',
    },
    {
      level: 6,
      name: 'Countercharm',
      body: 'As an Action, you can start a performance that lasts until the end of your next turn. During it, you and friendly creatures within 30 feet have **Advantage on saving throws against being Frightened or Charmed**.',
    },
    { level: 8, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 10, name: 'Expertise', body: 'Choose **two more** skill proficiencies to double your proficiency bonus with.', choice: 'expertise' },
    {
      level: 10,
      name: 'Magical Secrets',
      body: 'You learn **two spells of your choice from any class**. They count as Bard spells for you and do not count against your number of Bard spells known. You learn **two more at level 14** and **two more at level 18**.',
    },
    { level: 12, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 14, name: 'Magical Secrets', body: 'You learn **two more spells from any class**, as the level-10 feature.' },
    { level: 16, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 18, name: 'Magical Secrets', body: 'You learn **two more spells from any class**, as the level-10 feature.' },
    { level: 19, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 20,
      name: 'Superior Inspiration',
      body: 'When you **roll initiative** and have no uses of Bardic Inspiration left, you regain **one** use.',
    },
  ],
};

export const BARD_SUBCLASSES_2014: SubclassDefinition[] = [
  {
    key: 'lore',
    name: 'College of Lore',
    classKey: 'bard',
    system: 'dnd5e-2014',
    description: 'Keepers of every secret — a wide net of skills, words that cut down a foe\'s successes, and magic borrowed early from any tradition.',
    features: [
      {
        level: 3,
        name: 'Bonus Proficiencies',
        body: 'You gain proficiency with **three skills** of your choice.',
      },
      {
        level: 3,
        name: 'Cutting Words',
        body:
          'When a creature within 60 feet that you can see makes an attack roll, ability check, or damage roll, you can use your **Reaction to expend a Bardic Inspiration die** and subtract it from the roll. You can do so after the roll but before its effects apply. The creature is immune if it cannot hear you or is immune to being Charmed.',
      },
      {
        level: 6,
        name: 'Additional Magical Secrets',
        body: 'You learn **two spells of your choice from any class** (of a level you can cast). They count as Bard spells but do not count against your spells known.',
      },
      {
        level: 14,
        name: 'Peerless Skill',
        body: 'When you make an ability check, you can **expend a Bardic Inspiration die** and add it to the roll. You can do so after rolling but before the outcome is determined.',
      },
    ],
  },
  {
    key: 'valor',
    name: 'College of Valor',
    classKey: 'bard',
    system: 'dnd5e-2014',
    description: 'Skalds who fight in the front line — martial training, inspiration that also defends and strikes, and spellcasting woven into a swing.',
    features: [
      {
        level: 3,
        name: 'Bonus Proficiencies',
        body: 'You gain proficiency with **medium armor, Shields, and martial weapons**.',
      },
      {
        level: 3,
        name: 'Combat Inspiration',
        body:
          'A creature holding one of your **Bardic Inspiration dice** can use it to add to a **weapon damage roll**, or, as a Reaction when hit by an attack, to **add it to its AC** against that attack.',
      },
      {
        level: 6,
        name: 'Extra Attack',
        body: 'You can attack **twice**, instead of once, whenever you take the **Attack action** on your turn.',
      },
      {
        level: 14,
        name: 'Battle Magic',
        body: 'When you use your **Action to cast a Bard spell**, you can make **one weapon attack as a Bonus Action**.',
      },
    ],
  },
];
