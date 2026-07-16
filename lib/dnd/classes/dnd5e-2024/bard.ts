// lib/dnd/classes/dnd5e-2024/bard.ts — Bard, 2024 Player's Handbook.
//
// 2024 deltas worth knowing: the subclass ("Bard College") is chosen at 3 rather than 3-in-name-only,
// Magical Secrets is now a BASE class feature at 10 (it was College of Lore's at 6 in 2014), Font of
// Inspiration returns Bardic Inspiration on a SHORT rest and can be bought back with a spell slot,
// and level 19 is an Epic Boon rather than an ASI.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { FULL_CASTER_SLOTS } from '../slots';

export const BARD_2024: ClassDefinition = {
  key: 'bard',
  name: 'Bard',
  system: 'dnd5e-2024',
  hitDie: 8,
  primaryAbility: ['cha'],
  savingThrows: ['dex', 'cha'],
  skillChoices: {
    count: 3,
    from: [
      'acrobatics', 'animal', 'arcana', 'athletics', 'deception', 'history', 'insight',
      'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance',
      'persuasion', 'religion', 'sleight', 'stealth', 'survival',
    ],
  },
  armorProficiencies: ['Light armor'],
  weaponProficiencies: ['Simple weapons'],
  toolProficiencies: ['Three Musical Instruments of your choice'],
  asiLevels: [4, 8, 12, 16],
  subclassLevel: 3,
  subclassLabel: 'Bard College',
  spellcasting: {
    kind: 'full',
    ability: 'cha',
    preparedRule:
      'Your Prepared Spells count comes from the Bard table (4 at level 1, rising to 22 at level 20), chosen from the Bard spell list. Whenever you gain a Bard level you may replace one prepared spell with another; you may also change the list after a Long Rest. Spell save DC = 8 + proficiency bonus + CHA modifier.',
    cantripsKnown: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    slots: FULL_CASTER_SLOTS,
    spellsKnown: [0, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  },
  resources: [
    {
      id: 'bardic-inspiration',
      name: 'Bardic Inspiration',
      // Uses equal your CHA modifier (minimum 1) — a per-character number the sheet computes, so the
      // table carries -1 ("derived/unlimited by table") rather than a wrong fixed count.
      perLevel: [0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
      resetOn: 'long',
      note: 'Uses = your Charisma modifier (minimum 1). From level 5 (Font of Inspiration) they return on a Short Rest too.',
    },
  ],
  startingEquipment: [
    'Leather Armor, 2 Daggers, a Musical Instrument of your choice, Entertainer\'s Pack, and 19 GP',
    'or 90 GP',
  ],
  description:
    'A performer whose magic rides on music and words — inspiring allies, bending minds, and borrowing a little of every other spellcaster\'s repertoire.',
  features: [
    {
      level: 1,
      name: 'Bardic Inspiration',
      body:
        'As a **Bonus Action**, you can inspire one creature other than yourself within **60 feet** who can hear you. That creature gains one **Bardic Inspiration die**, a **d6**.\n\nOnce within the next **hour**, when the creature fails a **D20 Test** (an ability check, attack roll, or saving throw), it can roll the die and add the number to the total, turning the failure into a possible success. The die can be rolled after seeing the d20 result but before the DM says whether the roll succeeds. The die is then expended, and a creature can only hold one at a time.\n\nYou have a number of uses equal to your **Charisma modifier** (minimum of 1), and you regain all expended uses when you finish a **Long Rest**.\n\nThe die grows with you: **d8** at level 5, **d10** at level 10, and **d12** at level 15.',
      description: 'A Bonus Action grants an ally a die they can add to a failed d20 Test within the next hour.',
    },
    {
      level: 1,
      name: 'Spellcasting',
      body:
        'You have learned to cast spells through your music and speech, drawing on the **Bard spell list**. **Charisma** is your spellcasting ability.\n\n· **Cantrips.** You know two Bard cantrips of your choice, rising to three at level 4 and four at level 10. Whenever you gain a Bard level you may replace one cantrip with another from the list.\n· **Prepared spells.** You prepare four level-1 Bard spells to start; the Bard table sets the number at every level, and your spell slots come from the standard full-caster table.\n· **Spellcasting focus.** You can use a Musical Instrument as your spellcasting focus.\n\nYour **spell save DC** is 8 + your proficiency bonus + your Charisma modifier, and your **spell attack modifier** is your proficiency bonus + your Charisma modifier.',
      description: 'You cast Bard spells using Charisma, preparing them from the Bard spell list on the full-caster slot table.',
    },
    {
      level: 2,
      name: 'Expertise',
      body:
        'Choose **two** of your skill proficiencies. Your proficiency bonus is **doubled** for any ability check you make with either of those skills.\n\nIf you have neither Sleight of Hand nor Performance proficiency, one of your Expertise choices does not need to be a skill you are already proficient in — the standard rule is that Expertise applies only to skills you are proficient with.\n\nAt level 9 you choose **two more** of your skill proficiencies to gain this benefit.',
      description: 'Double your proficiency bonus on two chosen skills, and two more at level 9.',
      choice: 'expertise',
    },
    {
      level: 2,
      name: 'Jack of All Trades',
      body:
        'You can add **half your proficiency bonus** (rounded down) to any ability check you make that uses a skill you are **not** already proficient in and that doesn\'t already include your proficiency bonus.\n\nAt level 2 that is +1; it grows to +2 at level 9 and +3 at level 17. It is small, but it means a Bard is never truly bad at anything.',
      description: 'Add half your proficiency bonus to ability checks that don\'t already include it.',
    },
    {
      level: 3,
      name: 'Bard Subclass',
      body:
        'You choose a **Bard College** — Dance, Glamour, Lore, or Valor — and gain its level-3 features.\n\nYour college also grants you features at levels **6** and **14**. Every college draws on the same core Bard chassis, so the choice shapes how you use Bardic Inspiration and what you do when the singing stops and the fighting starts.',
      description: 'Choose a Bard College, which grants features now and at levels 6 and 14.',
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
      name: 'Font of Inspiration',
      body:
        'You now regain all expended uses of **Bardic Inspiration** when you finish a **Short Rest** as well as a Long Rest.\n\nIn addition, you can **expend a spell slot** (no action required) to regain one expended use of Bardic Inspiration. This turns spare slots into inspiration and makes the die something you spend freely rather than hoard.',
      description: 'Bardic Inspiration returns on a Short Rest, and you can burn a spell slot to regain a use.',
    },
    {
      level: 7,
      name: 'Countercharm',
      body:
        'When you or a creature within **30 feet** of you fails a saving throw against an effect that would apply the **Frightened** or **Charmed** condition, you can take a **Reaction** to cause the save to be **rerolled**, and the new roll has **Advantage**.\n\nYou must be able to be heard, and you can\'t use this if you have the Incapacitated or Silenced condition.',
      description: 'React to let a nearby failed save against Charmed or Frightened be rerolled with Advantage.',
    },
    {
      level: 10,
      name: 'Magical Secrets',
      body:
        'Your repertoire stops respecting class boundaries. Whenever you reach a Bard level that grants the Spellcasting feature\'s "prepare spells" step, you can choose your prepared spells from the **Bard**, **Cleric**, **Druid**, and **Wizard** spell lists as well — including cantrips.\n\nA spell you take this way counts as a **Bard spell** for you, and you cast it with **Charisma**. The spell\'s rank must be one you can already cast.\n\nAt level 10 this applies to your prepared spells generally, so on any level-up (or Long Rest reshuffle) you can swap in the exact tool the party is missing.',
      description: 'Prepare spells from the Cleric, Druid, and Wizard lists as well; they count as Bard spells for you.',
    },
    {
      level: 18,
      name: 'Superior Inspiration',
      body:
        'When you roll **Initiative**, you regain expended uses of **Bardic Inspiration** until you have **two** uses (if you had fewer than two).\n\nYou will effectively never start a fight empty-handed again.',
      description: 'Rolling Initiative tops your Bardic Inspiration back up to two uses.',
    },
    {
      level: 19,
      name: 'Epic Boon',
      body:
        'You gain an **Epic Boon** feat or another feat of your choice for which you qualify.\n\n**Boon of Spell Recall** is the thematic pick for a Bard: whenever you cast a Bard spell of rank 1–4 using a spell slot, roll 1d4 — on a 4, the slot is not expended. Epic Boons also raise one ability score by 1, to a maximum of **30**.\n\nNote that in the 2024 rules level 19 is an **Epic Boon**, not an Ability Score Improvement.',
      description: 'Take an Epic Boon feat — a capstone feat that can push an ability score above 20.',
      choice: 'epic-boon',
    },
    {
      level: 20,
      name: 'Words of Creation',
      body:
        'You have mastered two of the seven words of creation: you always have the **Power Word Heal** and **Power Word Kill** spells prepared.\n\nWhen you cast either one, you can target a **second** creature with it, so long as that creature is within **10 feet** of the first target.',
      description: 'Always have Power Word Heal and Power Word Kill prepared, and each can hit a second nearby target.',
    },
  ],
};

// 2024 Bard colleges grant features at 3, 6, and 14 — there is NO level-10 subclass feature,
// because level 10 is where the BASE class now hands out Magical Secrets. This is why College of
// Lore lost its 2014 "Additional Magical Secrets" and got Magical Discoveries at 6 instead.
export const BARD_SUBCLASSES_2024: SubclassDefinition[] = [
  {
    key: 'dance',
    name: 'College of Dance',
    classKey: 'bard',
    system: 'dnd5e-2024',
    description:
      'A bard whose instrument is their own body — an unarmored acrobat who turns momentum into defense and inspiration into strikes.',
    features: [
      {
        level: 3,
        name: 'Dazzling Footwork',
        body:
          'While you aren\'t wearing armor or wielding a Shield, you gain all of the following.\n\n· **Dance Virtuoso.** You have **Advantage** on any Charisma (Performance) check you make that involves you dancing.\n· **Unarmored Defense.** Your base **AC = 10 + your Dexterity modifier + your Charisma modifier**.\n· **Agile Strikes.** When you expend a use of **Bardic Inspiration** as part of an action, a Bonus Action, or a Reaction, you can make **one Unarmed Strike** as part of that same action, Bonus Action, or Reaction.\n· **Bardic Damage.** You can use **Dexterity** instead of Strength for your Unarmed Strike attack rolls. When you deal damage with an Unarmed Strike, you can instead deal **Bludgeoning damage equal to a roll of your Bardic Inspiration die + your Dexterity modifier** — and this roll **does not expend the die**.',
        description: 'Unarmored, you get a CHA-based AC, Dex unarmed strikes that deal your Bardic Inspiration die, and free strikes when you spend inspiration.',
      },
      {
        level: 6,
        name: 'Inspiring Movement',
        body:
          'When an enemy you can see ends its turn **within 5 feet** of you, you can take a **Reaction** and **expend one use of Bardic Inspiration** to move up to **half your Speed**.\n\nThen **one ally of your choice within 30 feet** of you can also move up to **half their Speed**, using **their Reaction**.\n\nNone of this movement provokes **Opportunity Attacks**.',
        description: 'React when an enemy ends its turn next to you: you and an ally each reposition half your Speed, freely.',
      },
      {
        level: 6,
        name: 'Tandem Footwork',
        body:
          'When you roll **Initiative**, you can **expend one use of Bardic Inspiration** — provided you don\'t have the **Incapacitated** condition.\n\nRoll your Bardic Inspiration die. **You and each ally within 30 feet** of you who can see or hear you gain a **bonus to Initiative equal to the number rolled**.',
        description: 'Spend Bardic Inspiration on Initiative to give yourself and nearby allies the die roll as an Initiative bonus.',
      },
      {
        level: 14,
        name: 'Leading Evasion',
        body:
          'When you are subjected to an effect that allows you to make a **Dexterity saving throw to take only half damage**, you instead take **no damage on a success** and **half damage on a failure**.\n\nIf any creatures **within 5 feet** of you are making the same saving throw, you can **share this benefit with them** for that save.\n\nYou can\'t use this feature while you have the **Incapacitated** condition.',
        description: 'Evasion that you can extend to creatures within 5 feet of you.',
      },
    ],
  },
  {
    key: 'glamour',
    name: 'College of Glamour',
    classKey: 'bard',
    system: 'dnd5e-2024',
    description:
      'A bard touched by the Feywild, wielding an unearthly charm that heartens allies and makes enemies falter mid-swing.',
    features: [
      {
        level: 3,
        name: 'Beguiling Magic',
        body:
          'You always have **Charm Person** and **Mirror Image** prepared.\n\nIn addition, immediately after you cast an **Enchantment or Illusion spell using a spell slot**, you can force one creature you can see **within 60 feet** to make a **Wisdom saving throw** against your spell save DC. On a failed save, the target has the **Charmed** or **Frightened** condition (your choice) for **1 minute**. The target repeats the save at the end of each of its turns, ending the effect on itself on a success.\n\nYou can use this **once per Long Rest**, and you can also restore the use by **expending one use of Bardic Inspiration** (no action required).',
        description: 'Charm Person and Mirror Image always prepared, plus a rider that Charms or Frightens after your Enchantment/Illusion spells.',
      },
      {
        level: 3,
        name: 'Mantle of Inspiration',
        body:
          'As a **Bonus Action**, you can expend a use of **Bardic Inspiration** and roll the die.\n\nChoose up to **your Charisma modifier** in other creatures (minimum of 1) **within 60 feet**. Each of them gains **Temporary Hit Points equal to twice the number rolled**, and each can immediately use its **Reaction to move up to its Speed**, without provoking **Opportunity Attacks**.',
        description: 'A Bonus Action gives several allies Temp HP equal to twice your Inspiration die, plus a free Reaction move.',
      },
      {
        level: 6,
        name: 'Mantle of Majesty',
        body:
          'You always have the **Command** spell prepared.\n\nAs a **Bonus Action**, you cast **Command without expending a spell slot** and take on an unearthly appearance for **1 minute or until your Concentration ends**. For that duration, you can cast **Command as a Bonus Action without expending a spell slot**.\n\nAny creature **Charmed by you automatically fails** its saving throw against the Command you cast with this feature.\n\nYou can use this **once per Long Rest**, and you can also restore the use by **expending a level 3+ spell slot** (no action required).',
        description: 'Cast Command free as a Bonus Action each round for a minute; creatures you have Charmed auto-fail it.',
      },
      {
        level: 14,
        name: 'Unbreakable Majesty',
        body:
          'As a **Bonus Action**, you can assume a magically majestic presence for **1 minute or until you have the Incapacitated condition**.\n\nFor the duration, whenever a creature **hits you with an attack roll for the first time on a turn**, the attacker must succeed on a **Charisma saving throw** against your spell save DC or **the attack misses instead**, regardless of the roll.\n\nYou can use this feature **once per Short or Long Rest**.',
        description: 'For a minute, the first attack that hits you each turn can simply miss if the attacker fails a CHA save.',
      },
    ],
  },
  {
    key: 'lore',
    name: 'College of Lore',
    classKey: 'bard',
    system: 'dnd5e-2024',
    description:
      'A bard who collects knowledge the way others collect coin — the widest skill set in the party, and a barbed word that unravels an enemy\'s best moment.',
    features: [
      {
        level: 3,
        name: 'Bonus Proficiencies',
        body:
          'You gain proficiency with **three skills** of your choice.\n\nCombined with Expertise at level 2 and Jack of All Trades, this is what makes a Lore Bard the party\'s answer to almost any check that isn\'t combat.',
        description: 'Gain proficiency in three skills of your choice.',
      },
      {
        level: 3,
        name: 'Cutting Words',
        body:
          'When a creature you can see **within 60 feet** makes a **damage roll**, or **succeeds on an ability check or an attack roll**, you can take a **Reaction** and **expend one use of Bardic Inspiration**.\n\nRoll the Bardic Inspiration die and **subtract the number rolled from the creature\'s roll**, reducing the damage or potentially turning a success into a failure.\n\nUnlike the 2014 version, there is **no exemption for creatures immune to being Charmed** — Cutting Words now works on anything you can see.',
        description: 'React to subtract your Inspiration die from an enemy\'s damage roll, successful check, or attack.',
      },
      {
        level: 6,
        name: 'Magical Discoveries',
        body:
          'You learn **two spells** of your choice from the **Cleric**, **Druid**, or **Wizard** spell lists, in any combination.\n\nEach spell must be a **cantrip** or a spell for which you have **spell slots**. You always have these spells prepared, and they don\'t count against your prepared total.\n\nWhenever you gain a Bard level, you can **replace one** of them with another spell that meets the same requirements.\n\nNote this is *not* the 2014 "Additional Magical Secrets" — in 2024 **Magical Secrets is a base Bard feature at level 10** for every college.',
        description: 'Always have two Cleric, Druid, or Wizard spells prepared, swappable on each Bard level-up.',
      },
      {
        level: 14,
        name: 'Peerless Skill',
        body:
          'When you make an **ability check or attack roll** and **fail**, you can expend one use of **Bardic Inspiration**, roll the die, and **add the number to the d20**, potentially turning the failure into a success.\n\n**On a failure, the Bardic Inspiration is not expended** — you only pay when it actually works.',
        description: 'Add your Inspiration die to your own failed check or attack; if it still fails, the die isn\'t spent.',
      },
    ],
  },
  {
    key: 'valor',
    name: 'College of Valor',
    classKey: 'bard',
    system: 'dnd5e-2024',
    description:
      'A skald who sings from inside the shield wall — armor, martial weapons, and inspiration that sharpens an ally\'s blade mid-swing.',
    features: [
      {
        level: 3,
        name: 'Combat Inspiration',
        body:
          'A creature that has a **Bardic Inspiration die** from you can use it in either of these ways, in addition to the normal use.\n\n· **Defense.** When the creature is **hit by an attack roll**, it can use its **Reaction** to roll the die and **add the number to its AC** against that attack, potentially causing the attack to miss.\n· **Offense.** Immediately after the creature **hits a target with an attack roll**, it can roll the die and **add the number to the attack\'s damage** against that target.',
        description: 'Your Inspiration die can instead be added to an ally\'s AC against a hit, or to their damage.',
      },
      {
        level: 3,
        name: 'Martial Training',
        body:
          'You gain proficiency with **Martial weapons** and training with **Medium armor** and **Shields**.\n\nIn addition, you can use a **Simple or Martial weapon as a Spellcasting Focus** for your Bard spells — so you never have to choose between holding a sword and holding a lute.',
        description: 'Martial weapons, Medium armor and Shields, and weapons work as your spellcasting focus.',
      },
      {
        level: 6,
        name: 'Extra Attack',
        body:
          'You can **attack twice** instead of once whenever you take the **Attack** action on your turn.\n\nIn addition, you can **cast one of your cantrips that has a casting time of an action in place of one of those attacks**.',
        description: 'Attack twice with the Attack action, and you may swap one attack for an action-cast cantrip.',
      },
      {
        level: 14,
        name: 'Battle Magic',
        body:
          'After you cast a spell that has a **casting time of an action**, you can make **one attack with a weapon as a Bonus Action**.\n\nThis is the level where a Valor Bard stops choosing between casting and fighting on any given turn.',
        description: 'After casting an action spell, make one weapon attack as a Bonus Action.',
      },
    ],
  },
];
