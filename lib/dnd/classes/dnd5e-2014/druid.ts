// lib/dnd/classes/dnd5e-2014/druid.ts — Druid, 2014 Player's Handbook.
//
// 2014 tells vs 2024: the Druid Circle is chosen at level 2 (the 2024 book moved it to 3), Wild Shape
// is a Short-Rest resource of 2 uses with CR/movement gates that grow at 4 and 8, and only the two
// PHB circles (Land, Moon). Full caster, WIS, spells PREPARED. Circle of the Land's terrain spell
// lists live in the feature body (a SubclassDefinition can't express four alternative lists cleanly).
import type { ClassDefinition, SubclassDefinition } from '../types';
import { FULL_CASTER_SLOTS } from '../slots';

export const DRUID_2014: ClassDefinition = {
  key: 'druid',
  name: 'Druid',
  system: 'dnd5e-2014',
  hitDie: 8,
  primaryAbility: ['wis'],
  savingThrows: ['int', 'wis'],
  skillChoices: {
    count: 2,
    from: ['arcana', 'animal', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'],
  },
  armorProficiencies: ['Light armor (nonmetal)', 'Medium armor (nonmetal)', 'Shields (nonmetal)'],
  weaponProficiencies: ['Clubs', 'Daggers', 'Darts', 'Javelins', 'Maces', 'Quarterstaffs', 'Scimitars', 'Sickles', 'Slings', 'Spears'],
  toolProficiencies: ['Herbalism kit'],
  asiLevels: [4, 8, 12, 16, 19],
  // The Druid chooses its Circle at level 2 (after gaining Wild Shape).
  subclassLevel: 2,
  subclassLabel: 'Druid Circle',
  description:
    'A priest of the Old Faith, wielding the powers of nature — moonlight and plant growth, fire and lightning — and adopting animal forms to hunt, scout, and fight.',
  startingEquipment: [
    'A wooden shield, or any simple weapon',
    'A scimitar, or any simple melee weapon',
    'Leather armor, an Explorer\'s Pack, and a druidic focus',
  ],
  spellcasting: {
    kind: 'full',
    ability: 'wis',
    preparedRule: 'Spells PREPARED = your Wisdom modifier + your Druid level (minimum one). Change the list on a Long Rest.',
    cantripsKnown: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    slots: FULL_CASTER_SLOTS,
  },
  resources: [
    {
      id: 'wild-shape',
      name: 'Wild Shape',
      // Two uses from level 2, back on a Short or Long Rest.
      perLevel: [0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      resetOn: 'short',
    },
  ],
  features: [
    {
      level: 1,
      name: 'Druidic',
      body: 'You know **Druidic**, the secret language of druids. You can speak it and use it to leave hidden messages; those who know it automatically spot such a message, and others can find one with a hard Wisdom (Perception) check but cannot decode it without magic.',
    },
    {
      level: 1,
      name: 'Spellcasting',
      body:
        'Drawing on the divine essence of nature, you can cast spells. **Wisdom** is your spellcasting ability; your spell save DC = **8 + your Wisdom modifier + your proficiency bonus**. You know **two cantrips** (three at 4, four at 10) and **prepare** a number of Druid spells equal to your **Wisdom modifier + your Druid level** (minimum one). You use the **full-caster** slot table.',
    },
    {
      level: 2,
      name: 'Wild Shape',
      body:
        'You can use an **Action to magically assume the shape of a beast** you have seen before, for a number of hours equal to **half your Druid level** (rounded down). You can do so **twice**, regaining a use on a **Short or Long Rest**.\n\nThe beast\'s challenge rating can be at most **1/4 at level 2** (no flying or swimming speed), **1/2 at level 4** (no flying speed), and **1 at level 8**. You keep your mental scores, personality, and the ability to speak/cast is limited by the form; your game statistics are replaced by the beast\'s, and you revert when you drop to 0 form Hit Points or choose to.',
    },
    {
      level: 2,
      name: 'Druid Circle',
      body:
        'You choose to identify with a circle of druids — the **Circle of the Land** or the **Circle of the Moon**.\n\nYour choice grants features at level 2 and at later levels that vary by circle.',
      choice: 'subclass',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat. (Your Wild Shape CR and speed limits also improve at this level.)', choice: 'asi' },
    { level: 8, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat. (Your Wild Shape can now be a CR 1 beast.)', choice: 'asi' },
    { level: 12, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 16, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 18,
      name: 'Timeless Body',
      body: 'The primal magic you wield slows your aging: for every 10 years that pass, your body ages only 1 year.',
    },
    {
      level: 18,
      name: 'Beast Spells',
      body: 'You can **cast many of your Druid spells while in Wild Shape** — performing the somatic and verbal components in beast form (but not material components unless you have them).',
    },
    { level: 19, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 20,
      name: 'Archdruid',
      body: 'You can use Wild Shape an **unlimited number of times**, and you can ignore the verbal and somatic components of your Druid spells, as well as any material components that lack a cost and are not consumed.',
    },
  ],
};

export const DRUID_SUBCLASSES_2014: SubclassDefinition[] = [
  {
    key: 'land',
    name: 'Circle of the Land',
    classKey: 'druid',
    system: 'dnd5e-2014',
    description: 'A keeper of old lore tied to a landscape — extra cantrip, slots recovered on a short rest, and terrain-themed circle spells.',
    features: [
      { level: 2, name: 'Bonus Cantrip', body: 'You learn **one additional Druid cantrip** of your choice.' },
      {
        level: 2,
        name: 'Natural Recovery',
        body: 'Once per day during a **Short Rest**, you can recover expended spell slots with a combined level up to **half your Druid level** (rounded up), none of level 6+.',
      },
      {
        level: 3,
        name: 'Circle Spells',
        body:
          'Your mystical connection to the land infuses you with the ability to cast certain spells, **always prepared** and free of your prepared limit. Choose a land type at level 2 — **arctic, coast, desert, forest, grassland, mountain, swamp, or Underdark** — which sets your circle spells at Druid levels **3, 5, 7, and 9** (e.g. Forest grants Barkskin & Spider Climb at 3, Call Lightning & Plant Growth at 5, Divination & Freedom of Movement at 7, Commune with Nature & Tree Stride at 9).',
      },
      { level: 6, name: 'Land\'s Stride', body: 'Moving through nonmagical difficult terrain costs no extra movement; you pass through nonmagical plants without being slowed or harmed, and have **Advantage on saves** against plants magically impeding movement.' },
      { level: 10, name: 'Nature\'s Ward', body: 'You cannot be **Charmed or Frightened** by elementals or fey, and you are **immune to poison and disease**.' },
      { level: 14, name: 'Nature\'s Sanctuary', body: 'Creatures of the natural world sense your bond: when a beast or plant creature attacks you, it must make a **Wisdom save** or choose a different target (and it has Disadvantage on the save).' },
    ],
  },
  {
    key: 'moon',
    name: 'Circle of the Moon',
    classKey: 'druid',
    system: 'dnd5e-2014',
    description: 'A fierce shapeshifter — Wild Shape as a Bonus Action into tougher beasts, and eventually elementals.',
    features: [
      {
        level: 2,
        name: 'Combat Wild Shape',
        body: 'You can use Wild Shape as a **Bonus Action** (rather than an Action), and while transformed you can use a Bonus Action to **expend a spell slot to regain 1d8 Hit Points per slot level**.',
      },
      {
        level: 2,
        name: 'Circle Forms',
        body: 'You can transform into beasts with a challenge rating as high as **1** (instead of 1/4). Starting at level 6, your Wild Shape CR can be as high as **half your Druid level** (rounded down).',
      },
      { level: 6, name: 'Primal Strike', body: 'Your **attacks in beast form count as magical** for overcoming Resistance and Immunity to nonmagical attacks and damage.' },
      { level: 10, name: 'Elemental Wild Shape', body: 'You can **expend two Wild Shape uses** at once to transform into an **air, earth, fire, or water elemental**.' },
      { level: 14, name: 'Thousand Forms', body: 'You have learned to use magic to alter your physical form in minor ways: you can cast the **Alter Self** spell at will.' },
    ],
  },
];
