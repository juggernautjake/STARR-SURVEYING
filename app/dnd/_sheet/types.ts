import type { AbilityKey, ProfLevel } from './rules/dnd'
import type { Effect } from './engine/effects'

export interface Attack {
  id: string
  name: string
  ability: AbilityKey // ability used for to-hit + damage
  proficient: boolean
  range: string
  damage: string // e.g. "1d6" (ability + form damage mods are added automatically)
  damageType: string
  bonusToHit?: number // extra flat to-hit beyond ability+prof
  bonusDamage?: number // extra flat damage beyond ability
  strMelee?: boolean // a STR-based melee attack (eligible for advantage-granting features)
  formBoosted?: boolean // gains combat.formDamageBonus while a form/transformation is active
  formOnly?: string // form id that must be active (e.g. "brute")
  /** This attack's damage die follows the ACTIVE form's `strikeDie` (an unarmed strike that
   *  grows as you transform). Character-owned, so no attack id is special-cased in the engine. */
  usesFormStrikeDie?: boolean
  /** Damage die ladder by character level, e.g. [{level:1,damage:'1d8'},{level:6,damage:'1d10'}].
   *  The highest entry at or below the current level wins. Omit = fixed `damage`. */
  damageByLevel?: { level: number; damage: string }[]
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
  /** Makes the feature USABLE from the sheet: spend a resource (by id) and/or roll a die,
   *  applying heal/temp HP. Shown as a button on the feature card. */
  use?: {
    label: string
    resourceId?: string // resource whose `current` decrements on use
    roll?: string // dice expr to roll, e.g. '1d8+3'
    rollKind?: 'damage' | 'heal' | 'temp' | 'raw'
    note?: string // shown in the log for non-dice uses
  }
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
    /** heal = restore HP · temp = grant temp HP · status = apply a condition · buff = grant
     *  temporary Effects (spell DC, ability, AC…) · custom = note-only, DM adjudicates. */
    kind: 'heal' | 'temp' | 'status' | 'buff' | 'custom'
    dice?: string // heal/temp: dice rolled, e.g. '2d4+2'
    status?: string // status: condition granted, e.g. 'Invisible', 'Blessed'
    duration?: string // status/buff: how long, e.g. '10 minutes', '3 rounds', '1 hour'
    effects?: Effect[] // buff: temporary bonuses (e.g. +1 spell save DC, +2 DEX)
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
  image?: string // uploaded item artwork URL (dnd-media bucket, kind='item')
  weapon?: WeaponStats
  armor?: ArmorStats
  consumable?: ConsumableStats
  effects?: Effect[] // passive bonuses while equipped/attuned (engine Effect shape)
}

/** A temporary effect currently applied to the character (from a consumed buff/potion or a
 *  DM boon). Shown in the Active-Effects tracker; removable by the player or DM. */
export interface ActiveEffect {
  id: string
  label: string // e.g. "Potion of Storm Giant Strength"
  effects: Effect[] // the bonuses granted while active
  duration?: string // e.g. "1 hour", "3 rounds"
  source?: string // where it came from (item name)
}

export type SpellLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 // 0 = cantrip

/** A defined, castable spell (DND_SPELLS_AND_ABILITIES). Damage is typed so it reuses the
 *  item-builder's typed roller; save/attack drive how casting resolves. */
export interface Spell {
  id: string
  name: string
  level: SpellLevel
  school?: string
  /** Prepared/known and usable. Cantrips + domain/feat spells are effectively always on. */
  prepared?: boolean
  /** Domain/feat spells that don't count against the prepared cap. */
  alwaysPrepared?: boolean
  castTime?: string
  range?: string
  components?: string
  duration?: string
  concentration?: boolean
  ritual?: boolean
  description: string
  alias?: string // display alias, e.g. "Spotlight" for Guiding Bolt
  attack?: boolean // spell attack roll (castingMod + PB)
  save?: { ability: AbilityKey; effect: string } // targets save vs your spell DC
  damage?: TypedDamage[] // typed damage components
  heal?: string // healing dice, e.g. "1d4"
  higher?: string // "at higher levels" scaling text
}

export interface SpellcastingInfo {
  ability: AbilityKey
  preparedCap?: number // WIS mod + level, etc.
  /** Spell slots per level (1–9); cantrips don't use slots. */
  slots?: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, { max: number; current: number }>>
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

/** One row of a class-progression table. The two middle columns are GENERIC: each character
 *  labels them via `progressionMeta.col3`/`col4` (e.g. Fisticuffs/Moxie for a Pugilist, Spell
 *  Slots/Cantrips for a Warlock, Rages/Rage Dmg for a Barbarian). `rages`/`rageDmg` are the
 *  legacy names for these columns, still read from stored sheets (see normalizeCharacter). */
export interface ProgressionRow {
  level: number
  prof: string
  col3: string
  col4: string
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
    deathSaveBonus: number // flat bonus to death saves (some species/feats grant one)
    /** +damage on melee attacks flagged `formBoosted` while a form/transformation is active.
     *  Generic: a Barbarian's Rage damage, a Pugilist's fired-up bonus, etc. Legacy name:
     *  `rageDamageBonus` (still read from stored sheets — see normalizeCharacter). */
    formDamageBonus: number
    saveDCOverride?: number | null // if set, overrides the derived 8+PB+STR save DC
    // ── Form/transformation state (only characters with the `forms` module use these) ──
    transformActive: boolean // currently transformed into your top form
    transformTurnsLeft: number // turns remaining before it ends
    transformsThisRest: number // how many times you've transformed since the last long rest
    exhaustion: number // 0–6; each level −2 to d20 rolls (applied automatically)
    abilityUses: Record<string, number> // remaining uses of the active form's limited abilities (reset on transform)
    // Combat state trackers (Phase L6). Optional so existing data stays valid.
    concentration?: string // spell being concentrated on ('' / undefined = not concentrating)
    conditions?: string[] // active conditions (poisoned, prone, …)
  }
  resources: Resource[]
  forms: CharForm[]
  activeFormId: string
  attacks: Attack[]
  /** Defined, castable spells (optional — non-casters omit). Managed in the Spells tab. */
  spells?: Spell[]
  spellcasting?: SpellcastingInfo
  features: FeatureBlock[]
  progression: ProgressionRow[]
  /** Per-character labels for the progression table's two generic middle columns + heading.
   *  Every character should set these to whatever its class table tracks. */
  progressionMeta?: { title?: string; lead?: string; col3?: string; col4?: string }
  /** Passive defensive/utility traits listed under Defenses (markdown-lite, e.g.
   *  '**Darkvision 60 ft**' or '**Damage Resistance** (while Raging): bludgeoning…').
   *  Character-owned: the panel used to hardcode one character's species traits for all. */
  traits?: string[]
  /** An optional per-turn self-heal button (e.g. a regeneration trait). `amount` is either a
   *  flat number or 'conMod' to use the CON modifier. Omit = no regeneration button. */
  regen?: { label: string; note?: string; amount: 'conMod' | number; unlockLevel?: number }
  /** Extra clause appended to the long-rest confirmation, e.g. 'rages, lasers'. Omit for the
   *  generic 'Restores HP, hit dice, resources, death saves.' */
  longRestNote?: string
  /** How THIS character's derived stats recompute when its level changes. Everything is
   *  optional and character-owned, so no class's assumptions leak onto another sheet:
   *   · hitDie             — override the die used for HP (defaults to combat.hitDiceSize)
   *   · bonusHpPerLevel    — flat extra HP per level (e.g. the Tough feat's +2)
   *   · speedByLevel       — speed ladder (e.g. Barbarian Fast Movement at 5); omit = speed never changes
   *   · formDamageByLevel  — form/transformation damage ladder (e.g. Barbarian Rage damage);
   *                          omit = formDamageBonus is left alone
   *   · autoHp             — false to stop the sheet recomputing max HP from the die entirely
   *                          (point-buy / non-d20 systems that set HP by hand) */
  levelRules?: {
    hitDie?: number
    bonusHpPerLevel?: number
    speedByLevel?: { level: number; speed: number }[]
    formDamageByLevel?: { level: number; bonus: number }[]
    autoHp?: boolean
  }
  inventory: InvItem[]
  /** Temporary effects currently active on the character — from a consumed buff/potion or a
   *  DM-granted boon. Each is removable by the player or DM (Active-Effects tracker). Passive
   *  item effects come from equipped/attuned `inventory` items, not this list. */
  activeEffects?: ActiveEffect[]
  currency: { credits: number; harmonyte: number; scrip: number }
  bio: {
    intro: string[]
    appearance: string[]
    personality: string[]
    background: string
    playTips: string[]
  }
  balance: {
    /** Optional intro line above the synergy/weakness cards, e.g. what this build's
     *  balancing lever is. Character-owned; omitted = no lead paragraph. */
    lead?: string
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
  /** Free-form values for AI-generated interactive sheet widgets (Phase V, Slice 11).
   *  Widgets on a custom sheet (fields, counters, toggles the AI added) bind to a key in
   *  here so their edits persist with the sheet `data` autosave. Kept separate from the
   *  typed model so an AI-invented field can never collide with a real mechanic. */
  customFields?: Record<string, string | number | boolean>
}
