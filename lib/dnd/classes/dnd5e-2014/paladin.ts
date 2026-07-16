// lib/dnd/classes/dnd5e-2014/paladin.ts — Paladin, 2014 Player's Handbook.
//
// 2014 tells vs 2024: Divine Smite is a class feature (not a spell), the Sacred Oath is chosen at 3
// with features at 3/7/15/20, Channel Divinity recharges on a Short Rest, Auras start at a 10-foot
// radius (30 at level 18), and only the three PHB oaths. Half-caster, CHA, spells PREPARED (not
// known). ASI at 19, no Epic Boon.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { HALF_CASTER_SLOTS } from '../slots';

export const PALADIN_2014: ClassDefinition = {
  key: 'paladin',
  name: 'Paladin',
  system: 'dnd5e-2014',
  hitDie: 10,
  primaryAbility: ['str', 'cha'],
  savingThrows: ['wis', 'cha'],
  skillChoices: {
    count: 2,
    from: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'],
  },
  armorProficiencies: ['Light armor', 'Medium armor', 'Heavy armor', 'Shields'],
  weaponProficiencies: ['Simple weapons', 'Martial weapons'],
  asiLevels: [4, 8, 12, 16, 19],
  subclassLevel: 3,
  subclassLabel: 'Sacred Oath',
  description:
    'A holy warrior bound by a sacred oath, wielding divine magic and martial skill to smite the wicked, protect the innocent, and uphold the ideals that give the oath its power.',
  startingEquipment: [
    'A martial weapon and a shield, or two martial weapons',
    'Five javelins, or any simple melee weapon',
    'A Priest\'s Pack, or an Explorer\'s Pack',
    'Chain mail and a holy symbol',
  ],
  spellcasting: {
    kind: 'half',
    ability: 'cha',
    preparedRule:
      'Spells PREPARED = your Charisma modifier + half your Paladin level (rounded down), minimum one. Change the list on a Long Rest. No cantrips. Half-caster slots from level 2.',
    slots: HALF_CASTER_SLOTS,
  },
  features: [
    {
      level: 1,
      name: 'Divine Sense',
      body:
        'As an **Action**, you can open your awareness to detect **celestials, fiends, and undead**. Until the end of your next turn, you know the location of any such creature within **60 feet** that is not behind total cover, and its type. You can use this feature **1 + your Charisma modifier** times, regaining all uses on a Long Rest.',
    },
    {
      level: 1,
      name: 'Lay on Hands',
      body:
        'You have a pool of healing power that replenishes on a Long Rest. The pool has **Hit Points equal to five times your Paladin level**. As an Action, you can touch a creature and draw from the pool to restore Hit Points, or expend **5 points to cure one disease or neutralize one poison** affecting it. This feature has no effect on undead and constructs.',
    },
    {
      level: 2,
      name: 'Fighting Style',
      body:
        'You adopt a style of fighting: **Defense** (+1 AC in armor), **Dueling** (+2 damage with a one-handed melee weapon and no other weapon), **Great Weapon Fighting** (reroll 1s and 2s on two-handed weapon damage), or **Protection** (impose Disadvantage on an attack against an ally within 5 feet using your Reaction and a Shield).',
      choice: 'fighting-style',
    },
    {
      level: 2,
      name: 'Spellcasting',
      body:
        'You draw on divine magic through prayer and meditation. **Charisma** is your spellcasting ability; your spell save DC = **8 + your Charisma modifier + your proficiency bonus**. You **prepare** a number of Paladin spells equal to your **Charisma modifier + half your Paladin level** (minimum one), changing the list on a Long Rest. You use the **half-caster** slot table (first slots at level 2).',
    },
    {
      level: 2,
      name: 'Divine Smite',
      body:
        'When you hit a creature with a **melee weapon attack**, you can expend one spell slot to deal **radiant damage** in addition to the weapon\'s damage: **2d8 for a level 1 slot, plus 1d8 for each slot level above 1st, to a maximum of 5d8**. The damage increases by **1d8** if the target is an **undead or a fiend**, to a maximum of 6d8.',
    },
    {
      level: 3,
      name: 'Divine Health',
      body: 'The divine magic flowing through you makes you **immune to disease**.',
    },
    {
      level: 3,
      name: 'Sacred Oath',
      body:
        'You swear the oath that binds you as a Paladin forever — **Oath of Devotion**, **Oath of the Ancients**, or **Oath of Vengeance**. Each grants **Oath Spells** (always prepared, free of your prepared limit) and **Channel Divinity** options, plus further features at levels **7, 15, and 20**.',
      choice: 'subclass',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 5,
      name: 'Extra Attack',
      body: 'You can attack **twice**, instead of once, whenever you take the **Attack action** on your turn.',
    },
    {
      level: 6,
      name: 'Aura of Protection',
      body:
        'Whenever you or a friendly creature **within 10 feet** of you must make a saving throw, the creature gains a bonus to the save equal to your **Charisma modifier** (minimum +1). You must be conscious to grant this. At **level 18** the range increases to **30 feet**.',
    },
    { level: 8, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 10,
      name: 'Aura of Courage',
      body: 'You and friendly creatures **within 10 feet** of you cannot be **Frightened** while you are conscious. At **level 18** the range increases to **30 feet**.',
    },
    {
      level: 11,
      name: 'Improved Divine Smite',
      body: 'You are so suffused with righteous might that all your **melee weapon strikes carry divine power**. Whenever you hit a creature with a melee weapon, it takes an extra **1d8 radiant damage**.',
    },
    { level: 12, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 14,
      name: 'Cleansing Touch',
      body:
        'You can use your **Action to end one spell** on yourself or on one willing creature you touch. You can use this feature **a number of times equal to your Charisma modifier** (minimum once), regaining all uses on a Long Rest.',
    },
    { level: 16, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 19, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
  ],
};

export const PALADIN_SUBCLASSES_2014: SubclassDefinition[] = [
  {
    key: 'devotion',
    name: 'Oath of Devotion',
    classKey: 'paladin',
    system: 'dnd5e-2014',
    description: 'The paragon of the knight in shining armor — honesty, courage, and compassion, backed by a blade of holy light.',
    alwaysPrepared: {
      3: ['Protection from Evil and Good', 'Sanctuary'],
      5: ['Lesser Restoration', 'Zone of Truth'],
      9: ['Beacon of Hope', 'Dispel Magic'],
      13: ['Freedom of Movement', 'Guardian of Faith'],
      17: ['Commune', 'Flame Strike'],
    },
    features: [
      {
        level: 3,
        name: 'Channel Divinity',
        body:
          'You gain two Channel Divinity options; you can use one, regaining the use on a **Short or Long Rest**.\n· **Sacred Weapon** — as an Action, add your Charisma modifier to attack rolls with a weapon for 1 minute; the weapon emits bright light and counts as magical.\n· **Turn the Unholy** — as an Action, each fiend or undead within 30 feet that can see or hear you must make a Wisdom save or be Turned for 1 minute.',
      },
      { level: 7, name: 'Aura of Devotion', body: 'You and friendly creatures within **10 feet** (30 at level 18) cannot be **Charmed** while you are conscious.' },
      {
        level: 15,
        name: 'Purity of Spirit',
        body: 'You are always under the effect of a **Protection from Evil and Good** spell.',
      },
      {
        level: 20,
        name: 'Holy Nimbus',
        body:
          'As an **Action**, you emanate an aura of sunlight for 1 minute. **Bright light** fills a 30-foot radius; enemies in it take **10 radiant damage** at the start of each of their turns, and you have **Advantage on saving throws against spells** cast by fiends and undead. Once used, you cannot again until a Long Rest (or by expending a level 5 spell slot).',
      },
    ],
  },
  {
    key: 'ancients',
    name: 'Oath of the Ancients',
    classKey: 'paladin',
    system: 'dnd5e-2014',
    description: 'A green knight of the old ways — light, life, and joy defended against the encroaching dark, hard to kill and hard to keep down.',
    alwaysPrepared: {
      3: ['Ensnaring Strike', 'Speak with Animals'],
      5: ['Moonbeam', 'Misty Step'],
      9: ['Plant Growth', 'Protection from Energy'],
      13: ['Ice Storm', 'Stoneskin'],
      17: ['Commune with Nature', 'Tree Stride'],
    },
    features: [
      {
        level: 3,
        name: 'Channel Divinity',
        body:
          'Two options, one use per Short or Long Rest:\n· **Nature\'s Wrath** — spectral vines Restrain a creature within 10 feet (Strength or Dexterity save).\n· **Turn the Faithless** — fey and fiends within 30 feet must make a Wisdom save or be Turned for 1 minute.',
      },
      {
        level: 7,
        name: 'Aura of Warding',
        body: 'You and friendly creatures within **10 feet** (30 at level 18) have **Resistance to damage from spells**.',
      },
      {
        level: 15,
        name: 'Undying Sentinel',
        body: 'When you would drop to 0 Hit Points and are not killed outright, you can drop to **1 Hit Point** instead (once per Long Rest). You also no longer age and cannot be aged magically.',
      },
      {
        level: 20,
        name: 'Elder Champion',
        body:
          'As an **Action**, you undergo a transformation for 1 minute: you regain **10 Hit Points at the start of each of your turns**, you can cast Paladin spells with a casting time of 1 action as a **Bonus Action**, and enemies within 10 feet have **Disadvantage on saving throws** against your spells and Channel Divinity. Once used, a Long Rest (or a level 5 slot) is needed to use it again.',
      },
    ],
  },
  {
    key: 'vengeance',
    name: 'Oath of Vengeance',
    classKey: 'paladin',
    system: 'dnd5e-2014',
    description: 'A grim avenger who will pay any price to punish wrongdoers — relentless pursuit and a smite that never misses its mark.',
    alwaysPrepared: {
      3: ['Bane', 'Hunter\'s Mark'],
      5: ['Hold Person', 'Misty Step'],
      9: ['Haste', 'Protection from Energy'],
      13: ['Banishment', 'Dimension Door'],
      17: ['Hold Monster', 'Scrying'],
    },
    features: [
      {
        level: 3,
        name: 'Channel Divinity',
        body:
          'Two options, one use per Short or Long Rest:\n· **Abjure Enemy** — one creature within 60 feet makes a Wisdom save or is Frightened and has its speed reduced to 0 for 1 minute (fiends/undead save at Disadvantage).\n· **Vow of Enmity** — as a Bonus Action, gain **Advantage on attack rolls** against one creature within 10 feet for 1 minute.',
      },
      {
        level: 7,
        name: 'Relentless Avenger',
        body: 'When you hit a creature with an Opportunity Attack, you can **move up to half your speed** immediately (this movement does not provoke Opportunity Attacks).',
      },
      {
        level: 15,
        name: 'Soul of Vengeance',
        body: 'When a creature under your **Vow of Enmity** makes an attack, you can use your **Reaction to make a melee weapon attack** against it, if it is within range.',
      },
      {
        level: 20,
        name: 'Avenging Angel',
        body:
          'As an **Action**, you transform for 1 hour, gaining a **flying speed of 60 feet** and an aura of menace in a 30-foot radius: the first time an enemy enters it or starts its turn there, it must make a **Wisdom saving throw** or be **Frightened** for 1 minute. Once used, a Long Rest (or a level 5 slot) is needed to use it again.',
      },
    ],
  },
];
