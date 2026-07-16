// lib/dnd/classes/dnd5e-2024/sorcerer.ts — Sorcerer, 2024 Player's Handbook.
//
// 2024 deltas worth knowing: the subclass ("Sorcerous Origin") moved from level 1 to level 3;
// Innate Sorcery at 1 is brand new and is the engine the whole class now runs on; Sorcerous
// Restoration (5) and Sorcery Incarnate (7) are new; every origin grants always-prepared spells
// (except Wild Magic); and level 19 is an Epic Boon rather than an ASI.
//
// NOTE on the capstone: subclass features land at 3/6/14/**18**, level 19 is the Epic Boon, and
// **Arcane Apotheosis is the level 20 capstone** — not level 18. Verified against the 2024 class
// table on three independent sources.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { FULL_CASTER_SLOTS } from '../slots';

export const SORCERER_2024: ClassDefinition = {
  key: 'sorcerer',
  name: 'Sorcerer',
  system: 'dnd5e-2024',
  hitDie: 6,
  primaryAbility: ['cha'],
  savingThrows: ['con', 'cha'],
  skillChoices: {
    count: 2,
    from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'],
  },
  armorProficiencies: [],
  weaponProficiencies: ['Simple weapons'],
  asiLevels: [4, 8, 12, 16],
  subclassLevel: 3,
  subclassLabel: 'Sorcerous Origin',
  spellcasting: {
    kind: 'full',
    ability: 'cha',
    preparedRule:
      'Your Prepared Spells count comes from the Sorcerer table (2 at level 1, rising to 22 at level 20), chosen from the Sorcerer spell list. Whenever you gain a Sorcerer level you may replace one prepared spell with another. Spell save DC = 8 + proficiency bonus + CHA modifier.',
    cantripsKnown: [0, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
    slots: FULL_CASTER_SLOTS,
    spellsKnown: [0, 2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  },
  resources: [
    {
      id: 'innate-sorcery',
      name: 'Innate Sorcery',
      perLevel: [0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      resetOn: 'long',
      note: 'Two uses per Long Rest. From level 7 (Sorcery Incarnate) you can spend 2 Sorcery Points to use it when none remain.',
    },
    {
      id: 'sorcery-points',
      name: 'Sorcery Points',
      // Sorcery Points equal your Sorcerer level, starting at level 2 with Font of Magic.
      perLevel: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      resetOn: 'long',
      note: 'Sorcery Points equal your Sorcerer level (from level 2). Sorcerous Restoration returns some on a Short Rest.',
    },
  ],
  startingEquipment: [
    'Spear, 2 Daggers, Arcane Focus (crystal), Dungeoneer\'s Pack, and 28 GP',
    'or 50 GP',
  ],
  description:
    'A spellcaster who never studied a thing — the magic is simply in the blood, raw and bendable, spent as fast as it can be shaped.',
  features: [
    {
      level: 1,
      name: 'Innate Sorcery',
      body:
        'An event in your past left an indelible mark on you, infusing you with simmering magic. As a **Bonus Action**, you can unleash it for **1 minute**, gaining both of these benefits:\n\n· The **spell save DC** of your Sorcerer spells **increases by 1**.\n· You have **Advantage** on the **attack rolls of Sorcerer spells** you cast.\n\nYou can use this feature **twice**, and you regain all expended uses when you finish a **Long Rest**.\n\nThis is new in 2024 and it is the axis the class turns on: Sorcery Incarnate (7) lets you buy extra uses with Sorcery Points and double up on Metamagic while it runs, and Arcane Apotheosis (20) makes that Metamagic free.',
      description: 'A Bonus Action grants +1 spell save DC and Advantage on Sorcerer spell attacks for 1 minute, twice per Long Rest.',
    },
    {
      level: 1,
      name: 'Spellcasting',
      body:
        'You cast spells drawn from the **Sorcerer spell list** through raw inborn power. **Charisma** is your spellcasting ability.\n\n· **Cantrips.** You know **four** Sorcerer cantrips — more than any other caster starts with — rising to five at level 4 and six at level 10.\n· **Prepared spells.** You prepare two level-1 Sorcerer spells to start; the Sorcerer table sets the number at every level, and your slots come from the standard full-caster table.\n· **Spellcasting focus.** You can use an Arcane Focus.\n\nYour **spell save DC** is 8 + your proficiency bonus + your Charisma modifier. Whenever you gain a Sorcerer level, you can replace one prepared spell with another from the list.',
      description: 'You cast Sorcerer spells using Charisma, with four starting cantrips and the full-caster slot table.',
    },
    {
      level: 2,
      name: 'Font of Magic',
      body:
        'You can tap into the wellspring of magic within yourself. This font is represented by **Sorcery Points**, which let you create a variety of magical effects.\n\nYou have a number of Sorcery Points equal to **your Sorcerer level** (2 at level 2, 20 at level 20). You regain all spent points when you finish a **Long Rest**.\n\nYou can use them for **Metamagic** and for converting magic back and forth:\n\n· **Converting Sorcery Points into a spell slot** (Bonus Action): 2 points for a rank-1 slot, 3 for rank-2, 5 for rank-3, 6 for rank-4, or 7 for rank-5. Any slot made this way vanishes when you finish a Long Rest.\n· **Converting a spell slot into Sorcery Points** (Bonus Action): expend a slot to gain points equal to the slot\'s rank.',
      description: 'Gain Sorcery Points equal to your Sorcerer level, convertible to and from spell slots.',
    },
    {
      level: 2,
      name: 'Metamagic',
      body:
        'You gain the ability to twist your spells to suit your needs. Choose **two Metamagic options** — such as Careful, Distant, Empowered, Extended, Heightened, Quickened, Seeking, Subtle, Transmuted, or Twinned Spell.\n\nEach option costs **Sorcery Points** to apply, and **you can use only one Metamagic option on a spell when you cast it**, unless the option says otherwise.\n\nYou gain **two more** options at level **10** and **two more** at level **17** — a cumulative **2 / 4 / 6**. Whenever you gain a Sorcerer level, you can replace one of your Metamagic options with another.\n\nFrom level 7, **Sorcery Incarnate** lifts the one-per-spell cap while Innate Sorcery is active.',
      description: 'Twist spells with two Metamagic options, gaining two more at levels 10 and 17.',
      choice: 'other',
    },
    {
      level: 3,
      name: 'Sorcerer Subclass',
      body:
        'You choose a **Sorcerous Origin** — Aberrant, Clockwork, Draconic, or Wild Magic — and gain its level-3 features.\n\nYour origin also grants features at levels **6**, **14**, and **18**, and (except for Wild Magic) a list of **always-prepared spells** that don\'t count against your prepared total.\n\nNote that 2024 moved this choice from level 1 to level 3, so your first two levels are origin-agnostic.',
      description: 'Choose a Sorcerous Origin, granting features at 3, 6, 14, and 18 plus (usually) free always-prepared spells.',
      choice: 'subclass',
    },
    {
      level: 4,
      name: 'Ability Score Improvement',
      body:
        'You gain the **Ability Score Improvement** feat, or another feat of your choice for which you qualify.\n\nThe ASI feat lets you increase one ability score by 2, or two ability scores by 1 each, to a maximum of 20. You gain this feature again at levels **8**, **12**, and **16**.',
      description: 'Take the Ability Score Improvement feat or another feat you qualify for.',
      choice: 'asi',
    },
    {
      level: 5,
      name: 'Sorcerous Restoration',
      body:
        'When you finish a **Short Rest**, you can regain expended **Sorcery Points**, but no more than a number equal to **half your Sorcerer level (rounded down)** — 2 points at level 5, 10 at level 20.\n\nOnce you use this feature, you can\'t do so again until you finish a **Long Rest**.\n\nThis is what lets a Sorcerer spend freely in the first fight of the day instead of hoarding.',
      description: 'Once per Long Rest, a Short Rest returns Sorcery Points equal to half your Sorcerer level.',
    },
    {
      level: 7,
      name: 'Sorcery Incarnate',
      body:
        'If you have **no uses of Innate Sorcery left**, you can use it anyway by spending **2 Sorcery Points** when you take the Bonus Action to activate it.\n\nIn addition, while your **Innate Sorcery** feature is active, you can use up to **two** of your **Metamagic options on each spell you cast**, rather than the usual one.\n\nStacking Metamagic is the real prize here — a Quickened *and* Twinned spell is a different class of turn.',
      description: 'Buy extra Innate Sorcery uses for 2 Sorcery Points, and apply two Metamagic options per spell while it\'s active.',
    },
    {
      level: 19,
      name: 'Epic Boon',
      body:
        'You gain an **Epic Boon** feat or another feat of your choice for which you qualify.\n\n**Boon of Irresistible Offense** is a thematic pick for a Sorcerer: your damage ignores Resistance, and when you roll a 20 on a d20 for an attack you add your Strength or Dexterity score to the damage. Epic Boons also raise one ability score by 1, to a maximum of **30**.\n\nNote that in the 2024 rules level 19 is an **Epic Boon**, not an Ability Score Improvement.',
      description: 'Take an Epic Boon feat — a capstone feat that can push an ability score above 20.',
      choice: 'epic-boon',
    },
    {
      level: 20,
      name: 'Arcane Apotheosis',
      body:
        'While your **Innate Sorcery** feature is active, you can use **one Metamagic option on each of your turns without spending Sorcery Points** on it.\n\nCombined with Sorcery Incarnate, an active Innate Sorcery now means: +1 spell save DC, Advantage on your spell attacks, up to two Metamagic options per spell, and one of them free every turn.',
      description: 'While Innate Sorcery is active, one Metamagic option per turn costs no Sorcery Points.',
    },
  ],
};

export const SORCERER_SUBCLASSES_2024: SubclassDefinition[] = [
  {
    key: 'aberrant',
    name: 'Aberrant Sorcery',
    classKey: 'sorcerer',
    system: 'dnd5e-2024',
    description:
      'Something from the Far Realm touched your bloodline, and it left a psionic mind behind — telepathy, alien flesh, and magic cast without a word or a gesture.',
    alwaysPrepared: {
      3: ['Arms of Hadar', 'Calm Emotions', 'Detect Thoughts', 'Dissonant Whispers', 'Mind Sliver'],
      5: ['Hunger of Hadar', 'Sending'],
      7: ["Evard's Black Tentacles", 'Summon Aberration'],
      9: ["Rary's Telepathic Bond", 'Telekinesis'],
    },
    features: [
      {
        level: 3,
        name: 'Psionic Spells',
        body:
          'You always have certain spells prepared, and they **don\'t count against your prepared total**:\n\n· **Level 3** — *Arms of Hadar*, *Calm Emotions*, *Detect Thoughts*, *Dissonant Whispers*, *Mind Sliver*\n· **Level 5** — *Hunger of Hadar*, *Sending*\n· **Level 7** — *Evard\'s Black Tentacles*, *Summon Aberration*\n· **Level 9** — *Rary\'s Telepathic Bond*, *Telekinesis*\n\nThese are the spells **Psionic Sorcery** (level 6) later lets you cast with Sorcery Points instead of slots.',
        description: 'A list of psionic spells is always prepared for free, expanding at Sorcerer levels 3, 5, 7, and 9.',
      },
      {
        level: 3,
        name: 'Telepathic Speech',
        body:
          'As a **Bonus Action**, choose one creature you can see **within 30 feet**. You and that creature can speak **telepathically** with each other while you are within a number of **miles equal to your Charisma modifier** (minimum 1 mile).\n\nTo understand each other, you each must mentally use a language the other knows.\n\nThe connection lasts for a number of **minutes equal to your Sorcerer level**, and it ends early if you use this feature to connect with a different creature.',
        description: 'Open a telepathic link with a creature for minutes equal to your Sorcerer level, across miles.',
      },
      {
        level: 6,
        name: 'Psionic Sorcery',
        body:
          'When you cast any level 1+ spell from your **Psionic Spells** feature, you can cast it by **spending Sorcery Points equal to the spell\'s rank** instead of expending a spell slot.\n\nWhen you cast it this way, it requires **no Verbal or Somatic components**, and it requires **no Material components** unless they are consumed by the spell or have a cost specified in it.\n\nA silent, motionless *Hunger of Hadar* is very hard to attribute to you — this is effectively free Subtle Spell on your whole origin list.',
        description: 'Cast Psionic Spells with Sorcery Points instead of slots, with no Verbal or Somatic components.',
      },
      {
        level: 6,
        name: 'Psychic Defenses',
        body:
          'You have **Resistance to Psychic damage**, and you have **Advantage on saving throws** to avoid or end the **Charmed** or **Frightened** conditions.',
        description: 'Resistance to Psychic damage and Advantage on saves against Charmed and Frightened.',
      },
      {
        level: 14,
        name: 'Revelation in Flesh',
        body:
          'As a **Bonus Action**, you can spend **1 or more Sorcery Points** to alter your body for **10 minutes**. You gain one of the following benefits **per Sorcery Point spent**:\n\n· **Aquatic Adaptation.** You gain a **Swim Speed equal to twice your Speed** and can breathe underwater. Your body becomes slimy.\n· **Glistening Flight.** You gain a **Fly Speed equal to your Speed** and can **hover**. A shimmering, translucent extrusion carries you.\n· **See the Invisible.** You can see any **Invisible** creature within **60 feet** that isn\'t behind Total Cover. Your eyes also turn black or become writhing sensory tendrils.\n· **Wormlike Movement.** You can move through any space **as narrow as 1 inch** without squeezing, and you can spend **5 feet** of movement to escape from nonmagical restraints or the **Grappled** condition. Your body becomes long and slithering.',
        description: 'Spend Sorcery Points to gain alien bodily traits — flight, swimming, see invisibility, or squeezing — for 10 minutes.',
      },
      {
        level: 18,
        name: 'Warping Implosion',
        body:
          'As a **Magic action**, you can **teleport** to an unoccupied space you can see **within 120 feet**, and a **wave of warping energy** erupts from the space you left.\n\nEach creature **within 30 feet** of the space you left must make a **Strength saving throw** against your spell save DC. On a failed save, a creature takes **3d10 Force damage** and is **pulled toward the space you left**. On a successful save, it takes **half as much damage only**.\n\nYou can use this **once per Long Rest**, and you can also restore the use by **spending 5 Sorcery Points** (no action required).',
        description: 'Teleport 120 feet and detonate the space you left for 3d10 Force, pulling creatures in.',
      },
    ],
  },
  {
    key: 'clockwork',
    name: 'Clockwork Sorcery',
    classKey: 'sorcerer',
    system: 'dnd5e-2024',
    description:
      'Your magic is tuned to Mechanus and the cosmic order beneath reality — you flatten randomness, ward allies, and impose law on a chaotic world.',
    alwaysPrepared: {
      3: ['Aid', 'Alarm', 'Lesser Restoration', 'Protection from Evil and Good'],
      5: ['Dispel Magic', 'Protection from Energy'],
      7: ['Freedom of Movement', 'Summon Construct'],
      9: ['Greater Restoration', 'Wall of Force'],
    },
    features: [
      {
        level: 3,
        name: 'Clockwork Spells',
        body:
          'You always have certain spells prepared, and they **don\'t count against your prepared total**:\n\n· **Level 3** — *Aid*, *Alarm*, *Lesser Restoration*, *Protection from Evil and Good*\n· **Level 5** — *Dispel Magic*, *Protection from Energy*\n· **Level 7** — *Freedom of Movement*, *Summon Construct*\n· **Level 9** — *Greater Restoration*, *Wall of Force*\n\n**Manifestations of Order.** Your connection to Mechanus also shows itself physically — roll on the subclass\'s 1d6 table (spectral cogwheels, ticking sounds, a clockwork eye) or invent your own.',
        description: 'A list of orderly, protective spells is always prepared for free, expanding at Sorcerer levels 3, 5, 7, and 9.',
      },
      {
        level: 3,
        name: 'Restore Balance',
        body:
          'When a creature you can see **within 60 feet** is about to roll a **d20 with Advantage or Disadvantage**, you can take a **Reaction** to prevent the roll from being affected by **either**.\n\nYou can use this a number of times equal to your **Charisma modifier** (minimum of once), and you regain all expended uses when you finish a **Long Rest**.\n\nIt is a Reaction that reads the table rather than the dice: it shuts off a rogue\'s Advantage or rescues an ally from Disadvantage equally well.',
        description: 'React to strip Advantage or Disadvantage from a d20 roll within 60 feet, CHA-modifier times per Long Rest.',
      },
      {
        level: 6,
        name: 'Bastion of Law',
        body:
          'As a **Magic action**, you can expend **1 to 5 Sorcery Points** to create a **magical ward** around yourself or another creature you can see **within 30 feet**.\n\nThe ward is represented by a number of **d8s equal to the number of Sorcery Points spent**. When the warded creature takes damage, it can expend any number of those dice, roll them, and **reduce the damage taken by the total rolled**.\n\nThe ward lasts until you finish a **Long Rest** or until you use this feature again.',
        description: 'Spend 1–5 Sorcery Points to ward a creature with that many d8s of damage reduction.',
      },
      {
        level: 14,
        name: 'Trance of Order',
        body:
          'As a **Bonus Action**, you can enter a state of clockwork consciousness for **1 minute**. For the duration:\n\n· **Attack rolls against you can\'t benefit from Advantage.**\n· On any **D20 Test**, you treat a d20 roll of **9 or lower as a 10**.\n\nYou can use this **once per Long Rest**, and you can also restore the use by **spending 5 Sorcery Points** (no action required).\n\nA floor of 10 on every check, save, and attack for a minute is a remarkably deep effect — it removes the bottom half of the die.',
        description: 'For 1 minute, treat d20 rolls of 9 or lower as 10, and attacks against you lose Advantage.',
      },
      {
        level: 18,
        name: 'Clockwork Cavalcade',
        body:
          'As a **Magic action**, you summon spirits of order to fill a **30-foot Cube** originating from you. The spirits produce all of the following:\n\n· **Heal.** They restore up to **100 Hit Points**, divided as you choose among any number of creatures in the Cube.\n· **Repair.** Any damaged objects entirely in the Cube are **instantly repaired**.\n· **Dispel.** Every spell of **rank 6 and lower ends** on creatures and objects of your choice in the Cube.\n\nYou can use this **once per Long Rest**, and you can also restore the use by **spending 7 Sorcery Points** (no action required).',
        description: 'A 30-foot Cube that heals 100 HP, repairs objects, and dispels spells of rank 6 and lower.',
      },
    ],
  },
  {
    key: 'draconic',
    name: 'Draconic Sorcery',
    classKey: 'sorcerer',
    system: 'dnd5e-2024',
    description:
      'Dragon blood runs in you — tougher skin, an elemental affinity that sharpens your best spells, and eventually wings.',
    alwaysPrepared: {
      3: ['Alter Self', 'Chromatic Orb', 'Command', "Dragon's Breath"],
      5: ['Fear', 'Fly'],
      7: ['Arcane Eye', 'Charm Monster'],
      9: ['Legend Lore', 'Summon Dragon'],
    },
    features: [
      {
        level: 3,
        name: 'Draconic Resilience',
        body:
          'The magic in your body manifests physically: parts of your skin are covered by dragon-like scales.\n\n· Your **Hit Point maximum increases by 3**, and by **1 more** every time you gain another Sorcerer level.\n· While you aren\'t wearing armor, your base **AC = 10 + your Dexterity modifier + your Charisma modifier**.\n\nAt level 20 that is +22 Hit Points, which meaningfully offsets the d6 hit die.',
        description: 'Gain +3 HP (+1 per later Sorcerer level) and an unarmored AC of 10 + DEX + CHA.',
      },
      {
        level: 3,
        name: 'Draconic Spells',
        body:
          'You always have certain spells prepared, and they **don\'t count against your prepared total**:\n\n· **Level 3** — *Alter Self*, *Chromatic Orb*, *Command*, *Dragon\'s Breath*\n· **Level 5** — *Fear*, *Fly*\n· **Level 7** — *Arcane Eye*, *Charm Monster*\n· **Level 9** — *Legend Lore*, *Summon Dragon*',
        description: 'A list of draconic spells is always prepared for free, expanding at Sorcerer levels 3, 5, 7, and 9.',
      },
      {
        level: 6,
        name: 'Elemental Affinity',
        body:
          'Choose one of the following damage types: **Acid**, **Cold**, **Fire**, **Lightning**, or **Poison**.\n\nYou gain **Resistance** to that damage type, and when you cast a spell that deals damage of that type, you can **add your Charisma modifier to one damage roll** of that spell.\n\nPick the type your Chromatic Orb and Dragon\'s Breath will lean on — the Charisma rider applies to one damage roll per casting, not per target.',
        description: 'Gain Resistance to a chosen element and add your CHA modifier to one damage roll of spells of that type.',
      },
      {
        level: 14,
        name: 'Dragon Wings',
        body:
          'As a **Bonus Action**, you can cause **draconic wings** to appear on your back. They last for **1 hour** or until you dismiss them (no action required).\n\nFor the duration, you have a **Fly Speed of 60 feet**.\n\nYou can use this **once per Long Rest**, and you can also restore the use by **spending 3 Sorcery Points** (no action required).',
        description: 'Sprout wings for a 60-foot Fly Speed for 1 hour, once per Long Rest or for 3 Sorcery Points.',
      },
      {
        level: 18,
        name: 'Dragon Companion',
        body:
          'You can cast **Summon Dragon** **without a Material component**. You can also cast it **once without a spell slot**, and you regain that casting when you finish a **Long Rest**.\n\nWhenever you start casting the spell, you can **modify it so that it doesn\'t require Concentration**. If you do so, the spell\'s **duration becomes 1 minute** for that casting.',
        description: 'Cast Summon Dragon free once per Long Rest, and optionally drop Concentration for a 1-minute duration.',
      },
    ],
  },
  {
    key: 'wild-magic',
    name: 'Wild Magic Sorcery',
    classKey: 'sorcerer',
    system: 'dnd5e-2024',
    description:
      'Your magic answers to raw chaos — it surges unbidden, bends other creatures\' luck, and by the end you can dictate the chaos outright.',
    // Wild Magic is the only 2024 Sorcerer origin with NO always-prepared spell list; it gets the
    // 1d100 Wild Magic Surge table instead.
    features: [
      {
        level: 3,
        name: 'Wild Magic Surge',
        body:
          'Your spellcasting can unleash surges of untamed magic. **Once per turn**, you can roll **1d20** immediately after you cast a **Sorcerer spell with a spell slot**. If you roll a **20**, roll on the **Wild Magic Surge table** to create a magical effect.\n\nIf that effect is a spell, it is **too wild to be affected by your Metamagic**.\n\nNote the 2024 change: the surge is on your own opt-in d20 roll rather than a DM-called 1-in-20, so you choose when to court chaos.',
        description: 'After casting a Sorcerer spell with a slot, roll 1d20; on a 20, roll on the Wild Magic Surge table.',
      },
      {
        level: 3,
        name: 'Tides of Chaos',
        body:
          'You can manipulate chaos itself to give yourself **Advantage on one D20 Test** before you roll.\n\nOnce you do so, you must **cast a Sorcerer spell with a spell slot** or finish a **Long Rest** to regain the use of this feature.\n\nIf you do cast a Sorcerer spell with a slot before your next Long Rest, you **automatically roll on the Wild Magic Surge table** — no d20 check required.',
        description: 'Take Advantage on one D20 Test; casting a slotted Sorcerer spell recharges it and forces a Wild Magic Surge.',
      },
      {
        level: 6,
        name: 'Bend Luck',
        body:
          'You have the ability to twist fate using your wild magic. Immediately after **another creature you can see** rolls a **d20**, you can take a **Reaction** and spend **1 Sorcery Point** to roll **1d4** and apply the number rolled as a **bonus or penalty** (your choice) to the creature\'s roll.\n\nIt works on allies and enemies alike, and you decide after seeing their roll.',
        description: 'React and spend 1 Sorcery Point to add or subtract 1d4 from any creature\'s d20 roll.',
      },
      {
        level: 14,
        name: 'Controlled Chaos',
        body:
          'You gain a modicum of control over your surges. Whenever you roll on the **Wild Magic Surge table**, you can **roll twice and use either number**.\n\nThis roughly doubles your odds of landing something useful rather than something that sets the party on fire.',
        description: 'Roll twice on the Wild Magic Surge table and choose which result to use.',
      },
      {
        level: 18,
        name: 'Tamed Surge',
        body:
          'Immediately after you cast a **Sorcerer spell with a spell slot**, you can **choose an effect from the Wild Magic Surge table instead of rolling** on it.\n\nYou can choose any effect **except the table\'s final row** (the 97–00 entry). If the chosen effect involves a roll, you must make it.\n\nOnce you use this feature, you can\'t do so again until you finish a **Long Rest** — there is no Sorcery Point buyback for this one.',
        description: 'Once per Long Rest, pick your Wild Magic Surge effect instead of rolling for it.',
      },
    ],
  },
];
