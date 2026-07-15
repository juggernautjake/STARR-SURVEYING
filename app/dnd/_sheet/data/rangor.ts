import type { FeatureBlock, Resource } from '../types'

// ===================================================================
// RANGOR (species) + FARMER (background) — shared trait data for Jack.
// Neon Odyssey · the Rangor are the galaxy's "Unstoppable Force" (aether/
// gravity kin of the Aetheron's "immovable object"), homeworld Titan IX.
// These are reusable FeatureBlocks + the small engine hooks (natural-armor
// AC, Tough HP) that jack.ts (Slice 3) composes into the full character.
// Spec: docs/planning/in-progress/DND_JACK_RANGOR_PUGILIST_2026-07-15.md
// ===================================================================

// ── Engine hooks ────────────────────────────────────────────────────────────

/** Rangor rocklike scales — unarmored AC while wearing no armor. */
export function naturalArmorAC(dexMod: number): number {
  return 13 + dexMod
}

/** Pugilist "Iron Chin" — unarmored AC (class trait, combined here for Jack's best-of). */
export function ironChinAC(conMod: number): number {
  return 12 + conMod
}

/**
 * Jack has TWO unarmored formulas (Rangor natural armor 13+DEX and Iron Chin 12+CON) plus the
 * default 10+DEX; the sheet uses whichever is highest. Returns the AC and which trait wins.
 */
export function bestUnarmoredAC(dexMod: number, conMod: number): { ac: number; source: string } {
  const options = [
    { ac: 10 + dexMod, source: 'Unarmored' },
    { ac: naturalArmorAC(dexMod), source: 'Natural Armor' },
    { ac: ironChinAC(conMod), source: 'Iron Chin' },
  ]
  return options.reduce((best, o) => (o.ac > best.ac ? o : best))
}

/** Farmer's origin Feat: Tough — HP max increases by 2 × character level. */
export function toughBonusHp(level: number): number {
  return 2 * Math.max(1, level)
}

/** The 2/long-rest Unstoppable Force pips (drop into a character's `resources`). */
export const UNSTOPPABLE_FORCE_RESOURCE: Resource = {
  id: 'unstoppable-force',
  name: 'Unstoppable Force',
  max: 2,
  current: 2,
  color: 'gold',
  resetOn: 'long',
  note: 'Spend a pip to ignore an effect that would slow you or move you unwillingly.',
}

// ── Trait cards ─────────────────────────────────────────────────────────────

export const RANGOR_FEATURES: FeatureBlock[] = [
  {
    id: 'rangor-natural-armor',
    name: 'Natural Armor (Rocklike Scales)',
    level: 'Rangor',
    source: 'Species (Rangor)',
    body: [
      'The rocklike scales plating your body grant protection. While you are **not wearing armor**, your **AC = 13 + your DEX modifier**.',
      "Jack also has the Pugilist's **Iron Chin** (12 + CON). The sheet's AC always uses whichever is higher — no need to track it.",
    ],
  },
  {
    id: 'rangor-living-momentum',
    name: 'Living Momentum',
    level: 'Rangor',
    source: 'Species (Rangor)',
    tone: 'gold',
    body: [
      'The internal momentum of the Rangor. When you **hit** with an attack roll after moving at least **15 ft in a straight line**, choose one:',
      '• **Push** the target 15 ft straight away from you.\n• Knock the target **Prone** (it makes a Strength save vs your 8 + STR mod + Proficiency).\n• Deal **extra damage** equal to your **Strength modifier**.',
    ],
  },
  {
    id: 'rangor-powerful-build',
    name: 'Powerful Build',
    level: 'Rangor',
    source: 'Species (Rangor)',
    body: [
      'You count as **one size larger** when determining your carrying capacity and the weight you can **push, drag, or lift**.',
    ],
  },
  {
    id: 'rangor-unstoppable-force',
    name: 'Unstoppable Force',
    level: 'Rangor',
    source: 'Species (Rangor)',
    tone: 'gold',
    body: [
      "The Rangor are the galaxy's Unstoppable Force. **Twice per long rest**, when an effect would **reduce your speed** or **forcibly move you unwillingly**, you can **ignore** that effect.",
    ],
    use: {
      label: 'Ignore (Unstoppable Force)',
      resourceId: 'unstoppable-force',
      rollKind: 'raw',
      note: 'Ignored a speed reduction / forced movement (Unstoppable Force).',
    },
  },
]

export const FARMER_FEATURES: FeatureBlock[] = [
  {
    id: 'farmer-background',
    name: 'Farmer (Background)',
    level: 'Origin',
    source: 'Background',
    body: [
      'You grew up close to the land. Years tending animals and cultivating the earth rewarded you with patience and good health.',
      'Grants proficiency in **Animal Handling** and **Nature**, and with **Carpenter’s Tools**.',
    ],
  },
  {
    id: 'feat-tough',
    name: 'Tough',
    level: 'Feat',
    source: 'Feat (Farmer)',
    tone: 'teal',
    body: [
      'Your **Hit Point maximum increases by twice your character level** when you gain this feat, and by an **additional 2 HP** every character level thereafter.',
    ],
  },
]
