// lib/dnd/classes/dnd5e-2014/cleric.ts — Cleric, 2014 Player's Handbook.
//
// 2014 tells vs 2024: the Divine Domain is chosen at level 1 (features at 1/2/6/8/17), Channel
// Divinity scales 1→3 per rest at 2/6/18, Destroy Undead climbs CR 1/2→4, and all SEVEN PHB domains
// (Knowledge, Life, Light, Nature, Tempest, Trickery, War). Full caster, WIS, spells PREPARED. Each
// domain carries always-prepared Domain Spells and either Divine Strike or Potent Spellcasting at 8.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { FULL_CASTER_SLOTS } from '../slots';

export const CLERIC_2014: ClassDefinition = {
  key: 'cleric',
  name: 'Cleric',
  system: 'dnd5e-2014',
  hitDie: 8,
  primaryAbility: ['wis'],
  savingThrows: ['wis', 'cha'],
  skillChoices: { count: 2, from: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
  armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
  weaponProficiencies: ['Simple weapons'],
  asiLevels: [4, 8, 12, 16, 19],
  subclassLevel: 1,
  subclassLabel: 'Divine Domain',
  description:
    'A priestly champion who wields divine magic in service of a higher power — healing, warding, and smiting, with a domain that shapes exactly what kind of miracle you are.',
  startingEquipment: [
    'A mace, or a warhammer (if proficient)',
    'Scale mail, leather armor, or chain mail (if proficient)',
    'A light crossbow and 20 bolts, or any simple weapon',
    'A Priest\'s Pack or an Explorer\'s Pack, a shield, and a holy symbol',
  ],
  spellcasting: {
    kind: 'full',
    ability: 'wis',
    preparedRule: 'Spells PREPARED = your Wisdom modifier + your Cleric level (minimum one). Change the list on a Long Rest. Domain Spells are always prepared and do not count against this.',
    cantripsKnown: [0, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    slots: FULL_CASTER_SLOTS,
  },
  features: [
    {
      level: 1,
      name: 'Spellcasting',
      body:
        'As a conduit for divine power, you can cast Cleric spells. **Wisdom** is your spellcasting ability; your spell save DC = **8 + your Wisdom modifier + your proficiency bonus**. You know **three cantrips** (four at 4, five at 10) and **prepare** a number of Cleric spells equal to your **Wisdom modifier + your Cleric level** (minimum one), changing the list on a Long Rest. You use the **full-caster** slot table.',
    },
    {
      level: 1,
      name: 'Divine Domain',
      body:
        'You choose a domain related to your deity — **Knowledge, Life, Light, Nature, Tempest, Trickery, or War**. Each grants **Domain Spells** (always prepared, free of your prepared limit) and features at level 1, and again at levels **2, 6, 8, and 17**.',
      choice: 'subclass',
    },
    {
      level: 2,
      name: 'Channel Divinity',
      body:
        'You gain the ability to channel divine energy directly from your deity. You start with two effects: **Turn Undead** and an effect granted by your domain. You use Channel Divinity **once per Short or Long Rest**, rising to **twice at level 6** and **three times at level 18**.\n\n**Turn Undead** — as an Action, each undead within 30 feet that can see or hear you must make a **Wisdom saving throw** or be **Turned for 1 minute** (it must move away from you and cannot take reactions).',
    },
    {
      level: 5,
      name: 'Destroy Undead',
      body: 'When an undead of **CR 1/2 or lower** fails its saving throw against your Turn Undead, it is instantly **destroyed**. The CR threshold rises to **1 at level 8, 2 at 11, 3 at 14, and 4 at 17**.',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 8, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    {
      level: 10,
      name: 'Divine Intervention',
      body:
        'You can call on your deity to intervene. As an Action, describe the assistance you seek and roll **percentile dice**; if you roll a number **equal to or less than your Cleric level**, your deity intervenes. If it succeeds, you cannot use this feature again for 7 days; otherwise you can use it again after a Long Rest. At **level 20**, your call **succeeds automatically**.',
    },
    { level: 12, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 16, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
    { level: 19, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two by 1 each (max 20), or take a feat.', choice: 'asi' },
  ],
};

// Domain Spells are always prepared at the listed Cleric level. Feature bodies are kept concise; the
// Channel Divinity option and the level-8 strike/spellcasting boost are the mechanically load-bearing
// parts of each domain.
export const CLERIC_SUBCLASSES_2014: SubclassDefinition[] = [
  {
    key: 'knowledge',
    name: 'Knowledge Domain',
    classKey: 'cleric',
    system: 'dnd5e-2014',
    description: 'The pursuit of every secret — languages, borrowed skills, and a touch that reads an object\'s past.',
    alwaysPrepared: { 1: ['Command', 'Identify'], 3: ['Augury', 'Suggestion'], 5: ['Nondetection', 'Speak with Dead'], 7: ['Arcane Eye', 'Confusion'], 9: ['Legend Lore', 'Scrying'] },
    features: [
      { level: 1, name: 'Blessings of Knowledge', body: 'You learn **two languages**, and gain proficiency (with doubled proficiency bonus) in **two** of Arcana, History, Nature, or Religion.' },
      { level: 2, name: 'Channel Divinity: Knowledge of the Ages', body: 'As an Action, you gain **proficiency with one skill or tool** of your choice for 10 minutes.' },
      { level: 6, name: 'Channel Divinity: Read Thoughts', body: 'As an Action, one creature within 60 feet makes a Wisdom save; on a failure you can **read its surface thoughts** for 1 minute and cast Suggestion on it without a slot.' },
      { level: 8, name: 'Potent Spellcasting', body: 'You add your **Wisdom modifier** to the damage of any Cleric **cantrip**.' },
      { level: 17, name: 'Visions of the Past', body: 'Through concentration and prayer you can call up **visions of an object\'s or area\'s past**.' },
    ],
  },
  {
    key: 'life',
    name: 'Life Domain',
    classKey: 'cleric',
    system: 'dnd5e-2014',
    description: 'The positive energy of life itself — the strongest healer in the game, and a heavy-armored bulwark.',
    alwaysPrepared: { 1: ['Bless', 'Cure Wounds'], 3: ['Lesser Restoration', 'Spiritual Weapon'], 5: ['Beacon of Hope', 'Revivify'], 7: ['Death Ward', 'Guardian of Faith'], 9: ['Mass Cure Wounds', 'Raise Dead'] },
    features: [
      { level: 1, name: 'Bonus Proficiency', body: 'You gain proficiency with **heavy armor**.' },
      { level: 1, name: 'Disciple of Life', body: 'Whenever you use a spell of level 1+ to restore Hit Points, the creature regains **extra HP equal to 2 + the spell\'s level**.' },
      { level: 2, name: 'Channel Divinity: Preserve Life', body: 'As an Action, restore Hit Points equal to **five times your Cleric level**, split among creatures within 30 feet, up to half each creature\'s maximum.' },
      { level: 6, name: 'Blessed Healer', body: 'When you cast a spell of level 1+ that heals another creature, you also regain **2 + the spell\'s level** Hit Points.' },
      { level: 8, name: 'Divine Strike', body: 'Once per turn, when you hit with a weapon attack, deal an extra **1d8 radiant damage** (2d8 at level 14).' },
      { level: 17, name: 'Supreme Healing', body: 'When you would roll dice to restore Hit Points with a spell, you instead use the **highest number possible** for each die.' },
    ],
  },
  {
    key: 'light',
    name: 'Light Domain',
    classKey: 'cleric',
    system: 'dnd5e-2014',
    description: 'Radiance and revelation — a warding flare, a burst of sunlight, and command over illumination.',
    alwaysPrepared: { 1: ['Burning Hands', 'Faerie Fire'], 3: ['Flaming Sphere', 'Scorching Ray'], 5: ['Daylight', 'Fireball'], 7: ['Guardian of Faith', 'Wall of Fire'], 9: ['Flame Strike', 'Scrying'] },
    features: [
      { level: 1, name: 'Bonus Cantrip', body: 'You learn the **Light** cantrip if you do not already know it.' },
      { level: 1, name: 'Warding Flare', body: 'When a creature within 30 feet attacks you, you can use your **Reaction to impose Disadvantage** on the roll (uses = your Wisdom modifier, per Long Rest).' },
      { level: 2, name: 'Channel Divinity: Radiance of the Dawn', body: 'As an Action, dispel magical Darkness within 30 feet and deal **2d10 + your Cleric level radiant damage** to hostile creatures there (Con save for half).' },
      { level: 6, name: 'Improved Flare', body: 'You can use **Warding Flare** when a creature you can see within 30 feet attacks a creature **other than you**.' },
      { level: 8, name: 'Potent Spellcasting', body: 'You add your **Wisdom modifier** to the damage of any Cleric **cantrip**.' },
      { level: 17, name: 'Corona of Light', body: 'As an Action, emit **bright light in a 60-foot radius** for 1 minute; enemies in it have **Disadvantage on saves** against spells that deal fire or radiant damage.' },
    ],
  },
  {
    key: 'nature',
    name: 'Nature Domain',
    classKey: 'cleric',
    system: 'dnd5e-2014',
    description: 'A priest of the wild gods — druidic cantrips, charmed beasts and plants, and heavy armor besides.',
    alwaysPrepared: { 1: ['Animal Friendship', 'Speak with Animals'], 3: ['Barkskin', 'Spike Growth'], 5: ['Plant Growth', 'Wind Wall'], 7: ['Dominate Beast', 'Grasping Vine'], 9: ['Insect Plague', 'Tree Stride'] },
    features: [
      { level: 1, name: 'Acolyte of Nature', body: 'You learn one **Druid cantrip** and gain proficiency in one of Animal Handling, Nature, or Survival.' },
      { level: 1, name: 'Bonus Proficiency', body: 'You gain proficiency with **heavy armor**.' },
      { level: 2, name: 'Channel Divinity: Charm Animals and Plants', body: 'As an Action, each beast or plant creature within 30 feet makes a Wisdom save or is **Charmed** by you for 1 minute.' },
      { level: 6, name: 'Dampen Elements', body: 'When you or a creature within 30 feet takes acid, cold, fire, lightning, or thunder damage, you can use your **Reaction to grant Resistance** to that instance.' },
      { level: 8, name: 'Divine Strike', body: 'Once per turn, when you hit with a weapon attack, deal an extra **1d8 cold, fire, or lightning damage** (2d8 at level 14).' },
      { level: 17, name: 'Master of Nature', body: 'You can use a **Bonus Action to command** the actions of creatures Charmed by your Channel Divinity while the charm lasts.' },
    ],
  },
  {
    key: 'tempest',
    name: 'Tempest Domain',
    classKey: 'cleric',
    system: 'dnd5e-2014',
    description: 'Storm and sea — maximized thunderbolts, a retaliatory shock, and eventually flight on the wind.',
    alwaysPrepared: { 1: ['Fog Cloud', 'Thunderwave'], 3: ['Gust of Wind', 'Shatter'], 5: ['Call Lightning', 'Sleet Storm'], 7: ['Control Water', 'Ice Storm'], 9: ['Destructive Wave', 'Insect Plague'] },
    features: [
      { level: 1, name: 'Bonus Proficiencies', body: 'You gain proficiency with **heavy armor and martial weapons**.' },
      { level: 1, name: 'Wrath of the Storm', body: 'When a creature within 5 feet hits you, you can use your **Reaction to deal 2d8 lightning or thunder damage** (Dex save for half); uses = your Wisdom modifier per Long Rest.' },
      { level: 2, name: 'Channel Divinity: Destructive Wrath', body: 'When you roll lightning or thunder damage, you can use Channel Divinity to deal **maximum damage** instead of rolling.' },
      { level: 6, name: 'Thunderbolt Strike', body: 'When you deal lightning damage to a Large or smaller creature, you can **push it up to 10 feet** away.' },
      { level: 8, name: 'Divine Strike', body: 'Once per turn, when you hit with a weapon attack, deal an extra **1d8 thunder damage** (2d8 at level 14).' },
      { level: 17, name: 'Stormborn', body: 'You have a **flying speed equal to your current walking speed** whenever you are not underground or indoors.' },
    ],
  },
  {
    key: 'trickery',
    name: 'Trickery Domain',
    classKey: 'cleric',
    system: 'dnd5e-2014',
    description: 'A divine trickster — blessings of stealth, duplicates and disguises, and a poisoned touch.',
    alwaysPrepared: { 1: ['Charm Person', 'Disguise Self'], 3: ['Mirror Image', 'Pass without Trace'], 5: ['Blink', 'Dispel Magic'], 7: ['Dimension Door', 'Polymorph'], 9: ['Dominate Person', 'Modify Memory'] },
    features: [
      { level: 1, name: 'Blessing of the Trickster', body: 'You can use an Action to give a willing creature **Advantage on Dexterity (Stealth) checks** for 1 hour.' },
      { level: 2, name: 'Channel Divinity: Invoke Duplicity', body: 'As an Action, create an **illusory duplicate** of yourself for 1 minute; you can cast spells as though from its space and gain Advantage on attacks when both you and it are within 5 feet of a target.' },
      { level: 6, name: 'Channel Divinity: Cloak of Shadows', body: 'As an Action, you become **Invisible** until the end of your next turn or until you attack or cast a spell.' },
      { level: 8, name: 'Divine Strike', body: 'Once per turn, when you hit with a weapon attack, deal an extra **1d8 poison damage** (2d8 at level 14).' },
      { level: 17, name: 'Improved Duplicity', body: 'You can create **up to four duplicates** with Invoke Duplicity, and allies gain the attack Advantage near any of them.' },
    ],
  },
  {
    key: 'war',
    name: 'War Domain',
    classKey: 'cleric',
    system: 'dnd5e-2014',
    description: 'The god of battle made manifest — bonus attacks, divine favor on the swing, and a shield against the worst blows.',
    alwaysPrepared: { 1: ['Divine Favor', 'Shield of Faith'], 3: ['Magic Weapon', 'Spiritual Weapon'], 5: ['Crusader\'s Mantle', 'Spirit Guardians'], 7: ['Freedom of Movement', 'Stoneskin'], 9: ['Flame Strike', 'Hold Monster'] },
    features: [
      { level: 1, name: 'Bonus Proficiencies', body: 'You gain proficiency with **heavy armor and martial weapons**.' },
      { level: 1, name: 'War Priest', body: 'When you take the Attack action, you can make **one weapon attack as a Bonus Action**; uses = your Wisdom modifier per Long Rest.' },
      { level: 2, name: 'Channel Divinity: Guided Strike', body: 'When you make an attack roll, you can use Channel Divinity to gain a **+10 bonus** to it, after seeing the roll but before knowing the outcome.' },
      { level: 6, name: 'Channel Divinity: War God\'s Blessing', body: 'When a creature within 30 feet makes an attack roll, you can use your **Reaction and Channel Divinity to grant it +10** to the roll.' },
      { level: 8, name: 'Divine Strike', body: 'Once per turn, when you hit with a weapon attack, deal an extra **1d8 damage of the weapon\'s type** (2d8 at level 14).' },
      { level: 17, name: 'Avatar of Battle', body: 'You gain **Resistance to bludgeoning, piercing, and slashing damage** from nonmagical weapons.' },
    ],
  },
];
