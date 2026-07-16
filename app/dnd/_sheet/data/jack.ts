import type { Character } from '../types'
import { blankCharacter } from './blank'
import {
  RANGOR_FEATURES,
  FARMER_FEATURES,
  UNSTOPPABLE_FORCE_RESOURCE,
  bestUnarmoredAC,
  toughBonusHp,
} from './rangor'

// ===================================================================
// JACK — Rangor Pugilist 3 (Sweet Science), Farmer background.
// Neon Odyssey. A big, dumb, pleasant rock-brute who lugs a backless park
// bench around and hits like a landslide. Built on the shared sheet engine:
// blankCharacter + overrides + the Rangor/Farmer trait data (Slice 2).
// Spec: docs/planning/in-progress/DND_JACK_RANGOR_PUGILIST_2026-07-15.md
// ===================================================================

// ── Pugilist class + Sweet Science subclass feature cards (through L3, with the
//    key later features shown as locked previews via unlockLevel) ──────────────
const PUGILIST_FEATURES: Character['features'] = [
  {
    id: 'pug-fisticuffs',
    name: 'Fisticuffs',
    level: 'Lv 1',
    source: 'Class (Pugilist)',
    tone: 'gold',
    body: [
      'You have mastery over Unarmed Strikes and **Pugilist weapons** (simple melee + improvised — Jack’s park bench counts).',
      '**Fisticuffs die:** roll **1d8** in place of the normal damage of your Unarmed Strike or a Pugilist weapon (grows to 1d10 at 5, 1d12 at 11, 2d6 at 17).',
      '**Bonus Unarmed Strike:** you can make an Unarmed Strike as a **Bonus Action**.',
      '**Improved Improvisation:** improvised weapons count as having the **Sap** mastery for you.',
    ],
  },
  {
    id: 'pug-iron-chin',
    name: 'Iron Chin',
    level: 'Lv 1',
    source: 'Class (Pugilist)',
    body: [
      'While in Light or no armor and not wielding a Shield, your base **AC = 12 + your CON modifier**.',
      'Jack also has Rangor **Natural Armor** (13 + DEX). The sheet uses whichever is higher.',
    ],
  },
  {
    id: 'pug-moxie',
    name: 'Moxie',
    level: 'Lv 2',
    unlockLevel: 2,
    source: 'Class (Pugilist)',
    tone: 'gold',
    body: [
      'Swagger you channel mid-fight as **Moxie Points** (see the Resources tab). Spend them to fuel:',
      '• **Brace Up** (BA, 1 Moxie): roll your Fisticuffs die and gain that + level + CON **temp HP**.\n• **One-Two Punch** (1 Moxie): make **two** Unarmed Strikes as a Bonus Action.\n• **Stick and Move** (BA, 1 Moxie): an Unarmed Strike **and** Dash or Disengage.',
    ],
    use: { label: 'Spend Moxie', resourceId: 'moxie', rollKind: 'raw', note: 'Spent 1 Moxie Point.' },
  },
  {
    id: 'pug-bloodied-but-unbowed',
    name: 'Bloodied But Unbowed',
    level: 'Lv 2',
    unlockLevel: 2,
    source: 'Class (Pugilist)',
    body: [
      'When you take damage, you can take a **Reaction to regain all your expended Moxie**. If you are **Bloodied** when you do, also gain **temp HP equal to 4 × your Pugilist level**.',
      'Once used, recharges on a Short or Long Rest.',
    ],
  },
  {
    id: 'pug-swagger-streak',
    name: 'Swagger Streak',
    level: 'Lv 2',
    unlockLevel: 2,
    source: 'Class (Pugilist)',
    body: [
      'When you fail a Str, Dex, Con, or Cha check, spend a Moxie Point and add your **Fisticuffs die** to it — maybe turning the fail into a success. If it still fails, you get the Moxie back (once per Short/Long Rest).',
    ],
  },
  {
    id: 'pug-heavy-hitter',
    name: 'Heavy Hitter',
    level: 'Lv 3',
    unlockLevel: 3,
    source: 'Class (Pugilist)',
    tone: 'gold',
    body: [
      'When you hit a creature with an **Unarmed Strike**, you can use **both** the Damage **and** your choice of the **Grapple** or **Shove** option.',
    ],
  },
  {
    id: 'pug-sweet-science',
    name: 'Sweet Science — Bare Knuckle Boxer',
    level: 'Lv 3',
    unlockLevel: 3,
    source: 'Subclass (Sweet Science)',
    tone: 'gold',
    flavor: 'Float like a butterfly, sting like a bee.',
    body: [
      'Your subclass. **Bare Knuckle Boxer:** your attack rolls with **Unarmed Strikes score a Critical Hit on a 19 or 20** (the Attacks tab shows Jack’s fists at crit 19–20).',
    ],
  },
  {
    id: 'pug-cross-counter',
    name: 'Cross Counter',
    level: 'Lv 3',
    unlockLevel: 3,
    source: 'Subclass (Sweet Science)',
    body: [
      'When you take damage from a **melee attack**, take a **Reaction** and spend **1 Moxie** to reduce that damage by **1d10 + STR mod + Pugilist level**.',
      'If you reduce the damage to **0**, you can immediately make an **Unarmed Strike** (or attack with a Pugilist weapon) against a creature within reach as part of the same Reaction.',
    ],
    use: { label: 'Cross Counter', resourceId: 'moxie', roll: '1d10+3', rollKind: 'raw', note: 'Reduced melee damage by 1d10 + STR + level.' },
  },
  // Locked previews (revealed as Jack levels up — the engine gates by unlockLevel).
  {
    id: 'pug-extra-attack',
    name: 'Extra Attack / Haymaker',
    level: 'Lv 5',
    unlockLevel: 5,
    source: 'Class (Pugilist)',
    body: ['Attack twice when you take the Attack action; **Haymaker** lets you spend 1 Moxie to deal max damage on a hit (regained on a hit).'],
  },
  {
    id: 'pug-knock-out',
    name: 'Sweet Science — Knock Out',
    level: 'Lv 17',
    unlockLevel: 17,
    source: 'Subclass (Sweet Science)',
    body: ['**Coldcock** (crit → Con save or Unconscious 1 min) and **Uppercut** (Reaction + Moxie to turn a hit into a Critical Hit).'],
  },
]

// The Pugilist class table (L1–20). The two generic middle columns (col3/col4) are labelled
// Fisticuffs / Moxie via progressionMeta.
const PUGILIST_PROGRESSION: Character['progression'] = [
  { level: 1, prof: '+2', col3: '1d8', col4: '—', features: 'Fisticuffs, Iron Chin' },
  { level: 2, prof: '+2', col3: '1d8', col4: '2', features: 'Moxie, Bloodied But Unbowed, Swagger Streak' },
  { level: 3, prof: '+2', col3: '1d8', col4: '2', features: 'Heavy Hitter, Pugilist Subclass', here: true },
  { level: 4, prof: '+2', col3: '1d8', col4: '3', features: 'Ability Score Improvement, Dig Deep' },
  { level: 5, prof: '+3', col3: '1d10', col4: '3', features: 'Extra Attack, Haymaker' },
  { level: 6, prof: '+3', col3: '1d10', col4: '4', features: 'Moxie-Fueled Fists, Subclass feature' },
  { level: 7, prof: '+3', col3: '1d10', col4: '4', features: 'Down But Not Out' },
  { level: 8, prof: '+3', col3: '1d10', col4: '5', features: 'Ability Score Improvement' },
  { level: 9, prof: '+4', col3: '1d10', col4: '5', features: 'School of Hard Knocks' },
  { level: 10, prof: '+4', col3: '1d10', col4: '6', features: 'Herculean, Shake It Off' },
  { level: 11, prof: '+4', col3: '1d12', col4: '6', features: 'Subclass feature' },
  { level: 12, prof: '+4', col3: '1d12', col4: '7', features: 'Ability Score Improvement' },
  { level: 13, prof: '+5', col3: '1d12', col4: '7', features: 'Dig Deeper' },
  { level: 14, prof: '+5', col3: '1d12', col4: '8', features: 'Unbreakable' },
  { level: 15, prof: '+5', col3: '1d12', col4: '8', features: 'Pugnacious' },
  { level: 16, prof: '+5', col3: '1d12', col4: '9', features: 'Ability Score Improvement' },
  { level: 17, prof: '+6', col3: '2d6', col4: '9', features: 'Subclass feature' },
  { level: 18, prof: '+6', col3: '2d6', col4: '10', features: 'Fighting Spirit' },
  { level: 19, prof: '+6', col3: '2d6', col4: '11', features: 'Epic Boon' },
  { level: 20, prof: '+6', col3: '2d6', col4: '12', features: 'Peak Physical Condition' },
]

/** Jack — the Rangor Pugilist. A function so the character-create API can seed a fresh copy. */
export function jack(name = 'Jack'): Character {
  const c = blankCharacter(name)
  const abilities = { str: 17, dex: 13, con: 15, int: 6, wis: 11, cha: 10 }
  const dexMod = Math.floor((abilities.dex - 10) / 2)
  const conMod = Math.floor((abilities.con - 10) / 2)
  const ac = bestUnarmoredAC(dexMod, conMod)
  const level = 3
  // d10 Pugilist: max at L1 + avg (6) per later level + CON each level + Tough (2×level).
  const maxHp = 10 + 6 * (level - 1) + conMod * level + toughBonusHp(level)

  c.meta = {
    name,
    kicker: 'Neon Odyssey · Character Dossier',
    role: 'Rangor · Pugilist 3 · Sweet Science',
    species: 'Rangor',
    className: 'Pugilist',
    subclass: 'Sweet Science',
    level,
    chips: [
      { text: 'Unstoppable Force', tone: 'gold' },
      { text: 'Bare Knuckle Boxer', tone: 'pink' },
      { text: 'Carries a park bench', tone: 'teal' },
    ],
  }
  c.abilities = abilities
  c.primaryAbilities = ['str']
  c.saves.str.proficient = true
  c.saves.con.proficient = true
  // 2 class skills (Athletics, Intimidation) + Farmer background (Animal Handling, Nature).
  for (const k of ['athletics', 'intimidation', 'animal', 'nature']) c.skills[k].prof = 'proficient'

  c.combat = {
    ...c.combat,
    ac: ac.ac,
    acNote: `${ac.source} — Rangor Natural Armor (13 + DEX) / Iron Chin (12 + CON), whichever is higher`,
    speed: 30,
    speedNote: 'Rangor',
    maxHp,
    currentHp: maxHp,
    hitDiceSize: 10,
    hitDiceTotal: level,
    hitDiceRemaining: level,
  }

  c.resources = [
    { id: 'moxie', name: 'Moxie Points', max: 2, current: 2, color: 'pink', resetOn: 'short', note: 'Swagger you spend on Brace Up, One-Two Punch, Stick and Move, Swagger Streak, and Cross Counter.' },
    { ...UNSTOPPABLE_FORCE_RESOURCE },
  ]

  c.attacks = [
    {
      id: 'unarmed', name: 'Unarmed Strike (Fisticuffs)', ability: 'str', proficient: true,
      range: 'Melee (reach 5 ft)', damage: '1d8', damageType: 'bludgeoning', strMelee: true,
      notes: 'Fisticuffs die (1d8). Crits on 19–20 (Bare Knuckle Boxer). Bonus-action Unarmed Strike available; on a hit, free Grapple or Shove (Heavy Hitter).',
    },
    {
      id: 'park-bench', name: 'Backless Park Bench', ability: 'str', proficient: true,
      range: 'Melee (reach 5 ft)', damage: '1d8', damageType: 'bludgeoning', strMelee: true,
      notes: 'Improvised two-handed Pugilist weapon — uses the Fisticuffs die. Has the Sap mastery (Improved Improvisation). Also: a fine place to sit.',
    },
  ]

  // Jack's own level math: d10 Pugilist + the Farmer's Tough feat (+2 HP/level). No speed
  // ladder and no form-damage ladder — he has neither Fast Movement nor Rage.
  c.levelRules = { hitDie: 10, bonusHpPerLevel: 2 }
  c.traits = [
    '**Natural Armor** (Rangor): unarmored AC 13 + DEX — the sheet uses this or Iron Chin (12 + CON), whichever is higher.',
    '**Powerful Build**: count as one size larger for carrying capacity and what you can push, drag, or lift.',
    '**Unstoppable Force**: twice per long rest, ignore an effect that would reduce your speed or move you unwillingly.',
  ]
  c.features = [...RANGOR_FEATURES, ...PUGILIST_FEATURES, ...FARMER_FEATURES]
  c.progression = PUGILIST_PROGRESSION
  c.progressionMeta = {
    title: 'The Pugilist',
    lead: 'Fisticuffs die grows and Moxie deepens as Jack levels. Features above his current level are locked.',
    col3: 'Fisticuffs',
    col4: 'Moxie',
  }

  c.inventory = [
    { id: 'bench', name: 'Backless Park Bench', desc: 'A heavy iron-and-slat park bench, no backrest. Jack thwacks foes with it (improvised weapon, Fisticuffs die, Sap mastery) — and sits on it when he’s tired.', qty: 1, tags: ['weapon', 'flavor'] },
    { id: 'sickle', name: 'Sickle', desc: 'Simple farm blade.', qty: 1, tags: ['weapon'] },
    { id: 'carpenter', name: "Carpenter's Tools", desc: 'Proficient (Farmer background).', qty: 1, tags: ['flavor'] },
    { id: 'healers-kit', name: "Healer's Kit", desc: '10 uses — stabilize a dying creature with no check.', qty: 1, tags: ['consumable'] },
    { id: 'iron-pot', name: 'Iron Pot', desc: 'Doubles as a helmet, sometimes.', qty: 1, tags: ['flavor'] },
    { id: 'shovel', name: 'Shovel', desc: 'For honest work.', qty: 1, tags: ['flavor'] },
    { id: 'travelers-clothes', name: "Traveler's Clothes", desc: 'Extra-large.', qty: 1, tags: ['flavor'] },
  ]
  c.currency = { credits: 30, harmonyte: 0, scrip: 0 }

  c.bio = {
    intro: [
      'Jack is a **Rangor** — one of the galaxy’s largest species, aether-and-gravity kin to the Aetheron. Where the Aetheron are the *immovable object*, the Rangor are the **Unstoppable Force**: once Jack gets moving, he does not stop.',
      'Homeworld: **Titan IX**, the moon-sized station the Rangor share with the Aetheron after their planet was lost aeons ago.',
    ],
    appearance: [
      'Enormous and stone-plated — a big rock-looking brute with an **animalistic, lion-like head** and a shaggy **mane**, small horns, and one glowing violet eye. Think a gargoyle with no wings and a mane. Slabs of rocky scale plate his shoulders, arms, and legs.',
    ],
    personality: [
      'Big, dumb, and **pleasant**. Genuinely **nice and law-abiding at heart** — he just has no idea what most laws actually *are*, so he breaks them by accident with total innocence.',
      'Slow to anger and easily delighted, but when he finally gets **mad** he **fights**, and he hits like a landslide. Gentle giant, low cunning, enormous heart.',
    ],
    background: 'A Farmer who grew up close to the land — patient, hardy, good with animals. He wandered off Titan IX’s agri-decks into the wider Neon Odyssey and mostly just wants to help (and to keep his bench).',
    playTips: [
      'Lead with movement: Living Momentum triggers after moving 15 ft in a straight line — charge in for a push, a prone, or bonus damage.',
      'Spend Moxie freely; Bloodied But Unbowed and Swagger Streak often hand it right back.',
      'Cross Counter punishes anyone who melees Jack — reduce the hit, and if it drops to 0, swing back for free.',
    ],
  }
  c.balance = {
    synergies: [
      'Natural Armor + Iron Chin + Tough make Jack extremely hard to drop even with no armor.',
      'Charge → Living Momentum → Heavy Hitter stacks a shove/prone with damage every turn.',
    ],
    weaknesses: [
      'Int 6 and no ranged game — Jack is easy to mislead and can be kited.',
      'Moxie is a small pool at low levels; big turns burn it fast.',
    ],
  }
  c.dmNote = 'Jack is comic-relief muscle with a heart of gold. Lean into the “law-abiding but clueless” bit for roleplay; he’ll happily wreck a room and then apologize.'

  c.tokenFocus = { x: 50, y: 22, zoom: 1.1 }
  return c
}
