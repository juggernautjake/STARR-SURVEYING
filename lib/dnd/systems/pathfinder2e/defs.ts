// lib/dnd/systems/pathfinder2e/defs.ts — the PF2 catalog SCHEMAS (PF2 buildout S1).
//
// The subsystem shipped with just enough shape to render a sheet: a spell was {name, rank,
// traditions, cast, effect} and there was no feat catalog at all. That is why the Area MV audit
// concluded PF2 had "nothing to gate" — you cannot enforce a feat's level when no feat carries one.
// These are the shapes the rest of the buildout targets.
//
// WHY SEPARATE FROM content.ts: content.ts holds the small hand-authored seed the sheet already
// depends on. Widening a type in place would either break those 25 entries or force every new
// field optional, and "optional" is how a rules catalog quietly fills with holes. New content is
// authored against these richer types; the seed is migrated onto them tranche by tranche.
//
// LICENSING (see the planning doc): PF2 mechanics are ORC-licensed, which expressly permits
// reproducing rules mechanics. Reserved Material — Paizo trademarks, deities, characters,
// locations, lore, art — must never appear here. Every entry carries `source`. Paraphrased
// mechanical facts and numbers only, never verbatim rulebook prose.
//
// GROUND RULE 3 — never invent a rule. For a rules platform a plausible-but-wrong number is worse
// than an absent one, so an unknown field is OMITTED and the catalog's status object reports the
// gap honestly. Nothing here should ever be filled in from vibes.
import type { PF2Tradition, PF2AttributeKey } from './model';

// ── Shared ────────────────────────────────────────────────────────────────────────────────────

/** Action cost. PF2's economy is three actions per turn, so cost is mechanical, not flavour.
 *  `'1-3'` covers spells like Heal whose effect scales with the actions spent. */
export type PF2Cost = 'free' | 'reaction' | '1' | '2' | '3' | '1-3' | '2-3' | 'varies';

/** Where an entry came from. Rulebook titles only — no Product Identity.
 *
 *  The last three were added for data/classes.ts. Four of the twenty classes it covers were never
 *  printed in a Core book: Thaumaturge and Kineticist are remaster-current but live in their own
 *  rulebooks, and Magus/Summoner have not been remastered at all. Tagging any of them 'Legacy' would
 *  be a lie about two of them and tagging them 'Player Core' a lie about all four, so the union
 *  grew instead. Additive only — nothing switches exhaustively on this type. */
export type PF2Source =
  | 'Player Core' | 'Player Core 2' | 'GM Core' | 'Monster Core' | 'Legacy'
  | 'Dark Archives' | 'Rage of Elements' | 'Secrets of Magic';

/** A save a target rolls against the caster's DC. `basic` is PF2's four-degree damage template
 *  (crit fail = double, fail = full, success = half, crit success = none) — it is a specific rule,
 *  not a synonym for "there is a save", so it is a separate flag. */
export interface PF2SaveSpec {
  save: 'Fortitude' | 'Reflex' | 'Will';
  basic?: boolean;
  /** What happens per degree, when it is not a plain basic save. */
  effect?: string;
}

// ── Spells ────────────────────────────────────────────────────────────────────────────────────

/** A fully-specified PF2 spell.
 *
 *  RANK, never "level". PF2 renamed spell levels to ranks precisely so a spell's rank cannot be
 *  confused with a character's level; the two diverge constantly (a level-5 character casts rank-3
 *  spells). Ground Rule 1 — a system's vocabulary never leaks. */
export interface PF2SpellFull {
  name: string;
  /** 0 = cantrip … 10. */
  rank: number;
  traditions: PF2Tradition[];
  /** Spell traits — these are mechanical in PF2 (e.g. `incapacitation` changes how the spell
   *  resolves against higher-level creatures; `concentrate`/`manipulate` interact with reactions). */
  traits: string[];
  cast: PF2Cost;
  /** Material/somatic/verbal or an activity like "1 minute", when the cast line needs words. */
  castNote?: string;
  range?: string;
  area?: string;
  targets?: string;
  duration?: string;
  sustained?: boolean;
  save?: PF2SaveSpec;
  /** A spell attack roll rather than a save. */
  attack?: boolean;
  /** Damage as authored, e.g. "6d6 fire". Omitted when the spell deals none. */
  damage?: string;
  /** Concise paraphrased mechanics. Never rulebook prose. */
  effect: string;
  /** Per-rank heightening, keyed by the rank it applies at: `{ 4: '...', 6: '...' }`. */
  heightened?: Record<number, string>;
  /** Incremental heightening: `{ step: 1, text: '+2d6 fire' }` = "Heightened (+1)". */
  heightenedPer?: { step: number; text: string };
  /** Focus spells are cast from Focus Points and belong to a class/subclass, not a slot. */
  focus?: boolean;
  /** For focus spells: whose it is. */
  focusClass?: string;
  source: PF2Source;
  /** Renames across the remaster, e.g. Magic Missile → Force Barrage. Keeps old names findable. */
  formerly?: string;
}

// ── Feats ─────────────────────────────────────────────────────────────────────────────────────

/** The four feat tracks plus archetype. Each has its OWN level schedule — modelled in
 *  eligibility.ts, and the reason PF2 needs a real gate rather than a level comparison. */
export type PF2FeatTrack = 'ancestry' | 'class' | 'skill' | 'general' | 'archetype';

/** A prerequisite the gate can actually CHECK. Anything that cannot be expressed here stays in
 *  `prereqText` and is shown to the player rather than silently enforced or silently ignored —
 *  refusing on unparsed English is how a builder starts blocking legal choices. */
export type PF2Prereq =
  | { kind: 'skill'; skill: string; rank: 'trained' | 'expert' | 'master' | 'legendary' }
  | { kind: 'attribute'; attribute: PF2AttributeKey; value: number }
  | { kind: 'feat'; name: string }
  | { kind: 'level'; value: number }
  | { kind: 'class'; name: string }
  | { kind: 'ancestry'; name: string };

export interface PF2FeatFull {
  name: string;
  /** The level at which the feat becomes available — the field whose absence made PF2 ungateable. */
  level: number;
  track: PF2FeatTrack;
  traits: string[];
  /** Scoping: a class feat belongs to a class, an ancestry feat to an ancestry. */
  className?: string;
  ancestry?: string;
  /** Archetype feats belong to an archetype and require its Dedication feat first. */
  archetype?: string;
  cost?: PF2Cost;
  /** Machine-checkable prerequisites. */
  prereqs?: PF2Prereq[];
  /** Prerequisites that resist structuring, kept as prose so they are at least VISIBLE. */
  prereqText?: string;
  frequency?: string;
  trigger?: string;
  requirements?: string;
  effect: string;
  /** Some feats may be taken more than once (often with a different choice each time). */
  repeatable?: boolean;
  source: PF2Source;
}

// ── Everything else ───────────────────────────────────────────────────────────────────────────

/** An action, activity, or reaction — basic actions, exploration and downtime activities. */
export interface PF2ActionDef {
  name: string;
  cost: PF2Cost;
  traits: string[];
  category: 'basic' | 'specialty' | 'exploration' | 'downtime' | 'skill';
  /** Skill actions are gated on a skill and sometimes a proficiency rank. */
  skill?: string;
  minRank?: 'trained' | 'expert' | 'master' | 'legendary';
  trigger?: string;
  requirements?: string;
  effect: string;
  /** Critical success / success / failure / critical failure, where the action defines them. */
  degrees?: { critSuccess?: string; success?: string; failure?: string; critFailure?: string };
  source: PF2Source;
}

/** A PF2 condition. Many are NUMERIC (Frightened 2, Clumsy 1) where 5e's are binary — exactly the
 *  kind of same-word-different-meaning difference Ground Rule 1 exists for. */
export interface PF2ConditionDef {
  name: string;
  /** True when the condition carries a value that scales its effect. */
  valued?: boolean;
  effect: string;
  /** How it ends or decreases — Frightened drops by 1 each turn, for instance. */
  ends?: string;
  source: PF2Source;
}

export interface PF2HeritageDef {
  name: string;
  ancestry: string;
  effect: string;
  source: PF2Source;
}

/** Items, consumables, and magic items. Weapons and armour keep their own richer shapes in
 *  content.ts because their maths differs. */
export interface PF2ItemDef {
  name: string;
  /** Item level — gates availability and pricing. */
  level: number;
  price?: string;
  bulk?: string;
  traits: string[];
  category: 'gear' | 'consumable' | 'alchemical' | 'wondrous' | 'rune' | 'shield' | 'staff' | 'wand';
  usage?: string;
  activate?: PF2Cost;
  effect: string;
  source: PF2Source;
}

/** A fundamental or property rune. PF2's item maths runs through these — a +1 striking weapon is
 *  two runes, not a magic-item name — so they are their own shape rather than free-text items. */
export interface PF2RuneDef {
  name: string;
  level: number;
  price?: string;
  kind: 'fundamental' | 'property';
  appliesTo: 'weapon' | 'armor';
  effect: string;
  source: PF2Source;
}

// ── Coverage status ───────────────────────────────────────────────────────────────────────────

/** What the catalog actually holds, per kind.
 *
 *  Mirrors 5e's `SPELL_CATALOG_STATUS`. It exists so a missing entry reads as "not catalogued yet"
 *  and never as "does not exist in PF2" — the honest failure mode for a partial catalog, and the
 *  one that keeps Ground Rule 3 enforceable. `complete` stays false until a kind genuinely is. */
export interface PF2CatalogKindStatus {
  count: number;
  complete: boolean;
  /** What is deliberately not in yet, in one line. */
  note?: string;
}

export interface PF2CatalogStatus {
  spells: PF2CatalogKindStatus;
  feats: PF2CatalogKindStatus;
  classes: PF2CatalogKindStatus;
  ancestries: PF2CatalogKindStatus;
  weapons: PF2CatalogKindStatus;
  armors: PF2CatalogKindStatus;
  items: PF2CatalogKindStatus;
  conditions: PF2CatalogKindStatus;
  actions: PF2CatalogKindStatus;
}
