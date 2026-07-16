// lib/dnd/classes/dnd5e-2024/fighter.ts — Fighter, 2024 Player's Handbook.
//
// 2024 shape: Fighting Style is now a FEAT, subclass moves to 3, Weapon Mastery at 1 (three kinds),
// extra ASIs at 6 and 14, and an Epic Boon at 19. Subclass features land at 3, 7, 10, 15, and 18 —
// the Fighter is the only class with five subclass beats.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { THIRD_CASTER_SLOTS } from '../slots';

export const FIGHTER_2024: ClassDefinition = {
  key: 'fighter',
  name: 'Fighter',
  system: 'dnd5e-2024',
  hitDie: 10,
  primaryAbility: ['str', 'dex'],
  savingThrows: ['str', 'con'],
  skillChoices: {
    count: 2,
    from: [
      'acrobatics',
      'animal',
      'athletics',
      'history',
      'insight',
      'intimidation',
      'perception',
      'persuasion',
      'survival',
    ],
  },
  armorProficiencies: ['Light armor', 'Medium armor', 'Heavy armor', 'Shields'],
  weaponProficiencies: ['Simple weapons', 'Martial weapons'],
  asiLevels: [4, 6, 8, 12, 14, 16],
  subclassLevel: 3,
  subclassLabel: 'Martial Archetype',
  description:
    'A master of weapons and armor in every form, defined less by a single trick than by sheer tactical depth — more attacks, more actions, and more ways to refuse to go down.',
  startingEquipment: [
    'Chain Mail, Greatsword, Flail, 8 Javelins, Dungeoneer\'s Pack, and 4 GP',
    'or Studded Leather Armor, Scimitar, Shortsword, Longbow, 20 Arrows, Quiver, Dungeoneer\'s Pack, and 11 GP',
    'or 155 GP',
  ],
  resources: [
    {
      id: 'second-wind',
      name: 'Second Wind',
      // Index 0 unused. 2 at 1–3, 3 at 4–9, 4 at 10–20.
      perLevel: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      resetOn: 'long',
      note: 'You regain one expended use on a Short Rest and all of them on a Long Rest.',
    },
    {
      id: 'action-surge',
      name: 'Action Surge',
      // Index 0 unused. None at 1, one at 2–16, two at 17–20.
      perLevel: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2],
      resetOn: 'short',
    },
    {
      id: 'indomitable',
      name: 'Indomitable',
      // Index 0 unused. None before 9, one at 9–12, two at 13–16, three at 17–20.
      perLevel: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3],
      resetOn: 'long',
    },
  ],
  features: [
    {
      level: 1,
      name: 'Fighting Style',
      body:
        'You gain a **Fighting Style feat** of your choice. In 2024 these are true feats, not a bespoke class list — Archery, Blind Fighting, Defense, Dueling, Great Weapon Fighting, Interception, Protection, Thrown Weapon Fighting, Two-Weapon Fighting, and Unarmed Fighting are the usual options.\n\nWhenever you gain a **Fighter level**, you can **replace** this feat with a different Fighting Style feat.',
      choice: 'fighting-style',
    },
    {
      level: 1,
      name: 'Second Wind',
      body:
        'You have a limited well of stamina you can draw on. As a **Bonus Action**, you regain **1d10 + your Fighter level** Hit Points.\n\nYou have **two** uses. You regain **one** expended use when you finish a **Short Rest** and **all** of them on a **Long Rest**.\n\nThe number of uses rises to **three at level 4** and **four at level 10**.',
    },
    {
      level: 1,
      name: 'Weapon Mastery',
      body:
        'You can use the **mastery property** of **three** kinds of weapons of your choice that you are proficient with — say Longswords (Sap), Longbows (Slow), and Greatswords (Graze).\n\nWhenever you finish a **Long Rest** you can swap one of those choices for a different eligible weapon.\n\nThe number rises with your Fighter level: **4 at level 4**, **5 at level 10**, and **6 at level 16**.',
    },
    {
      level: 2,
      name: 'Action Surge',
      body:
        'On your turn, you can push yourself beyond your normal limits and take **one additional action** — no action required to do so. The extra action can be **anything except the Magic action**.\n\nOnce you use this, you must finish a **Short Rest or a Long Rest** before using it again.\n\nAt **level 17** you gain a **second use**, but you can still only use Action Surge **once on a turn**.',
    },
    {
      level: 2,
      name: 'Tactical Mind',
      body:
        'You have a mind for overcoming obstacles. When you **fail an ability check**, you can **expend a use of Second Wind** to push toward success: roll **1d10** and add it to the check, potentially turning the failure into a success.\n\nIf the check **still fails**, you **do not expend** the use of Second Wind.',
    },
    {
      level: 3,
      name: 'Fighter Subclass',
      body:
        'You choose a **Martial Archetype** — Battle Master, Champion, Eldritch Knight, or Psi Warrior.\n\nThe subclass grants features now and again at Fighter levels **7, 10, 15, and 18**.',
      choice: 'subclass',
    },
    {
      level: 5,
      name: 'Extra Attack',
      body: 'You can attack **twice**, instead of once, whenever you take the **Attack action** on your turn.',
    },
    {
      level: 5,
      name: 'Tactical Shift',
      body:
        'Whenever you activate **Second Wind** with a Bonus Action, you can move up to **half your Speed** without provoking **Opportunity Attacks**.',
    },
    {
      level: 9,
      name: 'Indomitable',
      body:
        'If you **fail a saving throw**, you can reroll it with a **bonus equal to your Fighter level**. You must use the new roll.\n\nOnce you use this, you cannot use it again until you finish a **Long Rest**.\n\nYou gain a **second use at level 13** and a **third at level 17**.',
    },
    {
      level: 9,
      name: 'Tactical Master',
      body:
        'When you attack with a weapon whose **mastery property you can use**, you can **replace** that property with **Push, Sap, or Slow** for that attack.\n\nThis lets a Greatsword shove, or a Longbow slow, regardless of the property printed on the weapon.',
    },
    {
      level: 11,
      name: 'Two Extra Attacks',
      body: 'You can attack **three times**, instead of once, whenever you take the **Attack action** on your turn.',
    },
    {
      level: 13,
      name: 'Studied Attacks',
      body:
        'You study your opponent\'s defences as you fight. If you make an **attack roll against a creature and miss**, you have **Advantage on your next attack roll** against that creature before the end of your **next turn**.',
    },
    {
      level: 19,
      name: 'Epic Boon',
      body:
        'You gain an **Epic Boon feat** or another feat of your choice for which you qualify. **Boon of Combat Prowess** suits the Fighter: when you miss with an attack roll, you can turn that miss into a **hit** once per turn.',
      choice: 'epic-boon',
    },
    {
      level: 20,
      name: 'Three Extra Attacks',
      body: 'You can attack **four times**, instead of once, whenever you take the **Attack action** on your turn.',
    },
  ],
};

export const FIGHTER_SUBCLASSES_2024: SubclassDefinition[] = [
  {
    key: 'battle-master',
    name: 'Battle Master',
    classKey: 'fighter',
    system: 'dnd5e-2024',
    description: 'A student of the science of battle, spending Superiority Dice on manoeuvres that trip, goad, parry, and command.',
    features: [
      {
        level: 3,
        name: 'Combat Superiority',
        body:
          'You learn manoeuvres fuelled by **Superiority Dice**.\n\n· **Manoeuvres** — you learn **three** of your choice (Trip Attack, Riposte, Precision Attack, Menacing Attack, Goading Attack, Parry, Sweeping Attack, Disarming Attack, Rally, Ambush, and so on). You learn **two more at Fighter levels 7, 10, and 15** (nine total). You can swap one known manoeuvre for another whenever you gain a Fighter level.\n· **Superiority Dice** — you have **four d8s**. A die is expended when you use it and you regain all of them when you finish a **Short Rest or a Long Rest**. You gain a **fifth die at level 7** and a **sixth at level 15**.\n· **Save DC** — when a manoeuvre requires a saving throw, the DC is **8 + your Proficiency Bonus + your Strength or Dexterity modifier** (your choice).\n\nYou can use only **one manoeuvre per attack**.',
      },
      {
        level: 3,
        name: 'Student of War',
        body:
          'You gain proficiency with **one type of Artisan\'s Tools** of your choice, and proficiency in **one skill** of your choice from the Fighter skill list.',
      },
      {
        level: 7,
        name: 'Know Your Enemy',
        body:
          'As a **Bonus Action**, you can study one creature you can see **within 30 feet**.\n\nYou immediately learn whether it has any **Immunities, Resistances, or Vulnerabilities**, and if so, what they are.\n\nOnce you use this feature, you cannot use it again until you finish a **Short Rest or a Long Rest** — unless you **expend a Superiority Die** to use it again.',
      },
      {
        level: 10,
        name: 'Improved Combat Superiority',
        body: 'Your **Superiority Die becomes a d10**.',
      },
      {
        level: 15,
        name: 'Relentless',
        body:
          '**Once per turn**, when you use a **manoeuvre**, you can roll **1d8** and use the number rolled **instead of expending a Superiority Die**.\n\nThe manoeuvre works exactly as normal; you simply do not pay for it.',
      },
      {
        level: 18,
        name: 'Ultimate Combat Superiority',
        body: 'Your **Superiority Die becomes a d12**.',
      },
    ],
  },
  {
    key: 'champion',
    name: 'Champion',
    classKey: 'fighter',
    system: 'dnd5e-2024',
    description: 'Raw physical excellence: wider crit ranges, a second Fighting Style, and a body that simply refuses to stop.',
    features: [
      {
        level: 3,
        name: 'Improved Critical',
        body:
          'Your attack rolls with **weapons and Unarmed Strikes** can score a **Critical Hit on a roll of 19 or 20** on the d20.',
      },
      {
        level: 3,
        name: 'Remarkable Athlete',
        body:
          'You have **Advantage on Initiative rolls** and on **Strength (Athletics) checks**.\n\nIn addition, immediately after you score a **Critical Hit**, you can move up to **half your Speed** without provoking **Opportunity Attacks**.',
      },
      {
        level: 7,
        name: 'Additional Fighting Style',
        body:
          'You gain **another Fighting Style feat** of your choice.\n\nAs with your first, you can replace it with a different Fighting Style feat whenever you gain a Fighter level.',
        choice: 'fighting-style',
      },
      {
        level: 10,
        name: 'Heroic Warrior',
        body:
          'During combat, you can give yourself **Heroic Inspiration** whenever you **start your turn without it**.\n\nHeroic Inspiration lets you reroll any d20 once and take the new roll.',
      },
      {
        level: 15,
        name: 'Superior Critical',
        body: 'Your attack rolls with **weapons and Unarmed Strikes** now score a **Critical Hit on a roll of 18–20** on the d20.',
      },
      {
        level: 18,
        name: 'Survivor',
        body:
          'You gain two benefits:\n· **Defy Death** — you have **Advantage on Death Saving Throws**, and a roll of **18–20 counts as a 20** on them (regaining 1 Hit Point).\n· **Heroic Rally** — at the **start of each of your turns**, you regain Hit Points equal to **5 + your Constitution modifier** if you are **Bloodied** (at or below half your Hit Point maximum).',
      },
    ],
  },
  {
    key: 'eldritch-knight',
    name: 'Eldritch Knight',
    classKey: 'fighter',
    system: 'dnd5e-2024',
    description: 'A warrior who braids Wizard magic into swordplay — bonded blades, cantrips mid-swing, and spells that land harder after a hit.',
    features: [
      {
        level: 3,
        name: 'Spellcasting',
        body:
          'You have learned to cast spells from the **Wizard spell list**. **Intelligence** is your spellcasting ability, and your spell save DC is **8 + your Intelligence modifier + your Proficiency Bonus**.\n\n· **Cantrips** — you know **two** Wizard cantrips of your choice, and a **third at Fighter level 10**. Whenever you gain a Fighter level you can replace one with another Wizard cantrip.\n· **Prepared spells** — you start with **three** level 1 Wizard spells prepared, rising to **13 by level 20**. You can change one prepared spell whenever you finish a Long Rest.\n· **Slots** — you use the **third-caster** table: your first slot arrives at level 3 and your spells cap at **rank 4** (a single rank-4 slot from level 19).\n\nUnlike the 2014 version, you are **not restricted to Abjuration and Evocation** — any Wizard spell of a rank you have slots for is fair game.',
      },
      {
        level: 3,
        name: 'War Bond',
        body:
          'You learn a ritual that bonds you to a weapon. Performing it takes **1 hour**, which can be done during a **Short Rest**; the weapon must stay within your reach throughout, and you touch it at the end to forge the bond.\n\nOnce bonded, you **cannot be disarmed** of that weapon unless you have the **Incapacitated** condition. If it is on the same plane of existence, you can **summon it as a Bonus Action**, teleporting it into your hand.\n\nYou can have **two bonded weapons** at once but can summon only **one at a time**. Bonding a third breaks the bond with one of the others.',
      },
      {
        level: 7,
        name: 'War Magic',
        body:
          'When you take the **Attack action** on your turn, you can **replace one of your attacks** with a casting of one of your **Eldritch Knight cantrips** that has a casting time of an action.',
      },
      {
        level: 10,
        name: 'Eldritch Strike',
        body:
          'When you **hit a creature with a weapon attack**, that creature has **Disadvantage on the next saving throw** it makes against a **spell you cast** before the end of your next turn.',
      },
      {
        level: 15,
        name: 'Arcane Charge',
        body:
          'When you use **Action Surge**, you can **teleport up to 30 feet** to an unoccupied space you can see.\n\nYou can teleport **before or after** the additional action.',
      },
      {
        level: 18,
        name: 'Improved War Magic',
        body:
          'When you take the **Attack action** on your turn, you can **replace two of your attacks** with a casting of one of your **level 1 or level 2 Eldritch Knight spells** that has a casting time of an action.',
      },
    ],
  },
  {
    key: 'psi-warrior',
    name: 'Psi Warrior',
    classKey: 'fighter',
    system: 'dnd5e-2024',
    description: 'A fighter who has awakened psionic power — telekinetic shields, force-laced strikes, and objects moved by will alone.',
    features: [
      {
        level: 3,
        name: 'Psionic Power',
        body:
          'You have a pool of **Psionic Energy Dice**, which fuel this subclass. You start with **four d6s**. The pool grows and sharpens with your Fighter level: **six d8s at 5**, **eight d8s at 9**, **eight d10s at 11**, **ten d10s at 13**, and **twelve d12s at 17**.\n\nYou regain **one** expended die when you finish a **Short Rest** and **all** of them on a **Long Rest**.\n\nYou gain three ways to spend them:\n· **Protective Field** — when you or a creature you can see within **30 feet** takes damage, take a **Reaction** to expend one die and **reduce the damage** by the roll + your **Intelligence modifier** (minimum 0).\n· **Psionic Strike** — **once per turn**, right after you hit a target within **30 feet** with a weapon and deal damage, expend one die to deal extra **Force damage** equal to the roll + your Intelligence modifier.\n· **Telekinetic Movement** — as a **Magic action**, move one **Large or smaller** loose object or **willing creature** (other than yourself) that you can see within 30 feet up to **30 feet** to an unoccupied space you can see. Once you use this, you cannot again until you finish a **Short Rest or a Long Rest** — unless you **expend a Psionic Energy Die**.',
      },
      {
        level: 7,
        name: 'Telekinetic Adept',
        body:
          'You gain two more ways to use your psionics:\n· **Psi-Powered Leap** — as a **Bonus Action**, you gain a **Fly Speed equal to twice your Speed** until the end of the turn. Once you use this, you cannot again until you finish a **Short Rest or a Long Rest** — unless you **expend a Psionic Energy Die**.\n· **Telekinetic Thrust** — when you deal damage with **Psionic Strike**, you can force the target to make a **Strength saving throw** (DC = 8 + your Intelligence modifier + your Proficiency Bonus). On a failure, you either knock it **Prone** or push it up to **10 feet** horizontally.',
      },
      {
        level: 10,
        name: 'Guarded Mind',
        body:
          'You have **Resistance to Psychic damage**.\n\nIn addition, if you **start your turn** with the **Charmed or Frightened** condition, you can **expend one Psionic Energy Die** to end every effect on yourself that is causing those conditions.',
      },
      {
        level: 15,
        name: 'Bulwark of Force',
        body:
          'As a **Bonus Action**, choose yourself or any number of creatures you can see within **30 feet**, up to a total equal to your **Intelligence modifier** (minimum of one creature).\n\nEach chosen creature has **Half Cover** for **1 minute** or until you have the **Incapacitated** condition.\n\nOnce you use this, you cannot again until you finish a **Long Rest** — unless you **expend a Psionic Energy Die**.',
      },
      {
        level: 18,
        name: 'Telekinetic Master',
        body:
          'You always have the **Telekinesis** spell prepared. You can cast it **without a spell slot** and **without material components**, using **Intelligence** as your spellcasting ability.\n\nWhile **concentrating on it**, you can make **one attack with a weapon as a Bonus Action** on each of your turns.\n\nOnce you cast it with this feature, you cannot again until you finish a **Long Rest** — unless you **expend a Psionic Energy Die**.',
      },
    ],
  },
];

// Eldritch Knight uses the shared third-caster table; the subclass-level spellcasting block is
// attached here so a builder can resolve slots for a Fighter/Eldritch Knight without special-casing.
export const ELDRITCH_KNIGHT_SPELLCASTING_2024: NonNullable<ClassDefinition['spellcasting']> = {
  kind: 'third',
  ability: 'int',
  preparedRule:
    'Prepared spells are fixed by the Eldritch Knight Spellcasting table (3 at Fighter level 3 rising to 13 at level 20), chosen from the Wizard spell list. Swap one on a Long Rest.',
  // Index 1..20. Two Wizard cantrips from level 3, a third from level 10.
  cantripsKnown: [0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  slots: THIRD_CASTER_SLOTS,
  // Index 1..20 — the "Prepared Spells" column, not a known-spells list.
  spellsKnown: [0, 0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13],
};
