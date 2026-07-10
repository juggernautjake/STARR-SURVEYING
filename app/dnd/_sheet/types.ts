import type { AbilityKey, ProfLevel } from './rules/dnd'
import type { Effect } from './engine/effects'

export interface Attack {
  id: string
  name: string
  ability: AbilityKey // ability used for to-hit + damage
  proficient: boolean
  range: string
  damage: string // e.g. "1d6" (mods are added from ability + rage automatically)
  damageType: string
  bonusToHit?: number // extra flat to-hit beyond ability+prof
  bonusDamage?: number // extra flat damage beyond ability
  strMelee?: boolean // affected by Reckless Attack advantage
  rageable?: boolean // gains rage damage while raging (STR attacks)
  formOnly?: string // form id that must be active (e.g. "brute")
  unlockLevel?: number // character level required (default 1)
  saveBased?: boolean // AOE: targets make a save vs your DC instead of you rolling to hit
  saveAbility?: AbilityKey // which save the targets roll (e.g. dex, con)
  aoe?: string // short AOE descriptor, e.g. "60-ft line"
  notes?: string
}

export interface FeatureBlock {
  id: string
  name: string
  level?: string
  unlockLevel?: number // character level required (default 1)
  source: string // Class / Species / Signature / Feat / Background
  body: string[] // paragraphs (markdown-lite: **bold**, *em*)
  flavor?: string
  tone?: 'default' | 'pink' | 'teal' | 'gold'
}

export interface FormAbility {
  id: string
  name: string
  desc: string
  uses?: number // uses per transformation; omit/0 = at-will until the form ends
  attack?: { damage: string; damageType: string; saveAbility?: AbilityKey; aoe?: string }
}

export interface CharForm {
  id: string
  name: string
  subtitle: string
  cls: string // css class f-base etc.
  unlockLevel: number
  gating: 'held' | 'surged' | 'locked'
  flavor: string
  bullets: string[]
  durationTurns?: number // how many turns you can hold this as a Surge/transformation
  strikeDie?: string // unarmed-strike die while in this form (basic-attack buff)
  abilities?: FormAbility[]
  note?: { title: string; body: string }
}

export interface Resource {
  id: string
  name: string
  max: number
  current: number
  color: 'pink' | 'teal' | 'gold'
  resetOn: 'short' | 'long'
  unlockLevel?: number // character level required (default 1)
  note?: string
}

/** One typed damage component, e.g. { dice: '2d8', type: 'slashing' }. Reused by the weapon
 *  builder and the typed dice roller so a weapon can deal 2d8 slashing + 1d6 poison. */
export interface TypedDamage {
  dice: string
  type: string
}

export type ItemKind = 'weapon' | 'armor' | 'shield' | 'consumable' | 'wondrous' | 'gear'

export interface WeaponStats {
  ability?: AbilityKey // to-hit + damage ability (default STR; DEX if finesse/ranged)
  proficient?: boolean
  toHitBonus?: number
  range?: string
  damage: TypedDamage // primary damage
  bonus?: TypedDamage[] // extra typed dice, e.g. [{ dice: '1d6', type: 'poison' }]
  properties?: string[] // finesse, versatile, thrown, two-handed, …
}

export interface ArmorStats {
  category: 'light' | 'medium' | 'heavy' | 'shield'
  baseAC?: number // body-armor base AC, or a shield's flat bonus
  dexCap?: number | null // medium = 2, heavy = 0, light = null (uncapped)
  stealthDisadvantage?: boolean
}

export interface ConsumableStats {
  effect: {
    kind: 'heal' | 'temp' | 'status' | 'custom'
    dice?: string // for heal/temp, e.g. '2d4+2'
    status?: string // condition name for kind 'status'
    note?: string
  }
}

export interface InvItem {
  id: string
  name: string
  desc: string
  qty: number
  tags: ('equipped' | 'weapon' | 'consumable' | 'tech' | 'flavor')[]
  use?: { label: string; expr: string; kind: 'heal' | 'temp' | 'damage' }
  // ── Homebrew item-builder fields (Phase: DND_ITEM_BUILDER). All optional so existing
  //    items and old exports keep working; readers must be defensive.
  kind?: ItemKind
  equipped?: boolean
  attuned?: boolean
  weapon?: WeaponStats
  armor?: ArmorStats
  consumable?: ConsumableStats
  effects?: Effect[] // passive bonuses while equipped/attuned (engine Effect shape)
}

export interface SkillState {
  prof: ProfLevel
  misc: number
}

export interface CustomSkill {
  id: string
  label: string
  ability: AbilityKey // which ability score it's based on
  prof: ProfLevel
  misc: number
}

export interface SaveState {
  proficient: boolean
  misc: number
}

export interface ProgressionRow {
  level: number
  prof: string
  rages: string
  rageDmg: string
  features: string
  here?: boolean
}

export interface Character {
  meta: {
    name: string
    kicker: string
    role: string
    species: string
    className: string
    subclass: string
    level: number
    chips: { text: string; tone?: 'pink' | 'teal' | 'gold' }[]
  }
  inspiration: boolean
  profBonusOverride?: number | null
  // When a value is edited in Temporary mode, its ORIGINAL value is stored here
  // (keyed by a stable path) so it can be reverted with one click.
  tempOverrides: Record<string, number>
  abilities: Record<AbilityKey, number>
  primaryAbilities: AbilityKey[]
  saves: Record<AbilityKey, SaveState>
  skills: Record<string, SkillState>
  customSkills: CustomSkill[]
  combat: {
    ac: number
    acNote: string
    speed: number
    speedNote: string
    initiativeMisc: number
    maxHp: number
    currentHp: number
    tempHp: number
    hitDiceSize: number
    hitDiceTotal: number
    hitDiceRemaining: number
    deathSuccess: number
    deathFail: number
    deathSaveBonus: number // Jenovan: prof to death saves
    rageDamageBonus: number // +damage on STR attacks while transformed (Surged)
    saveDCOverride?: number | null // if set, overrides the derived 8+PB+STR save DC
    // ── Transformation ("Surge") state ──
    transformActive: boolean // currently Surged into your top form
    transformTurnsLeft: number // turns remaining before it ends
    transformsThisRest: number // how many times you've Surged since the last long rest
    exhaustion: number // 0–6; each level −2 to d20 rolls (applied automatically)
    abilityUses: Record<string, number> // remaining uses of the active form's limited abilities (reset each Surge)
    // Combat state trackers (Phase L6). Optional so existing data stays valid.
    concentration?: string // spell being concentrated on ('' / undefined = not concentrating)
    conditions?: string[] // active conditions (poisoned, prone, …)
  }
  resources: Resource[]
  forms: CharForm[]
  activeFormId: string
  attacks: Attack[]
  features: FeatureBlock[]
  progression: ProgressionRow[]
  /** Optional per-character labels for the progression table (defaults to Lazzuh's
   *  barbarian columns). Lets non-barbarians relabel the two middle columns + lead. */
  progressionMeta?: { title?: string; lead?: string; col3?: string; col4?: string }
  inventory: InvItem[]
  currency: { credits: number; harmonyte: number; scrip: number }
  bio: {
    intro: string[]
    appearance: string[]
    personality: string[]
    background: string
    playTips: string[]
  }
  balance: {
    synergies: string[]
    weaknesses: string[]
  }
  dmNote: string
  /** How the round token/icon is cropped from the token/art image (D2). `x`/`y` are
   *  the focus point (0–100% of the image) centered in the circle; `zoom` (≥1) tightens
   *  the crop. Omitted → sensible default (centered, or top for full-body art). */
  tokenFocus?: { x: number; y: number; zoom: number }
  /** Chosen visual variant for skins that offer more than one (§6.9, streamer). The
   *  engine applies the matching color theme + `.variant-<id>` class. */
  skinVariant?: 'pink' | 'blue'
  /** Per-variant art + token URLs, so switching the style swaps the character art
   *  too. Falls back to the DB art_url/token_url (media) when a variant is unset. */
  variantArt?: {
    pink?: { art?: string | null; token?: string | null }
    blue?: { art?: string | null; token?: string | null }
  }
}
