// lib/dnd/classes/dnd5e-2024/druid.ts — the 2024 Player's Handbook Druid.
//
// 2024 deltas from 2014, for anyone diffing this against an older sheet:
//   · The Druid Circle is chosen at level 3, not level 1.
//   · Wild Shape recharges on a SHORT rest and is a Bonus Action from the start.
//   · Primal Order (level 1) is new; Wild Companion is now baseline at level 2.
//   · Level 19 is an Epic Boon, not an ASI.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { FULL_CASTER_SLOTS } from '../slots';

export const DRUID_2024: ClassDefinition = {
  key: 'druid',
  name: 'Druid',
  system: 'dnd5e-2024',
  hitDie: 8,
  primaryAbility: ['wis'],
  savingThrows: ['int', 'wis'],
  skillChoices: {
    count: 2,
    from: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'],
  },
  armorProficiencies: ['Light armor', 'Shields'],
  weaponProficiencies: ['Simple weapons'],
  toolProficiencies: ['Herbalism Kit'],
  asiLevels: [4, 8, 12, 16],
  subclassLevel: 3,
  subclassLabel: 'Druid Circle',
  description:
    'A priest of the wild who borrows the shape of what they protect. Full spellcasting on Wisdom, plus a Wild Shape economy that recharges on a Short Rest and pays for half the circle\'s tricks.',
  startingEquipment: [
    'Leather Armor, Shield, Sickle, Druidic Focus (Quarterstaff), Explorer\'s Pack, Herbalism Kit, and 9 GP',
    'or 50 GP',
  ],
  spellcasting: {
    kind: 'full',
    ability: 'wis',
    slots: FULL_CASTER_SLOTS,
    cantripsKnown: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    preparedRule:
      'Prepared spells are a fixed count from the Druid table, NOT level + Wisdom modifier: 4/5/6/7/9/10/11/12/14/15/16/16/17/17/18/18/19/20/21/22 at levels 1–20. Choose them from the whole Druid list, up to the highest rank you have slots for, and rebuild the list after a Long Rest. Circle spells are always prepared and never count against this number.',
  },
  resources: [
    {
      id: 'wild-shape',
      name: 'Wild Shape',
      perLevel: [0, 0, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4],
      resetOn: 'short',
      note: '2024 change: uses return on a Short OR Long Rest. Your circle spends these on its own features too.',
    },
  ],
  features: [
    {
      level: 1,
      name: 'Spellcasting',
      body:
        'You draw magic from the primal forces of nature, preparing from the **entire Druid spell list** rather than learning a fixed set.\n\n· **Cantrips.** You know 2 Druid cantrips at level 1 (a 3rd at 4, a 4th at 10), swappable one at a time when you gain a Druid level.\n· **Prepared spells.** A fixed number from the table — 4 at level 1, up to 22 at level 20 — of any rank you have slots for. Rebuild the list freely after a Long Rest.\n· **Slots.** The full-caster table; all slots return on a Long Rest.\n\n**Wisdom** is your spellcasting ability: save DC 8 + proficiency bonus + Wisdom modifier, spell attack bonus proficiency bonus + Wisdom modifier. A **Druidic Focus** serves as your spellcasting focus.',
      description: 'You prepare from the entire Druid list using Wisdom, with a fixed prepared count per level.',
    },
    {
      level: 1,
      name: 'Druidic',
      body:
        'You know **Druidic**, the secret language of druids. You can speak it and use it to leave hidden messages — you and anyone else who knows Druidic spot such a message automatically, while others need a **DC 15 Wisdom (Perception)** check even to notice one is there, and magic to actually read it.\n\nYou also **always have Speak with Animals prepared**. It does not count against your prepared spell total, and you can cast it as a Ritual, which in practice means unlimited animal conversation for the cost of ten minutes.',
      description: 'You speak the secret language Druidic and always have Speak with Animals prepared for free.',
    },
    {
      level: 1,
      name: 'Primal Order',
      body:
        'You decide how your order relates to nature\'s power. Choose once — this is permanent.\n\n· **Magician.** You know one **extra Druid cantrip**, and you add your Wisdom modifier (minimum **+1**) to every Intelligence (Arcana) and Intelligence (Nature) check.\n· **Warden.** You gain training with **Martial weapons** and **Medium armor**.\n\nWarden is the reason a 2024 Druid can stand in a scimitar-and-shield line without a dip; Magician is the pick if your Druid is going to be the party\'s lore engine and cantrip platform.',
      description: 'Choose Magician (extra cantrip + Wisdom to Arcana/Nature) or Warden (Martial weapons + Medium armor).',
      choice: 'other',
    },
    {
      level: 2,
      name: 'Wild Shape',
      body:
        'As a **Bonus Action**, you shape-shift into a Beast form you know. You stay in it for **hours equal to half your Druid level**, or until you use Wild Shape again, become **Incapacitated**, or die; you can drop the form early as a **Bonus Action**.\n\n· **Uses.** **2** (3 at level 6, 4 at level 17). They come back on a **Short or Long Rest** — this is the big 2024 change, and it is why circles can afford to spend Wild Shape on non-shape-shifting features.\n· **Known forms.** 4 forms, **max CR 1/4, no Fly Speed**. At level 4: 6 forms, max **CR 1/2**. At level 8: 8 forms, max **CR 1**, and Fly Speeds are allowed. Swap one known form on each Long Rest.\n· **Temporary Hit Points.** You gain Temporary HP equal to your **Druid level** each time you transform.\n\n**In form:** you use the Beast\'s stat block but keep your own **Intelligence, Wisdom and Charisma**, your Hit Point maximum, your creature type, personality, memories, languages, class features and feats, and you apply your own proficiency bonus. You **cannot cast spells**, but ongoing Concentration is not broken. Your equipment merges, falls, or stays worn as you choose.',
      description: 'Bonus Action to become a Beast for hours equal to half your level; 2–4 uses that recharge on a Short Rest.',
    },
    {
      level: 2,
      name: 'Wild Companion',
      body:
        'As a **Magic action**, expend either a **spell slot** or a **use of Wild Shape** to cast **Find Familiar** without its Material components.\n\nThe familiar summoned this way is a **Fey** rather than its usual type, and it **vanishes when you finish a Long Rest**.\n\nBecause Wild Shape now recharges on a Short Rest, the Wild Shape option is usually the cheap one: a scout, a Help-bot, and a delivery system for touch spells, all for a resource you get back at the next campfire.',
      description: 'Spend a spell slot or a Wild Shape use to cast Find Familiar; the familiar is Fey and lasts until a Long Rest.',
    },
    {
      level: 3,
      name: 'Druid Subclass',
      body:
        'You join a **Druid Circle**: **Land**, **Moon**, **Sea**, or **Stars**.\n\nYour circle grants features now and again at levels **6, 10 and 14**, and most circles give a list of **always-prepared circle spells** that grows at Druid levels **3, 5, 7 and 9**. Those spells never count against your prepared total.\n\nNote for anyone porting a 2014 character: the circle used to be a level-1 choice. In the 2024 rules it lands at level 3, and levels 1–2 are identical for every Druid.',
      description: 'Choose the Circle of the Land, Moon, Sea, or Stars.',
      choice: 'subclass',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — raise one ability score by 2, or two scores by 1 each, to a maximum of 20 — or instead take any other feat you qualify for.\n\nThis recurs at Druid levels **8, 12 and 16**. Level 19 is *not* an ASI in the 2024 rules; it is an Epic Boon.', description: 'Take the ASI feat (+2/+1+1) or another feat you qualify for.', choice: 'asi' },
    {
      level: 5,
      name: 'Wild Resurgence',
      body:
        'You can trade between your two resource pools, in both directions.\n\n· **Slot → Wild Shape.** Once on each of your turns, if you have **no** uses of Wild Shape left, you can expend a **spell slot** (no action required) to give yourself one use back.\n· **Wild Shape → slot.** You can expend one use of **Wild Shape** (no action required) to give yourself a **rank-1 spell slot**. You cannot do this again until you finish a **Long Rest**.\n\nThe asymmetry is deliberate: slots convert into Wild Shape freely when you are empty, but Wild Shape only converts back into magic once a day.',
      description: 'Spend a spell slot to regain a Wild Shape use when empty; once per Long Rest, spend a Wild Shape use for a rank-1 slot.',
    },
    {
      level: 7,
      name: 'Elemental Fury',
      body:
        'Primal power starts riding on your attacks or your cantrips. Choose one option — you keep it, and it upgrades at level 15.\n\n· **Potent Spellcasting.** Add your **Wisdom modifier** to the damage of any **Druid cantrip** you cast.\n· **Primal Strike.** **Once per turn**, when you hit with a weapon **or with a Beast form\'s attack** in Wild Shape, the target takes an extra **1d8 Cold, Fire, Lightning, or Thunder** damage (your choice).\n\nPrimal Strike explicitly works in Wild Shape, which is what makes it the Moon Druid\'s pick; Potent Spellcasting is for the Druid who spends fights casting.',
      description: 'Choose Potent Spellcasting (Wisdom to cantrip damage) or Primal Strike (+1d8 elemental, once per turn, works in Wild Shape).',
      choice: 'other',
    },
    { level: 8, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — +2 to one score or +1 to two, to a cap of 20 — or another feat you qualify for.\n\nDruid level 8 is also when Wild Shape reaches 8 known forms, max CR 1, and Fly Speeds.', description: 'Take the ASI feat or another feat you qualify for.', choice: 'asi' },
    { level: 12, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — +2 to one score or +1 to two, to a cap of 20 — or another feat you qualify for.', description: 'Take the ASI feat or another feat you qualify for.', choice: 'asi' },
    {
      level: 15,
      name: 'Improved Elemental Fury',
      body:
        'Whichever Elemental Fury option you took at level 7 grows.\n\n· **Potent Spellcasting.** Whenever you cast a **Druid cantrip with a range of 10 feet or more**, that range increases by **300 feet**.\n· **Primal Strike.** The extra damage rises from 1d8 to **2d8**.\n\nThe Potent Spellcasting upgrade is easy to undersell: a 60-foot Starry Wisp becomes a 360-foot one, which changes what a cantrip is for.',
      description: 'Potent Spellcasting extends cantrip range by 300 feet; Primal Strike becomes 2d8.',
    },
    { level: 16, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — +2 to one score or +1 to two, to a cap of 20 — or another feat you qualify for. This is your last ASI; level 19 grants an Epic Boon instead.', description: 'Take the ASI feat or another feat you qualify for.', choice: 'asi' },
    {
      level: 18,
      name: 'Beast Spells',
      body:
        'The oldest Wild Shape restriction finally lifts: **while in a Wild Shape form you can cast spells**.\n\nThe only exception is spells requiring **costly or consumable Material components** — so no Revivify\'s diamonds and no Wish, but Healing Word, Spirit Guardians and Conjure Animals are all live from inside a dire wolf.\n\nYou still use your own Wisdom, DC and slots; the Beast body is just the platform.',
      description: 'You can cast spells while in Wild Shape, except those needing costly or consumed Material components.',
    },
    {
      level: 19,
      name: 'Epic Boon',
      body:
        'You gain an **Epic Boon feat** of your choice, or any other feat you qualify for. This replaces what used to be a fifth ASI.\n\nEpic Boons are the 2024 capstone feats — **Boon of Dimensional Travel**, **Boon of Spell Recall**, **Boon of Fate** and so on. Most also raise one ability score by 1, to a maximum of **30** rather than 20.\n\n*Boon of Dimensional Travel* is the conventional Druid pick: a free Misty Step after every Attack or Magic action, which pairs with a form that has already closed the distance.',
      description: 'Take an Epic Boon feat (or any feat you qualify for) — not an ASI.',
      choice: 'epic-boon',
    },
    {
      level: 20,
      name: 'Archdruid',
      body:
        'Nature stops asking you for anything.\n\n· **Evergreen Wild Shape.** Whenever you **roll Initiative** with no uses of Wild Shape remaining, you regain **one** use — you effectively never start a fight empty.\n· **Nature Magician.** You can expend uses of **Wild Shape** (no action required) to create a spell slot, each use converting into **2 spell levels**, up to a maximum of a **rank-5** slot. You cannot do this again until you finish a **Long Rest**. This supersedes the once-a-day rank-1 conversion from Wild Resurgence.\n· **Longevity.** You age only **1 year for every 10** that pass.\n\nEvergreen Wild Shape is the one that matters in play: it makes the Short-Rest economy of Wild Shape effectively per-encounter.',
      description: 'Regain a Wild Shape use on Initiative, convert Wild Shape into spell slots up to rank 5, and age at a tenth speed.',
    },
  ],
};

export const DRUID_SUBCLASSES_2024: SubclassDefinition[] = [
  {
    key: 'circle-of-the-land',
    name: 'Circle of the Land',
    classKey: 'druid',
    system: 'dnd5e-2024',
    description: 'A druid shaped by one kind of country. Terrain-flavoured spells, slot recovery on a Short Rest, and a damage-plus-healing burst that costs Wild Shape rather than magic.',
    // NOTE: Land's circle spells depend on the terrain chosen at level 3, so they cannot be
    // expressed as a single alwaysPrepared map. All four terrain tables live in the feature body.
    features: [
      {
        level: 3,
        name: 'Circle of the Land Spells',
        body:
          'Choose one type of land — **arid**, **polar**, **temperate**, or **tropical**. You always have that land\'s spells prepared, and they never count against your prepared total. You can swap your land choice whenever you finish a **Long Rest**.\n\n· **Arid** — 3: Blur, Burning Hands, Fire Bolt · 5: Fireball · 7: Blight · 9: Wall of Stone\n· **Polar** — 3: Fog Cloud, Hold Person, Ray of Frost · 5: Sleet Storm · 7: Ice Storm · 9: Cone of Cold\n· **Temperate** — 3: Misty Step, Shocking Grasp, Sleep · 5: Lightning Bolt · 7: Freedom of Movement · 9: Tree Stride\n· **Tropical** — 3: Acid Splash, Ray of Sickness, Web · 5: Stinking Cloud · 7: Polymorph · 9: Insect Plague\n\nThe numbers are your **Druid level**, not the spell\'s rank. Because the choice is re-made on every Long Rest, a Land Druid is the most tunable prepared caster in the game.',
        description: 'Pick arid, polar, temperate, or tropical for a set of always-prepared spells, re-choosable each Long Rest.',
        choice: 'other',
      },
      {
        level: 3,
        name: 'Land\'s Aid',
        body:
          'As a **Magic action**, expend a use of **Wild Shape** and choose a point within **60 feet**. Life-giving flowers and draining thorns burst into a **10-foot-radius Sphere** centred there for an instant.\n\nEach creature **you choose** in the Sphere makes a **Constitution save**, taking **2d6 Necrotic** damage on a failure or half on a success. Separately, **one creature of your choice** in the Sphere regains **2d6** Hit Points.\n\nThe dice grow with you: **3d6** at Druid level 10, **4d6** at level 14. Since you pick the affected creatures, allies in the Sphere are simply not hit — this is an AoE and a heal on the same action, paid for with a Short-Rest resource.',
        description: 'Spend Wild Shape for a 10-foot Sphere dealing 2d6 Necrotic to chosen creatures and healing 2d6 to one of them.',
      },
      {
        level: 6,
        name: 'Natural Recovery',
        body:
          'Two separate benefits, both once per Long Rest.\n\n· **Free circle spell.** You can cast **one of the spells from your Circle of the Land Spells feature** without expending a slot. You must finish a **Long Rest** before doing so again.\n· **Slot recovery.** When you finish a **Short Rest**, you can recover expended spell slots whose **combined rank equals half your Druid level, rounded up**, with none higher than **rank 5**. Once you do this, you cannot again until a **Long Rest**.\n\nAt level 6 that is 3 ranks of slots per day back on a coffee break; at level 18 it is 9. The free circle spell is the reason to keep a Fireball or a Cone of Cold on the land list.',
        description: 'Once per Long Rest: cast a circle spell free, and recover half-your-level in spell slot ranks on a Short Rest.',
      },
      {
        level: 10,
        name: 'Nature\'s Ward',
        body:
          'You are **immune to the Poisoned condition**, permanently and unconditionally.\n\nYou also gain **Resistance** to one damage type, decided by your **current land choice**:\n· **Arid** → Fire · **Polar** → Cold · **Temperate** → Lightning · **Tropical** → Poison\n\nBecause the land choice re-sets on every Long Rest, so does the Resistance — if the party is walking into a red dragon\'s lair, you wake up Arid that morning.',
        description: 'Immunity to the Poisoned condition, plus a damage Resistance that follows your current land choice.',
      },
      {
        level: 14,
        name: 'Nature\'s Sanctuary',
        body:
          'As a **Magic action**, expend a use of **Wild Shape** to raise spectral trees and vines in a **15-foot Cube** on the ground within **120 feet**. It lasts **1 minute**, or until you become **Incapacitated** or die.\n\nInside it, **you and your allies have Half Cover** (+2 AC and +2 to Dexterity saves), and your **allies gain whatever damage Resistance your Nature\'s Ward is currently granting**.\n\nAs a **Bonus Action**, you can move the foliage up to **60 feet** to a spot within 120 feet of yourself — so the sanctuary travels with the fight rather than anchoring it.',
        description: 'Spend Wild Shape for a movable 15-foot Cube granting Half Cover and sharing your Nature\'s Ward Resistance.',
      },
    ],
  },
  {
    key: 'circle-of-the-moon',
    name: 'Circle of the Moon',
    classKey: 'druid',
    system: 'dnd5e-2024',
    description: 'The shape-shifter proper. Bigger beasts, triple Temporary HP, radiant claws, and a Bonus Action teleport.',
    alwaysPrepared: {
      3: ['Cure Wounds', 'Moonbeam', 'Starry Wisp'],
      5: ['Conjure Animals'],
      7: ['Fount of Moonlight'],
      9: ['Mass Cure Wounds'],
    },
    features: [
      {
        level: 3,
        name: 'Circle Forms',
        body:
          'Your Wild Shape stops being a utility and becomes a combat form.\n\n· **Challenge Rating.** You can assume Beast forms up to **CR equal to your Druid level ÷ 3, rounded down** — CR 1 at level 3, CR 2 at 6, CR 4 at 12, CR 6 at 18. You ignore the Max CR column of the Beast Shapes table but obey its other limits.\n· **Armor Class.** While in Wild Shape, your AC becomes **13 + your Wisdom modifier** if that is higher than the Beast\'s own AC.\n· **Temporary Hit Points.** Wild Shape now grants **three times your Druid level** in Temporary HP instead of your Druid level.\n\nThat triple-Temp-HP line is the whole subclass: at level 12 every transformation is a 36-point buffer, and you have three of them per Short Rest.',
        description: 'Wild Shape into CR = level/3 beasts, with AC 13 + Wisdom and Temporary HP equal to three times your Druid level.',
      },
      {
        level: 3,
        name: 'Circle of the Moon Spells',
        body:
          'You always have the circle\'s spells prepared, and they never count against your prepared total: **Cure Wounds, Moonbeam, Starry Wisp** at Druid level 3, **Conjure Animals** at 5, **Fount of Moonlight** at 7, and **Mass Cure Wounds** at 9.\n\nCrucially, **you can cast these particular spells while in Wild Shape**, a full fifteen levels before Beast Spells lets you cast anything else in a Beast body.\n\nThat exception is what makes the list what it is: Moonbeam is a Concentration spell you can re-position each turn as a Bonus Action while fighting as a bear.',
        description: 'Always-prepared circle spells that you may cast even while in Wild Shape.',
      },
      {
        level: 6,
        name: 'Improved Circle Forms',
        body:
          'While in Wild Shape you gain two benefits.\n\n· **Radiant Attacks.** Each time you hit with an attack in Beast form, you can choose to deal **Radiant** damage instead of the attack\'s normal type — which sidesteps the Bludgeoning/Piercing/Slashing resistances that otherwise blunt beast forms as the tiers climb.\n· **Fortifying Wisdom.** You can add your **Wisdom modifier** to your **Constitution saving throws**.\n\nThe Constitution rider is quietly the better half: a Beast body usually has a poor Constitution save, and this is the stat you need to hold Concentration on Moonbeam.',
        description: 'In Wild Shape, deal Radiant damage on your attacks and add Wisdom to your Constitution saves.',
      },
      {
        level: 10,
        name: 'Moonlight Step',
        body:
          'As a **Bonus Action**, you teleport up to **30 feet** to an unoccupied space you can see, and you have **Advantage on the next attack roll** you make before the end of that turn.\n\nYou can use it a number of times equal to your **Wisdom modifier** (minimum once), regaining all uses on a **Long Rest**. You also **regain one use whenever you expend a spell slot of rank 2 or higher** — so it refills itself over a day of casting.\n\nThe teleport works in Wild Shape (it is not a spell), which gives an otherwise ground-bound bear a way past a chasm and onto the back line.',
        description: 'Bonus Action: teleport 30 feet with Advantage on your next attack; refills when you spend rank-2+ slots.',
      },
      {
        level: 14,
        name: 'Lunar Form',
        body:
          'Two upgrades, one to each half of the subclass.\n\n· **Lunar Radiance.** **Once per turn**, when you hit a creature with an attack while in **Wild Shape**, you deal an extra **2d10 Radiant** damage.\n· **Improved Moonlight Step.** Whenever you use **Moonlight Step**, you can bring **one willing creature within 10 feet** of you along; it appears in an unoccupied space of your choice within 10 feet of where you land.\n\nLunar Radiance stacks with Elemental Fury: Primal Strike is also once per turn, and nothing stops both from landing on the same hit.',
        description: 'Wild Shape attacks deal +2d10 Radiant once per turn, and Moonlight Step can carry a willing ally.',
      },
    ],
  },
  {
    key: 'circle-of-the-sea',
    name: 'Circle of the Sea',
    classKey: 'druid',
    system: 'dnd5e-2024',
    description: 'New in 2024. You become weather: a persistent aura of freezing spray that pushes enemies away and eventually lets you fly.',
    alwaysPrepared: {
      3: ['Fog Cloud', 'Gust of Wind', 'Ray of Frost', 'Thunderwave'],
      5: ['Lightning Bolt', 'Water Breathing'],
      7: ['Control Water', 'Ice Storm'],
      9: ['Conjure Elemental', 'Hold Monster'],
    },
    features: [
      {
        level: 3,
        name: 'Wrath of the Sea',
        body:
          'As a **Bonus Action**, expend a use of **Wild Shape** to wrap yourself in a **5-foot Emanation** of ocean spray. It lasts **10 minutes**, ending early if you become **Incapacitated** or use this feature again.\n\nWhen it appears, and **as a Bonus Action on each of your later turns**, choose one creature you can see in the Emanation. It makes a **Constitution save** against your spell save DC. On a failure it takes **Cold** damage equal to a roll of **d6s equal to your Wisdom modifier** (minimum 1d6) and, if it is **Large or smaller**, is **pushed up to 15 feet** away from you.\n\nThis is the subclass\'s engine: one Wild Shape buys ten minutes of Bonus Action damage with forced movement attached, and it does not need Concentration — so it runs underneath Spirit Guardians or Moonbeam.',
        description: 'Spend Wild Shape for a 10-minute aura that deals Wisdom-modifier d6 Cold and pushes a creature 15 feet each turn.',
      },
      {
        level: 6,
        name: 'Aquatic Affinity',
        body:
          'The Emanation of your **Wrath of the Sea** grows from 5 feet to **10 feet**, which roughly quadruples the area you can pick a target from and means enemies pushed 15 feet are still often inside it next turn.\n\nYou also gain a **Swim Speed equal to your Speed**, permanently and regardless of whether the aura is up.',
        description: 'Wrath of the Sea becomes a 10-foot Emanation, and you gain a Swim Speed equal to your Speed.',
      },
      {
        level: 10,
        name: 'Stormborn',
        body:
          'While your **Wrath of the Sea** is manifested, you gain:\n\n· **Fly Speed** equal to your Speed.\n· **Resistance** to **Cold, Lightning, and Thunder** damage.\n\nBoth switch off the moment the aura ends, which ties your mobility to keeping the aura running — plan for what happens when a fall becomes a fall.',
        description: 'While Wrath of the Sea is up, you have a Fly Speed and Resistance to Cold, Lightning, and Thunder.',
      },
      {
        level: 14,
        name: 'Oceanic Gift',
        body:
          'You can lend the storm out.\n\nWhen you manifest **Wrath of the Sea**, you can place the Emanation around a **willing creature within 60 feet** instead of yourself. It gains the Emanation\'s benefits, and its damage still uses **your spell save DC and your Wisdom modifier**.\n\nAlternatively, expend **two uses of Wild Shape** to manifest the Emanation around **both** yourself and that creature at once. Handing the aura to the melee character while you stay at range is usually the better line — the aura wants to be where the enemies are, and you do not.',
        description: 'Manifest Wrath of the Sea on a willing ally instead — or on both of you for two Wild Shape uses.',
      },
    ],
  },
  {
    key: 'circle-of-the-stars',
    name: 'Circle of the Stars',
    classKey: 'druid',
    system: 'dnd5e-2024',
    description: 'A druid who reads constellations. Three starry forms that make you an archer, a healer, or an unbreakable concentrator — plus the best Reaction in the class.',
    // NOTE: Stars has no separate circle spell table in 2024; Star Map grants Guidance and
    // Guiding Bolt directly, which is why alwaysPrepared is omitted here.
    features: [
      {
        level: 3,
        name: 'Star Map',
        body:
          'You carry a **Tiny star chart** — a hide scrap, an inked scroll, a constellation of gems — which serves as a **Druidic Focus** for your Druid spells.\n\nWhile you hold it, you always have **Guidance** and **Guiding Bolt** prepared, and neither counts against your prepared total. You can also cast **Guiding Bolt without expending a spell slot** a number of times equal to your **Wisdom modifier** (minimum once), regaining all uses on a **Long Rest**.\n\nIf the map is lost, you can spend **1 hour** in a ceremony to make a new one; doing so destroys the old map.',
        description: 'A focus that grants Guidance and Guiding Bolt prepared, plus free Guiding Bolt casts equal to your Wisdom modifier.',
      },
      {
        level: 3,
        name: 'Starry Form',
        body:
          'As a **Bonus Action**, expend a use of **Wild Shape** to light up rather than shape-shift. You keep all your own statistics; your joints glimmer like stars and glowing lines connect them. You shed **Bright Light in a 10-foot radius** and Dim Light for 10 feet beyond, and it lasts **10 minutes**, ending early if you dismiss it (no action), become **Incapacitated**, or use Wild Shape again.\n\nChoose a constellation each time you assume the form:\n· **Archer.** When you assume the form, and as a **Bonus Action** on later turns, make a **ranged spell attack** against one creature within **60 feet** for **1d8 + your Wisdom modifier** Radiant damage.\n· **Chalice.** Whenever you cast a spell **with a spell slot** that restores Hit Points, you or another creature within **30 feet** regains **1d8 + your Wisdom modifier** Hit Points.\n· **Dragon.** When you make an **Intelligence or Wisdom check**, or a **Constitution save to maintain Concentration**, treat a d20 roll of **9 or lower as a 10**.\n\nBecause you keep your own stat block, you can cast spells freely in Starry Form — it is a buff, not a transformation.',
        description: 'Spend Wild Shape for a 10-minute luminous form: Archer (ranged attacks), Chalice (healing), or Dragon (never roll under 10 on Concentration).',
        choice: 'other',
      },
      {
        level: 6,
        name: 'Cosmic Omen',
        body:
          'Whenever you finish a **Long Rest**, consult your Star Map and **roll a die**. Until your next Long Rest you have one of two Reactions:\n\n· **Weal (even roll).** When a creature you can see within **30 feet** is about to make a **D20 Test**, take a **Reaction** to roll **1d6** and **add** it to the total.\n· **Woe (odd roll).** Same trigger, but you **subtract** the 1d6 from the total.\n\nYou can use the Reaction a number of times equal to your **Wisdom modifier** (minimum once), regaining all uses on a **Long Rest**.\n\nNote the trigger: *about to make* — you commit before you know the roll, unlike a Cleric\'s Guided Strike. It applies to any D20 Test, so Woe works on enemy saving throws against your own spells.',
        description: 'After each Long Rest, roll for Weal (+1d6) or Woe (−1d6) as a Reaction on D20 Tests within 30 feet.',
      },
      {
        level: 10,
        name: 'Twinkling Constellations',
        body:
          'Your Starry Form sharpens.\n\n· The **1d8** of **Archer** and **Chalice** becomes **2d8**.\n· While **Dragon** is active you gain a **Fly Speed of 20 feet** and can **hover**.\n· At the **start of each of your turns** while in Starry Form, you can **change which constellation** is glimmering.\n\nThat last line is the real upgrade: one Wild Shape use now covers all three roles, letting you open as Archer, swap to Chalice the round someone drops, and sit in Dragon while you hold a Concentration spell.',
        description: 'Archer and Chalice deal 2d8, Dragon grants hovering flight, and you can swap constellation every turn.',
      },
      {
        level: 14,
        name: 'Full of Stars',
        body:
          'While in your **Starry Form**, you become partially incorporeal, gaining **Resistance to Bludgeoning, Piercing, and Slashing damage**.\n\nThose three types cover the overwhelming majority of weapon attacks, so a form you were already assuming for its offence now also halves the damage from most things swinging at you.\n\nIt lasts as long as the form does — 10 minutes on one use of Wild Shape.',
        description: 'In Starry Form you have Resistance to Bludgeoning, Piercing, and Slashing damage.',
      },
    ],
  },
];
