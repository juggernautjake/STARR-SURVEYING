// lib/dnd/classes/dnd5e-2024/paladin.ts — the 2024 Player's Handbook Paladin.
//
// 2024 deltas from 2014, for anyone diffing this against an older sheet:
//   · Spellcasting starts at LEVEL 1, not level 2 (the half-caster slot table still starts at 2).
//   · Smiting is no longer a free slot burn: Divine Smite is a rank-1 SPELL, cast as a Bonus
//     Action after a hit, and capped at once per turn like any spell.
//   · Channel Divinity moves to level 3 and starts with Divine Sense as an option.
//   · Level 19 is an Epic Boon, not an ASI.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { HALF_CASTER_SLOTS } from '../slots';

export const PALADIN_2024: ClassDefinition = {
  key: 'paladin',
  name: 'Paladin',
  system: 'dnd5e-2024',
  hitDie: 10,
  primaryAbility: ['str', 'cha'],
  savingThrows: ['wis', 'cha'],
  skillChoices: { count: 2, from: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'] },
  armorProficiencies: ['Light armor', 'Medium armor', 'Heavy armor', 'Shields'],
  weaponProficiencies: ['Simple weapons', 'Martial weapons'],
  asiLevels: [4, 8, 12, 16],
  subclassLevel: 3,
  subclassLabel: 'Sacred Oath',
  description:
    'A warrior bound by an oath that answers back. Heavy armor, a Charisma-powered aura that props up every save the party makes, and a smite that has become an actual spell.',
  startingEquipment: [
    'Chain Mail, Shield, Longsword, 6 Javelins, Holy Symbol, Priest\'s Pack, and 9 GP',
    'or 150 GP',
  ],
  spellcasting: {
    kind: 'half',
    ability: 'cha',
    slots: HALF_CASTER_SLOTS,
    preparedRule:
      'Prepared spells are a fixed count from the Paladin table: 2/3/4/5/6/6/7/7/9/9/10/10/11/11/12/12/14/14/15/15 at levels 1–20. Note that you have Spellcasting from level 1 but no slots until level 2 — until then the feature only carries your oath and class-granted always-prepared spells. Choose from the whole Paladin list, up to the highest rank you have slots for; you may swap ONE prepared spell after each Long Rest (not the whole list). Oath spells, Divine Smite and Find Steed are always prepared and do not count against this number.',
  },
  resources: [
    {
      id: 'lay-on-hands',
      name: 'Lay On Hands (HP pool)',
      perLevel: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100],
      resetOn: 'long',
      note: 'Five times your Paladin level, spent point by point.',
    },
    {
      id: 'channel-divinity',
      name: 'Channel Divinity',
      perLevel: [0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
      resetOn: 'long',
      note: 'A Short Rest gives back ONE use; a Long Rest gives back all of them.',
    },
  ],
  features: [
    {
      level: 1,
      name: 'Lay On Hands',
      body:
        'You carry a reservoir of healing that refills on a **Long Rest**. Its size is **five times your Paladin level** — 5 at level 1, 50 at level 10, 100 at level 20.\n\nAs a **Bonus Action**, touch a creature (yourself included) and spend any number of points from the pool to restore that many Hit Points.\n\nYou can also spend **5 points** to remove the **Poisoned** condition from a creature; those 5 points do not also heal it. At level 14, **Restoring Touch** lets the same 5-point price buy off Blinded, Charmed, Deafened, Frightened, Paralyzed or Stunned as well.',
      description: 'A Long Rest pool of 5 × your Paladin level in healing, spent as a Bonus Action by touch.',
    },
    {
      level: 1,
      name: 'Spellcasting',
      body:
        'Your oath, not study, gives you magic — and in the 2024 rules it arrives at **level 1**, a level earlier than it used to.\n\n· **Prepared spells.** A fixed count from the table: 2 at level 1, rising to 15 at level 20, chosen from the whole Paladin list up to the highest rank you have slots for. After a Long Rest you may swap **one** prepared spell — unlike a Cleric, you do not rebuild the list.\n· **Slots.** The half-caster table, which does not begin until **level 2** and tops out at **rank 5**. At level 1 you have the feature but no slots, so it only carries the always-prepared spells your class and oath hand you.\n\n**Charisma** is your spellcasting ability: save DC 8 + proficiency bonus + Charisma modifier, spell attack bonus proficiency bonus + Charisma modifier. A **Holy Symbol** is your spellcasting focus.',
      description: 'Charisma half-casting, gained at level 1 — though slots do not start until level 2.',
    },
    {
      level: 1,
      name: 'Weapon Mastery',
      body:
        'Your drills let you use the **mastery property** of **two kinds of weapons** you are proficient with — for example Longswords (**Sap**) and Javelins (**Slow**).\n\nWhenever you finish a **Long Rest**, you can change one or both of those choices.\n\nUnlike a Fighter\'s, this list never grows past two, so pick for the job: Sap on your main weapon to hand out Disadvantage, Topple to knock things prone for the party\'s melee, or Vex to set up your own next swing.',
      description: 'Use the mastery properties of two weapon kinds you are proficient with, re-chosen each Long Rest.',
    },
    {
      level: 2,
      name: 'Fighting Style',
      body:
        'You gain a **Fighting Style feat** of your choice — Defense, Great Weapon Fighting, Protection, Blind Fighting and the rest are all on the table.\n\nInstead of a Fighting Style feat, you may take the Paladin-only option:\n· **Blessed Warrior.** You learn **two Cleric cantrips**. They count as Paladin spells for you and use **Charisma**. You can swap one of them for another Cleric cantrip whenever you gain a Paladin level.\n\nBlessed Warrior is the pick for a Paladin who expects to be at range or wants a Sacred Flame that does not care about their poor Dexterity; otherwise Defense (+1 AC in armor) is the safe default.',
      description: 'Take a Fighting Style feat, or Blessed Warrior for two Charisma-powered Cleric cantrips.',
      choice: 'fighting-style',
    },
    {
      level: 2,
      name: 'Paladin\'s Smite',
      body:
        'This is the 2024 rewrite people trip over: **smiting is now a spell**, not a free slot burn.\n\nYou **always have the Divine Smite spell prepared**, and it does not count against your prepared total. **Divine Smite** is a **rank-1 spell** with a **Bonus Action** casting time, cast immediately after you hit a creature with a Melee weapon or an Unarmed Strike; it deals **2d8 Radiant** damage, **+1d8 against a Fiend or Undead**, and **+1d8 for each slot rank above 1**.\n\nYou can also cast it **once without expending a spell slot**; you must finish a **Long Rest** before doing that again.\n\nThe practical consequences: it costs your **Bonus Action**, so it competes with Lay On Hands and War-style Bonus Action attacks; you cannot stack it on multiple hits in one turn; and it cannot be used at all in a turn where you already cast another spell with a spell slot.',
      description: 'Divine Smite is always prepared as a rank-1 Bonus Action spell, plus one free casting per Long Rest.',
    },
    {
      level: 3,
      name: 'Channel Divinity',
      body:
        'Your oath lets you draw power directly from the Outer Planes. You have **2 uses** (**3** at level 11); a **Short Rest returns one** and a **Long Rest returns all**. Saves these force use **your spell save DC**.\n\n· **Divine Sense.** As a **Bonus Action**, spend a use to open your senses. For **10 minutes**, or until you become **Incapacitated**, you know the **location and creature type** of every **Celestial, Fiend and Undead** within **60 feet**. In the same radius you also sense any place or object that has been **consecrated or desecrated**, as with the Hallow spell.\n\nYour oath adds its own Channel Divinity options at level 3, and they all draw on this same pool — so Divine Sense is competing with Sacred Weapon or Vow of Enmity for the same two uses.',
      description: 'A shared pool fuelling Divine Sense and your oath\'s Channel Divinity options.',
    },
    {
      level: 3,
      name: 'Paladin Subclass',
      body:
        'You swear a **Sacred Oath**: **Devotion**, **Glory**, **the Ancients**, or **Vengeance**.\n\nYour oath grants features now and again at levels **7, 15 and 20**, gives you at least one **Channel Divinity** option, and hands you **always-prepared oath spells** at Paladin levels **3, 5, 9, 13 and 17**. Those spells never count against your prepared total.\n\nNote the spell cadence: 3/5/9/13/17, not the 3/5/7/9 a Cleric domain uses — the oath list is thinner but reaches rank 5.',
      description: 'Swear the Oath of Devotion, Glory, the Ancients, or Vengeance.',
      choice: 'subclass',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — raise one ability score by 2, or two scores by 1 each, to a maximum of 20 — or instead take any other feat you qualify for.\n\nThis recurs at Paladin levels **8, 12 and 16**. Level 19 is *not* an ASI in the 2024 rules; it is an Epic Boon.\n\nCharisma is not just your spell DC here — Aura of Protection at level 6 turns every point into a party-wide save bonus.', description: 'Take the ASI feat (+2/+1+1) or another feat you qualify for.', choice: 'asi' },
    {
      level: 5,
      name: 'Extra Attack',
      body:
        'Whenever you take the **Attack action** on your turn, you can **attack twice** instead of once.\n\nThis does not change Divine Smite\'s economy — Smite is a Bonus Action spell, so a second hit does not buy a second smite in the same turn. What it does buy is a second chance to land the hit you want to smite off, and a second application of your weapon\'s mastery property.',
      description: 'Attack twice whenever you take the Attack action.',
    },
    {
      level: 5,
      name: 'Faithful Steed',
      body:
        'You always have the **Find Steed** spell prepared, and it does not count against your prepared total.\n\nYou can also cast it **once without expending a spell slot**, regaining that free casting on a **Long Rest**.\n\nThe 2024 Find Steed is a real upgrade over the old one: the steed is a **Celestial, Fey or Fiend** with its own stat block that scales, it can be summoned as a Bonus Action, and it shares your Aura of Protection while you ride it.',
      description: 'Find Steed is always prepared, plus one free casting per Long Rest.',
    },
    {
      level: 6,
      name: 'Aura of Protection',
      body:
        'The defining Paladin feature, and the reason parties want one.\n\nYou radiate an unseeable **10-foot Emanation**. **You and your allies inside it add your Charisma modifier** (minimum **+1**) **to every saving throw**. The aura is **inactive while you have the Incapacitated condition**.\n\nIf more than one Paladin\'s aura covers a creature, it benefits from **only one at a time** and chooses which.\n\nAt +5 Charisma this is a flat +5 to every save for everyone standing near you — larger than most magic items in the game, and it is why Paladins are so often the party\'s answer to save-or-suck effects. It expands to 30 feet at level 18.',
      description: 'A 10-foot aura giving you and your allies your Charisma modifier as a bonus to all saving throws.',
    },
    { level: 8, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — +2 to one score or +1 to two, to a cap of 20 — or another feat you qualify for.', description: 'Take the ASI feat or another feat you qualify for.', choice: 'asi' },
    {
      level: 9,
      name: 'Abjure Foes',
      body:
        'A second Channel Divinity option, granted by the base class.\n\nAs a **Magic action**, spend one use of **Channel Divinity** and present your Holy Symbol or weapon. Target a number of creatures equal to your **Charisma modifier** (minimum 1) that you can see within **60 feet**. Each makes a **Wisdom save** or has the **Frightened** condition for **1 minute**, or until it takes **any damage**.\n\nWhile Frightened this way, a target can do **only one** of the following on its turn: **move**, **take an action**, or **take a Bonus Action** — not two of them, and not all three.\n\nThat action-economy clamp is far harsher than ordinary Frightened, but note the fragility: the first point of damage anyone deals ends it.',
      description: 'Channel Divinity: Frighten up to Charisma-modifier creatures within 60 feet, limiting each to one thing per turn.',
    },
    {
      level: 10,
      name: 'Aura of Courage',
      body:
        'You and your allies have **Immunity to the Frightened condition** while inside your **Aura of Protection**.\n\nIf an already-Frightened ally steps into the aura, the condition **has no effect on them while they are there** — it is suppressed rather than cured, so it resumes if they leave.\n\nThis rides on the Aura of Protection, so it grows to 30 feet at level 18 and shuts off whenever you are Incapacitated.',
      description: 'You and allies in your Aura of Protection are immune to the Frightened condition.',
    },
    {
      level: 11,
      name: 'Radiant Strikes',
      body:
        'When you hit a target with an attack roll using a **Melee weapon** or an **Unarmed Strike**, that target takes an extra **1d8 Radiant** damage.\n\nThere is no once-per-turn limit and no resource: with Extra Attack this is **+2d8 every round**, on every hit, forever.\n\nThis is the feature that quietly replaced the old habit of dumping every spell slot into smites — your baseline damage is now high enough that slots can go to actual spells.',
      description: 'Every melee weapon or Unarmed Strike hit deals an extra 1d8 Radiant damage — no limit, no cost.',
    },
    { level: 12, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — +2 to one score or +1 to two, to a cap of 20 — or another feat you qualify for.', description: 'Take the ASI feat or another feat you qualify for.', choice: 'asi' },
    {
      level: 14,
      name: 'Restoring Touch',
      body:
        'Your **Lay On Hands** becomes a condition-stripper.\n\nWhen you use Lay On Hands on a creature, you can also remove one or more of these conditions from it: **Blinded, Charmed, Deafened, Frightened, Paralyzed, or Stunned**.\n\nEach condition costs **5 Hit Points** out of the Lay On Hands pool, and those points do **not** also heal the creature. Poisoned still costs its own 5 as it always did.\n\nAt level 14 your pool is 70 points, so this is up to fourteen conditions a day — a Bonus Action answer to Hold Person, a Medusa\'s gaze, or a Banshee\'s wail.',
      description: 'Lay On Hands can also strip Blinded, Charmed, Deafened, Frightened, Paralyzed, or Stunned for 5 points each.',
    },
    { level: 16, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — +2 to one score or +1 to two, to a cap of 20 — or another feat you qualify for. This is your last ASI; level 19 grants an Epic Boon instead.', description: 'Take the ASI feat or another feat you qualify for.', choice: 'asi' },
    {
      level: 18,
      name: 'Aura Expansion',
      body:
        'Your **Aura of Protection** is now a **30-foot Emanation** rather than 10 feet.\n\nEverything keyed to it expands with it — **Aura of Courage**, and any oath aura such as Aura of Devotion, Aura of Warding or Aura of Alacrity.\n\nThirty feet is large enough that the party no longer has to cluster: the ranger on the ridge and the wizard behind the line are both inside it.',
      description: 'Your Aura of Protection — and everything keyed to it — grows from a 10-foot to a 30-foot Emanation.',
    },
    {
      level: 19,
      name: 'Epic Boon',
      body:
        'You gain an **Epic Boon feat** of your choice, or any other feat you qualify for. This replaces what used to be a fifth ASI.\n\nEpic Boons are the 2024 capstone feats — **Boon of Irresistible Offense**, **Boon of Combat Prowess**, **Boon of Fate** and the rest. Most also raise one ability score by 1, to a maximum of **30** rather than 20.\n\n*Boon of Irresistible Offense* is the standard Paladin pick, since it makes your weapon damage bypass non-adamantine resistance and adds a Strength-modifier spike on a natural 20.',
      description: 'Take an Epic Boon feat (or any feat you qualify for) — not an ASI.',
      choice: 'epic-boon',
    },
  ],
};

export const PALADIN_SUBCLASSES_2024: SubclassDefinition[] = [
  {
    key: 'oath-of-devotion',
    name: 'Oath of Devotion',
    classKey: 'paladin',
    system: 'dnd5e-2024',
    description: 'The knight in shining armor. A Charisma-boosted weapon, immunity to charms for the whole aura, and a capstone that turns you into a small sun.',
    alwaysPrepared: {
      3: ['Protection from Evil and Good', 'Shield of Faith'],
      5: ['Aid', 'Zone of Truth'],
      9: ['Beacon of Hope', 'Dispel Magic'],
      13: ['Freedom of Movement', 'Guardian of Faith'],
      17: ['Commune', 'Flame Strike'],
    },
    features: [
      {
        level: 3,
        name: 'Sacred Weapon',
        body:
          'When you take the **Attack action**, you can spend one use of **Channel Divinity** to charge one **Melee weapon** you are holding with positive energy.\n\nFor **10 minutes**, or until you use this again: you add your **Charisma modifier** (minimum **+1**) to **attack rolls** with that weapon, and each hit can deal either its normal damage type or **Radiant** damage, your choice. The weapon sheds **Bright Light in a 20-foot radius** and Dim Light for 20 feet beyond.\n\nIt ends early if you stop carrying the weapon, and you can dismiss it without an action. The attack bonus is the point: a Paladin already needs Charisma for the aura, so this converts a stat you were maxing anyway into +4 or +5 to hit for the whole fight.',
        description: 'Channel Divinity: add your Charisma modifier to attack rolls with a melee weapon for 10 minutes.',
      },
      {
        level: 7,
        name: 'Aura of Devotion',
        body:
          'You and your allies have **Immunity to the Charmed condition** while inside your **Aura of Protection**.\n\nAn already-Charmed ally who enters the aura finds the condition **has no effect while they are there** — suppressed, not cured.\n\nAlongside Aura of Courage at level 10, this closes off the two conditions that most reliably turn a party against itself. It grows to 30 feet with Aura Expansion at level 18.',
        description: 'You and allies in your Aura of Protection are immune to the Charmed condition.',
      },
      {
        level: 15,
        name: 'Smite of Protection',
        body:
          'Your smites now shelter the people around you.\n\nWhenever you cast **Divine Smite**, you and your allies gain **Half Cover** while inside your **Aura of Protection**. The aura keeps that benefit until the **start of your next turn**.\n\nHalf Cover is **+2 AC and +2 to Dexterity saving throws** — for everyone in a 10-foot (later 30-foot) radius, triggered by something you were already doing every round.',
        description: 'Casting Divine Smite gives you and allies in your aura Half Cover until the start of your next turn.',
      },
      {
        level: 20,
        name: 'Holy Nimbus',
        body:
          'As a **Bonus Action**, you fill your **Aura of Protection** with holy power for **10 minutes**. Once used, you cannot do it again until a **Long Rest** — or until you expend a **rank-5 spell slot** (no action required) to restore it.\n\nWhile it lasts:\n· **Holy Ward.** You have **Advantage on saving throws** forced by a **Fiend** or an **Undead**.\n· **Radiant Damage.** Whenever an **enemy starts its turn in the aura**, it takes **Radiant** damage equal to your **Charisma modifier + your proficiency bonus**.\n· **Sunlight.** The aura is filled with **Bright Light that counts as sunlight**.\n\nAt level 20 with +5 Charisma that is 11 automatic Radiant damage per enemy per round across a 30-foot radius, plus real sunlight for anything that fears it.',
        description: 'Bonus Action: for 10 minutes your aura burns enemies for Charisma + proficiency bonus Radiant and fills with sunlight.',
      },
    ],
  },
  {
    key: 'oath-of-glory',
    name: 'Oath of Glory',
    classKey: 'paladin',
    system: 'dnd5e-2024',
    description: 'The hero of the epic. Temporary Hit Points by the fistful, a party that moves 10 feet faster, and a Reaction that turns a hit into a counterattack.',
    alwaysPrepared: {
      3: ['Guiding Bolt', 'Heroism'],
      5: ['Enhance Ability', 'Magic Weapon'],
      9: ['Haste', 'Protection from Energy'],
      13: ['Compulsion', 'Freedom of Movement'],
      17: ['Legend Lore', 'Yolande\'s Regal Presence'],
    },
    features: [
      {
        level: 3,
        name: 'Inspiring Smite',
        body:
          'Immediately after you cast **Divine Smite**, you can spend one use of **Channel Divinity** to hand out Temporary Hit Points.\n\nThe total is **2d8 + your Paladin level**, and you **divide it however you like** among any creatures you choose within **30 feet**, including yourself.\n\nAt level 11 that is roughly 20 Temporary HP off one Channel Divinity use, on top of the smite you were already casting — and because you split it freely, you can dump it all on whoever is about to be focused.',
        description: 'After casting Divine Smite, spend Channel Divinity to split 2d8 + your Paladin level in Temporary HP within 30 feet.',
      },
      {
        level: 3,
        name: 'Peerless Athlete',
        body:
          'As a **Bonus Action**, spend one use of **Channel Divinity** to become superhuman for **1 hour**.\n\nFor that duration you have **Advantage on Strength (Athletics) and Dexterity (Acrobatics)** checks, and the distance of your **Long and High jumps increases by 10 feet** (the extra distance still costs movement as normal).\n\nAn hour is long enough that this is an exploration button, not a combat one — grapples, shoves, climbs, chases and the occasional absurd leap.',
        description: 'Channel Divinity: for 1 hour, Advantage on Athletics and Acrobatics and +10 feet of jump distance.',
      },
      {
        level: 7,
        name: 'Aura of Alacrity',
        body:
          'Your **Speed increases by 10 feet**, permanently.\n\nIn addition, whenever an **ally enters your Aura of Protection** for the first time on a turn, or **starts its turn there**, that ally\'s Speed increases by **10 feet until the end of its next turn**.\n\nNote how it interacts with the aura: the ally does not have to stay inside it, so at 18th level a 30-foot aura is effectively handing the whole party a permanent movement buff.',
        description: 'You gain +10 feet of Speed, and allies in your Aura of Protection gain +10 feet until the end of their next turn.',
      },
      {
        level: 15,
        name: 'Glorious Defense',
        body:
          'When **you or a creature you can see within 10 feet** of you is **hit by an attack roll**, you can take a **Reaction** to grant the target a bonus to **AC equal to your Charisma modifier** (minimum **+1**) against that attack — potentially turning the hit into a miss.\n\nIf the attack **does** miss, you can make **one attack with a weapon against the attacker** as part of that same Reaction, provided it is in range.\n\nYou can do this a number of times equal to your **Charisma modifier** (minimum once), regaining all uses on a **Long Rest**. Note it resolves after you know the attack hit, so you only spend it where the +5 might actually matter.',
        description: 'Reaction: add your Charisma modifier to AC against a hit within 10 feet, and counterattack if it misses.',
      },
      {
        level: 20,
        name: 'Living Legend',
        body:
          'As a **Bonus Action**, you become the story people tell about you for **1 minute**. Once used, you cannot do it again until a **Long Rest** — or until you expend a **rank-5 spell slot** (no action required).\n\nWhile it lasts:\n· **Charisma.** You have **Advantage on all Charisma checks**.\n· **Saving Throws.** If you **fail a saving throw**, you can take a **Reaction to reroll it**, and you must use the new roll.\n· **Attacks.** **Once per turn**, when you **miss with an attack roll**, you can cause that attack to **hit instead**.\n\nThe guaranteed hit is the headline, but the save reroll is what keeps you standing — it is one Reaction per round, so it stacks with Glorious Defense only across turns.',
        description: 'For 1 minute: Advantage on Charisma checks, reroll a failed save as a Reaction, and turn one miss per turn into a hit.',
      },
    ],
  },
  {
    key: 'oath-of-the-ancients',
    name: 'Oath of the Ancients',
    classKey: 'paladin',
    system: 'dnd5e-2024',
    description: 'The green knight. Fey-tinged control, party-wide Resistance to the three types that hurt most at high levels, and a refusal to die.',
    alwaysPrepared: {
      3: ['Ensnaring Strike', 'Speak with Animals'],
      5: ['Misty Step', 'Moonbeam'],
      9: ['Plant Growth', 'Protection from Energy'],
      13: ['Ice Storm', 'Stoneskin'],
      17: ['Commune with Nature', 'Tree Stride'],
    },
    features: [
      {
        level: 3,
        name: 'Nature\'s Wrath',
        body:
          'As a **Magic action**, spend one use of **Channel Divinity** to conjure spectral vines out of the ground.\n\nEach creature **of your choice** that you can see within **15 feet** must succeed on a **Strength save** or gain the **Restrained** condition for **1 minute**. A Restrained creature repeats the save at the **end of each of its turns**, freeing itself on a success.\n\nBecause you choose the targets, this is a clean no-friendly-fire lockdown at the exact range a Paladin already occupies — and Restrained means Disadvantage on its attacks plus Advantage on everyone\'s attacks against it.',
        description: 'Channel Divinity: Restrain chosen creatures within 15 feet on a failed Strength save, for up to 1 minute.',
      },
      {
        level: 7,
        name: 'Aura of Warding',
        body:
          'You and your allies have **Resistance to Necrotic, Psychic, and Radiant** damage while inside your **Aura of Protection**.\n\nThose three are the classic "no armour helps" types — the ones that come from liches, mind flayers, and celestials, and the ones parties have the fewest answers to.\n\nHalving them for everyone in a 10-foot (30-foot from level 18) radius, with no action and no resource, is the single most durable-making aura in the class.',
        description: 'You and allies in your Aura of Protection have Resistance to Necrotic, Psychic, and Radiant damage.',
      },
      {
        level: 15,
        name: 'Undying Sentinel',
        body:
          'When you are reduced to **0 Hit Points** and not killed outright, you can drop to **1 Hit Point** instead and immediately regain Hit Points equal to **three times your Paladin level** — 45 at level 15.\n\nOnce you do this you cannot again until you finish a **Long Rest**.\n\nSeparately and permanently: you **cannot be aged magically**, and you **stop visibly aging**.',
        description: 'Once per Long Rest, survive a drop to 0 HP and regain three times your Paladin level; you also stop aging.',
      },
      {
        level: 20,
        name: 'Elder Champion',
        body:
          'As a **Bonus Action**, you take on the aspect of an ancient force of nature for **1 minute**. Once used, you cannot do it again until a **Long Rest** — or until you expend a **rank-5 spell slot** (no action required).\n\nWhile it lasts:\n· **Diminish Defiance.** **Enemies in your Aura of Protection have Disadvantage on saving throws** against your **spells** and your **Channel Divinity** options.\n· **Regeneration.** You regain **10 Hit Points** at the **start of each of your turns**.\n· **Swift Justice.** Any spell you cast with a casting time of a **Magic action** can be cast as a **Bonus Action** instead.\n\nThe combination is what sells it: Swift Justice lets you cast a control spell and still swing, while Diminish Defiance means everything in the aura is throwing that save at Disadvantage.',
        description: 'For 1 minute: enemies in your aura have Disadvantage on saves against your magic, you regenerate 10 HP, and you cast action spells as Bonus Actions.',
      },
    ],
  },
  {
    key: 'oath-of-vengeance',
    name: 'Oath of Vengeance',
    classKey: 'paladin',
    system: 'dnd5e-2024',
    description: 'The relentless hunter. Advantage on every attack against one target, a free extra strike when it acts, and eventually wings.',
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
        name: 'Vow of Enmity',
        body:
          'When you take the **Attack action**, you can spend one use of **Channel Divinity** to swear enmity against a creature you can see within **30 feet**.\n\nYou have **Advantage on attack rolls against it for 1 minute**, or until you use this feature again.\n\nIf the target drops to **0 Hit Points** before the vow ends, you can **move the vow to a different creature within 30 feet** (no action required) — so a single use can carry across an entire fight as long as things keep dying.\n\nAdvantage on every swing is also a critical-hit engine, which is exactly what a class with a Bonus Action smite wants.',
        description: 'Channel Divinity: Advantage on attacks against one creature for 1 minute, transferable when it drops.',
      },
      {
        level: 7,
        name: 'Relentless Avenger',
        body:
          'When you hit a creature with an **Opportunity Attack**, you can **reduce its Speed to 0** until the end of the current turn.\n\nYou can then **move up to half your Speed** as part of that same **Reaction**, and this movement **does not provoke Opportunity Attacks**.\n\nRead together, this is how you stop a fleeing target and stay glued to it: it cannot run, and you close the gap for free on someone else\'s turn.',
        description: 'An Opportunity Attack hit drops the target\'s Speed to 0, and you may move half your Speed for free.',
      },
      {
        level: 15,
        name: 'Soul of Vengeance',
        body:
          'Immediately after a creature under your **Vow of Enmity** **hits or misses with an attack roll**, you can take a **Reaction** to make a **melee attack against it**, if it is within range.\n\nNote it triggers on a **miss** as well as a hit, and on an attack against **anyone**, not just you — so any time your vowed target swings at all, you get to swing back.\n\nOne Reaction per round still caps it, but against a multiattacking boss that is a free attack every single round of the fight.',
        description: 'Reaction: melee attack a creature under your Vow of Enmity whenever it makes an attack roll.',
      },
      {
        level: 20,
        name: 'Avenging Angel',
        body:
          'As a **Bonus Action**, you take on an angelic aspect for **10 minutes**. Once used, you cannot do it again until a **Long Rest** — or until you expend a **rank-5 spell slot** (no action required).\n\nWhile it lasts:\n· **Flight.** You gain a **Fly Speed of 60 feet** and can **hover**.\n· **Aura of Fear.** Whenever an **enemy starts its turn in your Aura of Protection**, it makes a **Wisdom save** or gains the **Frightened** condition for **1 minute**, or until it takes **any damage**.\n· **Advantage.** You have **Advantage on attack rolls against Frightened creatures**.\n\nThe three chain together: the aura frightens things, the frightening gives you Advantage, and the flight keeps the aura wherever you want it.',
        description: 'For 10 minutes: fly 60 feet, frighten enemies starting their turn in your aura, and gain Advantage against Frightened creatures.',
      },
    ],
  },
];
