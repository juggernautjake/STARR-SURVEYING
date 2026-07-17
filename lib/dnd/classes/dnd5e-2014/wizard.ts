// lib/dnd/classes/dnd5e-2014/wizard.ts — Wizard, 2014 Player's Handbook.
//
// 2014 tells vs 2024: the Arcane Tradition is chosen at level 2 (features at 2/6/10/14), Spell Mastery
// at 18 and Signature Spells at 20, and all EIGHT PHB schools as traditions. Full caster, INT, spells
// PREPARED from a spellbook. Arcane Recovery on a Short Rest. ASI at 19, no Epic Boon.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { FULL_CASTER_SLOTS } from '../slots';

export const WIZARD_2014: ClassDefinition = {
  key: 'wizard',
  name: 'Wizard',
  system: 'dnd5e-2014',
  hitDie: 6,
  primaryAbility: ['int'],
  savingThrows: ['int', 'wis'],
  skillChoices: { count: 2, from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'] },
  armorProficiencies: [],
  weaponProficiencies: ['Daggers', 'Darts', 'Slings', 'Quarterstaffs', 'Light crossbows'],
  asiLevels: [4, 8, 12, 16, 19],
  subclassLevel: 2,
  subclassLabel: 'Arcane Tradition',
  description:
    'A scholarly magic-user capable of manipulating the structures of reality — the widest spell list in the game, prepared from a treasured spellbook and shaped by a chosen school of magic.',
  startingEquipment: [
    'A quarterstaff, or a dagger',
    'A component pouch, or an arcane focus',
    'A Scholar\'s Pack, or an Explorer\'s Pack',
    'A spellbook',
  ],
  spellcasting: {
    kind: 'full',
    ability: 'int',
    preparedRule: 'Spells PREPARED = your Intelligence modifier + your Wizard level (minimum one), chosen from your spellbook. Change the list on a Long Rest. Your spellbook starts with six level 1 spells and grows as you level or copy spells you find.',
    cantripsKnown: [0, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    slots: FULL_CASTER_SLOTS,
  },
  features: [
    {
      level: 1,
      name: 'Spellcasting',
      body:
        'As a student of arcane magic, you cast spells prepared from your **spellbook**. **Intelligence** is your spellcasting ability; your spell save DC = **8 + your Intelligence modifier + your proficiency bonus**. You know **three cantrips** (four at 4, five at 10) and **prepare** a number of spells equal to your **Intelligence modifier + your Wizard level** (minimum one). You use the **full-caster** slot table. You can add new spells to your spellbook by copying ones you find (2 hours and 50 gp per spell level).',
    },
    {
      level: 1,
      name: 'Arcane Recovery',
      body: 'Once per day when you finish a **Short Rest**, you can recover expended spell slots with a combined level up to **half your Wizard level** (rounded up), none of level 6 or higher.',
    },
    {
      level: 2,
      name: 'Arcane Tradition',
      body:
        'You choose an arcane tradition, shaping your practice through one of the eight schools of magic — **Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, or Transmutation**.\n\nYour choice grants features at level 2 and again at levels **6, 10, and 14**.',
      choice: 'subclass',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 8, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 12, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 16, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 18,
      name: 'Spell Mastery',
      body: 'Choose one **level 1** and one **level 2** spell in your spellbook. You can cast those spells **at their lowest level without expending a slot** when you have them prepared. You can swap the chosen spells by studying for 8 hours.',
    },
    { level: 19, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 20,
      name: 'Signature Spells',
      body: 'Choose two **level 3** spells in your spellbook as signature spells. They are **always prepared**, do not count against your prepared limit, and you can cast each **once at level 3 without expending a slot** (regaining that use on a Short or Long Rest).',
    },
  ],
};

// Each school's "Savant" feature halves the time and gold to copy spells of that school into your
// spellbook; the mechanically interesting features follow. Bodies are concise.
function savant(school: string): string {
  return `The gold and time you must spend to copy a **${school}** spell into your spellbook is **halved**.`;
}

export const WIZARD_SUBCLASSES_2014: SubclassDefinition[] = [
  {
    key: 'abjuration',
    name: 'School of Abjuration',
    classKey: 'wizard',
    system: 'dnd5e-2014',
    description: 'The magic of protection and negation — a rechargeable ward, projected shielding, and resistance to spells.',
    features: [
      { level: 2, name: 'Abjuration Savant', body: savant('Abjuration') },
      { level: 2, name: 'Arcane Ward', body: 'When you cast an abjuration spell of level 1+, you create a magical ward with **HP = twice your Wizard level + your INT modifier**. It absorbs damage you take until depleted, and recharges when you cast further abjuration spells.' },
      { level: 6, name: 'Projected Ward', body: 'When a creature within 30 feet takes damage, you can use your **Reaction to have your Arcane Ward absorb it** instead.' },
      { level: 10, name: 'Improved Abjuration', body: 'When you use an ability that requires an ability check to counter or dispel magic (like Counterspell or Dispel Magic), add your **proficiency bonus** to the check.' },
      { level: 14, name: 'Spell Resistance', body: 'You have **Advantage on saving throws against spells**, and **Resistance to the damage** of spells.' },
    ],
  },
  {
    key: 'conjuration',
    name: 'School of Conjuration',
    classKey: 'wizard',
    system: 'dnd5e-2014',
    description: 'Summoning and teleportation — conjured objects, short blinks, and hardier summoned allies.',
    features: [
      { level: 2, name: 'Conjuration Savant', body: savant('Conjuration') },
      { level: 2, name: 'Minor Conjuration', body: 'As an Action, you conjure a nonmagical object (up to 3 feet on a side, 10 lb) that lasts 1 hour or until it takes damage.' },
      { level: 6, name: 'Benign Transposition', body: 'As an Action, you **teleport up to 30 feet**, or swap places with a willing creature within 30 feet. Reusable after you cast a conjuration spell of level 1+.' },
      { level: 10, name: 'Focused Conjuration', body: 'Your **concentration on a conjuration spell cannot be broken by taking damage**.' },
      { level: 14, name: 'Durable Summons', body: 'Any creature you summon or create with a conjuration spell has **30 Temporary Hit Points**.' },
    ],
  },
  {
    key: 'divination',
    name: 'School of Divination',
    classKey: 'wizard',
    system: 'dnd5e-2014',
    description: 'Foresight made manifest — the Portent rolls that rewrite fate, and senses that pierce any veil.',
    features: [
      { level: 2, name: 'Divination Savant', body: savant('Divination') },
      { level: 2, name: 'Portent', body: 'After each Long Rest, roll **two d20s** and record them. You can **replace any attack roll, save, or ability check** (yours or a creature you can see) with one of these rolls, before the roll is made.' },
      { level: 6, name: 'Expert Divination', body: 'When you cast a divination spell of level 2+, you **regain a spell slot** of a lower level (no higher than 5th).' },
      { level: 10, name: 'The Third Eye', body: 'As an Action, gain one benefit until you are Incapacitated or take a Short/Long Rest: darkvision 60 ft, see invisibility 10 ft, read any language, or ethereal sight 60 ft.' },
      { level: 14, name: 'Greater Portent', body: 'You roll **three d20s** for your Portent feature.' },
    ],
  },
  {
    key: 'enchantment',
    name: 'School of Enchantment',
    classKey: 'wizard',
    system: 'dnd5e-2014',
    description: 'The bending of minds — a hypnotic gaze, redirected attacks, and charms split across two victims.',
    features: [
      { level: 2, name: 'Enchantment Savant', body: savant('Enchantment') },
      { level: 2, name: 'Hypnotic Gaze', body: 'As an Action, charm a creature within 5 feet (Wisdom save) so it is **Charmed and Incapacitated** while you maintain it as an Action each turn.' },
      { level: 6, name: 'Instinctive Charm', body: 'When a creature within 30 feet attacks you, you can use your **Reaction to redirect the attack** to another creature (Wisdom save negates).' },
      { level: 10, name: 'Split Enchantment', body: 'When you cast an enchantment spell that targets only one creature, you can have it **target a second creature**.' },
      { level: 14, name: 'Alter Memories', body: 'When you cast an enchantment spell to charm a creature, you can make it **unaware it was charmed** and erase its memory of the time.' },
    ],
  },
  {
    key: 'evocation',
    name: 'School of Evocation',
    classKey: 'wizard',
    system: 'dnd5e-2014',
    description: 'Raw elemental force, shaped with precision — blasts that spare your allies and cantrips that never fully miss.',
    features: [
      { level: 2, name: 'Evocation Savant', body: savant('Evocation') },
      { level: 2, name: 'Sculpt Spells', body: 'When you cast an evocation spell affecting other creatures you can see, choose **1 + the spell\'s level** of them to automatically **succeed their save and take no damage**.' },
      { level: 6, name: 'Potent Cantrip', body: 'Creatures that succeed on a save against your **cantrip** still take **half the cantrip\'s damage** (if any).' },
      { level: 10, name: 'Empowered Evocation', body: 'You add your **Intelligence modifier** to one damage roll of any Wizard **evocation** spell you cast.' },
      { level: 14, name: 'Overchannel', body: 'When you cast a Wizard spell of levels 1–5 that deals damage, you can deal **maximum damage** with it. After the first use per Long Rest, doing so deals escalating necrotic damage to you.' },
    ],
  },
  {
    key: 'illusion',
    name: 'School of Illusion',
    classKey: 'wizard',
    system: 'dnd5e-2014',
    description: 'Deceptions that grow real — reshaped illusions, a decoy that saves your life, and figments that gain substance.',
    features: [
      { level: 2, name: 'Illusion Savant', body: savant('Illusion') },
      { level: 2, name: 'Improved Minor Illusion', body: 'You learn the **Minor Illusion** cantrip and can create **both a sound and an image** with a single casting of it.' },
      { level: 6, name: 'Malleable Illusions', body: 'As an Action, you can **change the nature of an illusion** you cast (with a duration of 1 minute+) while it lasts.' },
      { level: 10, name: 'Illusory Self', body: 'When a creature makes an attack roll against you, you can use your **Reaction to interpose an illusory duplicate**, causing the attack to **miss**. Reusable after a Short or Long Rest.' },
      { level: 14, name: 'Illusory Reality', body: 'When you cast an illusion spell of level 1+, you can make **one inanimate, illusory object real** for 1 minute.' },
    ],
  },
  {
    key: 'necromancy',
    name: 'School of Necromancy',
    classKey: 'wizard',
    system: 'dnd5e-2014',
    description: 'Mastery of life and death — health harvested from the slain, an army of the risen, and command over the undead.',
    features: [
      { level: 2, name: 'Necromancy Savant', body: savant('Necromancy') },
      { level: 2, name: 'Grim Harvest', body: 'Once per turn, when you kill a creature with a spell of level 1+, you **regain Hit Points equal to twice the spell\'s level** (three times for necromancy spells).' },
      { level: 6, name: 'Undead Thralls', body: 'You learn Animate Dead; when you cast it you can **raise one additional undead**, and your created undead gain bonus HP and add your proficiency bonus to their weapon damage.' },
      { level: 10, name: 'Inured to Undeath', body: 'You have **Resistance to necrotic damage**, and your **Hit Point maximum cannot be reduced**.' },
      { level: 14, name: 'Command Undead', body: 'As an Action, you can **bring an undead under your control** (Charisma save; it saves at Advantage if its Intelligence is 8+ / 12+).' },
    ],
  },
  {
    key: 'transmutation',
    name: 'School of Transmutation',
    classKey: 'wizard',
    system: 'dnd5e-2014',
    description: 'The reshaping of matter and self — minor alchemy, a stone of shifting benefits, and the power to remake a body.',
    features: [
      { level: 2, name: 'Transmutation Savant', body: savant('Transmutation') },
      { level: 2, name: 'Minor Alchemy', body: 'You can spend 10 minutes to **transform one material into another** (wood, stone, iron, copper, silver) for up to 1 hour.' },
      { level: 6, name: 'Transmuter\'s Stone', body: 'You create a stone that grants its bearer one benefit (darkvision 60 ft, +10 speed, proficiency in Constitution saves, or resistance to one damage type); you can change the benefit when you cast a transmutation spell of level 1+.' },
      { level: 10, name: 'Shapechanger', body: 'You add **Polymorph** to your spellbook, and can cast it targeting only yourself to become a CR 1 beast **once per Short or Long Rest without a slot**.' },
      { level: 14, name: 'Master Transmuter', body: 'As an Action, you can consume your Transmuter\'s Stone to produce a major transmutation: transmute an object, remove curses/diseases/poison, restore youth, or replicate Raise Dead.' },
    ],
  },
];
