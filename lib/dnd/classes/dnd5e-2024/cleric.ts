// lib/dnd/classes/dnd5e-2024/cleric.ts — the 2024 Player's Handbook Cleric.
//
// 2024 deltas from 2014, for anyone diffing this against an older sheet:
//   · The Divine Domain is chosen at level 3, not level 1.
//   · Divine Order (level 1) replaces the old domain-granted armour/cantrip riders.
//   · Channel Divinity arrives at 2 with Divine Spark AND Turn Undead baked in.
//   · Level 19 is an Epic Boon, not an ASI.
import type { ClassDefinition, SubclassDefinition } from '../types';
import { FULL_CASTER_SLOTS } from '../slots';

export const CLERIC_2024: ClassDefinition = {
  key: 'cleric',
  name: 'Cleric',
  system: 'dnd5e-2024',
  hitDie: 8,
  primaryAbility: ['wis'],
  savingThrows: ['wis', 'cha'],
  skillChoices: { count: 2, from: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'] },
  armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
  weaponProficiencies: ['Simple weapons'],
  asiLevels: [4, 8, 12, 16],
  subclassLevel: 3,
  subclassLabel: 'Divine Domain',
  description:
    'A priest whose god answers. Clerics heal, ward and burn — the only class that can turn the undead as a matter of routine and rewrite an encounter with a spell it never prepared.',
  startingEquipment: [
    'Chain Shirt, Shield, Mace, Holy Symbol, Priest\'s Pack, and 7 GP',
    'or 110 GP',
  ],
  spellcasting: {
    kind: 'full',
    ability: 'wis',
    slots: FULL_CASTER_SLOTS,
    cantripsKnown: [0, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    preparedRule:
      'Prepared spells are a fixed count from the Cleric table, NOT level + Wisdom modifier: 4/5/6/7/9/10/11/12/14/15/16/16/17/17/18/18/19/20/21/22 at levels 1–20. Choose them from the whole Cleric list (you always have access to every Cleric spell), up to the highest rank you have slots for. You can swap the whole list after a Long Rest. Domain spells are always prepared and never count against this number.',
  },
  resources: [
    {
      id: 'channel-divinity',
      name: 'Channel Divinity',
      perLevel: [0, 0, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4],
      resetOn: 'long',
      note: 'A Short Rest gives back ONE use; a Long Rest gives back all of them.',
    },
  ],
  features: [
    {
      level: 1,
      name: 'Spellcasting',
      body:
        'You pray for your magic rather than studying it, and your god answers with the **whole Cleric spell list** — you never "learn" Cleric spells, you simply choose which ones to hold ready.\n\n· **Cantrips.** You know 3 Cleric cantrips at level 1 (a 4th at 4, a 5th at 10). You may swap one for another Cleric cantrip whenever you gain a Cleric level.\n· **Prepared spells.** A fixed number from the table — 4 at level 1, rising to 22 at level 20 — of any rank you have slots for. Rebuild the list freely after a Long Rest.\n· **Slots.** The full-caster table. Casting a spell of rank 1+ spends a slot of that rank or higher; all slots return on a Long Rest.\n\n**Wisdom** is your spellcasting ability, so your save DC is 8 + proficiency bonus + Wisdom modifier and your spell attack bonus is proficiency bonus + Wisdom modifier. A **Holy Symbol** works as your spellcasting focus.',
      description: 'You prepare from the entire Cleric list using Wisdom, with a fixed prepared count per level.',
    },
    {
      level: 1,
      name: 'Divine Order',
      body:
        'You commit to one of your faith\'s callings. Choose once — this cannot be changed later.\n\n· **Protector.** You gain training with **Martial weapons** and **Heavy armor**. This is the front-line Cleric: chain a shield and a longsword to the domain that already wants you in melee.\n· **Thaumaturge.** You learn one **extra Cleric cantrip**, and you add your Wisdom modifier (minimum **+1**) to every Intelligence (Arcana) and Intelligence (Religion) check you make.\n\nProtector buys you a weapon platform; Thaumaturge buys you cantrip throughput and the lore checks that make a Cleric useful outside a fight.',
      description: 'Choose Protector (Martial weapons + Heavy armor) or Thaumaturge (extra cantrip + Wisdom to Arcana/Religion).',
      choice: 'other',
    },
    {
      level: 2,
      name: 'Channel Divinity',
      body:
        'You can pull power straight from your deity. You have **2 uses** (3 at level 6, 4 at level 18); a **Short Rest returns one** use and a **Long Rest returns all** of them. Any saving throw these effects force uses **your spell save DC**.\n\n· **Divine Spark.** As a **Magic action**, point your Holy Symbol at a creature you can see within **30 feet**. Roll **1d8** (2d8 at level 7, 3d8 at 13, 4d8 at 18) and add your Wisdom modifier. Either restore that many Hit Points to the target, or force a **Constitution save** — on a failure it takes that much **Necrotic or Radiant** damage (your choice), and half as much on a success.\n· **Turn Undead.** As a **Magic action**, brandish your Holy Symbol. Each Undead within **30 feet** that can see or hear you makes a **Wisdom save**. On a failure it is **Frightened and Incapacitated for 1 minute** and spends its turns fleeing as far from you as it can. The effect ends early on a creature that takes **any damage**, or if you become Incapacitated or die.\n\nYour subclass adds more Channel Divinity options at level 3, all drawing on this same pool.',
      description: 'A shared pool of divine energy fuelling Divine Spark, Turn Undead, and your domain\'s options.',
    },
    {
      level: 3,
      name: 'Cleric Subclass',
      body:
        'You commit to a **Divine Domain** — the slice of your god\'s portfolio you personally carry. Pick one: **Life**, **Light**, **Trickery**, or **War**.\n\nYour domain grants features now and again at levels **6 and 17**, and it hands you a list of **always-prepared domain spells** that grows at Cleric levels **3, 5, 7 and 9**. Those spells do not count against your prepared total and are always available — this is a large part of what makes a domain feel different at the table.\n\nNote for anyone porting a 2014 character: the domain used to be chosen at level 1. In the 2024 rules it is a level-3 decision, and levels 1–2 are identical for every Cleric.',
      description: 'Choose the Life, Light, Trickery, or War domain, which grants features and always-prepared spells.',
      choice: 'subclass',
    },
    { level: 4, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — raise one ability score by 2, or two scores by 1 each, to a maximum of 20 — or instead take any other feat you qualify for.\n\nThis recurs at Cleric levels **8, 12 and 16**. Level 19 is *not* an ASI in the 2024 rules; it is an Epic Boon.', description: 'Take the ASI feat (+2/+1+1) or another feat you qualify for.', choice: 'asi' },
    {
      level: 5,
      name: 'Sear Undead',
      body:
        'Turning the undead now burns them as well as scares them.\n\nWhenever you use **Turn Undead**, roll a number of **d8s equal to your Wisdom modifier** (minimum **1d8**) and total them. **Each** Undead that fails its Wisdom save against that use takes that much **Radiant** damage.\n\nCrucially, this damage does **not** break the turn effect the way ordinary damage does — the same use both frightens and scorches, so you are never choosing between the two.',
      description: 'Undead that fail your Turn Undead also take Radiant damage equal to a roll of Wisdom-modifier d8s.',
    },
    {
      level: 7,
      name: 'Blessed Strikes',
      body:
        'Divine power starts riding along with your attacks or your cantrips. Choose one option — you keep it for good, and it upgrades at level 14.\n\n· **Divine Strike.** **Once per turn**, when you hit a creature with a weapon or an Unarmed Strike, that target takes an extra **1d8 Necrotic or Radiant** damage (your choice).\n· **Potent Spellcasting.** Add your **Wisdom modifier** to the damage of any **Cleric cantrip** you cast.\n\nDivine Strike suits a Protector who is already swinging every round; Potent Spellcasting suits a Thaumaturge leaning on Sacred Flame or Toll the Dead.',
      description: 'Choose Divine Strike (+1d8 on a hit, once per turn) or Potent Spellcasting (Wisdom to cantrip damage).',
      choice: 'other',
    },
    { level: 8, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — +2 to one score or +1 to two, to a cap of 20 — or another feat you qualify for.', description: 'Take the ASI feat or another feat you qualify for.', choice: 'asi' },
    {
      level: 10,
      name: 'Divine Intervention',
      body:
        'You can call in a favour, and it lands. This is the 2024 rewrite of the old percentile gamble — it is **not** a roll any more, it simply works.\n\nAs a **Magic action**, choose any **Cleric spell of rank 5 or lower** that does not have a Reaction casting time. As part of that same action you cast it **without a spell slot** and **without Material components**.\n\nYou cannot do this again until you finish a **Long Rest**. Remember you have the whole Cleric list to pick from, prepared or not — this is a once-a-day Revivify, Greater Restoration, Mass Cure Wounds or Flame Strike from nowhere.',
      description: 'Once per Long Rest, cast any Cleric spell of rank 5 or lower free, without a slot or Materials.',
    },
    { level: 12, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — +2 to one score or +1 to two, to a cap of 20 — or another feat you qualify for.', description: 'Take the ASI feat or another feat you qualify for.', choice: 'asi' },
    {
      level: 14,
      name: 'Improved Blessed Strikes',
      body:
        'Whichever Blessed Strikes option you took at level 7 grows.\n\n· **Divine Strike.** The extra damage rises from 1d8 to **2d8**.\n· **Potent Spellcasting.** Whenever you deal damage to a creature with a **Cleric cantrip**, you can also give **yourself or another creature within 60 feet** Temporary Hit Points equal to **twice your Wisdom modifier**.\n\nYou do not re-choose here — the upgrade applies to the option already in play.',
      description: 'Divine Strike becomes 2d8; Potent Spellcasting adds Temporary HP equal to twice your Wisdom modifier.',
    },
    { level: 16, name: 'Ability Score Improvement', body: 'You gain the **Ability Score Improvement** feat — +2 to one score or +1 to two, to a cap of 20 — or another feat you qualify for. This is your last ASI; level 19 grants an Epic Boon instead.', description: 'Take the ASI feat or another feat you qualify for.', choice: 'asi' },
    {
      level: 19,
      name: 'Epic Boon',
      body:
        'You gain an **Epic Boon feat** of your choice, or any other feat you qualify for. This replaces what used to be a fifth ASI.\n\nEpic Boons are the 2024 rules\' capstone feats — **Boon of Fate**, **Boon of Spell Recall**, **Boon of Truesight** and the rest. Most also raise one ability score by 1, to a maximum of **30** rather than 20.\n\n*Boon of Fate* pairs unusually well with a Cleric already built to bend other people\'s dice.',
      description: 'Take an Epic Boon feat (or any feat you qualify for) — not an ASI.',
      choice: 'epic-boon',
    },
    {
      level: 20,
      name: 'Greater Divine Intervention',
      body:
        'Your god will now break the world for you.\n\nWhen you use **Divine Intervention**, you may choose **Wish** as the spell — ignoring the rank-5 limit and paying none of Wish\'s usual stress costs, since you are not the one casting it from a slot.\n\nIf you invoke Wish this way, you cannot use Divine Intervention again until you finish **2d4 Long Rests**. Using Divine Intervention normally still recharges on a single Long Rest.',
      description: 'Divine Intervention can now cast Wish, at the cost of 2d4 Long Rests before it recharges.',
    },
  ],
};

export const CLERIC_SUBCLASSES_2024: SubclassDefinition[] = [
  {
    key: 'life-domain',
    name: 'Life Domain',
    classKey: 'cleric',
    system: 'dnd5e-2024',
    description: 'The domain of vitality itself. The best healer in the game, and the only one that turns a Cure Wounds into a group event.',
    alwaysPrepared: {
      3: ['Aid', 'Bless', 'Cure Wounds', 'Lesser Restoration'],
      5: ['Mass Healing Word', 'Revivify'],
      7: ['Aura of Life', 'Death Ward'],
      9: ['Greater Restoration', 'Mass Cure Wounds'],
    },
    features: [
      {
        level: 3,
        name: 'Disciple of Life',
        body:
          'Your healing magic carries more than the spell describes.\n\nWhenever a spell you cast **using a spell slot** restores Hit Points to a creature, that creature regains an extra **2 + the slot\'s rank** Hit Points.\n\nThis fires per creature, so a rank-3 Mass Healing Word gives every target +5 on top of its roll. It does **not** apply to healing from cantrips, Channel Divinity, or spells cast without a slot (including your level-10 Divine Intervention).',
        description: 'Slot-cast healing restores an extra 2 + the spell slot\'s rank to each creature.',
      },
      {
        level: 3,
        name: 'Preserve Life',
        body:
          'A Channel Divinity option that triages the whole party at once.\n\nAs a **Magic action**, present your Holy Symbol and spend one use of **Channel Divinity** to conjure a pool of healing equal to **five times your Cleric level**. Choose any **Bloodied** creatures within **30 feet** (you may include yourself) and split the pool among them however you like.\n\nIt cannot take any creature above **half its Hit Point maximum**, and it does nothing for **Undead or Constructs**. At level 10 that is 50 Hit Points spread across the party for one Channel Divinity use.',
        description: 'Spend Channel Divinity to divide 5 × your Cleric level in healing among Bloodied creatures within 30 feet.',
      },
      {
        level: 6,
        name: 'Blessed Healer',
        body:
          'The magic you pour into others splashes back onto you.\n\nImmediately after you cast a spell **with a spell slot** that restores Hit Points to **one or more creatures other than yourself**, you regain **2 + the slot\'s rank** Hit Points.\n\nNote the shape: it triggers once per casting, not per target, and only when someone else was healed — healing only yourself does nothing here.',
        description: 'When a slot-cast spell heals someone else, you regain 2 + the slot\'s rank Hit Points.',
      },
      {
        level: 17,
        name: 'Supreme Healing',
        body:
          'You stop rolling for healing altogether.\n\nWhenever you would roll dice to restore Hit Points with a **spell** or with **Channel Divinity**, do not roll — treat each die as its **maximum**.\n\nA rank-1 Cure Wounds becomes a flat 8 before modifiers; Preserve Life is unaffected (it was never a roll) but Divine Spark\'s healing is maximised. Combined with Disciple of Life, every heal you cast is now a known, reliable number.',
        description: 'Healing dice from your spells and Channel Divinity are always maximised instead of rolled.',
      },
    ],
  },
  {
    key: 'light-domain',
    name: 'Light Domain',
    classKey: 'cleric',
    system: 'dnd5e-2024',
    description: 'Fire, radiance, and the light that reveals. A blaster Cleric that also happens to have the best defensive Reaction in the class.',
    alwaysPrepared: {
      3: ['Burning Hands', 'Faerie Fire', 'Scorching Ray', 'See Invisibility'],
      5: ['Daylight', 'Fireball'],
      7: ['Arcane Eye', 'Wall of Fire'],
      9: ['Flame Strike', 'Scrying'],
    },
    features: [
      {
        level: 3,
        name: 'Radiance of the Dawn',
        body:
          'A Channel Divinity option that clears a room of both darkness and enemies.\n\nAs a **Magic action**, spend one use of **Channel Divinity** to flare light in a **30-foot Emanation** around you. Any **magical Darkness** in that area is dispelled outright — no ability check.\n\nEach creature **of your choice** in the area makes a **Constitution save**, taking **2d10 + your Cleric level** Radiant damage on a failure, or half on a success. Because you pick the targets, allies standing in the blast are simply skipped.',
        description: 'Spend Channel Divinity to dispel magical Darkness and deal 2d10 + Cleric level Radiant in a 30-foot Emanation.',
      },
      {
        level: 3,
        name: 'Warding Flare',
        body:
          'When a creature you can see within **30 feet** makes an **attack roll**, you can take a **Reaction** to flare light in its eyes and give that roll **Disadvantage**.\n\nThe attack does not have to target you — this protects anyone in range, which is what separates it from Shield.\n\nYou can do this a number of times equal to your **Wisdom modifier** (minimum once), and you regain all uses on a **Long Rest**.',
        description: 'Reaction: impose Disadvantage on an attack roll made within 30 feet, Wisdom-modifier times per Long Rest.',
      },
      {
        level: 6,
        name: 'Improved Warding Flare',
        body:
          'Warding Flare gets both cheaper and kinder.\n\n· **Recharge.** You regain one expended use whenever you finish a **Short Rest**, on top of the full refill on a Long Rest.\n· **Cushion.** Whenever you use Warding Flare, you can also give the **target of the triggering attack** Temporary Hit Points equal to **2d6 + your Wisdom modifier**.\n\nThe Temporary HP land whether or not the flare actually causes a miss, so a flared attack is rarely wasted.',
        description: 'Warding Flare recharges on a Short Rest and grants the attack\'s target 2d6 + Wisdom modifier Temporary HP.',
      },
      {
        level: 17,
        name: 'Corona of Light',
        body:
          'As a **Magic action**, you ignite into a walking sun for **1 minute**, or until you dismiss it (no action required).\n\nYou shed **Bright Light in a 60-foot radius** and Dim Light for **30 feet** beyond that. Your **enemies inside the Bright Light have Disadvantage on saving throws** against Radiance of the Dawn and against any of your spells that deal **Fire or Radiant** damage.\n\nYou can use this a number of times equal to your **Wisdom modifier** (minimum once), regaining all uses on a **Long Rest**. Turned on before a Flame Strike or a Fireball, it is effectively a party-wide DC boost against the two damage types your domain is built around.',
        description: 'Emit 60 feet of Bright Light for 1 minute; enemies in it have Disadvantage on saves against your Fire/Radiant spells.',
      },
    ],
  },
  {
    key: 'trickery-domain',
    name: 'Trickery Domain',
    classKey: 'cleric',
    system: 'dnd5e-2024',
    description: 'The god who lies for a good reason. Illusion, stealth, and a duplicate of yourself that hands out Advantage all fight.',
    alwaysPrepared: {
      3: ['Charm Person', 'Disguise Self', 'Invisibility', 'Pass without Trace'],
      5: ['Hypnotic Pattern', 'Nondetection'],
      7: ['Confusion', 'Dimension Door'],
      9: ['Dominate Person', 'Modify Memory'],
    },
    features: [
      {
        level: 3,
        name: 'Blessing of the Trickster',
        body:
          'As a **Magic action**, choose **yourself or a willing creature within 30 feet** to gain **Advantage on Dexterity (Stealth) checks**.\n\nThe blessing lasts until you finish a **Long Rest** or until you use this feature again — so in practice one party member walks around permanently blessed, and you re-point it whenever the scouting job changes hands.\n\nThere is no use limit and no resource cost.',
        description: 'Give yourself or a willing creature Advantage on Stealth checks until your next Long Rest.',
      },
      {
        level: 3,
        name: 'Invoke Duplicity',
        body:
          'As a **Bonus Action**, spend one use of **Channel Divinity** to create a flawless visual illusion of yourself in an unoccupied space you can see within **30 feet**. It is intangible, does not occupy its space, and mimics your gestures. It lasts **1 minute**, ending early if you dismiss it (no action) or become **Incapacitated**.\n\nWhile it persists:\n· **Cast Spells.** You can cast spells as though you were standing in the illusion\'s space, though you still use your own senses.\n· **Distract.** When **both you and the illusion** are within 5 feet of a creature that can see the illusion, you have **Advantage on attack rolls** against it.\n· **Move.** As a **Bonus Action**, move the illusion up to **30 feet** to an unoccupied space you can see within **120 feet** of yourself.\n\nCasting from the illusion\'s space is the real prize: a Spirit Guardians or a Fireball originating 30 feet away while you stand safely back.',
        description: 'Channel Divinity: create a 1-minute duplicate you can cast spells from, move as a Bonus Action, and use for Advantage.',
      },
      {
        level: 6,
        name: 'Trickster\'s Transposition',
        body:
          'Whenever you take the **Bonus Action** to create **or** to move your Invoke Duplicity illusion, you can **teleport, swapping places with it**.\n\nThis costs nothing extra — it rides on the Bonus Action you were already spending. It is a 30-foot escape on creation and a 120-foot repositioning tool thereafter, and it does not provoke Opportunity Attacks because it is a teleport rather than movement.',
        description: 'When you create or move your duplicate, you can teleport and swap places with it.',
      },
      {
        level: 17,
        name: 'Improved Duplicity',
        body:
          'Your illusion stops being a personal trick and becomes a party asset.\n\n· **Shared Distraction.** **You and your allies** have **Advantage on attack rolls** against any creature within **5 feet of the illusion** — you no longer need to be adjacent to it yourself.\n· **Parting Gift.** When the illusion vanishes, **you or one creature within 5 feet of it** regains Hit Points equal to your **Cleric level**.\n\nAt level 17 that is Advantage for the whole party around a duplicate you can teleport-swap with, plus 17+ Hit Points every time it drops.',
        description: 'You and your allies get Advantage against creatures near the illusion, and it heals someone when it ends.',
      },
    ],
  },
  {
    key: 'war-domain',
    name: 'War Domain',
    classKey: 'cleric',
    system: 'dnd5e-2024',
    description: 'The god of the front line. Bonus Action attacks, a +10 that turns a miss into a hit, and free Spirit Guardians without Concentration.',
    alwaysPrepared: {
      3: ['Guiding Bolt', 'Magic Weapon', 'Shield of Faith', 'Spiritual Weapon'],
      5: ['Crusader\'s Mantle', 'Spirit Guardians'],
      7: ['Fire Shield', 'Freedom of Movement'],
      9: ['Hold Monster', 'Steel Wind Strike'],
    },
    features: [
      {
        level: 3,
        name: 'Guided Strike',
        body:
          'When **you, or a creature within 30 feet of you, misses with an attack roll**, you can spend one use of **Channel Divinity** to give that roll a **+10 bonus**, potentially turning the miss into a hit.\n\nThe 2024 version fires **after** you know the roll missed, so you never burn a use guessing — this is the single biggest change from the 2014 feature.\n\nIt works on any creature in range, so it is just as often the Barbarian\'s critical-fishing swing as your own.',
        description: 'Channel Divinity: after you or an ally within 30 feet misses, add +10 to that attack roll.',
      },
      {
        level: 3,
        name: 'War Priest',
        body:
          'As a **Bonus Action**, you can make **one attack** with a weapon or an Unarmed Strike.\n\nYou can do this a number of times equal to your **Wisdom modifier** (minimum once), and you regain all uses on a **Short or Long Rest** — a rest cadence generous enough that you can plan on it every fight.\n\nThis does not spend Channel Divinity, and it stacks with everything: Blessed Strikes: Divine Strike triggers on it, since Divine Strike is once per *turn*, not once per Attack action.',
        description: 'Bonus Action weapon attack, Wisdom-modifier times per Short or Long Rest.',
      },
      {
        level: 6,
        name: 'War God\'s Blessing',
        body:
          'Spend one use of **Channel Divinity** to cast **Shield of Faith** or **Spiritual Weapon** without expending a spell slot.\n\nCast this way, the spell **does not require Concentration**. Instead it simply lasts **1 minute**, ending early only if you cast that same spell again, become **Incapacitated**, or die.\n\nThis is what lets a War Cleric run Spirit Guardians on Concentration while a free, Concentration-less Spiritual Weapon swings alongside it.',
        description: 'Channel Divinity: cast Shield of Faith or Spiritual Weapon free and without Concentration for 1 minute.',
      },
      {
        level: 17,
        name: 'Avatar of Battle',
        body:
          'You gain **Resistance to Bludgeoning, Piercing, and Slashing damage**.\n\nThere is no magical-weapon exception and no duration — it is simply always on. Against the ordinary weapon attacks that make up the bulk of incoming damage in most fights, you are taking half.\n\nStacked on top of a d8 hit die and Heavy armor from Divine Order: Protector, this is the durability the domain has been promising since level 3.',
        description: 'You have permanent Resistance to Bludgeoning, Piercing, and Slashing damage.',
      },
    ],
  },
];
