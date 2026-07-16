// lib/dnd/classes/dnd5e-2024/barbarian.ts — Barbarian, 2024 Player's Handbook.
//
// 2024 shape: subclass at 3, Weapon Mastery at 1, Epic Boon (not an ASI) at 19, and Rage capped at
// six uses at level 17 rather than the 2014 "unlimited".
import type { ClassDefinition, SubclassDefinition } from '../types';

export const BARBARIAN_2024: ClassDefinition = {
  key: 'barbarian',
  name: 'Barbarian',
  system: 'dnd5e-2024',
  hitDie: 12,
  primaryAbility: ['str'],
  savingThrows: ['str', 'con'],
  skillChoices: {
    count: 2,
    from: ['animal', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
  },
  armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
  weaponProficiencies: ['Simple weapons', 'Martial weapons'],
  asiLevels: [4, 8, 12, 16],
  subclassLevel: 3,
  subclassLabel: 'Primal Path',
  description:
    'A ferocious warrior who channels a wellspring of primal fury, shrugging off blows that would fell anyone else and answering them with overwhelming violence.',
  startingEquipment: [
    'Greataxe, 4 Handaxes, Explorer\'s Pack, and 15 GP',
    'or 75 GP',
  ],
  resources: [
    {
      id: 'rage',
      name: 'Rage',
      // Index 0 unused. 2 at 1–2, 3 at 3–5, 4 at 6–11, 5 at 12–16, 6 at 17–20.
      perLevel: [0, 2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6],
      resetOn: 'long',
      note: 'You regain one expended use on a Short Rest and all of them on a Long Rest.',
    },
  ],
  features: [
    {
      level: 1,
      name: 'Rage',
      body:
        'As a **Bonus Action** you enter a Rage, provided you are not wearing Heavy armor and have a use left. It lasts **10 minutes**.\n\nWhile raging you gain:\n· **Damage Resistance** — Bludgeoning, Piercing, and Slashing damage.\n· **Rage Damage** — a bonus to damage on Strength-based attacks: **+2**, rising to **+3 at level 9** and **+4 at level 16**.\n· **Strength Advantage** — Advantage on Strength checks and Strength saving throws.\n· **No Concentration or Spells** — you cannot cast spells or maintain Concentration.\n\nThe Rage ends early if you have the Unconscious condition, if you don Heavy armor, or if you end it (no action required). To keep it going you must, each round, either make an attack roll against an enemy, force an enemy to make a saving throw, or spend a Bonus Action to extend it — otherwise it ends at the end of your turn.\n\nYou regain **one** expended use of Rage on a Short Rest and **all** of them on a Long Rest.',
    },
    {
      level: 1,
      name: 'Unarmored Defense',
      body:
        'While you are wearing **no armor**, your base Armor Class equals **10 + your Dexterity modifier + your Constitution modifier**.\n\nA Shield does not interfere — you can hold one and still benefit.',
    },
    {
      level: 1,
      name: 'Weapon Mastery',
      body:
        'You can use the **mastery property** of **two** kinds of Simple or Martial melee weapons of your choice that you are proficient with — say Greataxes (Cleave) and Handaxes (Vex).\n\nWhenever you finish a **Long Rest** you can swap either choice for a different eligible weapon.\n\nThe number of weapons rises with your Barbarian level: **3 at level 4** and **4 at level 10**.',
    },
    {
      level: 2,
      name: 'Danger Sense',
      body:
        'You have **Advantage on Dexterity saving throws** unless you have the Incapacitated condition.\n\nThis is an instinct for danger, not foresight: it applies only to effects you can perceive, such as a trap springing or a visible spell.',
    },
    {
      level: 2,
      name: 'Reckless Attack',
      body:
        'When you make your **first attack roll on your turn**, you can decide to throw caution aside — no action required.\n\nDoing so gives you **Advantage on Strength-based attack rolls** for the rest of the turn, but **attack rolls against you have Advantage** until the start of your next turn.',
    },
    {
      level: 3,
      name: 'Barbarian Subclass',
      body:
        'You choose a **Primal Path** — Path of the Berserker, Path of the Wild Heart, Path of the World Tree, or Path of the Zealot.\n\nThe subclass grants features now and again at Barbarian levels **6, 10, and 14**.',
      choice: 'subclass',
    },
    {
      level: 3,
      name: 'Primal Knowledge',
      body:
        'You gain proficiency in **one more skill** from the Barbarian skill list.\n\nIn addition, while your **Rage is active**, you can channel raw primal power into tasks that normally call for finesse or wits. Whenever you make an ability check using **Acrobatics, Intimidation, Perception, Stealth, or Survival**, you can make it as a **Strength check** instead of using that skill\'s normal ability.',
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
      body: 'Your instincts are so honed that you have **Advantage on Initiative rolls**.',
    },
    {
      level: 7,
      name: 'Instinctive Pounce',
      body:
        'As part of the **Bonus Action you take to enter your Rage**, you can move up to **half your Speed**.\n\nThis movement is part of activating Rage, so it costs you nothing beyond the Bonus Action you were already spending.',
    },
    {
      level: 9,
      name: 'Brutal Strike',
      body:
        'If you use **Reckless Attack**, you can **forgo the Advantage** on one Strength-based attack roll of your choice on your turn. That attack is a **Brutal Strike**.\n\nOn a hit, it deals an extra **1d10 damage** of the same type as the weapon or Unarmed Strike, and you cause **one** of the following effects:\n· **Forceful Blow** — the target is pushed **15 feet** straight away from you. You can then move up to **half your Speed** toward it without provoking Opportunity Attacks.\n· **Hamstring Blow** — the target\'s **Speed is reduced by 15 feet** until the start of your next turn. This does not stack with itself.\n\nYou can use only one Brutal Strike per turn.',
    },
    {
      level: 11,
      name: 'Relentless Rage',
      body:
        'If you drop to **0 Hit Points while your Rage is active** and do not die outright, you can make a **DC 10 Constitution saving throw**.\n\nOn a success, your Hit Points instead change to **twice your Barbarian level**.\n\nEach time you use this feature after the first, the **DC increases by 5**. The DC resets to 10 when you finish a Short Rest or a Long Rest.',
    },
    {
      level: 13,
      name: 'Improved Brutal Strike',
      body:
        'You have honed new ways to hurt. The following are now among your **Brutal Strike** options:\n· **Staggering Blow** — the target has **Disadvantage on the next saving throw** it makes, and it cannot make **Opportunity Attacks** until the start of your next turn.\n· **Sundering Blow** — the next attack roll made **by another creature** against the target before the start of your next turn gains a **+5 bonus**. Only one attacker can benefit from a given Sundering Blow, and that attacker chooses to use it.',
    },
    {
      level: 15,
      name: 'Persistent Rage',
      body:
        'When you **roll Initiative**, you can **regain all expended uses of Rage**. Once you do, you cannot again until you finish a Long Rest.\n\nIn addition, your Rage is now so fierce that it lasts **10 minutes without you doing anything to maintain it** round to round. It ends early only if you have the **Unconscious** condition, you don **Heavy armor**, or you choose to end it.',
    },
    {
      level: 17,
      name: 'Improved Brutal Strike',
      body:
        'Your **Brutal Strike** damage increases to **2d10**.\n\nIn addition, whenever you use Brutal Strike, you can apply **two different** Brutal Strike effects instead of one.',
    },
    {
      level: 18,
      name: 'Indomitable Might',
      body:
        'If your total for a **Strength check** is less than your **Strength score**, you can use that score in place of the total.\n\nWith a Strength of 20, for instance, no Strength check you make can total less than 20.',
    },
    {
      level: 19,
      name: 'Epic Boon',
      body:
        'You gain an **Epic Boon feat** or another feat of your choice for which you qualify. **Boon of Irresistible Offense** is thematically apt: it raises your Strength by 1 (to a maximum of 30) and lets your attacks ignore the target\'s Resistance to one damage type.',
      choice: 'epic-boon',
    },
    {
      level: 20,
      name: 'Primal Champion',
      body:
        'You embody primal power. Your **Strength and Constitution scores each increase by 4**, and the maximum for those two scores becomes **25**.',
    },
  ],
};

export const BARBARIAN_SUBCLASSES_2024: SubclassDefinition[] = [
  {
    key: 'berserker',
    name: 'Path of the Berserker',
    classKey: 'barbarian',
    system: 'dnd5e-2024',
    description: 'Rage as unfiltered violence — a frenzy that piles on damage and a presence that terrifies.',
    features: [
      {
        level: 3,
        name: 'Frenzy',
        body:
          'While your **Rage is active**, if you use **Reckless Attack** you deal extra damage to the **first creature you hit on your turn** with a Strength-based attack.\n\nRoll a number of **d6s equal to your Rage Damage bonus** (so 2d6, rising to 3d6 at level 9 and 4d6 at level 16) and add them together. The extra damage is the same type as the weapon or Unarmed Strike.',
      },
      {
        level: 6,
        name: 'Mindless Rage',
        body:
          'You have **Immunity to the Charmed and Frightened conditions** while your Rage is active.\n\nIf you are already Charmed or Frightened when you enter your Rage, those conditions **end** on you immediately.',
      },
      {
        level: 10,
        name: 'Retaliation',
        body:
          'When a creature **within 5 feet of you deals damage to you**, you can take a **Reaction** to make one melee attack against it, using a weapon or an Unarmed Strike.',
      },
      {
        level: 14,
        name: 'Intimidating Presence',
        body:
          'As a **Bonus Action**, you unleash your menace on a **30-foot Emanation**. Each creature of your choice in it must make a **Wisdom saving throw** (DC = 8 + your Strength modifier + your Proficiency Bonus).\n\nOn a failure, the creature has the **Frightened** condition for **1 minute**. It repeats the save at the end of each of its turns, ending the effect on itself on a success.\n\nOnce you use this feature, you cannot use it again until you finish a **Long Rest** — unless you **expend a use of Rage** to use it again.',
      },
    ],
  },
  {
    key: 'wild-heart',
    name: 'Path of the Wild Heart',
    classKey: 'barbarian',
    system: 'dnd5e-2024',
    description: 'A bond with the spirits of beast and wilderness, borrowing their forms and their senses in battle.',
    features: [
      {
        level: 3,
        name: 'Animal Speaker',
        body:
          'You can cast **Beast Sense** and **Speak with Animals**, but only as **Rituals** — the ten-minute ceremony, not a spell slot.\n\n**Wisdom** is your spellcasting ability for them.',
      },
      {
        level: 3,
        name: 'Rage of the Wilds',
        body:
          'Whenever you **enter your Rage**, choose one of the following. It lasts as long as the Rage does.\n· **Bear** — you have **Resistance to every damage type except Force, Necrotic, Psychic, and Radiant**. (This replaces the Rage\'s usual Resistances.)\n· **Eagle** — you can take the **Disengage** and **Dash** actions as part of the Bonus Action that entered the Rage, and you can take a **Bonus Action** on later turns to do so again.\n· **Wolf** — your **allies have Advantage on attack rolls** against enemies within **5 feet of you**.',
      },
      {
        level: 6,
        name: 'Aspect of the Wilds',
        body:
          'Choose one of the following. It is **always on** — no Rage required — and you can change the choice whenever you finish a **Long Rest**.\n· **Owl** — you have **Darkvision** out to **60 feet**. If you already have Darkvision, its range increases by 60 feet.\n· **Panther** — you have a **Climb Speed** equal to your Speed.\n· **Salmon** — you have a **Swim Speed** equal to your Speed.',
      },
      {
        level: 10,
        name: 'Nature Speaker',
        body: 'You can cast **Commune with Nature**, but only as a **Ritual**. **Wisdom** is your spellcasting ability for it.',
      },
      {
        level: 14,
        name: 'Power of the Wilds',
        body:
          'Whenever you **enter your Rage**, choose one of the following in addition to your Rage of the Wilds choice. It lasts as long as the Rage does.\n· **Falcon** — you have a **Fly Speed** equal to your Speed, provided you are not wearing armor.\n· **Lion** — enemies **within 5 feet of you have Disadvantage** on attack rolls against targets other than you or another Barbarian with this feature.\n· **Ram** — you can knock a creature **Prone** when you hit it with a melee attack.',
      },
    ],
  },
  {
    key: 'world-tree',
    name: 'Path of the World Tree',
    classKey: 'barbarian',
    system: 'dnd5e-2024',
    description: 'Rage drawn from Yggdrasil itself — vitality shared with allies, and branches that yank foes across the field.',
    features: [
      {
        level: 3,
        name: 'Vitality of the Tree',
        body:
          'When you **enter your Rage**, you gain **Temporary Hit Points equal to your Barbarian level**.\n\nImmediately after that Bonus Action, and at the **start of each of your turns** while the Rage lasts, you can choose one creature **within 10 feet** of yourself and give it Temporary Hit Points. Roll a number of **d6s equal to your Rage Damage bonus** (2d6, rising to 3d6 at level 9 and 4d6 at level 16); the creature gains that many Temporary Hit Points.',
      },
      {
        level: 6,
        name: 'Branches of the Tree',
        body:
          'While your **Rage is active**, when a creature you can see **starts its turn within 30 feet** of you, you can take a **Reaction** to try to yank it to you with spectral branches.\n\nThe creature must succeed on a **Strength saving throw** (DC = 8 + your Strength modifier + your Proficiency Bonus) or be **teleported** to an unoccupied space you can see **within 5 feet** of yourself.\n\nOn a **successful** save, the creature\'s **Speed is 0** until the end of that turn.',
      },
      {
        level: 10,
        name: 'Battering Roots',
        body:
          'Your **reach is 10 feet greater** with melee weapons that have the **Heavy** or **Versatile** property.\n\nIn addition, when you hit with such a weapon as part of the **Attack action** on your turn, you can use the **Push** or **Topple** mastery property **in addition to** another mastery property you are already using with that weapon.',
      },
      {
        level: 14,
        name: 'Travel along the Tree',
        body:
          'When you **enter your Rage**, and as a **Bonus Action** on later turns while it lasts, you can **teleport up to 60 feet** to an unoccupied space you can see.\n\n**Once per Rage**, you can instead teleport up to **150 feet** and bring up to **six willing creatures** within 10 feet of you along, each arriving in an unoccupied space of your choice within 10 feet of your destination.',
      },
    ],
  },
  {
    key: 'zealot',
    name: 'Path of the Zealot',
    classKey: 'barbarian',
    system: 'dnd5e-2024',
    description: 'A divine champion whose fury is holy — burning with radiant or necrotic force, and hard to keep dead.',
    features: [
      {
        level: 3,
        name: 'Divine Fury',
        body:
          'On each of your turns while your **Rage is active**, the **first creature you hit** with a weapon or an Unarmed Strike takes extra damage equal to **1d6 + half your Barbarian level** (rounded down).\n\nThe damage is **Necrotic or Radiant** — you choose which each time you deal it.',
      },
      {
        level: 3,
        name: 'Warrior of the Gods',
        body:
          'You have a pool of **four d12s** you can spend to heal yourself.\n\nAs a **Bonus Action**, you can expend any number of dice from the pool, roll them, and **regain Hit Points equal to the total**.\n\nThe pool regains all expended dice when you finish a **Long Rest**. It grows to **five dice at Barbarian level 6**, **six at level 12**, and **seven at level 17**.',
      },
      {
        level: 6,
        name: 'Fanatical Focus',
        body:
          '**Once per active Rage**, if you **fail a saving throw**, you can reroll it with a bonus equal to your **Rage Damage bonus** (+2, +3 at level 9, +4 at level 16). You must use the new roll.',
      },
      {
        level: 10,
        name: 'Zealous Presence',
        body:
          'As a **Bonus Action**, you let out a battle cry. Choose up to **ten other creatures within 60 feet** that can hear you.\n\nEach gains **Advantage on attack rolls and saving throws** until the start of your next turn.\n\nOnce you use this feature, you cannot use it again until you finish a **Long Rest** — unless you **expend a use of Rage** to use it again.',
      },
      {
        level: 14,
        name: 'Rage of the Gods',
        body:
          'When you **enter your Rage**, you can assume a divine warrior form for **1 minute** or until your Rage ends.\n\nWhile in that form:\n· You have a **Fly Speed** equal to your Speed and can hover.\n· You have **Resistance to Necrotic, Psychic, and Radiant damage**.\n· When a **creature within 30 feet** of you, including yourself, would drop to 0 Hit Points, you can take a **Reaction** to **expend a use of Rage** and leave that creature at **Hit Points equal to your Barbarian level** instead.\n\nOnce you assume this form, you cannot do so again until you finish a **Long Rest**.',
      },
    ],
  },
];
