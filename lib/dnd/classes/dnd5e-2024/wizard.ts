// lib/dnd/classes/dnd5e-2024/wizard.ts — Wizard, 2024 Player's Handbook.
//
// 2024 deltas worth knowing: the subclass ("Arcane Tradition") is chosen at 3 and the schools were
// renamed to the practitioner (Abjurer, Diviner, Evoker, Illusionist); Ritual Adept and Scholar are
// new; Memorize Spell at 5 lets you swap a prepared spell on a Short Rest; and level 19 is an Epic
// Boon rather than an ASI.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { FULL_CASTER_SLOTS } from '../slots';

export const WIZARD_2024: ClassDefinition = {
  key: 'wizard',
  name: 'Wizard',
  system: 'dnd5e-2024',
  hitDie: 6,
  primaryAbility: ['int'],
  savingThrows: ['int', 'wis'],
  skillChoices: {
    count: 2,
    from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'nature', 'religion'],
  },
  armorProficiencies: [],
  weaponProficiencies: ['Simple weapons'],
  asiLevels: [4, 8, 12, 16],
  subclassLevel: 3,
  subclassLabel: 'Arcane Tradition',
  spellcasting: {
    kind: 'full',
    ability: 'int',
    preparedRule:
      'You prepare spells from your SPELLBOOK, not the whole Wizard list. Your Prepared Spells count comes from the Wizard table (4 at level 1, rising to 25 at level 20). Your spellbook starts with 6 level-1 Wizard spells and gains 2 more each time you gain a Wizard level; you can also copy found spells into it. Spell save DC = 8 + proficiency bonus + INT modifier.',
    cantripsKnown: [0, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    slots: FULL_CASTER_SLOTS,
    // NOTE: this carries the PREPARED SPELLS column, not a 2014-style "spells known" list — 2024
    // has no known-spells casters. The Wizard's table is its own shape: it climbs to 25 (well past
    // the 22 that Bard/Sorcerer reach) and plateaus only once, at 11–12.
    spellsKnown: [0, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25],
  },
  resources: [
    {
      id: 'arcane-recovery',
      name: 'Arcane Recovery',
      perLevel: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      resetOn: 'long',
      note: 'Once per Long Rest, recover slots on a Short Rest totalling up to half your Wizard level (round up), rank 5 and below.',
    },
  ],
  startingEquipment: [
    '2 Daggers, Arcane Focus (quarterstaff), Robe, Spellbook, Scholar\'s Pack, and 5 GP',
    'or 55 GP',
  ],
  description:
    'A scholar of the arcane whose power comes from study rather than birthright — the widest spell list in the game, carried in a book that is both the class feature and the weak point.',
  features: [
    {
      level: 1,
      name: 'Spellcasting',
      body:
        'You have a **spellbook** — the true source of your magic — and cast Wizard spells from it. **Intelligence** is your spellcasting ability.\n\n· **Spellbook.** It starts with **six level-1 Wizard spells** of your choice. Whenever you gain a Wizard level you add **two more** Wizard spells to it, and you can copy spells you find in the world into it (costing time and gold).\n· **Cantrips.** You know three Wizard cantrips, rising to four at level 4 and five at level 10.\n· **Prepared spells.** You prepare **four** level-1 spells from your spellbook to start; the Wizard table sets the number at every level. After a Long Rest you can change which spells are prepared.\n· **Spellcasting focus.** You can use an Arcane Focus.\n\nYour **spell save DC** is 8 + your proficiency bonus + your Intelligence modifier. Note the two-step: the spellbook is what you *could* prepare, and the table limits what you *have* prepared.',
      description: 'Cast Wizard spells with Intelligence, preparing them from a spellbook that grows two spells per level.',
    },
    {
      level: 1,
      name: 'Ritual Adept',
      body:
        'You can cast **any spell as a Ritual** if that spell has the **Ritual** tag and the spell is **in your spellbook**.\n\nYou **needn\'t have the spell prepared**, but you must **read from the book** to cast a spell this way. Casting a spell as a Ritual takes **10 minutes longer** than normal and expends **no spell slot**.\n\nThis is a genuinely large feature: your spellbook is effectively a free, always-available library of every ritual you have ever copied — *Detect Magic*, *Identify*, *Comprehend Languages*, *Alarm* — none of which ever needs to occupy a prepared slot again.',
      description: 'Cast any Ritual-tagged spell in your spellbook as a ritual, unprepared and without a slot, by reading from the book.',
    },
    {
      level: 1,
      name: 'Arcane Recovery',
      body:
        'You can regain some of your magical energy by studying your spellbook. When you finish a **Short Rest**, you can choose expended spell slots to recover.\n\nThe slots must have a **combined rank no higher than half your Wizard level (rounded up)**, and none of them can be **rank 6 or higher**. At level 1 that is one rank-1 slot; at level 10 you can recover slots totalling rank 5.\n\nOnce you use this feature, you can\'t do so again until you finish a **Long Rest**.',
      description: 'Once per Long Rest, a Short Rest recovers slots totalling half your Wizard level in ranks.',
    },
    {
      level: 2,
      name: 'Scholar',
      body:
        'While studying, you specialised in one field of study. Choose one of the following skills in which you have proficiency: **Arcana**, **History**, **Investigation**, **Medicine**, **Nature**, or **Religion**.\n\nYou gain **Expertise** in that skill — your proficiency bonus is **doubled** for any ability check you make with it.\n\nThis is new in 2024 and it is the Wizard\'s only Expertise; pick the skill your table actually rolls.',
      description: 'Gain Expertise in one of Arcana, History, Investigation, Medicine, Nature, or Religion.',
      choice: 'expertise',
    },
    {
      level: 3,
      name: 'Wizard Subclass',
      body:
        'You choose an **Arcane Tradition** — Abjurer, Diviner, Evoker, or Illusionist — and gain its level-3 features.\n\nYour tradition also grants features at levels **6**, **10**, and **14**. In 2024 the schools are named for the practitioner rather than the school, and each tradition front-loads a free-spell benefit tied to its school.',
      description: 'Choose an Arcane Tradition, which grants features at levels 3, 6, 10, and 14.',
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
      name: 'Memorize Spell',
      body:
        'Whenever you finish a **Short Rest**, you can study your spellbook and **replace one of the level 1+ Wizard spells you have prepared** with another **level 1+** Wizard spell from the book.\n\nNote the restriction: this swaps prepared spells of level 1 and higher — it is not a way to rotate cantrips.\n\nIt softens the Wizard\'s oldest weakness — guessing wrong at dawn about what the day would demand — without giving up the discipline of preparing at all.',
      description: 'On a Short Rest, swap one prepared level 1+ Wizard spell for another from your spellbook.',
    },
    {
      level: 18,
      name: 'Spell Mastery',
      body:
        'Choose one **rank-1 Wizard spell** and one **rank-2 Wizard spell** that are in your spellbook and have a casting time of an **action**.\n\nYou can cast both of them **at their lowest rank without expending a spell slot**, as often as you like. To cast either at a higher rank, you must expend a slot as normal.\n\nWhenever you finish a **Long Rest**, you can study your spellbook and change either of the chosen spells. *Shield* and *Misty Step* are the traditional picks; an at-will *Shield* changes what a d6 hit die means.',
      description: 'Cast one chosen rank-1 and one rank-2 spell at will, without expending slots.',
    },
    {
      level: 19,
      name: 'Epic Boon',
      body:
        'You gain an **Epic Boon** feat or another feat of your choice for which you qualify.\n\n**Boon of Spell Recall** is the thematic pick for a Wizard: whenever you cast a Wizard spell of rank 1–4 using a spell slot, roll 1d4 — on a 4, the slot is not expended. Epic Boons also raise one ability score by 1, to a maximum of **30**.\n\nNote that in the 2024 rules level 19 is an **Epic Boon**, not an Ability Score Improvement.',
      description: 'Take an Epic Boon feat — a capstone feat that can push an ability score above 20.',
      choice: 'epic-boon',
    },
    {
      level: 20,
      name: 'Signature Spells',
      body:
        'Choose two **rank-3 Wizard spells** in your spellbook as your signature spells. You always have them **prepared**, and they don\'t count against the number of spells you can prepare.\n\nYou can cast each of them **once at rank 3 without expending a spell slot**, and you regain both castings when you finish a **Short or Long Rest** — a Short Rest, not just a Long one, which is what makes this a real capstone.\n\nTo cast either at a higher rank, you must expend a slot as normal.',
      description: 'Two rank-3 spells are always prepared and each is castable free once per Short Rest.',
    },
  ],
};

// 2024 Wizard traditions grant features at 3/6/10/14 — note this moved from 2014's 2/6/10/14,
// because the subclass itself now arrives at 3 rather than 2. Each tradition's "Savant" feature
// hands you free spellbook spells rather than 2014's gold-and-time discount on copying.
export const WIZARD_SUBCLASSES_2024: SubclassDefinition[] = [
  {
    key: 'abjurer',
    name: 'Abjurer',
    classKey: 'wizard',
    system: 'dnd5e-2024',
    description:
      'A specialist in wards and dispelling — you carry a rechargeable shield of force that soaks damage for you and for anyone you can see.',
    features: [
      {
        level: 3,
        name: 'Abjuration Savant',
        body:
          'Choose **two Wizard spells from the Abjuration school**, each of which must be **no higher than level 2**, and add them to your spellbook **for free**.\n\nIn addition, whenever you gain access to a **new level of spell slots** in this class, you can add **one Abjuration spell** of that level to your spellbook for free.\n\nNote the 2024 change: this hands you actual free spells rather than 2014\'s halved gold-and-time cost for copying them.',
        description: 'Add two level-2-or-lower Abjuration spells to your spellbook free, plus one more at each new spell level.',
      },
      {
        level: 3,
        name: 'Arcane Ward',
        body:
          'When you cast an **Abjuration spell with a spell slot**, you can simultaneously use a strand of the spell\'s magic to create a **magical ward** on yourself that lasts until you finish a **Long Rest**.\n\nThe ward has a **Hit Point maximum equal to twice your Wizard level + your Intelligence modifier**. Whenever you take damage, the **ward takes the damage instead**; if this reduces the ward to 0 Hit Points, you take any remaining damage.\n\nWhile the ward has 0 Hit Points, it can\'t absorb damage, but its magic remains. Whenever you cast an **Abjuration spell with a spell slot**, the ward **regains Hit Points equal to twice the spell slot\'s level**.\n\nOnce you create the ward, you can\'t create it again until you finish a **Long Rest**.',
        description: 'An Abjuration spell raises a ward with 2× Wizard level + INT HP that soaks your damage and recharges as you abjure.',
      },
      {
        level: 6,
        name: 'Projected Ward',
        body:
          'When a creature that you can see **within 30 feet** of yourself takes damage, you can take a **Reaction** to cause your **Arcane Ward** to absorb that damage.\n\nIf this reduces the ward to 0 Hit Points, the warded creature takes any remaining damage. Your ward stops being a personal buffer and becomes a party resource.',
        description: 'React to make your Arcane Ward absorb damage dealt to any creature within 30 feet.',
      },
      {
        level: 10,
        name: 'Spell Breaker',
        body:
          'You always have the **Counterspell** and **Dispel Magic** spells prepared.\n\nIn addition, you can cast **Dispel Magic as a Bonus Action**, and you can add your **Proficiency Bonus** to its ability check.\n\nBonus-action dispelling is a real tempo gain: you can strip an enemy\'s Concentration and still take your action.',
        description: 'Counterspell and Dispel Magic always prepared; cast Dispel Magic as a Bonus Action with your PB added.',
      },
      {
        level: 14,
        name: 'Spell Resistance',
        body:
          'You have **Advantage on saving throws against spells**, and you have **Resistance to the damage of spells**.\n\nThere is no duration, no resource, and no action — it is simply always on, and it is one of the flatter defensive features in the game.',
        description: 'Always have Advantage on saves against spells and Resistance to spell damage.',
      },
    ],
  },
  {
    key: 'diviner',
    name: 'Diviner',
    classKey: 'wizard',
    system: 'dnd5e-2024',
    description:
      'You glimpse the future each morning and hold it in your hand — replacing other people\'s dice with numbers you already rolled.',
    features: [
      {
        level: 3,
        name: 'Divination Savant',
        body:
          'Choose **two Wizard spells from the Divination school**, each of which must be **no higher than level 2**, and add them to your spellbook **for free**.\n\nIn addition, whenever you gain access to a **new level of spell slots** in this class, you can add **one Divination spell** of that level to your spellbook for free.',
        description: 'Add two level-2-or-lower Divination spells to your spellbook free, plus one more at each new spell level.',
      },
      {
        level: 3,
        name: 'Portent',
        body:
          'Whenever you finish a **Long Rest**, roll **two d20s** and record the numbers rolled.\n\nYou can **replace any D20 Test** made by **you or a creature that you can see** with one of these foretelling rolls. You must choose to do so **before the roll**, and you can replace a roll in this way **only once per turn**.\n\nEach foretelling roll can be **used only once**. When you finish your next Long Rest, you lose any unused foretelling rolls.\n\nA recorded 1 is an enemy\'s failed save; a recorded 20 is your ally\'s critical hit. This is the feature the whole subclass is built around.',
        description: 'Roll two d20s on each Long Rest and substitute them for any d20 Test you or a visible creature makes.',
      },
      {
        level: 6,
        name: 'Expert Divination',
        body:
          'When you cast a **Divination spell using a level 2+ spell slot**, you **regain one expended spell slot**.\n\nThe slot you regain must be of a level **lower** than the slot you expended, and it **can\'t be higher than level 5**.\n\nDivination spells partially pay for themselves — a level-3 *Clairvoyance* hands you back a level-2 slot.',
        description: 'Casting a Divination spell with a level 2+ slot refunds a lower-level slot (max level 5).',
      },
      {
        level: 10,
        name: 'The Third Eye',
        body:
          'As a **Bonus Action**, you can increase your powers of perception. Choose one of the following benefits, which lasts **until you start a Short or Long Rest**:\n\n· **Darkvision.** You gain **Darkvision out to 120 feet**.\n· **Greater Comprehension.** You can **read any language**.\n· **See Invisibility.** You can cast **See Invisibility** without expending a spell slot.\n\nNote the 2024 changes: this is now a **Bonus Action** and Darkvision reaches **120 feet**, and it lasts until your next rest rather than a fixed window.',
        description: 'A Bonus Action grants 120-foot Darkvision, universal reading, or a free See Invisibility until your next rest.',
      },
      {
        level: 14,
        name: 'Greater Portent',
        body:
          'You roll **three d20s** for your **Portent** feature rather than two.\n\nHalf again as much destiny per day, and a much better chance of holding a natural 1 and a natural 20 at the same time.',
        description: 'Portent now gives you three foretelling rolls per Long Rest instead of two.',
      },
    ],
  },
  {
    key: 'evoker',
    name: 'Evoker',
    classKey: 'wizard',
    system: 'dnd5e-2024',
    description:
      'You sculpt raw elemental force — fireballs that spare your friends, cantrips that never wholly miss, and a switch that maximises damage outright.',
    features: [
      {
        level: 3,
        name: 'Evocation Savant',
        body:
          'Choose **two Wizard spells from the Evocation school**, each of which must be **no higher than level 2**, and add them to your spellbook **for free**.\n\nIn addition, whenever you gain access to a **new level of spell slots** in this class, you can add **one Evocation spell** of that level to your spellbook for free.',
        description: 'Add two level-2-or-lower Evocation spells to your spellbook free, plus one more at each new spell level.',
      },
      {
        level: 3,
        name: 'Potent Cantrip',
        body:
          'Your damaging cantrips affect even creatures that avoid the brunt of the effect.\n\nWhen you cast a cantrip at a creature and you **miss with the attack roll** or the **target succeeds on a saving throw**, the target takes **half the cantrip\'s damage** (if any) but suffers **no additional effect** of the cantrip.\n\nNote the 2024 changes: this moved from level 6 down to **3**, and it now covers **missed attack rolls** — so *Fire Bolt* and *Ray of Frost* benefit, not just save-based cantrips.',
        description: 'Your cantrips deal half damage on a miss or a successful save.',
      },
      {
        level: 6,
        name: 'Sculpt Spells',
        body:
          'You can create pockets of relative safety within the effects of your Evocation spells.\n\nWhen you cast an Evocation spell that affects other creatures that you can see, you can choose a number of them equal to **1 plus the spell\'s level**. The chosen creatures **automatically succeed on their saving throws** against the spell, and they take **no damage** if they would normally take half damage on a successful save.\n\nA level-3 *Fireball* therefore spares **four** allies completely. This is why an Evoker can drop a Fireball into a melee.',
        description: 'Choose 1 + the spell\'s level in creatures to automatically succeed and take no damage from your Evocation spells.',
      },
      {
        level: 10,
        name: 'Empowered Evocation',
        body:
          'Whenever you cast a Wizard spell from the **Evocation school**, you can add your **Intelligence modifier** to **one damage roll** of that spell.\n\nNote "one damage roll" — for *Fireball* that is the single shared roll, so every target feels it; for *Magic Missile* it is one dart.',
        description: 'Add your INT modifier to one damage roll of every Evocation spell you cast.',
      },
      {
        level: 14,
        name: 'Overchannel',
        body:
          'You can increase the power of your spells. When you cast a **Wizard spell with a spell slot of levels 1–5** that **deals damage**, you can deal **maximum damage** with that spell **on the turn you cast it**.\n\nThe **first time** you do so, you suffer no adverse effect. If you use this feature **again before you finish a Long Rest**, you take **2d12 Necrotic damage per level of the spell slot** immediately after you cast it. This damage **ignores Resistance and Immunity**.\n\nNote the 2024 change: the backlash no longer escalates with each additional use the way 2014\'s did — it is a flat 2d12 per slot level every time after the first.',
        description: 'Deal maximum damage with a level 1–5 damaging spell; free once per Long Rest, then 2d12 Necrotic per slot level.',
      },
    ],
  },
  {
    key: 'illusionist',
    name: 'Illusionist',
    classKey: 'wizard',
    system: 'dnd5e-2024',
    description:
      'You weave lies out of light and sound — silent, long-ranged illusions, a duplicate that eats an attack, and eventually illusions that become real.',
    features: [
      {
        level: 3,
        name: 'Illusion Savant',
        body:
          'Choose **two Wizard spells from the Illusion school**, each of which must be **no higher than level 2**, and add them to your spellbook **for free**.\n\nIn addition, whenever you gain access to a **new level of spell slots** in this class, you can add **one Illusion spell** of that level to your spellbook for free.',
        description: 'Add two level-2-or-lower Illusion spells to your spellbook free, plus one more at each new spell level.',
      },
      {
        level: 3,
        name: 'Improved Illusions',
        body:
          'You can cast **Illusion spells without providing Verbal components**, and if an Illusion spell you cast has a **range of 10+ feet, that range increases by 60 feet**. Nobody hears you lie, and you can do it from across the room.\n\nYou also learn the **Minor Illusion** cantrip. It **doesn\'t count against the number of cantrips you know**, and if you already know it, you learn a different Wizard cantrip in its place.\n\nFinally, your Minor Illusion is upgraded: you can create **both a sound and an image** with a single casting, and you can cast it as a **Bonus Action**.',
        description: 'Cast Illusions silently and 60 feet farther; get an upgraded Minor Illusion free that makes sound and image at once.',
      },
      {
        level: 6,
        name: 'Phantasmal Creatures',
        body:
          'You always have the **Summon Beast** and **Summon Fey** spells prepared.\n\nWhenever you cast either spell, you can **change its school to Illusion**, which causes the summoned creature to appear **spectral**.\n\nThis is brand new in 2024 — there is no 2014 analogue. Recasting them as Illusion spells also means **Improved Illusions** applies, so you can summon silently.',
        description: 'Summon Beast and Summon Fey always prepared, castable as Illusion spells for a spectral creature.',
      },
      {
        level: 10,
        name: 'Illusory Self',
        body:
          'When a creature **hits you with an attack roll**, you can take a **Reaction** to interpose an **illusory duplicate** of yourself between the attacker and yourself.\n\nThe attack **automatically misses** you, then the illusion dissipates.\n\nOnce you use this feature, you can\'t do so again until you finish a **Short or Long Rest**, or until you **expend a level 2+ spell slot** (no action required) to restore your use of it.',
        description: 'React to make one attack that hit you automatically miss, once per Short Rest or for a level 2+ slot.',
      },
      {
        level: 14,
        name: 'Illusory Reality',
        body:
          'While an **Illusion spell** of yours is ongoing, you can take a **Bonus Action** to choose one **inanimate, nonmagical object** that is part of the illusion and **make that object real**.\n\nThe object remains real for **1 minute**, during which it **can\'t deal damage or give any conditions**.\n\nA real bridge over a chasm, a real wall, a real door — the restriction is only that it can\'t hurt anyone. This is the capstone that turns your lies into architecture.',
        description: 'A Bonus Action makes one inanimate object in your ongoing illusion physically real for 1 minute.',
      },
    ],
  },
];
