// lib/dnd/classes/dnd5e-2024/warlock.ts — Warlock, 2024 Player's Handbook.
//
// 2024 deltas worth knowing: the subclass ("Otherworldly Patron") moved from level 1 to level 3;
// Eldritch Invocations now start at level 1; the Pact Boons (Blade/Chain/Tome/Talisman) are no
// longer a level-3 feature but ordinary INVOCATIONS you can pick and swap; Magical Cunning at 2 is
// new; and level 19 is an Epic Boon rather than an ASI.
//
// Pact Magic is structurally unlike the full-caster table — few slots, all cast at your highest
// rank, back on a SHORT rest — so this reads PACT_SLOTS/PACT_RANK, never a slots table.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { PACT_SLOTS, PACT_RANK, MYSTIC_ARCANUM_LEVEL } from '../slots';

export const WARLOCK_2024: ClassDefinition = {
  key: 'warlock',
  name: 'Warlock',
  system: 'dnd5e-2024',
  hitDie: 8,
  primaryAbility: ['cha'],
  savingThrows: ['wis', 'cha'],
  skillChoices: {
    count: 2,
    from: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'],
  },
  armorProficiencies: ['Light armor'],
  weaponProficiencies: ['Simple weapons'],
  asiLevels: [4, 8, 12, 16],
  subclassLevel: 3,
  subclassLabel: 'Otherworldly Patron',
  spellcasting: {
    kind: 'pact',
    ability: 'cha',
    preparedRule:
      'Pact Magic: your Prepared Spells count comes from the Warlock table (2 at level 1, rising to 15 at level 20), chosen from the Warlock spell list. Every Pact Magic slot is cast at the rank shown by your level, and they all return on a SHORT Rest. Spell save DC = 8 + proficiency bonus + CHA modifier.',
    cantripsKnown: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    pactSlots: PACT_SLOTS,
    pactRank: PACT_RANK,
    spellsKnown: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
  },
  resources: [
    {
      id: 'eldritch-invocations-known',
      name: 'Eldritch Invocations known',
      // 2024 table: 1 at L1, then +2 jumps at L2 and L5, then +1 at 7/9/12/15/18.
      perLevel: [0, 1, 3, 3, 3, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10],
      resetOn: 'long',
      note: 'How many invocations you know (not a spendable resource). Swap one whenever you gain a Warlock level.',
    },
    {
      id: 'magical-cunning',
      name: 'Magical Cunning',
      perLevel: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      resetOn: 'long',
      note: 'One esoteric rite per Long Rest to recover Pact Magic slots (level 2+).',
    },
    {
      id: 'mystic-arcanum',
      name: 'Mystic Arcanum castings',
      // One free casting per arcanum spell: rank 6 at 11, 7 at 13, 8 at 15, 9 at 17.
      perLevel: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 4],
      resetOn: 'long',
      note: 'One free casting of each Mystic Arcanum spell you know (ranks 6/7/8/9 at levels 11/13/15/17).',
    },
  ],
  startingEquipment: [
    'Leather Armor, Sickle, 2 Daggers, Arcane Focus (orb), Book (occult lore), Scholar\'s Pack, and 15 GP',
    'or 100 GP',
  ],
  description:
    'A spellcaster who struck a bargain with something vast and inhuman — trading service for a small, sharp, endlessly reusable slice of its power.',
  features: [
    {
      level: 1,
      name: 'Eldritch Invocations',
      body:
        'You have unearthed **Eldritch Invocations** — fragments of forbidden knowledge that grant a lasting magical ability. You learn **one** invocation of your choice at level 1, and the count grows to **3** at level 2, **5** at level 5, and onward to **10** by level 18.\n\nSome invocations have a prerequisite — a minimum Warlock level, or another invocation — that you must meet to choose them.\n\nWhenever you gain a Warlock level, you can **replace one invocation** you know with another you qualify for. This is what keeps a Warlock flexible despite a short spell list.\n\nIn the 2024 rules the **Pact Boons** — *Pact of the Blade*, *Pact of the Chain*, and *Pact of the Tome* — are themselves invocations rather than a separate level-3 feature, and they carry **no level prerequisite**, so you can take one as early as level 1 and swap it later. (*Pact of the Talisman* was a 2014 Tasha\'s option and does not appear in the 2024 Player\'s Handbook.)',
      description: 'Learn Eldritch Invocations — lasting magical abilities, including the three Pact Boons, swappable on level-up.',
      choice: 'other',
    },
    {
      level: 1,
      name: 'Pact Magic',
      body:
        'Your bargain grants spellcasting, drawing on the **Warlock spell list**. **Charisma** is your spellcasting ability.\n\n· **Cantrips.** You know two Warlock cantrips, rising to three at level 4 and four at level 10.\n· **Pact slots.** You have very few spell slots — **1** at level 1, growing to **4** — but they are always cast at the **highest rank you can reach** (rank 5 from level 9), and they all come back on a **Short Rest**, not just a Long Rest.\n· **Prepared spells.** You prepare two Warlock spells at level 1, per the Warlock table.\n· **Spellcasting focus.** You can use an Arcane Focus.\n\nYour **spell save DC** is 8 + your proficiency bonus + your Charisma modifier. The Pact Magic slot table is deliberately unlike every other caster\'s: fewer, bigger, and refreshed far more often.',
      description: 'Cast Warlock spells with Charisma using a few always-max-rank slots that return on a Short Rest.',
    },
    {
      level: 2,
      name: 'Magical Cunning',
      body:
        'You can perform an esoteric rite that takes **1 minute** to complete. At the end of it, you regain expended **Pact Magic spell slots** — but no more than a number equal to **half your maximum** (round up).\n\nAt level 2 that is **1** slot; it is **2** from level 11, when your maximum reaches 3.\n\nOnce you use this feature, you can\'t do so again until you finish a **Long Rest**. It is effectively a free extra Short Rest\'s worth of slots on demand.',
      description: 'Spend 1 minute to recover half your Pact Magic slots (rounded up), once per Long Rest.',
    },
    {
      level: 3,
      name: 'Warlock Subclass',
      body:
        'You choose an **Otherworldly Patron** — Archfey, Celestial, Fiend, or Great Old One — and gain its level-3 features.\n\nYour patron also grants features at levels **6**, **10**, and **14**, and gives you a list of **always-prepared spells** that don\'t count against your prepared total — which matters enormously to a class with so short a list.\n\nNote that 2024 moved this choice from level 1 to level 3, so your first two levels are patron-agnostic.',
      description: 'Choose an Otherworldly Patron, granting features at 3/6/10/14 plus free always-prepared spells.',
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
      level: 9,
      name: 'Contact Patron',
      body:
        'Your patron is now obliged to take your call. You always have the **Contact Other Plane** spell prepared.\n\nYou can cast it **without expending a spell slot** to contact your patron directly, and when you do, you **automatically succeed** on the spell\'s saving throw — no risk of the usual 6d6 Psychic damage and a week of insanity.\n\nOnce you cast it this way, you can\'t do so again until you finish a **Long Rest**. You can still cast it normally, with a slot, to contact anything else.',
      description: 'Cast Contact Other Plane free once per Long Rest to reach your patron, auto-succeeding on the save.',
    },
    {
      level: 11,
      name: 'Mystic Arcanum (Rank 6)',
      body:
        'Your patron grants you a magical secret called an **Arcanum**. Choose one **rank-6 Warlock spell** as your arcanum.\n\nYou can cast it **once without expending a spell slot**, and you regain that casting when you finish a **Long Rest**. It sits entirely outside your Pact Magic slots — those never reach rank 6.\n\nWhenever you gain a Warlock level, you can **replace** one of your arcanum spells with another Warlock spell of the same rank.\n\nYou gain further arcanum spells at levels **13** (rank 7), **15** (rank 8), and **17** (rank 9).',
      description: 'Choose a rank-6 Warlock spell you can cast free once per Long Rest, outside your Pact slots.',
    },
    {
      level: 13,
      name: 'Mystic Arcanum (Rank 7)',
      body:
        'Choose one **rank-7 Warlock spell** as an additional arcanum.\n\nAs with your rank-6 arcanum, you can cast it **once without expending a spell slot**, and you regain the casting on a **Long Rest**. You can swap it for another rank-7 Warlock spell whenever you gain a Warlock level.',
      description: 'Choose a rank-7 Warlock spell you can cast free once per Long Rest.',
    },
    {
      level: 15,
      name: 'Mystic Arcanum (Rank 8)',
      body:
        'Choose one **rank-8 Warlock spell** as an additional arcanum.\n\nYou can cast it **once without expending a spell slot**, regaining the casting on a **Long Rest**, and you can swap it for another rank-8 Warlock spell whenever you gain a Warlock level.',
      description: 'Choose a rank-8 Warlock spell you can cast free once per Long Rest.',
    },
    {
      level: 17,
      name: 'Mystic Arcanum (Rank 9)',
      body:
        'Choose one **rank-9 Warlock spell** as an additional arcanum.\n\nYou can cast it **once without expending a spell slot**, regaining the casting on a **Long Rest**, and you can swap it for another rank-9 Warlock spell whenever you gain a Warlock level.\n\nWith all four arcana you hold one free casting each of ranks **6, 7, 8, and 9** per Long Rest, on top of your four Short-Rest Pact slots.',
      description: 'Choose a rank-9 Warlock spell you can cast free once per Long Rest.',
    },
    {
      level: 19,
      name: 'Epic Boon',
      body:
        'You gain an **Epic Boon** feat or another feat of your choice for which you qualify.\n\n**Boon of Fate** is a thematic pick for a Warlock: when a creature within 60 feet makes a d20 Test, you can roll 2d4 and add or subtract the total, once per turn. Epic Boons also raise one ability score by 1, to a maximum of **30**.\n\nNote that in the 2024 rules level 19 is an **Epic Boon**, not an Ability Score Improvement.',
      description: 'Take an Epic Boon feat — a capstone feat that can push an ability score above 20.',
      choice: 'epic-boon',
    },
    {
      level: 20,
      name: 'Eldritch Master',
      body:
        'When you use your **Magical Cunning** feature, you regain **all** your expended **Pact Magic spell slots** — not merely half of them.\n\nMagical Cunning is still the 1-minute rite, still once per **Long Rest**; this feature simply upgrades its payout to a full refill of all four slots. Combined with Short Rests, a level-20 Warlock is very hard to run dry.',
      description: 'Your Magical Cunning rite now restores all Pact Magic slots instead of half.',
    },
  ],
};

/** Re-exported for the sheet: which Warlock level turns on each Mystic Arcanum rank. */
export const WARLOCK_ARCANUM_LEVELS = MYSTIC_ARCANUM_LEVEL;

// 2024 patrons grant features at 3/6/10/14 plus an always-prepared spell list that expands at
// Warlock levels 3/5/7/9 — a large deal for a class whose prepared count tops out at 15.
export const WARLOCK_SUBCLASSES_2024: SubclassDefinition[] = [
  {
    key: 'archfey',
    name: 'Archfey Patron',
    classKey: 'warlock',
    system: 'dnd5e-2024',
    description:
      'A lord or lady of the Feywild backs your bargain — you blink about the battlefield in a shimmer of Misty Step and turn enchantment back on those who try it.',
    alwaysPrepared: {
      3: ['Calm Emotions', 'Faerie Fire', 'Misty Step', 'Phantasmal Force', 'Sleep'],
      5: ['Blink', 'Plant Growth'],
      7: ['Dominate Beast', 'Greater Invisibility'],
      9: ['Dominate Person', 'Seeming'],
    },
    features: [
      {
        level: 3,
        name: 'Archfey Spells',
        body:
          'You always have certain spells prepared, and they **don\'t count against your prepared total**:\n\n· **Level 3** — *Calm Emotions*, *Faerie Fire*, *Misty Step*, *Phantasmal Force*, *Sleep*\n· **Level 5** — *Blink*, *Plant Growth*\n· **Level 7** — *Dominate Beast*, *Greater Invisibility*\n· **Level 9** — *Dominate Person*, *Seeming*',
        description: 'A list of fey spells is always prepared for free, expanding at Warlock levels 3, 5, 7, and 9.',
      },
      {
        level: 3,
        name: 'Steps of the Fey',
        body:
          'You can cast **Misty Step without expending a spell slot** a number of times equal to your **Charisma modifier** (minimum of once), and you regain all expended uses when you finish a **Long Rest**.\n\nWhenever you cast it with this feature, you can choose one of the following additional effects:\n\n· **Refreshing Step.** Immediately after you teleport, **you or one creature you can see within 10 feet** of yourself gains **1d10 Temporary Hit Points**.\n· **Taunting Step.** Creatures **within 5 feet of the space you left** must succeed on a **Wisdom saving throw** against your spell save DC or have **Disadvantage on attack rolls** against creatures other than you until the end of your next turn.',
        description: 'Cast Misty Step free CHA-modifier times per Long Rest, each time granting Temp HP or taunting those you left behind.',
      },
      {
        level: 6,
        name: 'Misty Escape',
        body:
          'You can cast **Misty Step** as a **Reaction** when you take damage.\n\nIn addition, you gain two more options for **Steps of the Fey**:\n\n· **Disappearing Step.** You have the **Invisible** condition until the start of your next turn, or until immediately after you make an attack roll, deal damage, or cast a spell.\n· **Dreadful Step.** Creatures within **5 feet of the space you left or the space you arrive in** (your choice) must succeed on a **Wisdom saving throw** or take **2d10 Psychic damage**.',
        description: 'Misty Step as a Reaction when damaged, plus two new Steps of the Fey options: go Invisible or deal 2d10 Psychic.',
      },
      {
        level: 10,
        name: 'Beguiling Defenses',
        body:
          'You are **immune to the Charmed condition**.\n\nIn addition, immediately after a creature you can see **hits you with an attack roll**, you can take a **Reaction** to **halve the damage** (round down) and force the attacker to make a **Wisdom saving throw** against your spell save DC. On a failed save, the attacker takes **Psychic damage equal to the damage you took**.\n\nOnce you use this Reaction, you can\'t use it again until you finish a **Long Rest**, unless you **expend a Pact Magic spell slot** (no action required) to restore your use of it.',
        description: 'Immune to Charmed; React to halve a hit and reflect the damage back as Psychic on a failed WIS save.',
      },
      {
        level: 14,
        name: 'Bewitching Magic',
        body:
          'Immediately after you cast an **Enchantment or Illusion spell** using an **action and a spell slot**, you can cast **Misty Step** as part of the same action and **without expending a spell slot**.\n\nCast and vanish in the same beat — this is free action economy stapled to the school you were casting anyway.',
        description: 'After casting an Enchantment or Illusion spell with an action, cast Misty Step free as part of it.',
      },
    ],
  },
  {
    key: 'celestial',
    name: 'Celestial Patron',
    classKey: 'warlock',
    system: 'dnd5e-2024',
    description:
      'An empyrean being lends you a shard of its light — you carry a pool of healing no other Warlock has and burn undead with radiance.',
    alwaysPrepared: {
      3: ['Aid', 'Cure Wounds', 'Guiding Bolt', 'Lesser Restoration', 'Light', 'Sacred Flame'],
      5: ['Daylight', 'Revivify'],
      7: ['Guardian of Faith', 'Wall of Fire'],
      9: ['Greater Restoration', 'Summon Celestial'],
    },
    features: [
      {
        level: 3,
        name: 'Celestial Spells',
        body:
          'You always have certain spells prepared, and they **don\'t count against your prepared total**:\n\n· **Level 3** — *Aid*, *Cure Wounds*, *Guiding Bolt*, *Lesser Restoration*, *Light*, *Sacred Flame*\n· **Level 5** — *Daylight*, *Revivify*\n· **Level 7** — *Guardian of Faith*, *Wall of Fire*\n· **Level 9** — *Greater Restoration*, *Summon Celestial*',
        description: 'A list of celestial spells is always prepared for free, expanding at Warlock levels 3, 5, 7, and 9.',
      },
      {
        level: 3,
        name: 'Healing Light',
        body:
          'You gain the ability to channel celestial energy to heal wounds. You have a pool of **d6s equal to 1 + your Warlock level**.\n\nAs a **Bonus Action**, you can heal one creature you can see **within 60 feet**, spending dice from the pool. The maximum number of dice you can spend at once equals your **Charisma modifier** (minimum of one die). Roll the dice you spend and restore that many **Hit Points**.\n\nThe pool regains all expended dice when you finish a **Long Rest**.',
        description: 'A pool of d6s (1 + Warlock level) you spend as a Bonus Action to heal at 60 feet.',
      },
      {
        level: 6,
        name: 'Radiant Soul',
        body:
          'You have **Resistance to Radiant damage**.\n\n**Once per turn**, when a spell you cast deals **Radiant or Fire damage**, you can add your **Charisma modifier** to that spell\'s damage against **one** of the spell\'s targets.',
        description: 'Resistance to Radiant damage, and add your CHA modifier to one target of your Radiant or Fire spells each turn.',
      },
      {
        level: 10,
        name: 'Celestial Resilience',
        body:
          'You gain **Temporary Hit Points** whenever you use your **Magical Cunning** feature or finish a **Short or Long Rest**. The temp HP equal **your Warlock level + your Charisma modifier**.\n\nIn addition, choose **up to five** creatures you can see when you gain the temp HP. Each of those creatures gains temp HP equal to **half your Warlock level + your Charisma modifier**.',
        description: 'On every rest (or Magical Cunning), you and up to five allies gain Temporary Hit Points.',
      },
      {
        level: 14,
        name: 'Searing Vengeance',
        body:
          'When you or an ally **within 60 feet** of you is about to make a **death saving throw**, you can instead have the creature **regain Hit Points equal to half its Hit Point maximum** and immediately **stand up** if it is Prone.\n\nEach creature of your choice **within 30 feet** of the revived creature takes **2d8 + your Charisma modifier Radiant damage** and has the **Blinded** condition until the end of the current turn.\n\nOnce you use this feature, you can\'t do so again until you finish a **Long Rest**.',
        description: 'Once per Long Rest, turn a death save into a half-max-HP revival that blinds and burns nearby enemies.',
      },
    ],
  },
  {
    key: 'fiend',
    name: 'Fiend Patron',
    classKey: 'warlock',
    system: 'dnd5e-2024',
    description:
      'A devil or demon signed your contract — every kill feeds you temporary hit points, and eventually you can throw an enemy through Hell itself.',
    alwaysPrepared: {
      3: ['Burning Hands', 'Command', 'Scorching Ray', 'Suggestion'],
      5: ['Fireball', 'Stinking Cloud'],
      7: ['Fire Shield', 'Wall of Fire'],
      9: ['Geas', 'Insect Plague'],
    },
    features: [
      {
        level: 3,
        name: 'Fiend Spells',
        body:
          'You always have certain spells prepared, and they **don\'t count against your prepared total**:\n\n· **Level 3** — *Burning Hands*, *Command*, *Scorching Ray*, *Suggestion*\n· **Level 5** — *Fireball*, *Stinking Cloud*\n· **Level 7** — *Fire Shield*, *Wall of Fire*\n· **Level 9** — *Geas*, *Insect Plague*',
        description: 'A list of fiendish spells is always prepared for free, expanding at Warlock levels 3, 5, 7, and 9.',
      },
      {
        level: 3,
        name: "Dark One's Blessing",
        body:
          'When you reduce an enemy to **0 Hit Points**, you gain **Temporary Hit Points equal to your Charisma modifier + your Warlock level** (minimum of 1).\n\nNew in 2024: you also gain this benefit when **someone else** reduces an enemy **within 10 feet** of you to 0 Hit Points — so you no longer have to land the killing blow yourself to keep your buffer topped up.',
        description: 'Gain Temp HP equal to CHA + Warlock level whenever an enemy drops, even if an ally landed the blow.',
      },
      {
        level: 6,
        name: "Dark One's Own Luck",
        body:
          'You can add **1d10** to one **ability check or saving throw** you make. You can do so after seeing the roll but **before any of the roll\'s effects occur**.\n\nYou can use this feature a number of times equal to your **Charisma modifier** (minimum of once), but **only once per roll**, and you regain all expended uses when you finish a **Long Rest**.\n\nNote the 2024 change: the 2014 version recharged on a **Short** Rest and had a single use; this one gives you several uses but only on a **Long** Rest.',
        description: 'Add 1d10 to a check or save after seeing the roll, CHA-modifier times per Long Rest.',
      },
      {
        level: 10,
        name: 'Fiendish Resilience',
        body:
          'Choose one **damage type, other than Force**, whenever you finish a **Short or Long Rest**.\n\nYou have **Resistance** to that damage type until you choose a different one with this feature.\n\nBecause you re-pick on every rest, this is reactive armour: once you know what the dungeon is throwing at you, you can tune to it.',
        description: 'Pick a damage type (not Force) on each rest and gain Resistance to it until you change it.',
      },
      {
        level: 14,
        name: 'Hurl Through Hell',
        body:
          '**Once per turn** when you hit a creature with an attack roll, you can try to instantly transport the target through the Lower Planes.\n\nThe target must succeed on a **Charisma saving throw** against your spell save DC, or it vanishes and hurtles through a nightmare landscape. At the end of your next turn it returns to the space it left (or the nearest unoccupied space). If the target is **not a Fiend**, it takes **8d10 Psychic damage** from the harrowing journey, and it has the **Incapacitated** condition until the end of your next turn.\n\nOnce you use this feature, you can\'t do so again until you finish a **Long Rest**, unless you **expend a Pact Magic spell slot** (no action required) to restore your use of it.\n\nNote the 2024 changes: the target now gets a **saving throw**, the damage dropped from 10d10 to **8d10**, and you can buy the use back with a Pact slot.',
        description: 'On a hit, a failed CHA save hurls the target through the Lower Planes for 8d10 Psychic and Incapacitated.',
      },
    ],
  },
  {
    key: 'great-old-one',
    name: 'Great Old One Patron',
    classKey: 'warlock',
    system: 'dnd5e-2024',
    description:
      'Something unknowable and indifferent stirred, and you caught a fragment of its mind — telepathy, psychic magic, and a hex that never lets go.',
    alwaysPrepared: {
      3: ['Detect Thoughts', 'Dissonant Whispers', 'Phantasmal Force', "Tasha's Hideous Laughter"],
      5: ['Clairvoyance', 'Hunger of Hadar'],
      7: ['Confusion', 'Summon Aberration'],
      9: ['Modify Memory', 'Telekinesis'],
    },
    features: [
      {
        level: 3,
        name: 'Great Old One Spells',
        body:
          'You always have certain spells prepared, and they **don\'t count against your prepared total**:\n\n· **Level 3** — *Detect Thoughts*, *Dissonant Whispers*, *Phantasmal Force*, *Tasha\'s Hideous Laughter*\n· **Level 5** — *Clairvoyance*, *Hunger of Hadar*\n· **Level 7** — *Confusion*, *Summon Aberration*\n· **Level 9** — *Modify Memory*, *Telekinesis*',
        description: 'A list of aberrant spells is always prepared for free, expanding at Warlock levels 3, 5, 7, and 9.',
      },
      {
        level: 3,
        name: 'Awakened Mind',
        body:
          'As a **Bonus Action**, you can choose one creature you can see **within 30 feet** of yourself and form a **telepathic bond** with it for a limited time.\n\nThe bond lets you and the creature communicate mentally. From level 6, **Clairvoyant Combatant** turns forming this bond into an offensive move.',
        description: 'A Bonus Action forms a telepathic bond with a creature you can see within 30 feet.',
      },
      {
        level: 3,
        name: 'Psychic Spells',
        body:
          'When you cast a **Warlock spell that deals damage**, you can **change its damage type to Psychic**. Psychic damage is resisted by very little, which quietly upgrades your whole list.\n\nIn addition, when you cast a Warlock spell of the **Enchantment or Illusion** school, you can cast it **without Verbal or Somatic components** — no gestures, no incantation, nothing anyone can point to as the cause.',
        description: 'Convert your Warlock spells\' damage to Psychic, and cast Enchantment/Illusion spells with no Verbal or Somatic components.',
      },
      {
        level: 6,
        name: 'Clairvoyant Combatant',
        body:
          'When you form your **Awakened Mind** telepathic bond with a creature, you can force that creature to make a **Wisdom saving throw** against your spell save DC.\n\nOn a failed save, for the duration of the bond, the creature has **Disadvantage on attack rolls against you**, and **you have Advantage on attack rolls against it**.',
        description: 'Forming your telepathic bond can impose Disadvantage on the target\'s attacks against you and give you Advantage on yours.',
      },
      {
        level: 10,
        name: 'Eldritch Hex',
        body:
          'You always have the **Hex** spell prepared.\n\nIn addition, the creature **cursed by your Hex** has **Disadvantage on saving throws** of the **ability you chose** when you cast the spell.\n\nHex already taxes one ability check; now it taxes the matching saves too, which turns your next control spell into something close to a sure thing.',
        description: 'Hex is always prepared, and its target also has Disadvantage on saves of the chosen ability.',
      },
      {
        level: 10,
        name: 'Thought Shield',
        body:
          'Your thoughts **can\'t be read** by telepathy or other means unless you allow it.\n\nYou also have **Resistance to Psychic damage**, and whenever a creature deals Psychic damage to you, that creature takes **the same amount of damage** you do.',
        description: 'Unreadable thoughts, Resistance to Psychic damage, and Psychic damage is reflected back at the attacker.',
      },
      {
        level: 14,
        name: 'Create Thrall',
        body:
          'Whenever you cast **Summon Aberration**, it **doesn\'t require Concentration**, and its **duration becomes 1 minute** for that casting.\n\nThe Aberration you summon also gains **Temporary Hit Points equal to your Warlock level + your Charisma modifier**.\n\nIn addition, the **first time each turn** the Aberration hits a creature under your **Hex** spell, it deals extra **Psychic damage equal to Hex\'s bonus damage**.',
        description: 'Summon Aberration needs no Concentration, lasts 1 minute, and your thrall punishes your Hex target.',
      },
    ],
  },
];
