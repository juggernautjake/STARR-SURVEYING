// lib/dnd/classes/dnd5e-2024/ranger.ts — the 2024 Player's Handbook Ranger.
//
// 2024 deltas from 2014, for anyone diffing this against an older sheet:
//   · Favored Enemy and Natural Explorer are GONE. "Favored Enemy" is now just free castings of
//     Hunter's Mark, and the whole class is rebuilt around keeping that spell up.
//   · Spellcasting starts at level 1 (slots still begin at 2); the subclass still lands at 3.
//   · Deft Explorer / Roving / Tireless replace the old terrain features; Expertise is baseline.
//   · Level 19 is an Epic Boon, not an ASI.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { HALF_CASTER_SLOTS } from '../slots';

export const RANGER_2024: ClassDefinition = {
  key: 'ranger',
  name: 'Ranger',
  system: 'dnd5e-2024',
  hitDie: 10,
  primaryAbility: ['dex', 'wis'],
  savingThrows: ['str', 'dex'],
  skillChoices: {
    count: 3,
    from: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'],
  },
  armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
  weaponProficiencies: ['Simple weapons', 'Martial weapons'],
  asiLevels: [4, 8, 12, 16],
  subclassLevel: 3,
  subclassLabel: 'Ranger Subclass',
  description:
    'A martial hunter with nature magic bolted on. The 2024 rebuild drops the old favored-terrain paperwork entirely and hangs the class off one spell — Hunter\'s Mark — which it casts free, holds through damage, and eventually upgrades to a d10.',
  startingEquipment: [
    'Studded Leather Armor, Scimitar, Shortsword, Longbow, 20 Arrows, Quiver, Druidic Focus (Sprig of Mistletoe), Explorer\'s Pack, and 7 GP',
    'or 150 GP',
  ],
  spellcasting: {
    kind: 'half',
    ability: 'wis',
    slots: HALF_CASTER_SLOTS,
    preparedRule:
      'Prepared spells are a fixed count from the Ranger table: 2/3/4/5/6/6/7/7/9/9/10/10/11/11/12/12/14/14/15/15 at levels 1–20. You have Spellcasting from level 1 but no slots until level 2. Choose from the whole Ranger list, up to the highest rank you have slots for; you may swap ONE prepared spell after each Long Rest. Hunter\'s Mark (from Favored Enemy) and any subclass spells are always prepared and do not count against this number.',
  },
  resources: [
    {
      id: 'favored-enemy',
      name: 'Favored Enemy (free Hunter\'s Mark casts)',
      perLevel: [0, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6],
      resetOn: 'long',
      note: 'Castings of Hunter\'s Mark that cost no spell slot. Increases at Ranger levels 5, 9, 13 and 17.',
    },
  ],
  features: [
    {
      level: 1,
      name: 'Spellcasting',
      body:
        'You channel the magic of nature, and in the 2024 rules you do it from **level 1** rather than level 2.\n\n· **Prepared spells.** A fixed count from the table: 2 at level 1, up to 15 at level 20, chosen from the whole Ranger list up to the highest rank you have slots for. After a Long Rest you may swap **one** prepared spell — you do not rebuild the list.\n· **Slots.** The half-caster table, which does not start until **level 2** and caps at **rank 5**. At level 1 the feature exists only to carry Hunter\'s Mark.\n\n**Wisdom** is your spellcasting ability: save DC 8 + proficiency bonus + Wisdom modifier, spell attack bonus proficiency bonus + Wisdom modifier. A **Druidic Focus** is your spellcasting focus.',
      description: 'Wisdom half-casting from level 1, though slots do not begin until level 2.',
    },
    {
      level: 1,
      name: 'Favored Enemy',
      body:
        'This shares a name with the 2014 feature and shares nothing else — there is **no creature type to pick**, and **Natural Explorer is gone** too.\n\nYou **always have Hunter\'s Mark prepared** (it does not count against your prepared total), and you can cast it **without expending a spell slot** **2 times** per Long Rest. That rises to **3 at Ranger level 5**, **4 at 9**, **5 at 13**, and **6 at 17**.\n\n**Hunter\'s Mark** is a rank-1 Bonus Action Concentration spell: mark a creature you can see within 90 feet and your attacks against it deal an extra **1d6** damage, once per turn, for up to 1 hour (concentration).\n\nAlmost everything the class gains later keys off this: Relentless Hunter at 13 stops damage breaking the Concentration, Precise Hunter at 17 gives Advantage against the marked target, and Foe Slayer at 20 turns the d6 into a d10.',
      description: 'Hunter\'s Mark is always prepared, with 2 free castings per Long Rest (rising to 6 by level 17).',
    },
    {
      level: 1,
      name: 'Weapon Mastery',
      body:
        'Your training lets you use the **mastery property** of **two kinds of weapons** you are proficient with — Longbows (**Slow**) and Shortswords (**Vex**) are the conventional pair.\n\nWhenever you finish a **Long Rest**, you can change one or both choices.\n\n**Vex** is unusually good here: a hit gives Advantage on your next attack against that target, which chains neatly into keeping a Hunter\'s Mark target pinned down.',
      description: 'Use the mastery properties of two weapon kinds you are proficient with, re-chosen each Long Rest.',
    },
    {
      level: 2,
      name: 'Deft Explorer',
      body:
        'You are unusually accomplished at the things a life outdoors teaches.\n\n· **Expertise.** Choose one of your skill proficiencies in which you lack Expertise. You gain **Expertise** in it — your proficiency bonus is doubled for that skill.\n· **Languages.** You learn **two languages** of your choice.\n\nThis is the 2024 replacement for Natural Explorer, and it is deliberately terrain-agnostic: rather than being good in a chosen biome, you are simply good at Survival or Perception everywhere. A second Expertise choice arrives at level 9.',
      description: 'Gain Expertise in one skill you are proficient in, plus two languages.',
      choice: 'expertise',
    },
    {
      level: 2,
      name: 'Fighting Style',
      body:
        'You gain a **Fighting Style feat** of your choice — Archery, Two-Weapon Fighting, Defense and the rest.\n\nInstead of a Fighting Style feat you may take the Ranger-only option:\n· **Druidic Warrior.** You learn **two Druid cantrips**. They count as Ranger spells for you and use **Wisdom**. You can swap one for another Druid cantrip whenever you gain a Ranger level.\n\nArchery (+2 to ranged weapon attack rolls) is the default for a bow Ranger; Druidic Warrior is the pick if you want Guidance and Starry Wisp riding on the Wisdom you already need.',
      description: 'Take a Fighting Style feat, or Druidic Warrior for two Wisdom-powered Druid cantrips.',
      choice: 'fighting-style',
    },
    {
      level: 3,
      name: 'Ranger Subclass',
      body:
        'You choose a **Ranger subclass**: **Beast Master**, **Fey Wanderer**, **Gloom Stalker**, or **Hunter**.\n\nIt grants features now and again at levels **7, 11 and 15**. Two of them — **Fey Wanderer** and **Gloom Stalker** — also grant **always-prepared subclass spells** at Ranger levels **3, 5, 9, 13 and 17**, which never count against your prepared total. **Hunter** and **Beast Master** have no spell list; their level-3 features are their payload instead.\n\nNote that unlike the 2024 Cleric and Druid, the Ranger already chose its subclass at level 3 under the 2014 rules — nothing moved here.',
      description: 'Choose Beast Master, Fey Wanderer, Gloom Stalker, or Hunter.',
      choice: 'subclass',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — raise one ability score by 2, or two scores by 1 each, to a maximum of 20 — or instead take any other feat you qualify for.\n\nThis recurs at Ranger levels **8, 12 and 16**. Level 19 is *not* an ASI in the 2024 rules; it is an Epic Boon.', description: 'Take the ASI feat (+2/+1+1) or another feat you qualify for.', choice: 'asi' },
    {
      level: 5,
      name: 'Extra Attack',
      body:
        'Whenever you take the **Attack action** on your turn, you can **attack twice** instead of once.\n\nThis matters more for a Ranger than the raw numbers suggest, because **Hunter\'s Mark** only adds its die **once per turn** — the second attack is what converts a marked target into reliable damage rather than a coin flip on whether your one swing landed.\n\nYour free Hunter\'s Mark castings also go from 2 to **3** at this level.',
      description: 'Attack twice whenever you take the Attack action.',
    },
    {
      level: 6,
      name: 'Roving',
      body:
        'Your **Speed increases by 10 feet** while you are **not wearing Heavy armor** — which, since Rangers never gain Heavy armor training, is always.\n\nYou also gain a **Climb Speed** and a **Swim Speed** **equal to your Speed**.\n\nThe climb and swim speeds are the underrated half: they mean vertical terrain and water cost you nothing, which is exactly the kind of movement a Ranger is expected to be doing while everyone else rolls Athletics.',
      description: '+10 feet of Speed out of Heavy armor, plus a Climb Speed and Swim Speed equal to your Speed.',
    },
    { level: 8, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — +2 to one score or +1 to two, to a cap of 20 — or another feat you qualify for.', description: 'Take the ASI feat or another feat you qualify for.', choice: 'asi' },
    {
      level: 9,
      name: 'Expertise',
      body:
        'Choose **two** of your skill proficiencies in which you lack Expertise. You gain **Expertise** in both — your proficiency bonus is doubled for them.\n\nCombined with the single Expertise from Deft Explorer at level 2, a level-9 Ranger has **three** Expertise skills, matching a Rogue\'s count at the same level.\n\nYour free Hunter\'s Mark castings also rise to **4** at this level.',
      description: 'Gain Expertise in two more of your skill proficiencies.',
      choice: 'expertise',
    },
    {
      level: 10,
      name: 'Tireless',
      body:
        'Two benefits, both about staying on your feet.\n\n· **Temporary Hit Points.** As a **Magic action**, give yourself Temporary Hit Points equal to **1d8 + your Wisdom modifier** (minimum 1). You can do this a number of times equal to your **Wisdom modifier** (minimum once), regaining all uses on a **Long Rest**.\n· **Decrease Exhaustion.** Whenever you finish a **Short Rest**, your **Exhaustion level decreases by 1**.\n\nBecause the Temporary HP costs a Magic action rather than a Bonus Action, it is an out-of-combat button in practice — top yourself up between fights rather than mid-round.',
      description: 'Magic action for 1d8 + Wisdom Temporary HP, Wisdom-modifier times per Long Rest; Short Rests cut Exhaustion by 1.',
    },
    { level: 12, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — +2 to one score or +1 to two, to a cap of 20 — or another feat you qualify for.', description: 'Take the ASI feat or another feat you qualify for.', choice: 'asi' },
    {
      level: 13,
      name: 'Relentless Hunter',
      body:
        '**Taking damage can\'t break your Concentration on Hunter\'s Mark.**\n\nThat is the whole feature, and it fixes the single biggest problem the 2014 Ranger had: a front-line character trying to hold Concentration on the spell their entire damage output depends on.\n\nYou can still lose the mark to an effect that ends Concentration outright, to the Incapacitated condition, or by casting another Concentration spell — but no amount of incoming damage will do it.\n\nYour free Hunter\'s Mark castings also rise to **5** at this level.',
      description: 'Damage can never break your Concentration on Hunter\'s Mark.',
    },
    {
      level: 14,
      name: 'Nature\'s Veil',
      body:
        'You draw shadow and magic around yourself.\n\nAs a **Bonus Action**, you give yourself the **Invisible** condition until the **end of your next turn**.\n\nYou can do this a number of times equal to your **Wisdom modifier** (minimum once), regaining all uses on a **Long Rest**.\n\nA Bonus Action is cheap for a Ranger who is not casting that round, and Invisible grants Advantage on your attacks while imposing Disadvantage on attacks against you — so this is roughly a free round of Advantage on demand, several times a day.',
      description: 'Bonus Action: turn Invisible until the end of your next turn, Wisdom-modifier times per Long Rest.',
    },
    { level: 16, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — +2 to one score or +1 to two, to a cap of 20 — or another feat you qualify for. This is your last ASI; level 19 grants an Epic Boon instead.', description: 'Take the ASI feat or another feat you qualify for.', choice: 'asi' },
    {
      level: 17,
      name: 'Precise Hunter',
      body:
        'You have **Advantage on attack rolls against the creature currently marked by your Hunter\'s Mark**.\n\nThere is no use limit and no cost — as long as the mark is up, every swing at that target is at Advantage.\n\nStacked on top of **Relentless Hunter** (damage cannot break the Concentration) and **6 free castings** per day, this is the point where the mark stops being an optional buff and becomes simply how the Ranger attacks.',
      description: 'Advantage on all attack rolls against your Hunter\'s Mark target.',
    },
    {
      level: 18,
      name: 'Feral Senses',
      body:
        'Your bond with nature grants you **Blindsight with a range of 30 feet**.\n\nWithin that radius you can see anything that is not behind Total Cover, **even if you have the Blinded condition** and even if the target is **Invisible** — and you perceive it without needing to see at all.\n\nIn practice this shuts down the entire category of invisible ambushers and magical darkness inside 30 feet, and it makes you the party member who can still fight in a Darkness spell.',
      description: 'You gain Blindsight out to 30 feet.',
    },
    {
      level: 19,
      name: 'Epic Boon',
      body:
        'You gain an **Epic Boon feat** of your choice, or any other feat you qualify for. This replaces what used to be a fifth ASI.\n\nEpic Boons are the 2024 capstone feats — **Boon of Dimensional Travel**, **Boon of Combat Prowess**, **Boon of Fate** and the rest. Most also raise one ability score by 1, to a maximum of **30** rather than 20.\n\n*Boon of Dimensional Travel* is the usual pick: a free Misty Step after every Attack action keeps you at whatever range your build wants to fight from.',
      description: 'Take an Epic Boon feat (or any feat you qualify for) — not an ASI.',
      choice: 'epic-boon',
    },
    {
      level: 20,
      name: 'Foe Slayer',
      body:
        'The extra damage die of your **Hunter\'s Mark** is a **d10** rather than a d6.\n\nAveraged out that is +3 damage per marked hit, and with Extra Attack and Precise Hunter you are landing it essentially every turn.\n\nIt is a deliberately small capstone, because by level 20 the mark is already free (6 castings a day), unbreakable by damage (Relentless Hunter), and always at Advantage (Precise Hunter) — this just tops off the machine the last nineteen levels built.',
      description: 'Hunter\'s Mark deals a d10 of extra damage instead of a d6.',
    },
  ],
};

export const RANGER_SUBCLASSES_2024: SubclassDefinition[] = [
  {
    key: 'beast-master',
    name: 'Beast Master',
    classKey: 'ranger',
    system: 'dnd5e-2024',
    description: 'A ranger with a summoned primal beast that acts on your turn. The 2024 companion has its own scaling stat block and never needs re-statting.',
    // NOTE: Beast Master has no always-prepared subclass spell list in the 2024 PHB.
    features: [
      {
        level: 3,
        name: 'Primal Companion',
        body:
          'You summon a **primal beast** — pick its stat block: **Beast of the Land**, **Beast of the Sea**, or **Beast of the Sky**. You decide what animal it looks like. It is Friendly to you and your allies, obeys your commands, and uses **your proficiency bonus**, so it scales with you rather than needing to be replaced.\n\n**In combat**, the beast acts **during your turn**. It moves and uses its Reaction on its own, but the only action it takes is **Dodge** unless you spend a **Bonus Action** to command it to take another action from its stat block. You may also **sacrifice one of your attacks** from the Attack action to command it to take the **Beast\'s Strike** action. While you are **Incapacitated**, it acts on its own and is not limited to Dodging.\n\n**If it dies**, you can take a **Magic action** to touch the body within **1 hour** and expend a **spell slot**; it returns to life after 1 minute at full Hit Points. On any **Long Rest** you can summon a different primal beast, replacing the current one.',
        description: 'Summon a Land, Sea, or Sky beast that acts on your turn and scales with your proficiency bonus.',
        choice: 'other',
      },
      {
        level: 7,
        name: 'Exceptional Training',
        body:
          'Your beast becomes far more useful with the same Bonus Action.\n\n· **Extra action.** When you take the **Bonus Action** to command the beast, you can **also** command it to take the **Dash, Disengage, Dodge, or Help** action as part of that same Bonus Action — so it can attack *and* Help, or attack *and* Disengage.\n· **Force damage.** Whenever the beast hits with an attack and deals damage, it can deal **Force** damage instead of the attack\'s normal type.\n\nThe Help rider is the standout: a companion that hands your marked target\'s attacker Advantage every round, for free.',
        description: 'One Bonus Action commands both an attack and a Dash/Disengage/Dodge/Help; the beast can deal Force damage.',
      },
      {
        level: 11,
        name: 'Bestial Fury',
        body:
          'When you command your beast to take the **Beast\'s Strike** action, it can use it **twice**.\n\nIn addition, if **Hunter\'s Mark** is active and it is your turn, the **beast deals the spell\'s extra damage** to the marked creature — no more than **once per turn**.\n\nSo one Bonus Action now buys two attacks plus a share of your mark, and Exceptional Training means it can still Help or Disengage on top of that.',
        description: 'The beast strikes twice per command and can deliver your Hunter\'s Mark damage once per turn.',
      },
      {
        level: 15,
        name: 'Share Spells',
        body:
          'When you cast a spell **targeting yourself**, you can also apply it to your **Primal Companion** if the beast is within **30 feet** of you.\n\nThis covers the self-only buffs that a Ranger already casts and could never share: **Longstrider**, **Barkskin**, **Pass without Trace** in the exploration pillar, and notably **Conjure Barrage** or **Swift Quiver** style personal enhancements.\n\nOne casting, two creatures, one Concentration — the beast becomes a second body carrying your buffs into a fight.',
        description: 'Self-targeting spells you cast also affect your companion if it is within 30 feet.',
      },
    ],
  },
  {
    key: 'fey-wanderer',
    name: 'Fey Wanderer',
    classKey: 'ranger',
    system: 'dnd5e-2024',
    description: 'A ranger touched by the Feywild. Psychic damage on every hit, Wisdom bolted onto every Charisma check, and the party face nobody expected.',
    alwaysPrepared: {
      3: ['Charm Person'],
      5: ['Misty Step'],
      9: ['Dispel Magic'],
      13: ['Dimension Door'],
      17: ['Mislead'],
    },
    features: [
      {
        level: 3,
        name: 'Dreadful Strikes',
        body:
          'When you hit a creature with a **weapon**, you can deal an extra **1d4 Psychic** damage. A given target can take this extra damage only **once per turn**.\n\nThe damage rises to **1d6** at Ranger level **11**.\n\nThere is no use limit and no resource — it simply happens. Note the wording is once per turn *per target*, so with Extra Attack you can spread it across two different creatures in the same turn, and it stacks with Hunter\'s Mark on the marked one.',
        description: 'Your weapon hits deal an extra 1d4 Psychic damage (1d6 at level 11), once per turn per target.',
      },
      {
        level: 3,
        name: 'Otherworldly Glamour',
        body:
          'The Feywild has left you unnervingly compelling.\n\nWhenever you make a **Charisma check**, you add your **Wisdom modifier** (minimum **+1**) to the check — on top of your usual Charisma modifier and any proficiency.\n\nYou also gain **proficiency** in one skill of your choice: **Deception**, **Performance**, or **Persuasion**.\n\nThis is the reason to play the subclass out of combat: a Ranger who dumped Charisma but maxed Wisdom is suddenly a credible party face, and it applies to *all* Charisma checks, not just the chosen skill.',
        description: 'Add your Wisdom modifier to every Charisma check, plus proficiency in Deception, Performance, or Persuasion.',
        choice: 'other',
      },
      {
        level: 7,
        name: 'Beguiling Twist',
        body:
          'You have **Advantage on saving throws** to avoid or end the **Charmed** or **Frightened** condition.\n\nMore usefully: whenever a creature you can see within **120 feet** **succeeds** on a saving throw to avoid or end the Charmed or Frightened condition, you can take a **Reaction** to force a **different** creature you can see within 120 feet to make a **Wisdom save** against your spell save DC. On a failure it has the **Charmed or Frightened** condition (your choice) for **1 minute**, ending early if it takes any damage.\n\nThe trigger fires off **anyone\'s** successful save — including an ally shrugging off an enemy\'s fear aura — so a resisted enchantment anywhere on the field becomes a free save-or-suck of your own.',
        description: 'Advantage against Charm/Fright, and a Reaction to redirect any resisted Charm or Fright onto another creature.',
      },
      {
        level: 11,
        name: 'Fey Reinforcements',
        body:
          'You always have **Summon Fey** prepared, and it does not count against your prepared total. You can cast it **once without a spell slot**, regaining that free casting on a **Long Rest**.\n\nWhen you **start casting** the spell, you can choose to make that casting **not require Concentration** — in exchange, the duration drops to **1 minute** for that casting.\n\nThat trade is the point: a Ranger already holding Concentration on Hunter\'s Mark could never otherwise afford a summon, and a minute is most of a fight.',
        description: 'Summon Fey always prepared, one free casting per Long Rest, optionally without Concentration for 1 minute.',
      },
      {
        level: 15,
        name: 'Misty Wanderer',
        body:
          'You can cast **Misty Step without expending a spell slot** a number of times equal to your **Wisdom modifier** (minimum once), regaining all uses on a **Long Rest**.\n\nIn addition, whenever you cast **Misty Step** — free or not — you can bring **one willing creature within 5 feet** of you along. It appears in an unoccupied space of your choice within 5 feet of where you land.\n\nThis is a rescue tool as much as a mobility one: pull the grappled or Restrained party member out of a mess as a Bonus Action, several times a day, for nothing.',
        description: 'Free Misty Step casts equal to your Wisdom modifier, and you can bring one willing creature with you.',
      },
    ],
  },
  {
    key: 'gloom-stalker',
    name: 'Gloom Stalker',
    classKey: 'ranger',
    system: 'dnd5e-2024',
    description: 'The ambusher. Wisdom on Initiative, an opening round nobody survives comfortably, and darkvision that makes you invisible in the dark.',
    alwaysPrepared: {
      3: ['Disguise Self'],
      5: ['Rope Trick'],
      9: ['Fear'],
      13: ['Greater Invisibility'],
      17: ['Seeming'],
    },
    features: [
      {
        level: 3,
        name: 'Dread Ambusher',
        body:
          'You have mastered the ambush, and you get three separate things for it.\n\n· **Initiative.** You add your **Wisdom modifier** to your **Initiative rolls** — the stat you were already maxing.\n· **Opening burst.** At the **start of your first turn of each combat**, your **Speed increases by 10 feet** until the end of that turn.\n· **Dreadful Strike.** When you hit a creature with a **weapon**, you can deal an extra **2d6 Psychic** damage. Usable **once per turn**, a number of times equal to your **Wisdom modifier** (minimum once), regaining all uses on a **Long Rest**.\n\nTogether these are why Gloom Stalkers open fights so hard: you go early, you get there, and your first hit carries 2d6 on top of Hunter\'s Mark.',
        description: 'Wisdom added to Initiative, +10 feet on your first turn, and a 2d6 Psychic strike Wisdom-modifier times per Long Rest.',
      },
      {
        level: 3,
        name: 'Umbral Sight',
        body:
          'You gain **Darkvision out to 60 feet**. If you already have Darkvision, its range **increases by 60 feet** instead.\n\nMore importantly, you are hard to see in the dark: while **entirely within Darkness**, you have the **Invisible** condition to any creature that is relying on **Darkvision** to see you in that Darkness.\n\nAgainst the very large share of monsters whose only night vision *is* Darkvision, this makes an unlit room a one-sided fight — you see them, they cannot see you, and you attack at Advantage.',
        description: 'Darkvision 60 feet (or +60), and you are Invisible in Darkness to creatures relying on Darkvision.',
      },
      {
        level: 7,
        name: 'Iron Mind',
        body:
          'You gain proficiency in **Wisdom saving throws**.\n\nIf you already have that proficiency — from a feat, a species trait, or a multiclass — you instead gain proficiency in **Intelligence or Charisma** saving throws, your choice.\n\nRangers are proficient in Strength and Dexterity saves, which leaves the three mental saves wide open. This closes the one that matters most, and it is the save that most often decides whether you keep control of your character.',
        description: 'Proficiency in Wisdom saving throws (or Intelligence/Charisma if you already have it).',
        choice: 'other',
      },
      {
        level: 11,
        name: 'Stalker\'s Flurry',
        body:
          'The Psychic damage of your **Dreadful Strike** rises from 2d6 to **2d8**.\n\nIn addition, **once per turn** when you use Dreadful Strike, you can cause one of these extra effects:\n· **Sudden Strike.** Make **one attack with the same weapon** against a **different creature within 5 feet** of the original target and within the weapon\'s range.\n· **Mass Fear.** The target **and each creature within 10 feet of it** makes a **Wisdom save** against your spell save DC or gains the **Frightened** condition until the **end of your next turn**.\n\nSudden Strike is effectively a third attack in a round you were already spending a Dreadful Strike on; Mass Fear turns the same resource into a small crowd-control spell.',
        description: 'Dreadful Strike becomes 2d8 and can trigger an extra attack (Sudden Strike) or an AoE fear (Mass Fear).',
        choice: 'other',
      },
      {
        level: 15,
        name: 'Shadowy Dodge',
        body:
          'Whenever a creature makes an **attack roll against you** and does **not have Advantage** on it, you can take a **Reaction** to impose **Disadvantage** on that roll.\n\nYou can use the Reaction **before or after** the roll is made, but it must be used before the attack\'s effects apply — so you can wait, see the number, and only spend it when it matters.\n\nIf the attack **misses**, you can then **teleport up to 30 feet** to an unoccupied space you can see. There is no use limit; the only cost is your Reaction.',
        description: 'Reaction: impose Disadvantage on an attack against you, and teleport 30 feet if it misses.',
      },
    ],
  },
  {
    key: 'hunter',
    name: 'Hunter',
    classKey: 'ranger',
    system: 'dnd5e-2024',
    description: 'The straightforward monster-killer. Every feature is a pair of options you can swap on a rest, so the subclass reshapes itself for whatever you are fighting.',
    // NOTE: Hunter has no always-prepared subclass spell list in the 2024 PHB.
    features: [
      {
        level: 3,
        name: 'Hunter\'s Lore',
        body:
          'While a creature is marked by your **Hunter\'s Mark**, you know whether it has any **Immunities, Resistances, or Vulnerabilities** — and if it does, you know exactly what they are.\n\nThis costs nothing and needs no action; marking the target is the whole price, and you were doing that anyway.\n\nIt is a quiet fix to one of the game\'s oldest frictions: the party no longer has to spend three rounds discovering that the thing is immune to Fire.',
        description: 'You learn a Hunter\'s Mark target\'s Immunities, Resistances, and Vulnerabilities.',
      },
      {
        level: 3,
        name: 'Hunter\'s Prey',
        body:
          'Choose one option. Whenever you finish a **Short or Long Rest**, you can swap it for the other.\n\n· **Colossus Slayer.** When you hit a creature with a **weapon**, it takes an extra **1d8** damage if it is **missing any Hit Points**. Once per turn.\n· **Horde Breaker.** **Once on each of your turns** when you make an attack with a **weapon**, you can make **another attack with the same weapon** against a **different creature within 5 feet** of the original target.\n\nColossus Slayer is the single-boss pick and stacks with Hunter\'s Mark on the same hit; Horde Breaker is a genuine extra attack whenever enemies are bunched. The swap-on-a-rest clause is what makes the subclass: you retune it to the encounter.',
        description: 'Choose Colossus Slayer (+1d8 vs wounded) or Horde Breaker (an extra attack on a nearby second target); swap on any rest.',
        choice: 'other',
      },
      {
        level: 7,
        name: 'Defensive Tactics',
        body:
          'Choose one option. Whenever you finish a **Short or Long Rest**, you can swap it for the other.\n\n· **Escape the Horde.** **Opportunity Attacks have Disadvantage against you** — you move through and out of a melee at will.\n· **Multiattack Defense.** When a creature **hits you with an attack roll**, that creature has **Disadvantage on all its other attack rolls against you this turn**.\n\nEscape the Horde is for crowds; Multiattack Defense is for the single big thing swinging three times a round, and it is close to a permanent −5 against that boss after the first hit lands.',
        description: 'Choose Escape the Horde (Disadvantage on Opportunity Attacks against you) or Multiattack Defense; swap on any rest.',
        choice: 'other',
      },
      {
        level: 11,
        name: 'Superior Hunter\'s Prey',
        body:
          '**Once per turn**, when you deal damage to a creature marked by your **Hunter\'s Mark**, you can deal that **spell\'s extra damage** to a **different creature you can see within 30 feet** of the first one.\n\nThe second creature does not need to be marked, does not need to be within your weapon\'s reach, and you do not roll to hit it — the damage simply happens.\n\nAt level 20, with Foe Slayer, that is a free d10 splashing onto a second target every single turn.',
        description: 'Once per turn, your Hunter\'s Mark damage also hits a second creature within 30 feet of the marked one.',
      },
      {
        level: 15,
        name: 'Superior Hunter\'s Defense',
        body:
          'When you **take damage**, you can take a **Reaction** to gain **Resistance to that damage** — and to any other damage of the **same type** — until the **end of the current turn**.\n\nThat means it applies to the triggering hit itself, halving it, and then keeps halving every further instance of that type for the rest of the turn.\n\nAgainst a dragon\'s breath, a multiattacking brute, or anything that deals one damage type repeatedly, one Reaction per round is halving a large share of what comes at you. There is no use limit.',
        description: 'Reaction: gain Resistance to a damage type you just took, until the end of the turn.',
      },
    ],
  },
];
