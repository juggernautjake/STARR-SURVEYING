// lib/dnd/classes/dnd5e-2024/monk.ts — Monk, 2024 Player's Handbook.
//
// 2024 shape: Ki is renamed Focus Points and equals your Monk level (from level 2), the subclass
// moves to 3, and the Monk is the one martial class WITHOUT Weapon Mastery. Epic Boon at 19.
import type { ClassDefinition, SubclassDefinition } from '../types';

export const MONK_2024: ClassDefinition = {
  key: 'monk',
  name: 'Monk',
  system: 'dnd5e-2024',
  hitDie: 8,
  primaryAbility: ['dex', 'wis'],
  savingThrows: ['str', 'dex'],
  skillChoices: {
    count: 2,
    from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'],
  },
  armorProficiencies: [],
  weaponProficiencies: ['Simple weapons', 'Martial weapons that have the Light property'],
  toolProficiencies: ['One type of Artisan\'s Tools or one Musical Instrument of your choice'],
  asiLevels: [4, 8, 12, 16],
  subclassLevel: 3,
  subclassLabel: 'Monastic Tradition',
  description:
    'A disciplined martial artist who turns body and mind into a single weapon — striking faster than armor can answer, and spending Focus to bend a fight\'s shape.',
  startingEquipment: [
    'Spear, 5 Daggers, Artisan\'s Tools or Musical Instrument, Explorer\'s Pack, and 11 GP',
    'or 50 GP',
  ],
  resources: [
    {
      id: 'focus-points',
      name: 'Focus Points',
      // Index 0 unused. None at level 1; from level 2 onward Focus Points equal your Monk level.
      perLevel: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      resetOn: 'short',
      note: 'Focus Points equal your Monk level and return on a Short Rest or a Long Rest.',
    },
  ],
  features: [
    {
      level: 1,
      name: 'Martial Arts',
      body:
        'Your practice grants you mastery of unarmed combat and **Monk weapons** — Simple Melee weapons, plus Martial Melee weapons with the **Light** property, provided they lack the **Heavy** and **Special** properties.\n\nYou gain three benefits while unarmed or wielding only Monk weapons and wearing no armor and no Shield:\n· **Bonus Unarmed Strike** — you can make one **Unarmed Strike as a Bonus Action**.\n· **Martial Arts Die** — you can roll **1d6** in place of the normal damage of your Unarmed Strike or Monk weapons. The die grows to **1d8 at level 5**, **1d10 at level 11**, and **1d12 at level 17**.\n· **Dexterous Attacks** — you can use **Dexterity instead of Strength** for the attack and damage rolls of your Unarmed Strikes and Monk weapons, and for the DC of the **Grapple** and **Shove** options of your Unarmed Strike.',
    },
    {
      level: 1,
      name: 'Unarmored Defense',
      body:
        'While you are wearing **no armor** and **not wielding a Shield**, your base Armor Class equals **10 + your Dexterity modifier + your Wisdom modifier**.',
    },
    {
      level: 2,
      name: 'Monk\'s Focus',
      body:
        'Your training lets you harness a well of extraordinary energy. You have a number of **Focus Points equal to your Monk level**, and you regain **all** of them when you finish a **Short Rest or a Long Rest**.\n\nYou can spend them on three Focus features:\n· **Flurry of Blows** — spend **1 Focus Point** to make **two Unarmed Strikes** as a **Bonus Action**.\n· **Patient Defense** — you can take the **Disengage** action as a Bonus Action. Or you can spend **1 Focus Point** to take **both the Disengage and the Dodge** actions as a single Bonus Action.\n· **Step of the Wind** — you can take the **Dash** action as a Bonus Action. Or you can spend **1 Focus Point** to take **both the Disengage and the Dash** actions as a single Bonus Action, and your **jump distance is doubled** for the turn.',
    },
    {
      level: 2,
      name: 'Unarmored Movement',
      body:
        'Your **Speed increases by 10 feet** while you are wearing **no armor** and **not wielding a Shield**.\n\nThe bonus rises with your Monk level: **+15 feet at 6**, **+20 feet at 10**, **+25 feet at 14**, and **+30 feet at 18**.',
    },
    {
      level: 2,
      name: 'Uncanny Metabolism',
      body:
        'When you **roll Initiative**, you can **regain all expended Focus Points**.\n\nWhen you do, roll your **Martial Arts die** and **regain Hit Points equal to your Monk level + the number rolled**.\n\nOnce you use this feature, you cannot use it again until you finish a **Long Rest**.',
    },
    {
      level: 3,
      name: 'Monk Subclass',
      body:
        'You choose a **Monastic Tradition** — Warrior of Mercy, Warrior of Shadow, Warrior of the Elements, or Warrior of the Open Hand.\n\nThe subclass grants features now and again at Monk levels **6, 11, and 17**.',
      choice: 'subclass',
    },
    {
      level: 3,
      name: 'Deflect Attacks',
      body:
        'When an **attack roll hits you** and its damage includes **Bludgeoning, Piercing, or Slashing** damage, you can take a **Reaction** to reduce the attack\'s **total damage** by **1d10 + your Dexterity modifier + your Monk level**.\n\nIf you reduce the damage to **0**, you can **spend 1 Focus Point** to redirect some of the attack\'s force. Choose a creature you can see **within 5 feet** of yourself if the attack was melee, or **within 60 feet** otherwise. That creature must succeed on a **Dexterity saving throw** (DC = 8 + your Dexterity modifier + your Proficiency Bonus) or take damage equal to **two rolls of your Martial Arts die + your Dexterity modifier**. The damage is the same type as the attack you deflected.',
    },
    {
      level: 4,
      name: 'Slow Fall',
      body:
        'When you **fall**, you can take a **Reaction** to reduce the falling damage you take by an amount equal to **five times your Monk level**.',
    },
    {
      level: 5,
      name: 'Extra Attack',
      body: 'You can attack **twice**, instead of once, whenever you take the **Attack action** on your turn.',
    },
    {
      level: 5,
      name: 'Stunning Strike',
      body:
        '**Once per turn**, when you hit a creature with a **Monk weapon or an Unarmed Strike**, you can spend **1 Focus Point** to attempt a stunning strike. The target must make a **Constitution saving throw** (DC = 8 + your Wisdom modifier + your Proficiency Bonus).\n\n**Failure:** the target has the **Stunned** condition until the start of your next turn.\n\n**Success:** the target\'s **Speed is halved** until the start of your next turn, and the **next attack roll made against it** before then has **Advantage**.',
    },
    {
      level: 6,
      name: 'Empowered Strikes',
      body:
        'Whenever you deal damage with an **Unarmed Strike**, it can deal your choice of **Force damage** or its normal damage type.\n\nThis is decided each time you deal the damage, so you can pick whichever the target resists less.',
    },
    {
      level: 7,
      name: 'Evasion',
      body:
        'When you are subjected to an effect that lets you make a **Dexterity saving throw** to take only half damage, you instead take **no damage** on a success and **half damage** on a failure.\n\nYou cannot use this feature if you have the **Incapacitated** condition.',
    },
    {
      level: 9,
      name: 'Acrobatic Movement',
      body:
        'While you are **not wearing armor** and **not wielding a Shield**, you can move **along vertical surfaces and across liquids** on your turn without falling during the move.',
    },
    {
      level: 10,
      name: 'Heightened Focus',
      body:
        'Your three Focus features improve:\n· **Flurry of Blows** — you can make **three** Unarmed Strikes with it instead of two.\n· **Patient Defense** — when you spend a Focus Point on it, you also gain **Temporary Hit Points equal to two rolls of your Martial Arts die**.\n· **Step of the Wind** — when you spend a Focus Point on it, you can also **carry one willing creature** of Large size or smaller that is within 5 feet of you. It moves with you until the end of your turn, and its movement does not provoke Opportunity Attacks.',
    },
    {
      level: 10,
      name: 'Self-Restoration',
      body:
        'Through sheer force of will, you can remove one of the following conditions from yourself at the **end of each of your turns**: **Charmed**, **Frightened**, or **Poisoned**.\n\nIn addition, forgoing food and drink **no longer gives you levels of Exhaustion**.',
    },
    {
      level: 13,
      name: 'Deflect Energy',
      body:
        'You can now use **Deflect Attacks** against attacks that deal **any damage type**, not only Bludgeoning, Piercing, and Slashing.\n\nEverything else about the feature — the Reaction, the reduction, and the 1 Focus Point redirect — works as before.',
    },
    {
      level: 14,
      name: 'Disciplined Survivor',
      body:
        'Your discipline of body and mind grants you **proficiency in all saving throws**.\n\nIn addition, whenever you **make a saving throw and fail**, you can spend **1 Focus Point** to **reroll it**. You must use the new roll.',
    },
    {
      level: 15,
      name: 'Perfect Focus',
      body:
        'When you **roll Initiative** and **do not use Uncanny Metabolism**, you regain expended **Focus Points until you have 4** — provided you have **3 or fewer** at that moment.\n\nIt is the safety net for the fight you enter with an empty tank and Uncanny Metabolism already spent.',
    },
    {
      level: 18,
      name: 'Superior Defense',
      body:
        'At the **start of your turn**, you can spend **3 Focus Points** to bolster yourself against harm.\n\nFor **1 minute**, or until you have the **Incapacitated** condition, you have **Resistance to all damage except Force damage**.',
    },
    {
      level: 19,
      name: 'Epic Boon',
      body:
        'You gain an **Epic Boon feat** or another feat of your choice for which you qualify. **Boon of Irresistible Offense** pairs well with Empowered Strikes: it raises Strength or Dexterity by 1 (to a maximum of 30) and lets your attacks ignore one damage Resistance.',
      choice: 'epic-boon',
    },
    {
      level: 20,
      name: 'Body and Mind',
      body:
        'You have developed your body and mind to new heights. Your **Dexterity and Wisdom scores each increase by 4**, and the maximum for those two scores becomes **25**.',
    },
  ],
};

export const MONK_SUBCLASSES_2024: SubclassDefinition[] = [
  {
    key: 'warrior-of-mercy',
    name: 'Warrior of Mercy',
    classKey: 'monk',
    system: 'dnd5e-2024',
    description: 'A masked healer-killer who knows the body\'s pressure points well enough to mend it or stop it.',
    features: [
      {
        level: 3,
        name: 'Hand of Harm',
        body:
          '**Once per turn**, when you hit a creature with an **Unarmed Strike** and deal damage, you can spend **1 Focus Point** to deal extra **Necrotic damage** equal to **one roll of your Martial Arts die + your Wisdom modifier**.',
      },
      {
        level: 3,
        name: 'Hand of Healing',
        body:
          'As a **Magic action**, you can spend **1 Focus Point** to touch a creature and restore **Hit Points equal to a roll of your Martial Arts die + your Wisdom modifier**.\n\nWhen you use **Flurry of Blows**, you can **replace one of the Unarmed Strikes** with a use of this feature **without spending a Focus Point** for the healing.',
      },
      {
        level: 3,
        name: 'Implements of Mercy',
        body:
          'You gain proficiency in the **Insight** and **Medicine** skills, and proficiency with a **Herbalism Kit**.',
      },
      {
        level: 6,
        name: 'Physician\'s Touch',
        body:
          'Both hands grow more potent:\n· **Hand of Healing** — it also **ends one condition** on the target of your choice from: **Blinded, Deafened, Paralyzed, Poisoned, or Stunned**.\n· **Hand of Harm** — the target also has the **Poisoned** condition until the **end of your next turn**.',
      },
      {
        level: 11,
        name: 'Flurry of Healing and Harm',
        body:
          'When you use **Flurry of Blows**, you can **replace each of the Unarmed Strikes** with a use of **Hand of Healing**, without spending Focus Points for that healing.\n\nIn addition, when you make an Unarmed Strike as part of Flurry of Blows, you can use **Hand of Harm without spending a Focus Point** — still limited to once per turn. You can use this Focus-free Hand of Harm a number of times equal to your **Wisdom modifier** (minimum of once), regaining all uses on a **Long Rest**.',
      },
      {
        level: 17,
        name: 'Hand of Ultimate Mercy',
        body:
          'As a **Magic action**, you can touch the **corpse of a creature that died within the past 24 hours** and expend **5 Focus Points**.\n\nThe creature **returns to life** with **4d10 + your Wisdom modifier** Hit Points. If it died with any of the **Blinded, Deafened, Paralyzed, Poisoned, or Stunned** conditions, those end.\n\nOnce you use this feature, you cannot use it again until you finish a **Long Rest**.',
      },
    ],
  },
  {
    key: 'warrior-of-shadow',
    name: 'Warrior of Shadow',
    classKey: 'monk',
    system: 'dnd5e-2024',
    description: 'A monk of the Shadowfell who fights in a darkness of their own making, stepping between shadows to strike.',
    features: [
      {
        level: 3,
        name: 'Shadow Arts',
        body:
          'You gain three benefits:\n· **Darkness** — you can spend **1 Focus Point** to cast **Darkness** without a spell slot or components. While you **concentrate** on it, you can **see through** its area, and you can take a **Bonus Action** to move the area up to **60 feet**.\n· **Darkvision** — you gain **Darkvision** out to **60 feet**. If you already have it, its range increases by 60 feet.\n· **Shadowy Figments** — you know the **Minor Illusion** cantrip. **Wisdom** is your spellcasting ability for it.',
      },
      {
        level: 6,
        name: 'Shadow Step',
        body:
          'While you are in **Dim Light or Darkness**, you can take a **Bonus Action** to **teleport up to 60 feet** to an unoccupied space you can see that is also in Dim Light or Darkness.\n\nYou then have **Advantage on the next melee attack** you make before the end of the current turn.',
      },
      {
        level: 11,
        name: 'Improved Shadow Step',
        body:
          'When you use **Shadow Step**, you can spend **1 Focus Point** to lift its restrictions: you can use it **regardless of the illumination** you are in, and you **need not arrive** in Dim Light or Darkness.\n\nIn addition, you can make **one Unarmed Strike** immediately after you teleport, as part of the same Bonus Action.',
      },
      {
        level: 17,
        name: 'Cloak of Shadows',
        body:
          'As a **Magic action**, you can spend **3 Focus Points** to wrap yourself in shadow. For **1 minute**, you gain:\n· The **Invisible** condition.\n· The ability to **move through occupied spaces** as if they were **Difficult Terrain**; you take **1d10 Force damage** if you end your turn in another creature\'s space.\n· **Flurry of Blows** without spending Focus Points.\n\nThe effect ends early if you have the **Incapacitated** condition or if you **end your turn in Bright Light**.',
      },
    ],
  },
  {
    key: 'warrior-of-the-elements',
    name: 'Warrior of the Elements',
    classKey: 'monk',
    system: 'dnd5e-2024',
    description: 'A monk who channels elemental chaos through their strikes, reaching further and hitting with acid, cold, fire, lightning, or thunder.',
    features: [
      {
        level: 3,
        name: 'Elemental Attunement',
        body:
          'As a **Bonus Action**, you can spend **1 Focus Point** to surround yourself with elemental power for **10 minutes** or until you use this feature again. While it lasts:\n· **Reach** — your reach with **Unarmed Strikes increases by 10 feet**.\n· **Elemental Strikes** — once on each of your turns when you hit with an Unarmed Strike, you can deal **Acid, Cold, Fire, Lightning, or Thunder** damage instead of the normal type (choose the type when you gain this feature), and you can force the target to make a **Strength saving throw** (DC = 8 + your Wisdom modifier + your Proficiency Bonus) or be **pushed or pulled up to 10 feet**.',
      },
      {
        level: 3,
        name: 'Manipulate Elements',
        body:
          'You know the **Elementalism** cantrip. **Wisdom** is your spellcasting ability for it.',
      },
      {
        level: 6,
        name: 'Elemental Burst',
        body:
          'As a **Magic action**, you can spend **2 Focus Points** to create a **20-foot-radius Sphere** of elemental energy centred on a point you can see **within 120 feet**.\n\nChoose **Acid, Cold, Fire, Lightning, or Thunder**. Each creature in the Sphere must make a **Dexterity saving throw** (DC = 8 + your Wisdom modifier + your Proficiency Bonus), taking damage equal to **three rolls of your Martial Arts die** on a failure, or **half as much** on a success.',
      },
      {
        level: 11,
        name: 'Stride of the Elements',
        body:
          'While your **Elemental Attunement** is active, you have a **Fly Speed** and a **Swim Speed**, each equal to your **Speed**.',
      },
      {
        level: 17,
        name: 'Elemental Epitome',
        body:
          'While your **Elemental Attunement** is active, you gain the following, and you can change your damage-type choice each time you start a turn:\n· **Damage Resistance** — you have **Resistance** to the damage type you chose for Elemental Strikes.\n· **Destructive Stride** — when you use **Step of the Wind**, your **Speed increases by 20 feet** for that turn, and any creature you move within **5 feet** of takes damage equal to **one roll of your Martial Arts die** of your chosen type (once per turn per creature).\n· **Empowered Strikes** — once on each of your turns when you hit with an **Unarmed Strike**, you can deal extra damage of your chosen type equal to **one roll of your Martial Arts die**.',
      },
    ],
  },
  {
    key: 'warrior-of-the-open-hand',
    name: 'Warrior of the Open Hand',
    classKey: 'monk',
    system: 'dnd5e-2024',
    description: 'The purest expression of unarmed combat — every Flurry of Blows also addles, shoves, or floors its target.',
    features: [
      {
        level: 3,
        name: 'Open Hand Technique',
        body:
          'Whenever you hit a creature with an attack granted by **Flurry of Blows**, you can impose **one** of the following on that target (each once per Flurry):\n· **Addle** — the target **cannot make Opportunity Attacks** until the start of your next turn.\n· **Push** — the target must succeed on a **Strength saving throw** (DC = 8 + your Wisdom modifier + your Proficiency Bonus) or be **pushed up to 15 feet** away from you.\n· **Topple** — the target must succeed on a **Dexterity saving throw** against the same DC or have the **Prone** condition.',
      },
      {
        level: 6,
        name: 'Wholeness of Body',
        body:
          'As a **Bonus Action**, you can heal yourself for **one roll of your Martial Arts die + your Wisdom modifier** (minimum of 1 Hit Point).\n\nYou can use this feature a number of times equal to your **Wisdom modifier** (minimum of once), and you regain all expended uses when you finish a **Long Rest**.',
      },
      {
        level: 11,
        name: 'Fleet Step',
        body:
          'When you take a **Bonus Action** that is **not Step of the Wind**, you can **also use Step of the Wind** immediately after that Bonus Action — no second Bonus Action required.',
      },
      {
        level: 17,
        name: 'Quivering Palm',
        body:
          'When you hit a creature with an **Unarmed Strike**, you can spend **4 Focus Points** to start imperceptible vibrations in it. They last for a number of **days equal to your Monk level** and are harmless until you end them.\n\nWhen you take the **Attack action** on your turn, you can **forgo one of your attacks** to end the vibrations. You and the target must be on the **same plane of existence**. The target makes a **Constitution saving throw** (DC = 8 + your Wisdom modifier + your Proficiency Bonus), taking **10d12 Force damage** on a failure or **half as much** on a success.\n\nYou can have only **one creature** under this effect at a time, and you can end the vibrations harmlessly at any time (no action required).',
      },
    ],
  },
];
