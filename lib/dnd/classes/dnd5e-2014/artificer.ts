// lib/dnd/classes/dnd5e-2014/artificer.ts — Artificer (Eberron: Rising from the Last War / Tasha's).
//
// Not a PHB class, but the fourth-pillar caster of the 2014 rules era, so it lives with dnd5e-2014.
// Its quirks: an INT half-caster that PREPARES and casts from LEVEL 1 (the half-caster table rounded
// up — see ARTIFICER_SLOTS), Infuse Item (magic-item infusions), tool-based casting, and specialists
// chosen at level 3 (Alchemist, Artillerist, Battle Smith, Armorer). ASI at 19, no Epic Boon.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { ARTIFICER_SLOTS } from '../slots';

export const ARTIFICER_2014: ClassDefinition = {
  key: 'artificer',
  name: 'Artificer',
  system: 'dnd5e-2014',
  hitDie: 8,
  primaryAbility: ['int'],
  savingThrows: ['con', 'int'],
  skillChoices: {
    count: 2,
    from: ['arcana', 'history', 'investigation', 'medicine', 'nature', 'perception', 'sleight'],
  },
  armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
  weaponProficiencies: ['Simple weapons'],
  toolProficiencies: ['Thieves\' tools', 'Tinker\'s tools', 'One type of artisan\'s tools of your choice'],
  asiLevels: [4, 8, 12, 16, 19],
  subclassLevel: 3,
  subclassLabel: 'Artificer Specialist',
  description:
    'A master of invention who channels magic through tools and inventions — imbuing objects with spell effects, infusing gear with lasting magic, and adapting the right device to any problem.',
  startingEquipment: [
    'Any two simple weapons and a light crossbow with 20 bolts',
    'Studded leather armor, or scale mail',
    'Thieves\' tools and a Dungeoneer\'s Pack',
  ],
  spellcasting: {
    kind: 'half',
    ability: 'int',
    preparedRule: 'Spells PREPARED = your Intelligence modifier + half your Artificer level (rounded down), minimum one. The Artificer is the half-caster that casts from LEVEL 1 (slots round up). You cast using tools as a spellcasting focus.',
    cantripsKnown: [0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4],
    slots: ARTIFICER_SLOTS,
  },
  features: [
    {
      level: 1,
      name: 'Magical Tinkering',
      body:
        'You can invest a spark of magic into a Tiny nonmagical object to give it one minor property: it sheds bright light, emits a recorded message, emits a smell or sound, or bears a static visual effect. You can affect a number of objects equal to your **Intelligence modifier** (minimum one).',
    },
    {
      level: 1,
      name: 'Spellcasting',
      body:
        'You have studied the workings of magic and how to channel it through objects. **Intelligence** is your spellcasting ability; your spell save DC = **8 + your Intelligence modifier + your proficiency bonus**. You use **tools as a spellcasting focus**, know **two cantrips** (scaling to four), and **prepare** a number of Artificer spells equal to your **Intelligence modifier + half your Artificer level** (minimum one). Unusually for a half-caster, you have spell slots **from level 1**.',
    },
    {
      level: 2,
      name: 'Infuse Item',
      body:
        'You gain the ability to imbue mundane items with magic. You learn **four infusions** (such as Enhanced Weapon, Bag of Holding, or Repeating Shot). After a Long Rest you can imbue up to **two** items with infusions you know; they become magic items. The number known and the number of infused items rise as you level.',
    },
    {
      level: 3,
      name: 'Artificer Specialist',
      body:
        'You choose the specialty that defines your inventions — **Alchemist**, **Artillerist**, **Battle Smith**, or **Armorer**.\n\nYour choice grants features at level 3 and again at levels **5, 9, and 15**, and adds its own always-prepared spells.',
      choice: 'subclass',
    },
    {
      level: 3,
      name: 'The Right Tool for the Job',
      body: 'With tinker\'s tools in hand over 1 hour (during a rest), you can magically create **one set of artisan\'s tools** of your choice in an unoccupied space. It lasts until you use this feature again or die.',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 6,
      name: 'Tool Expertise',
      body: 'Your **proficiency bonus is doubled** for any ability check you make that uses your proficiency with a tool.',
    },
    {
      level: 7,
      name: 'Flash of Genius',
      body: 'When you or a creature within 30 feet makes an ability check or a saving throw, you can use your **Reaction to add your Intelligence modifier** to the roll. Uses = your Intelligence modifier, per Long Rest.',
    },
    { level: 8, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 10,
      name: 'Magic Item Adept',
      body: 'You can **attune to up to four magic items** at once, and crafting a common or uncommon magic item takes you a quarter of the normal time and costs half as much.',
    },
    {
      level: 11,
      name: 'Spell-Storing Item',
      body: 'After a Long Rest, you can store a level 1 or 2 Artificer spell in an item; a creature holding it can cast the stored spell using your spellcasting ability. It holds a number of charges equal to **twice your Intelligence modifier**.',
    },
    { level: 12, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 14,
      name: 'Magic Item Savant',
      body: 'You can **attune to up to five magic items** at once, and you ignore all class, race, spell, and level requirements on attuning to or using a magic item.',
    },
    { level: 16, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 18,
      name: 'Magic Item Master',
      body: 'You can **attune to up to six magic items** at once.',
    },
    { level: 19, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 20,
      name: 'Soul of Artifice',
      body:
        'You gain a **+1 bonus to all saving throws** for each magic item you are attuned to. In addition, if you are reduced to 0 Hit Points but not killed outright, you can use your **Reaction to end one of your artificer infusions** and drop to **1 Hit Point** instead.',
    },
  ],
};

export const ARTIFICER_SUBCLASSES_2014: SubclassDefinition[] = [
  {
    key: 'alchemist',
    name: 'Alchemist',
    classKey: 'artificer',
    system: 'dnd5e-2014',
    description: 'A master of potions and elixirs — healing and harming reagents, and spells that lean on restoration and acid.',
    alwaysPrepared: { 3: ['Healing Word', 'Ray of Sickness'], 5: ['Flaming Sphere', 'Melf\'s Acid Arrow'], 9: ['Gaseous Form', 'Mass Healing Word'], 13: ['Blight', 'Death Ward'], 15: ['Cloudkill', 'Raise Dead'] },
    features: [
      { level: 3, name: 'Experimental Elixir', body: 'After a Long Rest you can magically produce an **Experimental Elixir** in a flask (roll or choose an effect: Healing, Swiftness, Resilience, Boldness, Flight, or Transformation). You make more elixirs at higher levels and can spend a spell slot to make one on the fly.' },
      { level: 3, name: 'Tool Proficiency', body: 'You gain proficiency with **alchemist\'s supplies** (and can add the Alchemist spells to your always-prepared list).' },
      { level: 5, name: 'Alchemical Savant', body: 'When you cast a spell using alchemist\'s supplies as the focus, add your **Intelligence modifier** to one roll of the spell that restores Hit Points or deals acid, fire, necrotic, or poison damage.' },
      { level: 9, name: 'Restorative Reagents', body: 'When a creature drinks your Experimental Elixir, it gains **2d6 + your Intelligence modifier Temporary Hit Points**. You can also cast **Lesser Restoration** without a slot a number of times equal to your Intelligence modifier per Long Rest.' },
      { level: 15, name: 'Chemical Mastery', body: 'You gain **Resistance to acid and poison damage** and immunity to the Poisoned condition, and you can cast **Greater Restoration** and **Heal** once each per Long Rest without a slot.' },
    ],
  },
  {
    key: 'artillerist',
    name: 'Artillerist',
    classKey: 'artificer',
    system: 'dnd5e-2014',
    description: 'A siege-engineer of arcane force — a summonable Eldritch Cannon and a wand that amplifies your blasts.',
    alwaysPrepared: { 3: ['Shield', 'Thunderwave'], 5: ['Scorching Ray', 'Shatter'], 9: ['Fireball', 'Wind Wall'], 13: ['Ice Storm', 'Wall of Fire'], 15: ['Cone of Cold', 'Wall of Force'] },
    features: [
      { level: 3, name: 'Eldritch Cannon', body: 'Using tinker\'s tools, you create a Small or Tiny **Eldritch Cannon** (Flamethrower, Force Ballista, or Protector). As a Bonus Action you can activate it to attack or shield allies. It lasts 1 hour and you can have one at a time (two at level 11).' },
      { level: 3, name: 'Tool Proficiency', body: 'You gain proficiency with **woodcarver\'s tools**.' },
      { level: 5, name: 'Arcane Firearm', body: 'You can use a wand, staff, or rod as an Arcane Firearm spellcasting focus; when you cast an Artificer spell through it, add **1d8 to one damage roll** of that spell.' },
      { level: 9, name: 'Explosive Cannon', body: 'Your Eldritch Cannon\'s damage rolls **increase by 1d8**, and you can command it to Detonate (dealing 3d8 force in a 20-foot radius) as a Bonus Action.' },
      { level: 15, name: 'Fortified Position', body: 'You and your allies have **half cover** while within 10 feet of your cannon, and you can have **two cannons** at once, activating both with one Bonus Action.' },
    ],
  },
  {
    key: 'battle-smith',
    name: 'Battle Smith',
    classKey: 'artificer',
    system: 'dnd5e-2014',
    description: 'A protector who fights beside a construct companion — a Steel Defender and a weapon powered by intellect.',
    alwaysPrepared: { 3: ['Heroism', 'Shield'], 5: ['Branding Smite', 'Warding Bond'], 9: ['Aura of Vitality', 'Conjure Barrage'], 13: ['Aura of Purity', 'Fire Shield'], 15: ['Banishing Smite', 'Mass Cure Wounds'] },
    features: [
      { level: 3, name: 'Battle Ready', body: 'You gain proficiency with **martial weapons**, and you can use your **Intelligence modifier** instead of Strength or Dexterity for the attack and damage rolls of magic weapons.' },
      { level: 3, name: 'Steel Defender', body: 'You build a loyal **Steel Defender** construct that fights at your side. It adds your proficiency bonus to its AC, attacks, and saves, has HP tied to your level, and you command it with a Bonus Action.' },
      { level: 5, name: 'Extra Attack', body: 'You can attack **twice**, instead of once, whenever you take the Attack action on your turn.' },
      { level: 9, name: 'Arcane Jolt', body: 'When your magic-weapon attack or your Steel Defender hits, you can spend a use to either deal **2d6 extra force damage** or **heal a creature within 30 feet 2d6 HP**. Uses = your Intelligence modifier per Long Rest.' },
      { level: 15, name: 'Improved Defender', body: 'Your Arcane Jolt heal/damage increases to **4d6**, and your Steel Defender gains a Deflect Attack reaction that reduces damage to an ally.' },
    ],
  },
  {
    key: 'armorer',
    name: 'Armorer',
    classKey: 'artificer',
    system: 'dnd5e-2014',
    description: 'A power-armor pilot — Arcane Armor you never take off, in a Guardian or Infiltrator model that fights or sneaks.',
    alwaysPrepared: { 3: ['Magic Missile', 'Thunderwave'], 5: ['Mirror Image', 'Shatter'], 9: ['Hypnotic Pattern', 'Lightning Bolt'], 13: ['Fire Shield', 'Greater Invisibility'], 15: ['Passwall', 'Wall of Force'] },
    features: [
      { level: 3, name: 'Arcane Armor', body: 'You turn a suit of armor into **Arcane Armor** you can don/doff as an Action; it needs no Strength, cannot be removed against your will, replaces missing limbs, and serves as a spellcasting focus.' },
      { level: 3, name: 'Armor Model', body: 'You customize your Arcane Armor into a model — **Guardian** (a Thunder Gauntlet melee weapon and a Defensive Field bonus-action temp HP) or **Infiltrator** (a Lightning Launcher ranged weapon, +5 speed, and Advantage on Stealth).' },
      { level: 5, name: 'Extra Attack', body: 'You can attack **twice**, instead of once, whenever you take the Attack action on your turn.' },
      { level: 9, name: 'Armor Modifications', body: 'You can apply **up to four infusions** to your Arcane Armor (as its own armor, weapons, and two other parts), and its parts count as separate items for infusions.' },
      { level: 15, name: 'Perfected Armor', body: 'Your armor model improves: the Guardian can pull creatures toward it and gains a damage boon; the Infiltrator\'s Lightning Launcher can slow a target and adds extra lightning damage once per turn.' },
    ],
  },
];
