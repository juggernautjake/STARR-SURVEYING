// lib/dnd/classes/dnd5e-2024/artificer.ts — the 2024-rules Artificer (Eberron: Forge of the Artificer).
//
// P5-12. This class was BLOCKED ON DATA in the remediation doc — the 2024 Artificer was published after
// the 2024 PHB and the repo carried only the 2014 one (`dnd5e-2014/artificer.ts`). Owner supplied the
// sources 2026-07-31; the class table and every feature body below are transcribed from the published
// text, not adapted from the 2014 file. Where the two editions differ the 2014 one is WRONG for a 2024
// character, and the differences are structural rather than cosmetic:
//
//   · **Infuse Item → Replicate Magic Item.** Infusions are gone. You learn *plans* (4 at level 2, rising
//     to 8) and create magic items from them on a Long Rest (2 at level 2, rising to 6). The number of
//     each is a TABLE COLUMN, not a formula — see PLANS_KNOWN / MAGIC_ITEMS below.
//   · **Magical Tinkering → Tinker's Magic.** No longer minor properties on objects: you know Mending and
//     you conjure real mundane gear, INT-modifier times per Long Rest.
//   · **Prepared spells is a fixed table**, exactly like every other 2024 caster — not the 2014
//     `INT modifier + half level`. Cantrips step at 10 and 14 rather than 10 and 14 of the old table.
//   · **Tool Expertise (6) is gone**, replaced by Magic Item Tinker (Charge / Drain / Transmute).
//   · **Flash of Genius fires AFTER the roll fails** — "when you or a creature … fails an ability check
//     or a saving throw" — where 2014's fired on the attempt. That is a real play difference, not wording.
//   · **Spell-Storing Item takes level 1–3 spells** (2014: 1–2).
//   · **Magic Item Savant (14) → Advanced Artifice**, which is the fifth attunement slot PLUS regaining a
//     use of Flash of Genius on a Short Rest. It no longer ignores attunement requirements.
//   · **Level 19 is an Epic Boon**, per the 2024 convention; 2014 had a fifth ASI there. ASIs: 4/8/12/16.
//   · **Six subclasses**, not four: Cartographer (FotA) and Reanimator (Ravenloft: The Horrors Within)
//     join Alchemist, Armorer, Artillerist and Battle Smith. The Armorer has THREE models — Dreadnaught
//     is new alongside Guardian and Infiltrator.
//
// `roundHalfUp` is carried over deliberately: the Artificer is still the one half-caster whose levels
// round UP for multiclass caster-level math, and the class table still gives slots from level 1.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { ARTIFICER_SLOTS } from '../slots';

/** Plans Known column, index 1..20. Level 1 has no Replicate Magic Item yet. */
const PLANS_KNOWN = [0, 0, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8];
/** Magic Items column, index 1..20 — how many replicated items can exist at once. */
const MAGIC_ITEMS = [0, 0, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6];

export const ARTIFICER_2024: ClassDefinition = {
  key: 'artificer',
  name: 'Artificer',
  system: 'dnd5e-2024',
  hitDie: 8,
  primaryAbility: ['int'],
  savingThrows: ['con', 'int'],
  skillChoices: {
    count: 2,
    from: ['Arcana', 'History', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Sleight of Hand'],
  },
  armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
  weaponProficiencies: ['Simple weapons'],
  toolProficiencies: ['Thieves\' Tools', 'Tinker\'s Tools', 'One type of Artisan\'s Tools of your choice'],
  asiLevels: [4, 8, 12, 16],
  subclassLevel: 3,
  subclassLabel: 'Artificer Subclass',
  description:
    'An inventor who makes magic items on a schedule. Learn plans, replicate real magic items after every Long Rest, conjure the mundane gear the party forgot, and hand out a bonus that turns a failed save into a made one.',
  startingEquipment: [
    'Studded Leather Armor, Dagger, Thieves\' Tools, Tinker\'s Tools, Dungeoneer\'s Pack, and 16 GP',
    'or 150 GP',
  ],
  spellcasting: {
    kind: 'half',
    // The Artificer's caster levels round UP when multiclassing — the only 5e half-caster that does.
    roundHalfUp: true,
    ability: 'int',
    // Transcribed from the Artificer Features table (Part B) and pinned against `preparedRule` by test.
    // Identical to the 2024 Paladin's column, which is a coincidence of the half-caster chassis rather
    // than a shared constant — keep them separate so a change to one cannot silently move the other.
    spellsKnown: [0, 2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15],
    cantripsKnown: [0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4],
    preparedRule:
      'Prepared spells are a fixed count from the Artificer table: 2/3/4/5/6/6/7/7/9/9/10/10/11/11/12/12/14/14/15/15 at levels 1–20 — NOT the 2014 rule of Intelligence modifier + half your level. You may rebuild the whole list after a Long Rest. Cantrips: two at level 1, a third at level 10, a fourth at level 14 (Tinker\'s Magic gives you Mending on top of these). Slots come from the half-caster table but begin at LEVEL 1, and always-prepared subclass spells do not count against the number.',
    slots: ARTIFICER_SLOTS,
  },
  resources: [
    {
      id: 'replicated-items',
      name: 'Replicated Magic Items',
      perLevel: MAGIC_ITEMS,
      resetOn: 'long',
      note: 'How many items from Replicate Magic Item can exist at once. Create them with Tinker\'s Tools in hand at the end of a Long Rest; exceeding the maximum makes the oldest one vanish.',
    },
  ],
  features: [
    {
      level: 1,
      name: 'Spellcasting',
      body:
        'You channel magical energy through objects, casting from the **Artificer spell list** with **Intelligence** as your spellcasting ability (save DC 8 + proficiency bonus + Intelligence modifier).\n\n· **Tools Required.** Your focus is **Thieves\' Tools, Tinker\'s Tools, or another Artisan\'s Tools you are proficient with**, and you must have one in hand to cast — which means every Artificer spell has an M component for you. Any **Wand or Weapon you created with Replicate Magic Item** also counts as a focus.\n· **Cantrips.** Two at level 1; another at level **10** and again at level **14**.\n· **Prepared spells.** A fixed count from the table — 2 at level 1 rising to 15 at level 20 — chosen from spell levels you have slots for. You may **change the whole list after a Long Rest**.\n· **Slots.** The half-caster table, but unusually it **starts at level 1**.',
      description: 'INT half-caster that casts through tools and has slots from level 1; prepared count comes from the table.',
    },
    {
      level: 1,
      name: 'Tinker\'s Magic',
      body:
        'You know the **Mending** cantrip.\n\nAs a **Magic action** while holding **Tinker\'s Tools**, you create one mundane item in an unoccupied space within 5 feet — from a fixed list including **Ball Bearings, Bedroll, Bell, Blanket, Block and Tackle, Bottle, Bucket, Caltrops, Candle, Crowbar, Flask, Grappling Hook, Hunting Trap, Jug, Lamp, Manacles, Net, Oil, Paper, Parchment, Pole, Pouch, Rope, Sack, Shovel, Iron Spikes, String, Tinderbox, Torch, or Vial**.\n\nThe item **lasts until you finish a Long Rest**, then vanishes. You can do this a number of times equal to your **Intelligence modifier** (minimum once), regaining all uses on a Long Rest.\n\n*(This replaces 2014\'s Magical Tinkering, which added minor properties to objects you already had.)*',
      description: 'Mending, plus conjuring real mundane gear INT-modifier times per Long Rest.',
    },
    {
      level: 2,
      name: 'Replicate Magic Item',
      body:
        'You learn arcane **plans** and make real magic items from them. This replaces 2014\'s Infuse Item entirely.\n\n· **Plans Known.** Four at level 2, chosen from the *Magic Item Plans (Artificer Level 2+)* table. You learn another at levels **6, 10, 14 and 18** (4/5/6/7/8), choosing from any plans table you qualify for, and you can **replace one plan whenever you gain an Artificer level**.\n· **Creating an Item.** When you finish a **Long Rest** with Tinker\'s Tools in hand, create up to your maximum number of **different** magic items — **2** at level 2, **3** at 6, **4** at 10, **5** at 14, **6** at 18. If a created item requires **Attunement** you may attune to it the instant you create it.\n· **Duration.** The item works as the real magic item but its magic is not permanent: when you die it vanishes after **1d4 days**, and replacing a plan makes anything built from it vanish at once. Exceeding your maximum makes the **oldest** item vanish. A vanished container drops its contents harmlessly in its space.\n· **Spellcasting Focus.** Any **Wand or Weapon** you create this way serves as your focus.',
      description: 'Learn plans (4→8) and make real magic items on a Long Rest (2→6 at once).',
    },
    {
      level: 3,
      name: 'Artificer Subclass',
      body:
        'You choose a subclass — **Alchemist**, **Armorer**, **Artillerist**, **Battle Smith**, **Cartographer** or **Reanimator** — which grants features at levels **3, 5, 9 and 15** and its own always-prepared spells.\n\nEvery subclass except the Reanimator opens with a **Tools of the Trade** feature that hands you its artisan tools and halves the crafting time for the thing it specialises in.',
      choice: 'subclass',
    },
    {
      level: 4,
      name: 'Ability Score Improvement',
      body: 'You gain the **Ability Score Improvement** feat or another feat you qualify for. Again at levels **8, 12 and 16**.',
      choice: 'asi',
    },
    {
      level: 6,
      name: 'Magic Item Tinker',
      body:
        'Replicate Magic Item gains three options, all of them acting on items **you** created:\n\n· **Charge Magic Item.** *Bonus Action* — touch a created item within 5 feet that uses charges and expend a **level 1+ spell slot**; it regains charges equal to the slot\'s level.\n· **Drain Magic Item.** *Bonus Action* — touch a created item within 5 feet and destroy it, converting it into a **level 1 slot** (Common item) or **level 2 slot** (Uncommon or Rare). Once per Long Rest, and the slot vanishes at your next Long Rest.\n· **Transmute Magic Item.** *Magic action* — touch a created item within 5 feet and turn it into a different item based on a plan you know. Once per Long Rest.\n\n*(2014\'s Tool Expertise — double proficiency on tool checks — is gone.)*',
      description: 'Charge, Drain and Transmute your replicated items.',
    },
    {
      level: 7,
      name: 'Flash of Genius',
      body:
        'When you or a creature you can see within 30 feet **fails** an ability check or a saving throw, you can take a **Reaction** to add your **Intelligence modifier** (minimum +1) to the roll, potentially turning the failure into a success.\n\nUses equal your **Intelligence modifier** (minimum once), regained on a **Long Rest** — and from level 14 you get one back on a **Short Rest**, from level 20 all of them.\n\n*Note the 2024 timing:* you react to a **failed** roll, so you never spend a use on a roll that was going to succeed anyway.',
      description: 'Reaction: add INT to a FAILED check or save within 30 ft. INT-mod uses per Long Rest.',
    },
    {
      level: 8,
      name: 'Ability Score Improvement',
      body: 'You gain the **Ability Score Improvement** feat or another feat you qualify for.',
      choice: 'asi',
    },
    {
      level: 10,
      name: 'Magic Item Adept',
      body: 'You can **attune to up to four magic items** at once.\n\n*(The 2014 version also cut crafting time and cost for common and uncommon items; the 2024 one does not.)*',
    },
    {
      level: 11,
      name: 'Spell-Storing Item',
      body:
        'When you finish a **Long Rest**, touch one **Simple or Martial weapon**, or an item usable as a Spellcasting Focus, and store a **level 1, 2 or 3 Artificer spell** in it — one with a casting time of an action and no Material component consumed by the spell. **You need not have it prepared.**\n\nWhile holding the object, **any creature** can take a **Magic action** to produce the spell\'s effect, using **your** spellcasting ability modifier; it must concentrate if the spell requires Concentration. After a creature uses it, that creature cannot use it again until the start of its next turn.\n\nThe spell remains until used a number of times equal to **twice your Intelligence modifier** (minimum twice), or until you store a new spell.\n\n*(2014 capped this at level 1–2 spells.)*',
      description: 'Store a level 1–3 spell in an item; anyone may cast it, 2 × INT modifier times.',
    },
    {
      level: 12,
      name: 'Ability Score Improvement',
      body: 'You gain the **Ability Score Improvement** feat or another feat you qualify for.',
      choice: 'asi',
    },
    {
      level: 14,
      name: 'Advanced Artifice',
      body:
        '· **Magic Item Savant.** You can **attune to up to five magic items** at once.\n· **Refreshed Genius.** When you finish a **Short Rest**, you regain **one** expended use of Flash of Genius.\n\n*(This replaces 2014\'s Magic Item Savant, which let you ignore class, race, spell and level requirements for attunement. The 2024 feature does not.)*',
    },
    {
      level: 16,
      name: 'Ability Score Improvement',
      body: 'You gain the **Ability Score Improvement** feat or another feat you qualify for.',
      choice: 'asi',
    },
    {
      level: 18,
      name: 'Magic Item Master',
      body: 'You can **attune to up to six magic items** at once.',
    },
    {
      level: 19,
      name: 'Epic Boon',
      body: 'You gain an **Epic Boon feat** or another feat you qualify for. **Boon of Energy Resistance** is the recommended pick.\n\n*(2014 gave a fifth ASI here; every 2024 class gives a boon instead.)*',
      choice: 'epic-boon',
    },
    {
      level: 20,
      name: 'Soul of Artifice',
      body:
        '· **Cheat Death.** If you are reduced to **0 Hit Points but not killed outright**, you can disintegrate any number of **Uncommon or Rare** items you made with Replicate Magic Item. Your Hit Points instead become **20 × the number disintegrated**.\n· **Magical Guidance.** When you finish a **Short Rest**, you regain **all** expended uses of Flash of Genius, provided you are attuned to at least one magic item.\n\n*(2014 gave a flat +1 to all saves per attuned item and a Reaction to drop to 1 HP; the 2024 version scales with what you sacrifice.)*',
      description: 'Sacrifice replicated items to survive at 20 HP each, and refill Flash of Genius on a Short Rest.',
    },
  ],
};

export const ARTIFICER_SUBCLASSES_2024: SubclassDefinition[] = [
  {
    key: 'alchemist',
    name: 'Alchemist',
    classKey: 'artificer',
    system: 'dnd5e-2024',
    description: 'Combines reagents into elixirs that give life and leech it away — a Long Rest\'s worth of randomised potions, and spells that heal or corrode.',
    alwaysPrepared: {
      3: ['Healing Word', 'Ray of Sickness'],
      5: ['Flaming Sphere', 'Melf\'s Acid Arrow'],
      9: ['Gaseous Form', 'Mass Healing Word'],
      13: ['Death Ward', 'Vitriolic Sphere'],
      17: ['Cloudkill', 'Raise Dead'],
    },
    features: [
      {
        level: 3,
        name: 'Tools of the Trade',
        body: '· **Tool Proficiency.** **Alchemist\'s Supplies** and the **Herbalism Kit** (if you already have one, take another Artisan\'s Tools instead — two others if you have both).\n· **Potion Crafting.** Brewing a potion takes **half** the normal time.',
      },
      {
        level: 3,
        name: 'Experimental Elixir',
        body:
          'When you finish a **Long Rest** holding Alchemist\'s Supplies, produce **two elixirs**, rolling **1d6** on the Experimental Elixir table for each. A creature can **drink one as a Bonus Action** or administer it to a creature within 5 feet. Unused elixirs vanish at your next Long Rest.\n\n**As a Magic action** you can expend a **spell slot** to make another and **choose** its effect instead of rolling.\n\nYou make more at higher levels: **three at level 5, four at 9, five at 15**.\n\n**1 · Healing** — 2d8 + your Intelligence modifier HP (3d8 at level 9, 4d8 at 15).\n**2 · Swiftness** — Speed +10 ft for 1 hour (+15 at 9, +20 at 15).\n**3 · Resilience** — +1 AC for 10 minutes (1 hour at 9, 8 hours at 15).\n**4 · Boldness** — add 1d4 to every attack roll and saving throw for 1 minute (10 minutes at 9, 1 hour at 15).\n**5 · Flight** — Fly Speed 10 ft for 10 minutes (20 ft at 9, 30 ft at 15).\n**6 · Choose** any other row.',
        description: 'Two randomised elixirs per Long Rest (up to five), or spend a slot to choose one.',
      },
      {
        level: 5,
        name: 'Alchemical Savant',
        body: 'When you cast a spell using **Alchemist\'s Supplies** as your focus, add your **Intelligence modifier** (minimum +1) to one roll of that spell that **restores Hit Points** or deals **Acid, Fire or Poison** damage.',
      },
      {
        level: 9,
        name: 'Restorative Reagents',
        body: 'You can cast **Lesser Restoration** without a spell slot and without preparing it, using Alchemist\'s Supplies as the focus, a number of times equal to your **Intelligence modifier** (minimum once) per **Long Rest**.',
      },
      {
        level: 15,
        name: 'Chemical Mastery',
        body:
          '· **Alchemical Eruption.** When an Artificer spell of yours deals **Acid, Fire or Poison** damage to a target, also deal **2d8 Force** damage to it — once per turn.\n· **Chemical Resistance.** **Resistance** to Acid and Poison damage, and **Immunity** to the Poisoned condition.\n· **Conjured Cauldron.** Cast **Tasha\'s Bubbling Cauldron** with no slot, no preparation and no Material components (Alchemist\'s Supplies as focus), once per **Long Rest**.',
      },
    ],
  },
  {
    key: 'armorer',
    name: 'Armorer',
    classKey: 'artificer',
    system: 'dnd5e-2024',
    description: 'Wears its magic. Arcane Armor in one of three models — the new Dreadnaught juggernaut, the Guardian front-liner, or the Infiltrator skirmisher — each with a weapon that runs on Intelligence.',
    alwaysPrepared: {
      3: ['Magic Missile', 'Thunderwave'],
      5: ['Mirror Image', 'Shatter'],
      9: ['Hypnotic Pattern', 'Lightning Bolt'],
      13: ['Fire Shield', 'Greater Invisibility'],
      17: ['Passwall', 'Wall of Force'],
    },
    features: [
      {
        level: 3,
        name: 'Tools of the Trade',
        body: '· **Armor Training.** You gain training with **Heavy armor**.\n· **Tool Proficiency.** **Smith\'s Tools** (or another Artisan\'s Tools if you already have them).\n· **Armor Crafting.** Crafting armor, magic or not, takes **half** the normal time.',
      },
      {
        level: 3,
        name: 'Arcane Armor',
        body:
          'As a **Magic action** with Smith\'s Tools in hand, turn a suit of armor you are wearing into **Arcane Armor**. It stays that way until you don another suit or die. While wearing it:\n\n· **No Strength Requirement** — the armor\'s Strength minimum does not apply to you.\n· **Quick Don and Doff** — don or doff it as a **Utilize action**, and it **cannot be removed against your will**.\n· **Spellcasting Focus** — the armor itself is your focus.',
      },
      {
        level: 3,
        name: 'Armor Model',
        body:
          'Choose **Dreadnaught**, **Guardian** or **Infiltrator**. Each includes a special weapon, and you may add your **Intelligence modifier** instead of Strength or Dexterity to its attack and damage rolls. You can change model on a **Short or Long Rest** with Smith\'s Tools in hand.\n\n**Dreadnaught** — *a towering juggernaut.*\n· **Force Demolisher.** A wrecking ball or sledgehammer: a **Simple Melee weapon with Reach**, **1d10 Force**. On a hit against a creature at least one size smaller, push or pull it up to **10 feet**.\n· **Giant Stature.** *Bonus Action*, 1 minute: reach **+5 ft** and you become **Large** if smaller. Intelligence-modifier uses per Long Rest.\n\n**Guardian** — *the front line.*\n· **Thunder Pulse.** A **Simple Melee weapon**, **1d8 Thunder**. A creature hit has **Disadvantage on attack rolls against anyone but you** until the start of your next turn.\n· **Defensive Field.** While **Bloodied**, *Bonus Action* for **Temporary HP equal to your Artificer level**; lost if you doff the armor.\n\n**Infiltrator** — *subtler work.*\n· **Lightning Launcher.** A **Simple Ranged weapon** (90/300 ft), **1d6 Lightning**, plus an extra **1d6** once per turn on a hit.\n· **Powered Steps.** Speed **+5 ft**.\n· **Dampening Field.** **Advantage on Dexterity (Stealth)** checks.',
        description: 'Dreadnaught, Guardian or Infiltrator — an INT-powered weapon and a model-specific perk.',
      },
      {
        level: 5,
        name: 'Extra Attack',
        body: 'You can attack **twice** instead of once whenever you take the Attack action on your turn.',
      },
      {
        level: 9,
        name: 'Improved Armorer',
        body:
          '· **Armor Replication.** You learn **one additional plan** for Replicate Magic Item, which must be in the **Armor** category (and must be replaced by another Armor plan), and you can create **one additional item** — also Armor.\n· **Improved Arsenal.** **+1** to attack and damage rolls with your Arcane Armor\'s special weapon.',
      },
      {
        level: 15,
        name: 'Perfected Armor',
        body:
          '**Dreadnaught.** Force Demolisher becomes **2d6 Force**. Giant Stature now gives **+10 ft** reach, lets you become **Large or Huge**, and grants **Advantage on Strength checks and saves** for the duration.\n\n**Guardian.** Thunder Pulse becomes **1d10 Thunder**. When a Huge or smaller creature ends its turn within 30 feet, take a **Reaction** to force a **Strength save** against your spell save DC; on a failure, pull it up to **25 feet** toward you — and if it ends within 5 feet, make a melee weapon attack against it as part of the same Reaction. Intelligence-modifier uses per Long Rest.\n\n**Infiltrator.** Lightning Launcher becomes **2d6 Lightning**, and anything it damages **glimmers** until the start of your next turn: it sheds Dim Light in a 5-foot radius and has **Disadvantage on attack rolls against you**. Also, as a **Bonus Action**, gain a **Fly Speed equal to twice your Speed** until the end of the turn — Intelligence-modifier uses per Long Rest.',
      },
    ],
  },
  {
    key: 'artillerist',
    name: 'Artillerist',
    classKey: 'artificer',
    system: 'dnd5e-2024',
    description: 'Hurls energy from a distance. An Eldritch Cannon you deploy and command, and a carved firearm that adds a die to every spell you fire through it.',
    alwaysPrepared: {
      3: ['Shield', 'Thunderwave'],
      5: ['Scorching Ray', 'Shatter'],
      9: ['Fireball', 'Wind Wall'],
      13: ['Ice Storm', 'Wall of Fire'],
      17: ['Cone of Cold', 'Wall of Force'],
    },
    features: [
      {
        level: 3,
        name: 'Tools of the Trade',
        body: '· **Ranged Weaponry.** Proficiency with **Martial Ranged weapons**.\n· **Tool Proficiency.** **Woodcarver\'s Tools** (or another Artisan\'s Tools if you already have them).\n· **Wand Crafting.** Crafting a magic **Wand** takes **half** the normal time.',
      },
      {
        level: 3,
        name: 'Eldritch Cannon',
        body:
          'With **Smith\'s or Woodcarver\'s Tools**, take a **Magic action** to create a **Small or Tiny Eldritch Cannon** on a horizontal surface within 5 feet. It disappears at **0 HP**, after **1 hour**, or when you dismiss it as a Magic action. Once created, you cannot make another until a **Long Rest** — or you expend a **spell slot**. **One at a time.**\n\n**Eldritch Cannon** · Small or Tiny Object\n**AC** 18 · **HP** 5 × your Artificer level (**Mending** restores 2d6) · **Immunities** Poison, Psychic\n\n**Activate Cannon** (you must be within 60 feet): as a **Bonus Action**, order one option below; the cannon may move up to **15 feet** before or after.\n· **Flamethrower.** 15-foot **Cone**, Dexterity save vs your spell save DC, **2d8 Fire** (half on a success). Unattended flammable objects catch fire.\n· **Force Ballista.** Ranged spell attack from the cannon at one target within 120 feet: **2d8 Force**, and a creature is pushed **5 feet** away.\n· **Protector.** The cannon and each creature of your choice within 10 feet gain **1d8 + your Intelligence modifier** Temporary HP (minimum 1).',
        description: 'A deployable cannon: Flamethrower cone, Force Ballista attack, or Protector temp HP.',
      },
      {
        level: 5,
        name: 'Arcane Firearm',
        body: 'On a **Long Rest**, use Woodcarver\'s Tools to carve sigils into a **Rod, Staff, Wand or Martial Ranged weapon**, making it your **Arcane Firearm**. It serves as your Spellcasting Focus, and when you cast an Artificer spell through it, roll **1d8** and add it to one of the spell\'s damage rolls.',
      },
      {
        level: 9,
        name: 'Explosive Cannon',
        body:
          '· **Detonate.** When your cannon takes damage and you are within 60 feet, take a **Reaction** to destroy it: every creature within **20 feet** makes a Dexterity save against your spell save DC, taking **3d10 Force** (half on a success).\n· **Firepower.** The cannon\'s damage rolls and Protector\'s Temporary HP increase by **1d8**.',
      },
      {
        level: 15,
        name: 'Fortified Position',
        body:
          '· **Double Firepower.** You can have **two cannons** at once and create both with the same Magic action (a slot spent on the first does not pay for the second), and activate both with one **Bonus Action**, choosing options independently.\n· **Shimmering Field Projection.** You and your allies have **Half Cover** while within 10 feet of your cannon.',
      },
    ],
  },
  {
    key: 'battle-smith',
    name: 'Battle Smith',
    classKey: 'artificer',
    system: 'dnd5e-2024',
    description: 'Protector and medic, fighting beside a Steel Defender — and swinging magic weapons off Intelligence rather than Strength.',
    alwaysPrepared: {
      3: ['Heroism', 'Shield'],
      5: ['Shining Smite', 'Warding Bond'],
      9: ['Aura of Vitality', 'Conjure Barrage'],
      13: ['Aura of Purity', 'Fire Shield'],
      17: ['Banishing Smite', 'Mass Cure Wounds'],
    },
    features: [
      {
        level: 3,
        name: 'Tools of the Trade',
        body: '· **Tool Proficiency.** **Smith\'s Tools** (or another Artisan\'s Tools if you already have them).\n· **Weapon Crafting.** Crafting a weapon, magic or not, takes **half** the normal time.',
      },
      {
        level: 3,
        name: 'Battle Ready',
        body: '· **Arcane Empowerment.** When you attack with a **magic weapon**, you can use your **Intelligence modifier** instead of Strength or Dexterity for the attack and damage rolls.\n· **Weapon Knowledge.** Proficiency with **Martial weapons**, and any weapon you are proficient with can serve as your **Spellcasting Focus**.',
      },
      {
        level: 3,
        name: 'Steel Defender',
        body:
          'You build a **Steel Defender**. It is Friendly to you and your allies, obeys you, and vanishes if you die. In combat it acts on **your turn**: it moves and takes its Reaction on its own, but only takes the **Dodge** action unless you spend a **Bonus Action** to command another — unless you have the **Incapacitated** condition, in which case it acts freely.\n\nIf it died within the last hour, take a **Magic action** to touch it and expend a **spell slot**; it returns after 1 minute at full HP. On a **Long Rest** with Smith\'s Tools in hand you can build a new one (the old one vanishes).\n\n**Steel Defender** · Medium Construct\n**AC** 12 + your Intelligence modifier · **HP** 5 + five times your Artificer level (Hit Dice d8 equal to your level) · **Speed** 40 ft.\n**STR** 14 (+2) · **DEX** 12 (+1) · **CON** 14 (+2) · **INT** 4 (−3) · **WIS** 10 (+0) · **CHA** 6 (−2)\n**Immunities** Poison; Charmed, Exhaustion, Poisoned · **Senses** Darkvision 60 ft., Passive Perception 10 · **Languages** understands yours · **PB** equals yours\n\n**Steel Bond.** Add your **Proficiency Bonus** to any ability check or saving throw it makes.\n**Force-Empowered Rend.** *Melee Attack Roll:* your spell attack bonus, reach 5 ft. *Hit:* **1d8 + 2 + your Intelligence modifier** Force damage.\n**Repair (3/Day).** It, or a Construct or object within 5 feet, regains **2d8 + your Intelligence modifier** HP.\n**Deflect Attack** *(Reaction).* When a creature it can see within 5 feet attacks someone else, that attack is made with **Disadvantage**.',
        description: 'A construct companion that acts on your turn and deflects attacks aimed at your allies.',
      },
      {
        level: 5,
        name: 'Extra Attack',
        body: 'You can attack **twice** instead of once whenever you take the Attack action. You can **forgo one attack** to command your Steel Defender to take the **Force-Empowered Rend** action.',
      },
      {
        level: 9,
        name: 'Arcane Jolt',
        body:
          'When you hit with a **magic weapon** or your **Steel Defender** hits, channel energy into the strike:\n\n· **Destructive Energy.** An extra **2d6 Force** damage.\n· **Restorative Energy.** One creature or object you can see within 30 feet of the target regains **2d6** HP.\n\nUses equal your **Intelligence modifier** (minimum once), no more than **once per turn**, regained on a Long Rest.',
      },
      {
        level: 15,
        name: 'Improved Defender',
        body: '· **Improved Jolt.** Arcane Jolt\'s damage and healing both rise to **4d6**.\n· **Improved Deflection.** When your Steel Defender uses **Deflect Attack**, the attacker takes **1d4 + your Intelligence modifier** Force damage.',
      },
    ],
  },
  {
    key: 'cartographer',
    name: 'Cartographer',
    classKey: 'artificer',
    system: 'dnd5e-2024',
    description: 'New in 2024. Navigator and scout — living maps that let a party see and target each other through walls, short teleports, and an escape hatch at level 15.',
    alwaysPrepared: {
      3: ['Faerie Fire', 'Guiding Bolt', 'Healing Word'],
      5: ['Locate Object', 'Mind Spike'],
      9: ['Call Lightning', 'Clairvoyance'],
      13: ['Banishment', 'Locate Creature'],
      17: ['Scrying', 'Teleportation Circle'],
    },
    features: [
      {
        level: 3,
        name: 'Tools of the Trade',
        body: '· **Tool Proficiency.** **Calligrapher\'s Supplies** and **Cartographer\'s Tools** (if you already have one, take another Artisan\'s Tools — two others if you have both).\n· **Scroll Crafting.** Scribing a **Spell Scroll** takes **half** the normal time.',
      },
      {
        level: 3,
        name: 'Adventurer\'s Atlas',
        body:
          'On a **Long Rest** while holding Cartographer\'s Tools, touch at least two creatures (you may be one) up to **1 + your Intelligence modifier** (minimum two) and give each a **magical map**. The maps update constantly, are **illegible to anyone else**, and last until you die or use this feature again.\n\nWhile carrying a map, a creature gains:\n· **Awareness.** Add **1d4** to Initiative rolls.\n· **Positioning.** It knows where every other map holder on its plane is — and when casting a spell or creating an effect that requires seeing the target, it can **target another map holder regardless of sight or cover**, so long as they are in range.',
        description: 'Living maps for the party: +1d4 initiative, and line-of-sight-free targeting between holders.',
      },
      {
        level: 3,
        name: 'Mapping Magic',
        body:
          '· **Illuminated Cartography.** Cast **Faerie Fire** without a spell slot, outlining the affected creatures as if in ink — **Intelligence modifier** uses (minimum once) per Long Rest.\n· **Portal Jump.** On your turn, spend **half your Speed** (round down) to teleport to an unoccupied space you can see within **10 feet of yourself**, or within **5 feet of a map holder** who is within 30 feet of you. Unusable at Speed 0.',
      },
      {
        level: 5,
        name: 'Guided Precision',
        body: 'Once per turn, when you cast a spell from your **Cartographer Spells** list, or hit a creature affected by your **Faerie Fire** with an attack roll, add your **Intelligence modifier** to one damage roll of that spell or attack.\n\nIn addition, **taking damage cannot break your Concentration on Faerie Fire**.',
      },
      {
        level: 9,
        name: 'Ingenious Movement',
        body: 'When you use **Flash of Genius**, you — or a willing creature you can see within 30 feet — can **teleport up to 30 feet** to a space you can see, as part of the same Reaction.',
      },
      {
        level: 15,
        name: 'Superior Atlas',
        body:
          '· **Safe Haven.** When a map holder would drop to **0 Hit Points but is not killed outright**, it can destroy its map: its Hit Points instead become **twice your Artificer level**, and it teleports within 5 feet of you or another map holder of its choice.\n· **Unerring Path.** If you hold one of the maps, cast **Find the Path** with no slot, no preparation and no components, once per **Long Rest**.',
      },
    ],
  },
  {
    key: 'reanimator',
    name: 'Reanimator',
    classKey: 'artificer',
    system: 'dnd5e-2024',
    description: 'From Ravenloft: The Horrors Within — necromancy as engineering. A stitched-together companion you modify each time you build it, and a Spare the Dying that jolts hard enough to hurt bystanders.',
    alwaysPrepared: {
      3: ['False Life', 'Spare the Dying', 'Witch Bolt'],
      5: ['Blindness/Deafness', 'Enhance Ability'],
      9: ['Animate Dead', 'Lightning Bolt'],
      13: ['Blight', 'Death Ward'],
      17: ['Antilife Shell', 'Raise Dead'],
    },
    features: [
      {
        level: 3,
        name: 'Reanimator\'s Skill Set',
        body:
          '· **Jolt to Life.** When you cast **Spare the Dying**, you can modify it to jolt the target: it regains Hit Points equal to your **Artificer level**, and each creature of your choice in a **10-foot Emanation** from it makes a Dexterity save against your spell save DC, taking **2d4 Lightning** (half on a success). **Intelligence modifier** uses per Long Rest; the damage rises to **3d4 at level 11** and **4d4 at level 17**.\n· **Reanimator\'s Tools.** Proficiency with **Alchemist\'s Supplies** (or another Artisan\'s Tools if you already have them).',
      },
      {
        level: 3,
        name: 'Reanimated Companion',
        body:
          'With **Tinker\'s Tools** or other Artisan\'s Tools you are proficient with, take a **Magic action** to create a **Reanimated Companion** within 5 feet. It lasts until you finish a **Long Rest** or dismiss it as a Magic action; if **you** die it drops to 0 HP and dies, triggering its Death Burst. Once created you cannot make another until a Long Rest — or you expend a **spell slot**. **One at a time.**\n\nIn combat it acts on **your turn**, moving and reacting on its own but taking only the **Dodge** action unless you spend a **Bonus Action** to command another — unless you are **Incapacitated**, in which case it acts freely.\n\n**Reanimated Companion** · Medium Undead, Neutral\n**AC** 10 + your Intelligence modifier · **HP** 5 + five times your Artificer level (Hit Dice d8 equal to your level) · **Speed** 30 ft.\n**STR** 11 (+0) · **DEX** 10 (+0) · **CON** 16 (+3) · **INT** 4 (−3) · **WIS** 10 (+0) · **CHA** 6 (−2)\n**Resistances** Necrotic, Poison · **Immunities** Lightning; Charmed, Exhaustion, Poisoned · **Senses** Blindsight 60 ft., Passive Perception 10 · **PB** equals yours\n\n**Death Burst.** When it dies, each creature in a 10-foot Emanation makes a Dexterity save vs your spell save DC, taking **2d4 Necrotic** (half on a success).\n**Lightning Absorption.** Lightning damage **heals** it for the amount dealt.\n**Dreadful Swipe.** *Melee Attack Roll:* your spell attack bonus, reach 5 ft. *Hit:* **1d4 + your Intelligence modifier** Necrotic damage, and the target **cannot take Opportunity Attacks** until the start of its next turn.',
        description: 'An undead companion built fresh each Long Rest, with a Death Burst and Lightning healing.',
      },
      {
        level: 5,
        name: 'Strange Modifications',
        body:
          'Whenever you create a Reanimated Companion, it gains **one** of these, chosen at creation:\n\n· **Arcane Conduit.** You can cast spells as though you were in the companion\'s space (using your own senses). Once per turn, when you cast an Artificer **Evocation or Necromancy** spell that deals damage while it is within 120 feet, add your **Intelligence modifier** to one damage roll.\n· **Ferocity.** Dreadful Swipe\'s die increases to **1d6**.',
      },
      {
        level: 9,
        name: 'Improved Reanimation',
        body: 'Your companion\'s **Death Burst rises to 4d4**, and the **Necrotic damage it deals ignores Resistance**.',
      },
      {
        level: 9,
        name: 'Macabre Modifications',
        body:
          'Your companion now gains **two** Strange Modifications instead of one, and these options are added to the list:\n\n· **Bloated.** It becomes **Large**. When it hits a Large or smaller creature with Dreadful Swipe, that creature is pushed up to **10 feet** away. Add your **Intelligence modifier** to its Death Burst damage.\n· **Gaunt.** Speed rises to **45 feet** with a matching **Climb Speed** (including ceilings, no check). A creature of your choice that starts its turn within a 10-foot Emanation must succeed on a Wisdom save vs your spell save DC or be **Frightened** until the start of its next turn.\n· **Moist.** It gains a **Swim Speed** equal to its Speed and can squeeze through a **1-inch** gap without extra movement. When it is hit by an attack from within 10 feet, the attacker takes **Acid damage equal to your Intelligence modifier**.',
      },
      {
        level: 15,
        name: 'Refined Reanimation',
        body:
          '· **Facilitated Revival.** Cast **Raise Dead** without a spell slot and without Material components (Tinker\'s Tools or other proficient Artisan\'s Tools as focus), once per **Long Rest**.\n· **Life Transfer.** When you or your companion takes damage, take a **Reaction** to gain Hit Points equal to the **companion\'s current Hit Points**. It then drops to 0 and dies, triggering its Death Burst.\n· **Superior Modifications.** Your companion now gains **three** Strange Modifications.',
      },
    ],
  },
];
