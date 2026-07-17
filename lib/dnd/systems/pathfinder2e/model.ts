// lib/dnd/systems/pathfinder2e/model.ts — the typed Pathfinder 2e character model (Remaster-aware).
//
// PF2 does not fit the 5e-shaped ClassDefinition: there is no hit die, ability boosts replace ASIs,
// proficiency is a RANK (Untrained→Legendary) that adds your LEVEL, and advancement is four parallel
// feat tracks (ancestry, class, skill, general) plus skill increases. So PF2 gets its own model
// (like `systems/intuitive-games/`), stored as a sidecar on `character.data.pf2e`; the pure math lives
// in rules.ts. Data only — no services — so it is testable everywhere.

export const PF2_ATTRIBUTES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
export type PF2AttributeKey = typeof PF2_ATTRIBUTES[number];

export const PF2_SAVES = ['Fortitude', 'Reflex', 'Will'] as const;
export type PF2SaveKey = typeof PF2_SAVES[number];
/** Which attribute governs each save. */
export const PF2_SAVE_ATTRIBUTE: Record<PF2SaveKey, PF2AttributeKey> = { Fortitude: 'CON', Reflex: 'DEX', Will: 'WIS' };

/** PF2 proficiency ranks and their flat bonus (added to your level when trained or better). */
export const PF2_RANKS = ['untrained', 'trained', 'expert', 'master', 'legendary'] as const;
export type PF2Rank = typeof PF2_RANKS[number];
/** The flat bonus each rank contributes (before adding level). Untrained is +0 and adds NO level. */
export const PF2_RANK_BONUS: Record<PF2Rank, number> = { untrained: 0, trained: 2, expert: 4, master: 6, legendary: 8 };

/** The 3-action economy costs (◆ / ◆◆ / ◆◆◆ / ↺ / ⬦). */
export type PF2ActionCost = 1 | 2 | 3 | 'reaction' | 'free';

// ── Identity ──────────────────────────────────────────────────────────────────────────────────────
export interface PF2Identity {
  name: string;
  level: number;         // 1–20
  ancestry: string;      // Dwarf, Elf, … (see glossary)
  heritage: string;      // the ancestry's sub-choice
  background: string;    // grants two attribute boosts + a skill + a skill feat
  className: string;     // Fighter, Wizard, …
  subclass: string;      // the class's defining choice (Racket, Instinct, Bloodline, …)
  deity: string;
  size: string;          // usually Medium or Small
  alignment: string;     // legacy; Remaster uses edicts/anathema
  bio: string;
  photoUrl: string;
}

// ── Attributes — a modifier directly (PF2 has no scores in play, just modifiers) ────────────────────
export type PF2Attributes = Record<PF2AttributeKey, number>;

// ── A proficiency: a rank the level is added to when trained+ ───────────────────────────────────────
export interface PF2Proficiency {
  rank: PF2Rank;
}

export interface PF2Skill {
  name: string;
  attribute: PF2AttributeKey;
  rank: PF2Rank;
  /** Assurance, item bonuses, etc. — flat additions the sheet shows separately. */
  itemBonus: number;
}

export interface PF2Save {
  rank: PF2Rank;
  itemBonus: number;
}

// ── Combat: HP, AC, class DC, speed, and the attacks ────────────────────────────────────────────────
export interface PF2Combat {
  /** Ancestry HP (flat, at level 1) + class HP/level; CON is added per level in rules.ts. */
  ancestryHp: number;
  classHpPerLevel: number;
  currentHp: number;
  tempHp: number;
  dyingValue: number;    // 0 = not dying; PF2's death track
  woundedValue: number;
  speed: number;         // feet
  /** Armor: its AC proficiency rank + a Dex cap + item bonus. Unarmored has no cap. */
  armorRank: PF2Rank;
  dexCap: number | null; // null = uncapped (unarmored / no cap)
  acItemBonus: number;
  /** The attack proficiency that gates your Strikes (Fighter is highest). */
  attackRank: PF2Rank;
  /** The class DC proficiency (for class features that impose saves). */
  classDcRank: PF2Rank;
  classDcAttribute: PF2AttributeKey;
}

export interface PF2Attack {
  id: string;
  name: string;
  attribute: PF2AttributeKey; // STR (melee) or DEX (finesse/ranged)
  rank: PF2Rank;
  weaponBonus: number;        // item bonus (potency rune, etc.)
  damage: string;             // e.g. "1d8+4 slashing"
  traits: string[];           // agile, finesse, reach, …
}

// ── Spellcasting (Remaster) — tradition + rank slots + the DC ───────────────────────────────────────
export type PF2Tradition = 'arcane' | 'divine' | 'occult' | 'primal' | 'none';
export interface PF2Spellcasting {
  tradition: PF2Tradition;
  /** Prepared or spontaneous, or 'none'. */
  kind: 'prepared' | 'spontaneous' | 'none';
  attribute: PF2AttributeKey;
  rank: PF2Rank;             // spell DC / attack proficiency
  /** Slots per spell rank 1–10 (index 0 = cantrips known). */
  slots: number[];
}

/** A feat on one of the four tracks, or a class feature. */
export interface PF2Feat {
  id: string;
  name: string;
  level: number;
  track: 'ancestry' | 'class' | 'skill' | 'general' | 'archetype' | 'feature';
  actionCost?: PF2ActionCost;
  traits: string[];
  body: string;
}

// ── The full character sidecar (character.data.pf2e) ────────────────────────────────────────────────
export interface PF2Character {
  identity: PF2Identity;
  attributes: PF2Attributes;
  perception: PF2Proficiency;
  saves: Record<PF2SaveKey, PF2Save>;
  skills: PF2Skill[];
  combat: PF2Combat;
  attacks: PF2Attack[];
  spellcasting: PF2Spellcasting;
  feats: PF2Feat[];
  languages: string[];
}
