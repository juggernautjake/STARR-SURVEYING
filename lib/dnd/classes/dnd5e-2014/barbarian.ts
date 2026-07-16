// lib/dnd/classes/dnd5e-2014/barbarian.ts — Barbarian, 2014 Player's Handbook.
//
// The 2014 edition, kept deliberately distinct from the 2024 one (Ground Rule 2 — editions are
// different systems). The 2014 tells: subclass ("Primal Path") at 3 but only Berserker + Totem
// Warrior in the PHB; NO Weapon Mastery; Brutal Critical (extra crit dice) where 2024 has Brutal
// Strike; an ASI at 19 rather than an Epic Boon; Rage becomes UNLIMITED at 20; and Primal Champion
// raises the STR/CON cap to 24, not 25.
import type { ClassDefinition, SubclassDefinition } from '../types';

export const BARBARIAN_2014: ClassDefinition = {
  key: 'barbarian',
  name: 'Barbarian',
  system: 'dnd5e-2014',
  hitDie: 12,
  primaryAbility: ['str'],
  savingThrows: ['str', 'con'],
  skillChoices: {
    count: 2,
    from: ['animal', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
  },
  armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
  weaponProficiencies: ['Simple weapons', 'Martial weapons'],
  // 2014 grants an ASI at 19 (the 2024 book replaced that slot with an Epic Boon).
  asiLevels: [4, 8, 12, 16, 19],
  subclassLevel: 3,
  subclassLabel: 'Primal Path',
  description:
    'A fierce warrior of primitive background who can enter a battle rage, drawing on a deep well of fury to strike harder, shrug off wounds, and outlast any foe.',
  startingEquipment: [
    'A greataxe, or any martial melee weapon',
    'Two handaxes, or any simple weapon',
    'An Explorer\'s Pack and four javelins',
  ],
  resources: [
    {
      id: 'rage',
      name: 'Rage',
      // Index 0 unused. 2 at 1–2, 3 at 3–5, 4 at 6–11, 5 at 12–16, 6 at 17–19, UNLIMITED (-1) at 20.
      perLevel: [0, 2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, -1],
      resetOn: 'long',
      note: 'You regain all expended uses of Rage when you finish a Long Rest. At level 20 your Rage uses are unlimited.',
    },
  ],
  features: [
    {
      level: 1,
      name: 'Rage',
      body:
        'On your turn you can enter a Rage as a **Bonus Action**, provided you are not wearing Heavy armor. It lasts for **1 minute**.\n\nWhile raging you gain:\n· **Melee Damage Bonus** — when you make a melee weapon attack using Strength, you deal bonus damage: **+2**, rising to **+3 at level 9** and **+4 at level 16**.\n· **Damage Resistance** — Bludgeoning, Piercing, and Slashing damage.\n· **Strength Advantage** — Advantage on Strength checks and Strength saving throws.\n· **No Spells** — you cannot cast or concentrate on spells.\n\nYour Rage ends early if your turn ends and you have not **attacked a hostile creature** since your last turn or taken damage since then, or if you fall Unconscious. You can also end it on your turn as a Bonus Action.\n\nYou can enter a Rage a limited number of times (see the Rage table); you regain all expended uses on a **Long Rest**.',
    },
    {
      level: 1,
      name: 'Unarmored Defense',
      body:
        'While you are **not wearing any armor**, your Armor Class equals **10 + your Dexterity modifier + your Constitution modifier**.\n\nYou can use a Shield and still gain this benefit.',
    },
    {
      level: 2,
      name: 'Reckless Attack',
      body:
        'When you make your **first attack on your turn**, you can decide to attack recklessly.\n\nDoing so gives you **Advantage on melee weapon attack rolls using Strength** during this turn, but **attack rolls against you have Advantage** until your next turn.',
    },
    {
      level: 2,
      name: 'Danger Sense',
      body:
        'You have **Advantage on Dexterity saving throws** against effects that you can see, such as traps and spells.\n\nTo gain this benefit you cannot be Blinded, Deafened, or Incapacitated.',
    },
    {
      level: 3,
      name: 'Primal Path',
      body:
        'You choose a path that shapes the nature of your rage — the **Path of the Berserker** or the **Path of the Totem Warrior**.\n\nYour choice grants features at level 3 and again at levels **6, 10, and 14**.',
      choice: 'subclass',
    },
    {
      level: 4,
      name: 'Ability Score Improvement',
      body:
        'You can increase one ability score by **2**, or two ability scores by **1** each (to a maximum of 20), or take a **feat**.',
      choice: 'asi',
    },
    {
      level: 5,
      name: 'Extra Attack',
      body: 'You can attack **twice**, instead of once, whenever you take the **Attack action** on your turn.',
    },
    {
      level: 5,
      name: 'Fast Movement',
      body: 'Your **Speed increases by 10 feet** while you are not wearing Heavy armor.',
    },
    {
      level: 7,
      name: 'Feral Instinct',
      body:
        'Your instincts are so honed that you have **Advantage on Initiative rolls**.\n\nAdditionally, if you are Surprised at the start of combat and are not Incapacitated, you can act normally on your first turn — but only if you **enter your Rage** before doing anything else on that turn.',
    },
    {
      level: 9,
      name: 'Brutal Critical',
      body:
        'You can roll **one additional weapon damage die** when determining the extra damage for a **critical hit** with a melee attack.\n\nThis increases to **two additional dice at level 13** and **three additional dice at level 17**.',
    },
    {
      level: 11,
      name: 'Relentless Rage',
      body:
        'If you drop to **0 Hit Points while raging** and do not die outright, you can make a **DC 10 Constitution saving throw**. If you succeed, you drop to **1 Hit Point** instead.\n\nEach time you use this feature after the first, the **DC increases by 5**. The DC resets to 10 when you finish a Short Rest or a Long Rest.',
    },
    {
      level: 15,
      name: 'Persistent Rage',
      body:
        'Your Rage is so fierce that it ends early only if you fall **Unconscious** or if you **choose to end it**.',
    },
    {
      level: 18,
      name: 'Indomitable Might',
      body:
        'If your total for a **Strength check** is less than your **Strength score**, you can use that score in place of the total.',
    },
    {
      level: 20,
      name: 'Primal Champion',
      body:
        'You embody primal power. Your **Strength and Constitution scores increase by 4**, and their **maximum becomes 24**.',
    },
  ],
};

export const BARBARIAN_SUBCLASSES_2014: SubclassDefinition[] = [
  {
    key: 'berserker',
    name: 'Path of the Berserker',
    classKey: 'barbarian',
    system: 'dnd5e-2014',
    description: 'Rage as pure unbridled violence — a frenzy that piles on attacks, at the cost of your own endurance.',
    features: [
      {
        level: 3,
        name: 'Frenzy',
        body:
          'You can go into a **frenzy** when you rage. If you do, for the duration of your Rage you can make a **single melee weapon attack as a Bonus Action** on each of your turns after this one.\n\nWhen your Rage ends, you suffer **one level of Exhaustion** for having frenzied.',
      },
      {
        level: 6,
        name: 'Mindless Rage',
        body: 'You cannot be **Charmed or Frightened** while raging. If you are Charmed or Frightened when you enter your Rage, the effect is **suspended** for the duration of the Rage.',
      },
      {
        level: 10,
        name: 'Intimidating Presence',
        body:
          'As an **Action**, you can frighten a creature within **30 feet** that can see or hear you. It must succeed on a **Wisdom saving throw** (DC = 8 + your proficiency bonus + your Charisma modifier) or be **Frightened** of you until the end of your next turn.\n\nOn subsequent turns you can use your **Action** to extend the Frightened condition until the end of your next turn. The effect ends if the creature ends its turn out of line of sight or more than 60 feet away.\n\nIf the creature succeeds on its save, you cannot use this feature on it again for **24 hours**.',
      },
      {
        level: 14,
        name: 'Retaliation',
        body: 'When you take damage from a creature that is **within 5 feet** of you, you can use your **Reaction** to make a melee weapon attack against that creature.',
      },
    ],
  },
  {
    key: 'totem-warrior',
    name: 'Path of the Totem Warrior',
    classKey: 'barbarian',
    system: 'dnd5e-2014',
    description: 'A bond with an animal spirit — bear, eagle, or wolf — that lends its resilience, swiftness, or cunning to your rage.',
    features: [
      {
        level: 3,
        name: 'Spirit Seeker',
        body: 'You gain the ability to cast the **Beast Sense** and **Speak with Animals** spells, but only as **Rituals**.',
      },
      {
        level: 3,
        name: 'Totem Spirit',
        body:
          'Choose a totem animal and gain its feature. You must make or acquire a physical totem — an object bearing fur, feathers, claws, teeth, or bones of the animal.\n· **Bear** — while raging, you have **Resistance to all damage except Psychic**. The bear spirit makes you tough enough to withstand any punishment.\n· **Eagle** — while raging and not wearing Heavy armor, other creatures have **Disadvantage on Opportunity Attacks** against you, and you can use the **Dash** action as a Bonus Action.\n· **Wolf** — while raging, your allies have **Advantage on melee attack rolls** against any creature within 5 feet of you that is hostile to you.',
      },
      {
        level: 6,
        name: 'Aspect of the Beast',
        body:
          'You gain a magical benefit based on a totem animal of your choice (need not match your level-3 choice).\n· **Bear** — you count as one size larger for **carrying capacity** and lift/push/drag limits.\n· **Eagle** — you have **darkvision-sharp sight**: you can see up to 1 mile with no difficulty discerning fine detail, and Dim Light does not impose Disadvantage on Wisdom (Perception) checks.\n· **Wolf** — you can track creatures at a fast pace and move stealthily at a normal pace.',
      },
      {
        level: 10,
        name: 'Spirit Walker',
        body: 'You can cast the **Commune with Nature** spell, but only as a **Ritual**. When you do, a spiritual version of one of the animals you chose appears to convey the information you seek.',
      },
      {
        level: 14,
        name: 'Totemic Attunement',
        body:
          'You gain a magical benefit based on a totem animal of your choice.\n· **Bear** — while raging, any creature within 5 feet that is hostile to you has **Disadvantage on attack rolls** against targets other than you or another creature with this feature.\n· **Eagle** — while raging, you have a **Flying Speed** equal to your current walking speed, provided you are not wearing Heavy armor (you fall if you end your turn airborne with nothing to hold you aloft).\n· **Wolf** — while raging, you can use a **Bonus Action** to knock a Large or smaller creature **Prone** when you hit it with a melee weapon attack.',
      },
    ],
  },
];
