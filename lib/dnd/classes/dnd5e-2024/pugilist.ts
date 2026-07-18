// lib/dnd/classes/dnd5e-2024/pugilist.ts — the PUGILIST, a homebrew 2024 martial class (the owner's Jack).
//
// A bare-knuckle brawler built on Fisticuffs (scaling unarmed strikes), a Moxie grit pool, and Iron Chin
// (CON-based unarmored defense). Flagged `custom` so the builder badges it homebrew and a DM can gate it, but
// it carries FULL level 1–20 data like an official class, so a player can pick it in the 2024 builder and the
// level engine walks it like any other. Modeled on the Monk chassis (d8→ we use d10 for the tankier brawler),
// STR primary, STR+CON saves. Content mirrors app/dnd/_sheet/data/jack.ts + the homebrew catalog seed.
import type { ClassDefinition, SubclassDefinition } from '../types';

export const PUGILIST_2024: ClassDefinition = {
  key: 'pugilist',
  name: 'Pugilist',
  system: 'dnd5e-2024',
  custom: { authorName: 'Jacob', basedOn: 'Monk' },
  hitDie: 10,
  primaryAbility: ['str'],
  savingThrows: ['str', 'con'],
  skillChoices: {
    count: 2,
    from: ['acrobatics', 'athletics', 'insight', 'intimidation', 'perception', 'streetwise'],
  },
  armorProficiencies: ['Light armor'],
  weaponProficiencies: ['Simple weapons', 'Improvised weapons'],
  toolProficiencies: ["Gaming Set (your choice) or Brewer's Supplies"],
  asiLevels: [4, 8, 12, 16],
  subclassLevel: 3,
  subclassLabel: 'Fighting School',
  description:
    'A bare-knuckle scrapper who wins by refusing to go down — trading armor for an iron chin, spending Moxie to turn a beating into a comeback, and hitting harder the longer the fight drags on.',
  startingEquipment: [
    "Hand Wraps, an Explorer's Pack, a Gaming Set, and 12 GP",
    'or 60 GP',
  ],
  resources: [
    {
      id: 'moxie',
      name: 'Moxie',
      // Index 0 unused. None at level 1; from level 2, Moxie equals your Pugilist level.
      perLevel: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      resetOn: 'short',
      note: 'Moxie equals your Pugilist level and returns on a Short Rest or a Long Rest.',
    },
  ],
  features: [
    {
      level: 1,
      name: 'Fisticuffs',
      body:
        'Your fists are your signature weapon. While you are wearing no armor heavier than Light and are not wielding a Shield, you gain three benefits:\n· **Bonus Unarmed Strike** — you can make one **Unarmed Strike as a Bonus Action**.\n· **Fisticuffs Die** — you can roll **1d6** in place of the normal damage of your Unarmed Strikes. The die grows to **1d8 at level 5**, **1d10 at level 11**, and **1d12 at level 17**.\n· You use **Strength** for the attack and damage rolls of your Unarmed Strikes (and the DC of your Grapple and Shove).',
    },
    {
      level: 1,
      name: 'Iron Chin',
      body:
        'You can take a hit like a wall takes a breeze. While you are wearing **no armor** and **not wielding a Shield**, your base Armor Class equals **12 + your Constitution modifier**. If you have another unarmored-defense feature, use whichever formula is higher.',
    },
    {
      level: 2,
      name: 'Moxie',
      body:
        'You have a well of grit — a number of **Moxie points equal to your Pugilist level** — that returns on a **Short or Long Rest**. You can spend Moxie on:\n· **Combination** — spend **1 Moxie** to make **two Unarmed Strikes** as a Bonus Action.\n· **Rope-a-Dope** — as a Reaction when hit, spend **1 Moxie** to add your **Constitution modifier** to your AC against that attack, possibly turning a hit into a miss.\n· **Get Up** — spend **1 Moxie** to stand from Prone without spending movement and take the Dodge action as a Bonus Action.',
    },
    {
      level: 2,
      name: 'Bloodied But Unbowed',
      body:
        'When you are **Bloodied** (at or below half your Hit Point maximum), your Unarmed Strikes deal **+1 damage**, rising with your Fisticuffs die progression. Getting hurt just makes you meaner.',
    },
    {
      level: 3,
      name: 'Fighting School',
      choice: 'subclass',
      subclass: true,
      body: 'You commit to a school of fighting. Choose a **Fighting School** (e.g. **Sweet Science**). It grants features now and at levels 6, 11, and 17.',
    },
    {
      level: 3,
      name: 'Swagger Streak',
      body:
        'The first time you drop a creature to 0 Hit Points on your turn, you gain **Temporary Hit Points equal to your Pugilist level** and can make one **Unarmed Strike** as a Reaction before the end of the turn. Once per Short Rest.',
    },
    { level: 4, name: 'Ability Score Improvement', choice: 'asi', body: 'Increase one ability score by 2, or two by 1 (max 20), or take a feat.' },
    {
      level: 5,
      name: 'Extra Attack',
      body: 'You can **attack twice** whenever you take the Attack action on your turn. (Your Fisticuffs die also grows to **1d8** at this level.)',
    },
    {
      level: 6,
      name: 'Heavy Hitter',
      body:
        'Once per turn when you hit with an Unarmed Strike, you can spend **1 Moxie** to deal an extra **Fisticuffs die** of damage and, if the target is no larger than you, push it **10 feet** or knock it **Prone** (its choice via a **Strength save**, DC 8 + your Strength modifier + your Proficiency Bonus).',
    },
    {
      level: 7,
      name: 'Slip the Punch',
      body: 'You gain **proficiency in Dexterity saving throws**. When you fail a Dexterity save, you can spend **1 Moxie** to reroll it.',
    },
    { level: 8, name: 'Ability Score Improvement', choice: 'asi', body: 'Increase one ability score by 2, or two by 1 (max 20), or take a feat.' },
    {
      level: 9,
      name: 'Second Wind',
      body: 'When you start your turn Bloodied with no Moxie remaining, you regain **1 Moxie**. You never stay down for long.',
    },
    {
      level: 10,
      name: 'Unbreakable',
      body: 'You have **Advantage on saving throws against being Frightened**, and when you roll a death saving throw you can spend **1 Moxie** to treat it as a **10**.',
    },
    { level: 11, name: 'Fisticuffs Improvement', body: 'Your **Fisticuffs die** grows to **1d10**.' },
    { level: 12, name: 'Ability Score Improvement', choice: 'asi', body: 'Increase one ability score by 2, or two by 1 (max 20), or take a feat.' },
    {
      level: 13,
      name: 'Haymaker',
      body: 'When you score a **Critical Hit** with an Unarmed Strike, you can spend **1 Moxie** to knock the target **Prone** and end one of its Concentration effects (it makes a Constitution save, DC 8 + your Strength modifier + your Proficiency Bonus).',
    },
    {
      level: 14,
      name: 'Roll With It',
      body: 'You gain **proficiency in all saving throws**. Grit answers everything.',
    },
    {
      level: 15,
      name: 'Comeback Story',
      body: 'When you are reduced to 0 Hit Points but not killed outright, you can spend **3 Moxie** to instead drop to **1 Hit Point** and stand up. Once per Long Rest.',
    },
    { level: 16, name: 'Ability Score Improvement', choice: 'asi', body: 'Increase one ability score by 2, or two by 1 (max 20), or take a feat.' },
    { level: 17, name: 'Fisticuffs Mastery', body: 'Your **Fisticuffs die** grows to **1d12**.' },
    {
      level: 18,
      name: 'The Long Count',
      body: 'While you have **Moxie remaining**, you have **Resistance to Bludgeoning, Piercing, and Slashing damage** from nonmagical attacks. Nobody keeps you down.',
    },
    { level: 19, name: 'Epic Boon', choice: 'epic-boon', body: 'You gain an **Epic Boon feat** or another feat of your choice.' },
    {
      level: 20,
      name: 'Undisputed',
      body: 'Your Strength and Constitution scores increase by **2** each (max **24**). When you roll initiative with no Moxie, you regain **half your Moxie maximum**. You are, and remain, the champ.',
    },
  ],
};

export const PUGILIST_SUBCLASSES_2024: SubclassDefinition[] = [
  {
    key: 'sweet-science',
    name: 'Sweet Science',
    classKey: 'pugilist',
    system: 'dnd5e-2024',
    custom: { authorName: 'Jacob' },
    description: 'The bare-knuckle boxer\'s art — footwork, timing, and a punch that lands exactly where it hurts.',
    features: [
      {
        level: 3,
        name: 'Bare-Knuckle Boxer',
        subclass: true,
        body: 'Your Unarmed Strikes score a **Critical Hit on a roll of 19 or 20**. When you take the Attack action, you can forgo one attack to make a **feint** (an Insight vs Insight contest); on a success you have **Advantage** on your next Unarmed Strike against that target this turn.',
      },
      {
        level: 6,
        name: 'Footwork',
        subclass: true,
        body: 'Your Unarmed Strikes **do not provoke Opportunity Attacks**, and when you hit a creature you can spend **1 Moxie** to move **5 feet** without provoking. Sting and drift.',
      },
      {
        level: 11,
        name: 'One-Two',
        subclass: true,
        body: 'Once per turn, when you hit the **same creature** with two Unarmed Strikes, the second deals an extra **Fisticuffs die** of damage and the target has **Disadvantage** on its next attack roll before the start of your next turn.',
      },
      {
        level: 17,
        name: 'Knockout',
        subclass: true,
        body: 'When you score a Critical Hit with an Unarmed Strike against a creature that is **Bloodied**, it must succeed on a **Constitution save** (DC 8 + your Strength modifier + your Proficiency Bonus) or fall **Unconscious** for 1 minute (it repeats the save at the end of each of its turns, and any damage besides yours ends the effect).',
      },
    ],
  },
];
