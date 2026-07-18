// lib/dnd/classes/types.ts — the model a character is BUILT from, level 1 to 20.
//
// system-rules.ts knows a class's headline knobs (hit die, key ability, saves) — enough to ground
// an AI build and validate a finished sheet. It is nowhere near enough to actually BUILD a
// character: it doesn't know that a Fighter gets Action Surge at 2 and extra ASIs at 6 and 14, or
// that a Warlock's slots don't follow the full-caster table.
//
// This model does. It is deliberately shaped so a HOMEBREW class is the same kind of object as an
// official one — a custom class is data, not a fork (see lib/dnd/classes/custom.ts). Everything
// here is system-agnostic in shape; the 5e-specific numbers live in the per-class data files.
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';

/** How a class gets spells, which decides which slot table (if any) it reads. */
export type CasterKind =
  | 'none'
  | 'full'      // Bard, Cleric, Druid, Sorcerer, Wizard — the full table
  | 'half'      // Paladin, Ranger — slots from level 2, half progression
  | 'third'     // Eldritch Knight, Arcane Trickster — slots from level 3
  | 'pact';     // Warlock — few slots, all at your highest rank, back on a SHORT rest

/** A resource a class tracks between rests (Rage, Ki, Bardic Inspiration, Sorcery Points…). */
export interface ClassResource {
  id: string;
  name: string;
  /** Per-level maximum, index 1..20 (index 0 unused). Use -1 for "unlimited" at that level. */
  perLevel: number[];
  resetOn: 'short' | 'long';
  note?: string;
}

/** One feature gained at a level. */
export interface ClassFeature {
  level: number;
  name: string;
  /** Full rules text, markdown-lite (**bold**, "· " bullets). This is what the sheet shows. */
  body: string;
  /** Optional one-line summary — used where a full body is too long (level-up lists, tooltips). */
  description?: string;
  /** True when the feature is granted by the SUBCLASS rather than the base class. */
  subclass?: boolean;
  /** Marks the level as granting a choice the builder must prompt for. */
  choice?: 'asi' | 'subclass' | 'fighting-style' | 'expertise' | 'cantrip' | 'epic-boon' | 'other';
}

/** Spell slots at a level: index 0 = cantrips known, 1..9 = slots of that rank. */
export type SpellSlotRow = number[];

export interface ClassSpellcasting {
  kind: CasterKind;
  /** The Artificer exception: it is a `half` caster, but for MULTICLASS caster-level math its levels
   *  round UP (ceil), not down like Paladin/Ranger — the single 5e half-caster that does. Set true only
   *  on the Artificer; consumed by `multiclassCasterLevel`. (Single-class slots come from its own `slots`
   *  table, so this flag matters only when combining classes.) */
  roundHalfUp?: boolean;
  ability: AbilityKey;
  /** How the prepared/known count is derived — shown to the builder. */
  preparedRule?: string;
  /** Cantrips known by level (index 1..20). */
  cantripsKnown?: number[];
  /**
   * Slots by level: `slots[level]` = [_, r1, r2, …, r9]. Omit for pact casters, which use
   * `pactSlots`/`pactRank` instead because their table is structurally different.
   */
  slots?: Record<number, SpellSlotRow>;
  /** Warlock only: number of pact slots by level (index 1..20). */
  pactSlots?: number[];
  /** Warlock only: the rank those slots are cast at, by level (index 1..20). */
  pactRank?: number[];
  /** Spells known by level, for classes with a fixed known list (index 1..20). Omit for preparers. */
  spellsKnown?: number[];
}

export interface ClassDefinition {
  key: string;
  name: string;
  /** The system this class belongs to — a class is NEVER valid outside its own system. */
  system: string;
  /** Present only for homebrew: who authored it, and whether a DM has cleared it. */
  custom?: { authorName?: string; basedOn?: string };
  hitDie: number;
  primaryAbility: AbilityKey[];
  savingThrows: AbilityKey[];
  /** How many skills you choose, and from which list. */
  skillChoices: { count: number; from: string[] };
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies?: string[];
  /** Levels at which an Ability Score Improvement (or feat) is granted. */
  asiLevels: number[];
  /** The level the subclass is chosen. */
  subclassLevel: number;
  /** What this system calls a subclass, e.g. "Divine Domain", "Primal Path". */
  subclassLabel: string;
  spellcasting?: ClassSpellcasting;
  resources?: ClassResource[];
  features: ClassFeature[];
  /** Starting equipment options, as displayed. */
  startingEquipment?: string[];
  /** Flavour for the picker. */
  description: string;
}

export interface SubclassDefinition {
  key: string;
  name: string;
  classKey: string;
  system: string;
  description: string;
  features: ClassFeature[];
  /** Domain/oath/patron spells that are always prepared, by level. */
  alwaysPrepared?: Record<number, string[]>;
  custom?: { authorName?: string };
}

/** A resolved snapshot: everything a character of this class/subclass HAS at a given level. */
export interface LevelSnapshot {
  level: number;
  proficiencyBonus: number;
  hitDie: number;
  /** Max HP contribution from this class at this level, using fixed averages, before CON. */
  hitPointsBeforeCon: number;
  features: ClassFeature[];
  /** Every choice the builder still needs the player to make at or below this level. */
  pendingChoices: { level: number; kind: NonNullable<ClassFeature['choice']>; label: string }[];
  spellSlots?: SpellSlotRow;
  cantripsKnown?: number;
  spellsKnown?: number;
  pact?: { slots: number; rank: number };
  resources: { id: string; name: string; max: number; resetOn: 'short' | 'long' }[];
}
