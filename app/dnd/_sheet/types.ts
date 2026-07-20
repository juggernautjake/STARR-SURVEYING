import type { AbilityKey, ProfLevel } from './rules/dnd'
import type { Effect } from './engine/effects'

/** The events a Trigger can fire ON (Slice 15). A trigger is an EVENT-driven action — it fires when
 *  something happens, unlike an Effect (a continuous overlay). Retaliation ("armour that damages who
 *  hits me") is the motivating case; it can't be an Effect because it rolls dice and targets someone
 *  who isn't you. */
export type TriggerEvent =
  | 'hit_by_melee' | 'hit_by_ranged' | 'hit_by_spell'
  | 'you_hit' | 'you_crit' | 'you_are_crit'
  | 'save_failed' | 'turn_start' | 'turn_end' | 'damaged' | 'reduced_to_zero'

/** What a Trigger DOES when it fires. Deliberately a PROMPT, not automation: the sheet surfaces it
 *  and the player/DM resolves it — it never silently applies damage to a creature the app can't see. */
export interface TriggerAction {
  kind: 'damage' | 'heal' | 'temp_hp' | 'condition' | 'effect' | 'resource' | 'prompt'
  dice?: string            // damage/heal/temp: dice, e.g. "1d6"
  damageType?: string      // damage: fire/piercing/…
  attack?: boolean         // damage: does it need an attack roll to land?
  condition?: string       // condition: what it applies, e.g. "Frightened"
  note?: string            // free-text for prompt / flavor
}

export interface Trigger {
  id: string
  on: TriggerEvent
  /** Optional gate — only fires while this condition is active (e.g. "raging"), the engine's
   *  `condition` idea reused for events. */
  condition?: string
  label: string            // "Spiked Barbs"
  action: TriggerAction
  /** A usage limit — unlimited retaliation is the failure mode, so the model can say no. */
  limit?: { per: 'turn' | 'round' | 'short' | 'long' | 'encounter'; max: number }
}

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
  /** Which ability powers THIS attack's save DC (8 + PB + mod). Defaults to STR when unset — a
   *  spell or a special weapon can key its DC off a different stat than the sheet's default. */
  saveDcAbility?: AbilityKey
  /** A flat save DC that overrides the computed 8 + PB + mod for this attack — full manual control. */
  saveDcOverride?: number
  notes?: string
  /** Hand-tuned away from how it was (Slice 20): set true when edited through the in-place editor,
   *  drives the ✎ marker. Distinct from the ★ (something is modifying it right now). */
  customized?: boolean
  /** Uploaded art for this attack, shown as a thumbnail in the Attacks table (Slice 28). */
  image?: string
}
// (Trigger fields live on InvItem + FeatureBlock — an item's spiked armour, a feature's retort.)

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
  /** Passive mechanics this feature contributes to the ledger (Slice 10). Optional: most features
   *  are prose the DM reads. A feature with `effects` moves real numbers — and, like item effects,
   *  may be `condition`-gated ('raging') so it only counts when it should. */
  effects?: Effect[]
  /** Hand-tuned away from how it was (Slice 20) → drives the ✎ marker. */
  customized?: boolean
  /** Uploaded art for this feature, shown as a thumbnail on its card (Slice 28). */
  image?: string
  /** Event-triggered reactions this feature carries (Slice 15) — surfaced when their event fires. */
  triggers?: Trigger[]
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
  /** Ledger effects applied WHILE THIS FORM IS ACTIVE (Slice 15/25) — a Titan form that sets STR to
   *  25 and grants a fly speed. Resolved by the ledger as a `form` source, so they overlay like any
   *  other effect and revert the instant the form ends. Distinct from the bespoke `strikeDie` /
   *  form-attack fields, which keep their own render paths. */
  effects?: Effect[]
  /** Carry-over policy (Slice 18, Ground Rule 1): what of YOU survives becoming this form, declared
   *  per form rather than the engine hardcoding one game's answer. Omitted/undefined = Wild Shape-style
   *  "keep everything you have, the form only adds/overrides" (the original behaviour — existing forms
   *  are unchanged). Set `keepFeatures: false` for a true polymorph (5e Polymorph): your own gear +
   *  features stop applying while worn; only externally-imposed sources (a spell cast ON you, a DM
   *  boon, a condition) and the form's own effects apply. `keepMental`/`separateHp` are declared here
   *  for future slices. It's an overlay either way — dropping the form restores all of it exactly. */
  carryOver?: {
    keepFeatures?: boolean
    keepMental?: boolean
    separateHp?: boolean
  }
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
  dexCap?: number | null // legacy cap, superseded by modCap; still honoured on old items
  stealthDisadvantage?: boolean
  // Which ability modifier adds to the base AC, and how much of it counts. The
  // category only supplies the DEFAULTS (light = uncapped dex, medium = dex capped
  // at 2, heavy = none); setting these lets a homebrew piece do anything — a
  // wisdom-scaling robe, a heavy plate that still allows +1, and so on.
  modAbility?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'none'
  modCap?: number | null // null/undefined = uncapped
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

/** A tag this character's table invented, with what it MEANS (Slice 32). Definition is required —
 *  a tag nobody wrote down is the "what does FLAVOR mean?" problem, recreated by hand. */
export interface CustomTag {
  name: string
  description: string
}

export interface InvItem {
  id: string
  name: string
  desc: string
  qty: number
  /** The five built-ins, plus any tag from `char.customTags`. Three of the built-ins are wiring,
   *  not labels: `weapon` puts this in the Attacks table, `consumable` makes it usable-and-gone,
   *  `equipped` applies its effects — see ui/tagInfo.ts RESERVED_TAGS. */
  tags: ('equipped' | 'weapon' | 'consumable' | 'tech' | 'flavor' | string)[]
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
  /** A usage pool this item GRANTS while equipped/attuned (Slice 11 grant-half) — charges/points
   *  with their own reset rule. Surfaced read-only in Resources, badged to this item, and gone
   *  when it comes off. Distinct from `effects`: a resource is a stateful track, not a stat overlay. */
  grantsResource?: Resource
  /** An attack this item GRANTS while equipped/attuned (Slice 11 grant-half) — a full, rollable
   *  Attack. Rendered in the Attacks table badged to this item (no edit — it's on loan), and gone
   *  when it comes off. Structured like `grantsResource` because an attack must be rollable. */
  grantsAttack?: Attack
  /** A spell this item GRANTS while equipped/attuned (Slice 11 grant-half). Surfaced read-only in
   *  the Spells tab badged to this item — so a non-caster can be granted a spell and still see it —
   *  gone when it comes off. (Casting from granted slots is a follow-up.) */
  grantsSpell?: Spell
  /** Event-triggered reactions this item carries while equipped (Slice 15) — spiked armour that hits
   *  back, a shield that frightens. Surfaced (not auto-applied) when their event fires. */
  triggers?: Trigger[]
  /** Weight in lb per unit (Slice 11 carrying capacity). Optional — items without a weight count as 0,
   *  so the running total only reflects gear the player actually weighed. Feeds the Inventory carrying
   *  line together with the size-scaled `carryingCapacity`/`encumbranceLevel`. */
  weight?: number
  /** Hand-tuned away from how it was (Slice 20) → drives the ✎ marker. */
  customized?: boolean
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
  /** Lasting mechanical effects the spell applies when CAST (Slice 15/25) — a buff like Bless or
   *  Mage Armor. On cast these are SNAPSHOTTED into an ActiveEffect so the ledger resolves them like
   *  any other source and editing the spell later never changes a buff already running. Authored via
   *  the shared effect builder (Slice 17). */
  effects?: Effect[]
  /** How long a cast `effects` buff lasts, shown on its ActiveEffect (e.g. "1 minute", "1 hour"). */
  effectDuration?: string
  /** Hand-tuned away from how it was (Slice 20) → drives the ✎ marker. */
  customized?: boolean
  /** Uploaded art for this spell, shown as a thumbnail in the spell list (Slice 28). */
  image?: string
  /** Why this spell is outside what the character's class and level grant, e.g. "not on the
   *  Wizard spell list" (Area MV). Set when a CUSTOM character takes something a vanilla one
   *  would be blocked from, so the choice stays visible on the sheet instead of reading as a
   *  normal class pick. Absent = taken legally. Note this is NOT `provenance.ts`: that asks
   *  "does this exist in the system?" (Wish does), where this asks "was it legal for THIS
   *  character?" — a different question needing its own marker. */
  offRules?: string
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
    /** Descriptive identity fields (Slice 11) — optional, shown in the Bio "Details" line and
     *  overlayable by an identity effect (a potion that changes your recorded profession). */
    gender?: string
    pronouns?: string
    profession?: string
    alignment?: string
    /** The chosen 2024 mechanical BACKGROUND (a key into lib/dnd/backgrounds) — distinct from the
     *  narrative `bio.background` prose. In 2024 this is what grants the ability increases + Origin
     *  feat + skills + tool (Slice 4). */
    background?: string
    /** The ability-increase spread the player assigned FROM the 2024 background (+2/+1 or +1/+1/+1
     *  across the background's three abilities). Stored so switching or re-spreading the background
     *  can exactly reverse the prior increases before applying the new — `abilities` are running
     *  totals, so the applied spread must be remembered to be undone (Slice 4). */
    backgroundAbilities?: Partial<Record<AbilityKey, number>>
    /** A discreet, tongue-in-cheek note set when a transpose produced a character that reads as clearly
     *  overpowered for its level (Area MV/transpose quality). Shown small + italic in the hero header so the
     *  player is gently warned without blocking the build. Cleared when they trim the sheet back down. */
    opNote?: string
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
  /** The FORM's separate HP pool while a `separateHp` form (Slice 18) is worn. A scratch field: base
   *  `combat.currentHp`/`maxHp` stay frozen underneath, so ending the form restores you exactly.
   *  `formId` pins which form it belongs to; cleared when the form ends. */
  formHp?: import('@/lib/dnd/effects/form-hp').FormHpState
  attacks: Attack[]
  /** Defined, castable spells (optional — non-casters omit). Managed in the Spells tab. */
  spells?: Spell[]
  spellcasting?: SpellcastingInfo
  features: FeatureBlock[]
  progression: ProgressionRow[]
  /** Per-character labels for the progression table's two generic middle columns + heading.
   *  Every character should set these to whatever its class table tracks. */
  progressionMeta?: { title?: string; lead?: string; col3?: string; col4?: string }
  /** Grants advantage on Initiative from a named feature (e.g. the Barbarian's Feral Instinct at
   *  7). Character-owned: the stat rail used to give this to EVERY character at level 7. */
  initiativeAdvantage?: { label: string; unlockLevel?: number }
  /** The class this character levels as, and the choices made at each level. Drives the level
   *  builder (/dnd/characters/[id]/levels): a level is only complete once its choices are
   *  recorded, which is why the sheet has no +/- stepper. `classKey` may name a homebrew class. */
  build?: {
    classKey?: string
    subclassKey?: string
    /** RecordedChoice[] from lib/dnd/classes/levelup.ts — kept loosely typed here so the sheet
     *  engine doesn't depend on the class module. */
    choices?: {
      level: number
      kind: 'asi' | 'subclass' | 'fighting-style' | 'expertise' | 'cantrip' | 'epic-boon' | 'other'
      value?: string
      abilities?: AbilityKey[]
      featKey?: string
      skills?: string[]
      /** Set when this level's feature was homebrewed with the AI rather than picked from a book. */
      homebrew?: { name: string; body: string }
    }[]
  }
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
  /** Tags this character's table invented, with their meanings (Slice 32). Kept ON THE CHARACTER
   *  rather than in a global registry so a campaign's vocabulary travels with its sheets and
   *  nobody has to curate a shared list. */
  customTags?: CustomTag[]
  /** Legacy fixed-key money (kept for existing sheets). New sheets use `currencies` below. */
  currency: { credits: number; harmonyte: number; scrip: number }
  /** Flexible money: a list of named currencies with amounts + conversion rates (a rate = value of
   *  one unit in BASE units; the base currency is rate 1). Optional so legacy sheets stay valid; when
   *  present, the sheet renders this (amounts, total wealth, conversion table) instead of `currency`.
   *  See lib/dnd/currency.ts for the math. */
  currencies?: import('@/lib/dnd/currency').Currency[]
  /** Homebrew classes saved to this character (Slice 5). The registry resolves them as `extra` so a
   *  custom class appears in the level builder like an official one. See lib/dnd/classes/homebrew-store. */
  homebrewClasses?: import('@/lib/dnd/classes/types').ClassDefinition[]
  /** Homebrew feats saved to this character (Slice 5). */
  homebrewFeats?: import('@/lib/dnd/classes/custom').CustomFeat[]
  /** Homebrew subclasses saved to this character (Slice 5). The registry resolves them via `extra`. */
  homebrewSubclasses?: import('@/lib/dnd/classes/types').SubclassDefinition[]
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
  /** Chosen colour theme/variant for skins that offer more than one (§6.9 streamer pink/blue; Area TH the
   *  Hextech Gold/Shadow-Isles/Noxus/Freljord set). The engine resolves it to a SheetTheme via
   *  `resolveThemeVariant(skin, key)`; the streamer additionally applies a `.variant-<id>` class + art. Any
   *  variant key from `themeVariantsFor` is valid; an unknown key safely falls back to the skin's first. */
  skinVariant?: string
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
