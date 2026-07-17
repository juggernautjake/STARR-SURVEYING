// lib/dnd/classes/dnd5e-2014/monk.ts — Monk, 2014 Player's Handbook.
//
// 2014 tells vs 2024: the resource is "Ki" (2024 renamed it "Focus"), subclass ("Monastic Tradition")
// at 3 with features at 3/6/11/17, ASI at 19 (no Epic Boon), and the three PHB traditions only. Ki
// points equal your Monk level from level 2; Martial Arts and Unarmored Movement scale on their own
// tracks (described in the feature bodies).
import type { ClassDefinition, SubclassDefinition } from '../types';

export const MONK_2014: ClassDefinition = {
  key: 'monk',
  name: 'Monk',
  system: 'dnd5e-2014',
  hitDie: 8,
  primaryAbility: ['dex', 'wis'],
  savingThrows: ['str', 'dex'],
  skillChoices: {
    count: 2,
    from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'],
  },
  armorProficiencies: [],
  weaponProficiencies: ['Simple weapons', 'Shortswords'],
  toolProficiencies: ['One type of artisan\'s tools or one musical instrument of your choice'],
  asiLevels: [4, 8, 12, 16, 19],
  subclassLevel: 3,
  subclassLabel: 'Monastic Tradition',
  description:
    'A master of martial arts, harnessing the power of the body in pursuit of physical and spiritual perfection — striking with unarmed flurries and channeling ki to accomplish the extraordinary.',
  startingEquipment: [
    'A shortsword, or any simple weapon',
    'A Dungeoneer\'s Pack, or an Explorer\'s Pack',
    '10 darts',
  ],
  resources: [
    {
      id: 'ki',
      name: 'Ki',
      // Ki points equal your Monk level, starting at level 2.
      perLevel: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      resetOn: 'short',
      note: 'You regain all expended Ki when you finish a Short or Long Rest.',
    },
  ],
  features: [
    {
      level: 1,
      name: 'Unarmored Defense',
      body: 'While you are wearing **no armor and not wielding a Shield**, your Armor Class equals **10 + your Dexterity modifier + your Wisdom modifier**.',
    },
    {
      level: 1,
      name: 'Martial Arts',
      body:
        'Your practice grants you mastery of combat styles that use unarmed strikes and Monk weapons (Shortswords and any Simple melee weapon that lacks the Two-Handed or Heavy property). While unarmored and not wielding a Shield you gain:\n· **Dexterity for attacks** — you can use Dexterity instead of Strength for the attack and damage rolls of your unarmed strikes and Monk weapons.\n· **Martial Arts die** — you can roll a **d4** in place of the normal damage; it grows to **d6 at level 5, d8 at level 11, and d10 at level 17**.\n· **Bonus unarmed strike** — when you take the Attack action with an unarmed strike or a Monk weapon, you can make **one unarmed strike as a Bonus Action**.',
    },
    {
      level: 2,
      name: 'Ki',
      body:
        'You harness the mystic energy of **ki**. You have a number of **Ki points equal to your Monk level**. You spend them to fuel features; you regain all of them on a **Short or Long Rest**. The save DC for your ki features = **8 + your proficiency bonus + your Wisdom modifier**. Starting features:\n· **Flurry of Blows** — immediately after you take the Attack action, spend 1 ki to make **two unarmed strikes as a Bonus Action**.\n· **Patient Defense** — spend 1 ki to take the **Dodge** action as a Bonus Action.\n· **Step of the Wind** — spend 1 ki to take the **Disengage or Dash** action as a Bonus Action, and your jump distance is doubled for the turn.',
    },
    {
      level: 2,
      name: 'Unarmored Movement',
      body:
        'Your **Speed increases by 10 feet** while you are not wearing armor or wielding a Shield. It increases further as you level: **+15 at 6**, **+20 at 10**, **+25 at 14**, and **+30 at 18**.\n\nAt **level 9**, you can move along **vertical surfaces and across liquids** on your turn without falling during the move.',
    },
    {
      level: 3,
      name: 'Monastic Tradition',
      body:
        'You commit to a tradition — **Way of the Open Hand**, **Way of Shadow**, or **Way of the Four Elements**.\n\nYour choice grants features at level 3 and again at levels **6, 11, and 17**.',
      choice: 'subclass',
    },
    {
      level: 3,
      name: 'Deflect Missiles',
      body:
        'You can use your **Reaction to deflect or catch a ranged weapon attack** when you are hit by one, reducing its damage by **1d10 + your Dexterity modifier + your Monk level**. If you reduce the damage to 0 and have a free hand, you can spend **1 ki to make a ranged attack** with the caught missile as part of the same Reaction.',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 4,
      name: 'Slow Fall',
      body: 'You can use your **Reaction when you fall** to reduce the falling damage you take by an amount equal to **five times your Monk level**.',
    },
    {
      level: 5,
      name: 'Extra Attack',
      body: 'You can attack **twice**, instead of once, whenever you take the **Attack action** on your turn.',
    },
    {
      level: 5,
      name: 'Stunning Strike',
      body:
        'When you hit a creature with a melee weapon attack, you can spend **1 ki** to attempt a stunning strike. The target must succeed on a **Constitution saving throw** or be **Stunned until the end of your next turn**.',
    },
    {
      level: 6,
      name: 'Ki-Empowered Strikes',
      body: 'Your unarmed strikes count as **magical** for the purpose of overcoming Resistance and Immunity to nonmagical attacks and damage.',
    },
    { level: 7, name: 'Evasion', body: 'When you make a Dexterity saving throw to take half damage, you instead take **no damage on a success** and **half on a failure**.' },
    {
      level: 7,
      name: 'Stillness of Mind',
      body: 'You can use your **Action to end one effect on yourself that is causing you to be Charmed or Frightened**.',
    },
    { level: 8, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 10,
      name: 'Purity of Body',
      body: 'Your mastery of ki makes you **immune to disease and poison**.',
    },
    { level: 12, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 13,
      name: 'Tongue of the Sun and Moon',
      body: 'You can **understand all spoken languages**, and any creature that can understand a language can understand what you say.',
    },
    {
      level: 14,
      name: 'Diamond Soul',
      body:
        'You gain **proficiency in all saving throws**. In addition, whenever you fail a saving throw you can spend **1 ki to reroll it** and take the new result.',
    },
    { level: 16, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 15,
      name: 'Timeless Body',
      body: 'Ki sustains you: you can no longer be aged magically, you **need no food or water**, and you suffer none of the frailty of old age.',
    },
    {
      level: 18,
      name: 'Empty Body',
      body:
        'You can use your **Action to spend 4 ki** and become **Invisible for 1 minute**, during which you also have **Resistance to all damage except Force**.\n\nAdditionally, you can spend **8 ki** to cast **Astral Projection** (targeting only yourself) without material components.',
    },
    { level: 19, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 20,
      name: 'Perfect Self',
      body: 'When you **roll initiative** and have no Ki points remaining, you regain **4 Ki points**.',
    },
  ],
};

export const MONK_SUBCLASSES_2014: SubclassDefinition[] = [
  {
    key: 'open-hand',
    name: 'Way of the Open Hand',
    classKey: 'monk',
    system: 'dnd5e-2014',
    description: 'The pinnacle of unarmed combat — a Flurry that shoves, trips, and denies reactions, and a strike that can stop a heart.',
    features: [
      {
        level: 3,
        name: 'Open Hand Technique',
        body:
          'Whenever you hit a creature with one of the attacks granted by your **Flurry of Blows**, you can impose one of the following (the target must be able to be affected):\n· It must succeed on a **Dexterity save** or be knocked **Prone**.\n· It must succeed on a **Strength save** or be **pushed 15 feet** away from you.\n· It **cannot take Reactions** until the end of your next turn.',
      },
      {
        level: 6,
        name: 'Wholeness of Body',
        body: 'As an **Action**, you can regain Hit Points equal to **three times your Monk level**. Once you use this, you cannot again until you finish a **Long Rest**.',
      },
      {
        level: 11,
        name: 'Tranquility',
        body:
          'At the end of a **Long Rest**, you gain the effect of a **Sanctuary** spell (save DC = 8 + your Wisdom modifier + your proficiency bonus) that lasts until the start of your next Long Rest, ending early if you attack or cast a spell that affects an enemy.',
      },
      {
        level: 17,
        name: 'Quivering Palm',
        body:
          'When you hit a creature with an unarmed strike, you can spend **3 ki** to start imperceptible vibrations that last a number of days equal to your Monk level. As an Action you can end them, forcing a **Constitution save**: on a failure the creature drops to **0 Hit Points**; on a success it takes **10d10 Necrotic damage**. You can have vibrations in only one creature at a time.',
      },
    ],
  },
  {
    key: 'shadow',
    name: 'Way of Shadow',
    classKey: 'monk',
    system: 'dnd5e-2014',
    description: 'A ninja of gloom — bending darkness with ki, stepping between shadows, and striking from concealment.',
    features: [
      {
        level: 3,
        name: 'Shadow Arts',
        body:
          'You can spend **2 ki** as an Action to cast **Darkness, Darkvision, Pass without Trace, or Silence** without material components. You also learn the **Minor Illusion** cantrip, using Wisdom as your spellcasting ability.',
      },
      {
        level: 6,
        name: 'Shadow Step',
        body: 'When you are in **Dim Light or Darkness**, you can use a **Bonus Action to teleport up to 60 feet** to an unoccupied space you can see that is also in Dim Light or Darkness. You then have **Advantage on the first melee attack** you make before the end of the turn.',
      },
      {
        level: 11,
        name: 'Cloak of Shadows',
        body: 'When you are in **Dim Light or Darkness**, you can use an **Action to become Invisible**. You remain so until you make an attack, cast a spell, or are in an area of Bright Light.',
      },
      {
        level: 17,
        name: 'Opportunist',
        body: 'When a creature within 5 feet of you is hit by an attack made by a creature other than you, you can use your **Reaction to make one melee attack** against that creature.',
      },
    ],
  },
  {
    key: 'four-elements',
    name: 'Way of the Four Elements',
    classKey: 'monk',
    system: 'dnd5e-2014',
    description: 'A monk who bends the elements through ki — hurling flame, riding the wind, and shaping stone and water.',
    features: [
      {
        level: 3,
        name: 'Disciple of the Elements',
        body:
          'You learn magical disciplines that harness the elements. You know the **Elemental Attunement** discipline plus **one** other of your choice (such as Fangs of the Fire Snake or Water Whip); you learn more at levels 6, 11, and 17, for **five** total.\n\nMany disciplines let you spend **ki to cast a spell** — its cost is listed with the discipline, and you can spend extra ki to raise its level, up to a maximum ki spend of **your proficiency bonus + 1** (or as the discipline allows). Wisdom is your spellcasting ability, and the save DC = 8 + your Wisdom modifier + your proficiency bonus.',
      },
      {
        level: 6,
        name: 'Additional Elemental Discipline',
        body: 'You learn **one additional elemental discipline** of your choice, and the maximum ki you can spend to boost a discipline\'s spell increases as you gain levels.',
      },
      {
        level: 11,
        name: 'Additional Elemental Discipline',
        body: 'You learn **one additional elemental discipline** of your choice.',
      },
      {
        level: 17,
        name: 'Additional Elemental Discipline',
        body: 'You learn **one additional elemental discipline** of your choice, for five total.',
      },
    ],
  },
];
