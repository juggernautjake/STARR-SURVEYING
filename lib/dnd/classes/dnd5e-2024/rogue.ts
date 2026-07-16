// lib/dnd/classes/dnd5e-2024/rogue.ts — Rogue, 2024 Player's Handbook.
//
// 2024 shape: subclass at 3 (with subclass features at 3/9/13/17, not 3/9/13/17's 2014 cousin
// levels), Weapon Mastery at 1, Cunning Strike turns Sneak Attack dice into riders, and level 19
// is an Epic Boon. The Rogue keeps its extra ASI at 10.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { THIRD_CASTER_SLOTS } from '../slots';

export const ROGUE_2024: ClassDefinition = {
  key: 'rogue',
  name: 'Rogue',
  system: 'dnd5e-2024',
  hitDie: 8,
  primaryAbility: ['dex'],
  savingThrows: ['dex', 'int'],
  skillChoices: {
    count: 4,
    from: [
      'acrobatics',
      'athletics',
      'deception',
      'insight',
      'intimidation',
      'investigation',
      'perception',
      'persuasion',
      'sleight',
      'stealth',
    ],
  },
  armorProficiencies: ['Light armor'],
  weaponProficiencies: ['Simple weapons', 'Martial weapons that have the Finesse or Light property'],
  toolProficiencies: ['Thieves\' Tools'],
  asiLevels: [4, 8, 10, 12, 16],
  subclassLevel: 3,
  subclassLabel: 'Roguish Archetype',
  description:
    'A precise opportunist who wins fights by never being where the blow lands — then turning a single well-timed strike into a devastating one.',
  startingEquipment: [
    'Leather Armor, 2 Daggers, Shortsword, Shortbow, 20 Arrows, Quiver, Thieves\' Tools, Burglar\'s Pack, and 8 GP',
    'or 100 GP',
  ],
  resources: [
    {
      id: 'stroke-of-luck',
      name: 'Stroke of Luck',
      // Index 0 unused. Gained at level 20 only.
      perLevel: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      resetOn: 'short',
    },
  ],
  features: [
    {
      level: 1,
      name: 'Expertise',
      body:
        'Choose **two** of your skill proficiencies. Your **Proficiency Bonus is doubled** for any ability check you make using either of them.\n\nIf you have no other source pushing you elsewhere, **Sleight of Hand** and **Stealth** are the archetypal picks.\n\nYou choose **two more** skill proficiencies for Expertise at **Rogue level 6**.',
      choice: 'expertise',
    },
    {
      level: 1,
      name: 'Sneak Attack',
      body:
        '**Once per turn**, you can deal an extra **1d6 damage** to one creature you hit with an attack roll, provided:\n· You have **Advantage** on the attack roll, **or** an **ally of the target is within 5 feet** of it, that ally does not have the Incapacitated condition, and you do **not** have Disadvantage on the roll.\n· The attack uses a **Finesse or Ranged weapon**.\n\nThe extra damage is the same type as the weapon\'s.\n\nThe dice equal **half your Rogue level, rounded up**: 1d6 at levels 1–2, 2d6 at 3–4, and so on up to **10d6 at level 19**.',
    },
    {
      level: 1,
      name: 'Thieves\' Cant',
      body:
        'You know **Thieves\' Cant**, a secret mix of dialect, jargon, and code that lets you hide messages in seemingly ordinary conversation. Only another creature that knows Thieves\' Cant understands them.\n\nIt takes **four times longer** to convey a message this way than to say it plainly.\n\nYou also know **one language of your choice**, listed in the Player\'s Handbook\'s Standard or Rare languages.',
    },
    {
      level: 1,
      name: 'Weapon Mastery',
      body:
        'You can use the **mastery property** of **two** kinds of weapons of your choice that you are proficient with — Daggers (Nick) and Shortbows (Vex) being the classic pairing.\n\nWhenever you finish a **Long Rest** you can swap either choice for a different eligible weapon.\n\nUnlike the Barbarian and Fighter, the Rogue\'s count **stays at two** for all twenty levels.',
    },
    {
      level: 2,
      name: 'Cunning Action',
      body:
        'Your quick thinking and agility let you move and act nimbly. On your turn, you can take one of the following actions as a **Bonus Action**: **Dash**, **Disengage**, or **Hide**.',
    },
    {
      level: 3,
      name: 'Rogue Subclass',
      body:
        'You choose a **Roguish Archetype** — Arcane Trickster, Assassin, Soulknife, or Thief.\n\nThe subclass grants features now and again at Rogue levels **9, 13, and 17**.',
      choice: 'subclass',
    },
    {
      level: 3,
      name: 'Steady Aim',
      body:
        'As a **Bonus Action**, you give yourself **Advantage on your next attack roll** on the current turn.\n\nYou can use this only if you **have not moved** during this turn, and after you use it your **Speed is 0** until the end of the current turn.\n\nIt is the reliable way to switch Sneak Attack on when no ally is engaged.',
    },
    {
      level: 5,
      name: 'Cunning Strike',
      body:
        'When you deal **Sneak Attack** damage, you can add one of the following effects. Each has a **die cost** — the number of Sneak Attack dice you **forgo** to add it. The saving throw DC is **8 + your Dexterity modifier + your Proficiency Bonus**.\n\n· **Poison (1d6)** — the target must succeed on a **Constitution** save or have the **Poisoned** condition for **1 minute**. It repeats the save at the end of each of its turns. You need a Poisoner\'s Kit on your person to use this.\n· **Trip (1d6)** — if the target is **Large or smaller**, it must succeed on a **Dexterity** save or have the **Prone** condition.\n· **Withdraw (1d6)** — you move up to **half your Speed** without provoking **Opportunity Attacks**.\n\nYou forgo the dice before rolling, and you fail to gain the effect if the attack misses.',
    },
    {
      level: 5,
      name: 'Uncanny Dodge',
      body:
        'When an attacker you can see **hits you with an attack roll**, you can take a **Reaction** to **halve the attack\'s damage** against you (round down).',
    },
    {
      level: 7,
      name: 'Evasion',
      body:
        'When you are subjected to an effect that lets you make a **Dexterity saving throw** to take only half damage, you instead take **no damage** on a success and **half damage** on a failure.\n\nYou cannot use this feature if you have the **Incapacitated** condition.',
    },
    {
      level: 7,
      name: 'Reliable Talent',
      body:
        'Whenever you make an **ability check that uses one of your skill or tool proficiencies**, you can treat a **d20 roll of 9 or lower as a 10**.\n\nIn practice, you stop failing at things you are trained in.',
    },
    {
      level: 11,
      name: 'Improved Cunning Strike',
      body:
        'You can use **up to two Cunning Strike effects** when you deal **Sneak Attack** damage, **paying the die cost for each**.\n\nA level-11 Rogue landing 6d6 could, for instance, spend 1d6 on Trip and 1d6 on Withdraw and still deal 4d6 of Sneak Attack damage.',
    },
    {
      level: 14,
      name: 'Devious Strikes',
      body:
        'You gain three more **Cunning Strike** options, each using the same save DC (**8 + your Dexterity modifier + your Proficiency Bonus**):\n· **Daze (2d6)** — the target must succeed on a **Constitution** save or, on its next turn, it can do only **one** of the following: move, or take an action, or take a Bonus Action.\n· **Knock Out (6d6)** — the target must succeed on a **Constitution** save or have the **Unconscious** condition for **1 minute**, or until it takes damage or a creature nearby uses an action to shake it awake. Once a creature succeeds on this save, you cannot use Knock Out against it again until you finish a Long Rest.\n· **Obscure (3d6)** — the target must succeed on a **Dexterity** save or have the **Blinded** condition until the **end of its next turn**.',
    },
    {
      level: 15,
      name: 'Slippery Mind',
      body:
        'You gain proficiency in **Wisdom and Charisma saving throws**.\n\nCombined with your existing Dexterity and Intelligence proficiencies, you are now proficient in four of the six.',
    },
    {
      level: 18,
      name: 'Elusive',
      body:
        'You are so evasive that attackers rarely gain the upper hand: **no attack roll can have Advantage against you** while you do not have the **Incapacitated** condition.',
    },
    {
      level: 19,
      name: 'Epic Boon',
      body:
        'You gain an **Epic Boon feat** or another feat of your choice for which you qualify. **Boon of the Night Spirit** fits the Rogue: while entirely in Dim Light or Darkness you can become Invisible as a Magic action and gain a bonus to damage rolls.',
      choice: 'epic-boon',
    },
    {
      level: 20,
      name: 'Stroke of Luck',
      body:
        'You have an uncanny knack for succeeding when you need to. If you **fail a d20 Test**, you can **turn the roll into a 20**.\n\nOnce you use this feature, you cannot use it again until you finish a **Short Rest or a Long Rest**.',
    },
  ],
};

export const ROGUE_SUBCLASSES_2024: SubclassDefinition[] = [
  {
    key: 'arcane-trickster',
    name: 'Arcane Trickster',
    classKey: 'rogue',
    system: 'dnd5e-2024',
    description: 'A thief who enhances stealth and sleight of hand with Wizard magic — an invisible Mage Hand doing the work no fingers could.',
    features: [
      {
        level: 3,
        name: 'Spellcasting',
        body:
          'You have learned to cast spells from the **Wizard spell list**. **Intelligence** is your spellcasting ability, and your spell save DC is **8 + your Intelligence modifier + your Proficiency Bonus**.\n\n· **Cantrips** — you know **three**: **Mage Hand** (which you always know and which does not count against the others in spirit — it is the subclass\'s engine) plus **two** other Wizard cantrips of your choice. You learn a **fourth at Rogue level 10**.\n· **Prepared spells** — you start with **three** level 1 Wizard spells prepared, rising to **13 by level 20**. You can change one prepared spell whenever you finish a Long Rest.\n· **Slots** — you use the **third-caster** table: your first slot arrives at level 3 and your spells cap at **rank 4** (a single rank-4 slot from level 19).',
      },
      {
        level: 3,
        name: 'Mage Hand Legerdemain',
        body:
          'When you cast **Mage Hand**, you can cast it as a **Bonus Action**, and you can make the spectral hand **Invisible**.\n\nYou can control the hand as a **Bonus Action**, and through it you can make **Dexterity (Sleight of Hand)** checks — picking a lock, disarming a trap, lifting a purse — using your own bonus, at the hand\'s range rather than your own.',
      },
      {
        level: 9,
        name: 'Magical Ambush',
        body:
          'If you have the **Invisible** condition when you **cast a spell on a creature**, that creature has **Disadvantage on any saving throw** it makes against the spell this turn.\n\nThis pairs directly with Cunning Action (Hide).',
      },
      {
        level: 13,
        name: 'Versatile Trickster',
        body:
          'When you use the **Trip** option of **Cunning Strike**, you can also use that option on **another creature within 5 feet of your spectral Mage Hand**.\n\nThat second target makes the same **Dexterity** save (DC = 8 + your Dexterity modifier + your Proficiency Bonus) or has the **Prone** condition — one die cost, two potential targets.',
      },
      {
        level: 17,
        name: 'Spell Thief',
        body:
          'Immediately after a creature **casts a spell that targets you** or includes you in its area, you can take a **Reaction** to try to steal it. The creature makes an **Intelligence saving throw** (DC = 8 + your Dexterity modifier + your Proficiency Bonus).\n\nOn a **failure**, you **negate the spell\'s effect against you**, and you **steal the knowledge of the spell** if it is of a rank you can cast and of a school you can access. For the next **8 hours**, you know it and can cast it with your slots; the original caster **cannot cast that spell** until those 8 hours pass.\n\nOnce you use this feature, you cannot use it again until you finish a **Long Rest**.',
      },
    ],
  },
  {
    key: 'assassin',
    name: 'Assassin',
    classKey: 'rogue',
    system: 'dnd5e-2024',
    description: 'A killer who wins in the first round — disguise, poison, and a strike that lands before the target has moved.',
    features: [
      {
        level: 3,
        name: 'Assassinate',
        body:
          'You are deadliest when you strike first:\n· **Initiative** — you have **Advantage on Initiative rolls**.\n· **Surprise** — during the **first round** of each combat, you have **Advantage on attack rolls** against any creature that **has not had a turn yet**.\n· **Payoff** — if you hit such a creature and it has not yet taken a turn in this combat, your **Sneak Attack** deals extra damage equal to your **Rogue level**.',
      },
      {
        level: 3,
        name: 'Assassin\'s Tools',
        body:
          'You gain a **Disguise Kit** and a **Poisoner\'s Kit**, and you have **proficiency** with both.',
      },
      {
        level: 9,
        name: 'Infiltration Expertise',
        body:
          'You gain two benefits:\n· **Masterful Mimicry** — you can unerringly **mimic another person\'s speech, handwriting, or both**, if you have spent at least **1 hour** studying them.\n· **Roving Aim** — your **Speed is no longer reduced to 0** by using **Steady Aim**.',
      },
      {
        level: 13,
        name: 'Envenom Weapons',
        body:
          'When you use the **Poison** option of your **Cunning Strike**, the target also takes **2d6 Poison damage** whenever it **fails the saving throw**.\n\nThis damage is on top of any Sneak Attack damage you kept.',
      },
      {
        level: 17,
        name: 'Death Strike',
        body:
          'When you hit with your **Sneak Attack** on the **first round of a combat**, the target must succeed on a **Constitution saving throw** (DC = 8 + your Dexterity modifier + your Proficiency Bonus), or the **attack\'s damage is doubled**.',
      },
    ],
  },
  {
    key: 'soulknife',
    name: 'Soulknife',
    classKey: 'rogue',
    system: 'dnd5e-2024',
    description: 'A psion-thief who manifests blades of pure thought — silent, unarmed, and able to whisper across a mile.',
    features: [
      {
        level: 3,
        name: 'Psionic Power',
        body:
          'You have a pool of **Psionic Energy Dice**, which fuel this subclass. You start with **four d6s**. The pool grows and sharpens with your Rogue level: **six d8s at 5**, **eight d8s at 9**, **eight d10s at 11**, **ten d10s at 13**, and **twelve d12s at 17**.\n\nYou regain **one** expended die when you finish a **Short Rest** and **all** of them on a **Long Rest**.\n\nYou gain two ways to spend them:\n· **Psi-Bolstered Knack** — if you **fail an ability check** using a **skill or tool you are proficient with**, you can roll one Psionic Energy Die and **add the number rolled** to the check, potentially turning failure into success. The die is expended only if it turns the failure into a success.\n· **Psychic Whispers** — as a **Magic action**, choose up to a number of creatures you can see equal to your **Proficiency Bonus**, and roll one die. You establish **two-way telepathic communication** with each of them for a number of **hours equal to the roll**, out to **1 mile**. The **first time you use this after each Long Rest**, you do **not** expend the die.',
      },
      {
        level: 3,
        name: 'Psychic Blades',
        body:
          'As a **Bonus Action or as part of the Attack action**, you can manifest a shimmering blade of psychic energy in either hand. It counts as a **Simple Melee weapon** with the **Finesse** and **Thrown** (range 60/120) properties and the **Vex** mastery property. It deals **1d6 Psychic damage** on a hit, plus the ability modifier used for the attack roll.\n\nThe blade **vanishes** immediately after it hits or misses, and it leaves no mark. It requires no ammunition and it is never disarmed — you simply manifest another.\n\nIf you make a **second attack with a Psychic Blade as a Bonus Action** on the same turn, that one deals **1d4 Psychic damage** instead of 1d6.',
      },
      {
        level: 9,
        name: 'Soul Blades',
        body:
          'Your Psychic Blades gain two more uses of your Psionic Energy Dice:\n· **Homing Strikes** — if you make an **attack roll with a Psychic Blade and miss**, you can roll one Psionic Energy Die and **add the number rolled to the attack roll**. The die is expended only if the addition turns the miss into a hit.\n· **Psychic Teleportation** — as a **Bonus Action**, expend one die, roll it, and **throw a Psychic Blade** at an unoccupied space you can see up to a number of **feet equal to 10 times the roll**. You then **teleport** to that space.',
      },
      {
        level: 13,
        name: 'Psychic Veil',
        body:
          'As a **Magic action**, you gain the **Invisible** condition for **1 hour** or until you dismiss the effect (no action required).\n\nThe effect ends early immediately after you **deal damage** to a creature or **force a creature to make a saving throw**.\n\nOnce you use this feature, you cannot use it again until you finish a **Long Rest** — unless you **expend one Psionic Energy Die** to use it again.',
      },
      {
        level: 17,
        name: 'Rend Mind',
        body:
          'When you use a **Psychic Blade** to deal **Sneak Attack** damage, you can force the target to make a **Wisdom saving throw** (DC = 8 + your Dexterity modifier + your Proficiency Bonus).\n\nOn a failure, the target has the **Stunned** condition for **1 minute**. It repeats the save at the end of each of its turns, ending the effect on itself on a success.\n\nOnce you use this feature, you cannot use it again until you finish a **Long Rest** — unless you **expend three Psionic Energy Dice** to use it again.',
      },
    ],
  },
  {
    key: 'thief',
    name: 'Thief',
    classKey: 'rogue',
    system: 'dnd5e-2024',
    description: 'Burglar, treasure hunter, and explorer — fast hands, walls that may as well be floors, and magic items bent to your will.',
    features: [
      {
        level: 3,
        name: 'Fast Hands',
        body:
          'As a **Bonus Action**, you can do one of the following:\n· **Sleight of Hand** — make a Dexterity (Sleight of Hand) check to pick a lock or disarm a trap with **Thieves\' Tools**, or to pick a pocket.\n· **Utilize** — take the **Utilize** action.\n· **Magic** — take the **Magic** action to use a **magic item** that requires that action.',
      },
      {
        level: 3,
        name: 'Second-Story Work',
        body:
          'You gain two benefits:\n· **Climber** — you gain a **Climb Speed equal to your Speed**.\n· **Jumper** — you can determine your **jump distance using your Dexterity** rather than your Strength.',
      },
      {
        level: 9,
        name: 'Supreme Sneak',
        body:
          'You gain a new **Cunning Strike** option:\n· **Stealth Attack (1d6)** — if you have the **Invisible** condition from the **Hide** action, this attack **does not end that condition** on you, provided you end the turn behind **Three-Quarters Cover** or **Total Cover**.\n\nIt is how you attack from a shadow and stay in it.',
      },
      {
        level: 13,
        name: 'Use Magic Device',
        body:
          'You have learned how to wring more out of magic items than they were built to give:\n· **Attunement** — you can attune to up to **four** magic items at once, rather than three.\n· **Charges** — whenever you use a magic item property that **expends charges**, roll **1d6**. On a **6**, you use the property **without expending the charges**.\n· **Scrolls** — you can use any **Spell Scroll**, using **Intelligence** as your spellcasting ability. If the spell is a **cantrip or a level 1 spell**, you can cast it reliably; if it is **higher**, you must first succeed on an **Intelligence (Arcana)** check with a **DC equal to 10 + the spell\'s rank**. On a failed check, the scroll is not consumed.',
      },
      {
        level: 17,
        name: 'Thief\'s Reflexes',
        body:
          'You can take **two turns during the first round** of any combat.\n\nYou take your **first turn at your normal Initiative** and your **second turn at your Initiative minus 10**.',
      },
    ],
  },
];

// Arcane Trickster uses the shared third-caster table; attached here so a builder can resolve slots
// for a Rogue/Arcane Trickster without special-casing the subclass.
export const ARCANE_TRICKSTER_SPELLCASTING_2024: NonNullable<ClassDefinition['spellcasting']> = {
  kind: 'third',
  ability: 'int',
  preparedRule:
    'Prepared spells are fixed by the Arcane Trickster Spellcasting table (3 at Rogue level 3 rising to 13 at level 20), chosen from the Wizard spell list. Swap one on a Long Rest.',
  // Index 1..20. Three Wizard cantrips (including Mage Hand) from level 3, a fourth from level 10.
  cantripsKnown: [0, 0, 0, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  slots: THIRD_CASTER_SLOTS,
  // Index 1..20 — the "Prepared Spells" column, not a known-spells list.
  spellsKnown: [0, 0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13],
};
