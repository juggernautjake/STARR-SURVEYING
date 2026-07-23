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
  /** True for the four skills that take the armor check penalty (Acrobatics, Athletics, Stealth,
   *  Thievery) when the wearer doesn't meet the armor's Strength requirement. */
  armorPenalty?: boolean;
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
  heroPoints: number;    // 0–3; spend to reroll or (3) avoid death. Start each session with 1.
  speed: number;         // feet
  /** Armor: its AC proficiency rank + a Dex cap + item bonus. Unarmored has no cap. */
  armorRank: PF2Rank;
  dexCap: number | null; // null = uncapped (unarmored / no cap)
  acItemBonus: number;
  /** The worn armor's name (display only; the numbers above are what the rules engine reads). */
  armorName?: string;
  /** The effective armor check penalty (≤ 0) applied to armor-affected skills; 0 when the Strength
   *  requirement is met or when unarmored. */
  armorCheckPenalty?: number;
  /** Runes etched on the worn armor, by name ("+1 armor potency", "greater resilient"). When
   *  present these DERIVE the AC item bonus and the resilient save bonus at render via
   *  `pf2ResolveRunes`, exactly as `PF2Attack.runes` does for weapons — so armor and weapons cannot
   *  disagree about what a rune means. Absent → `acItemBonus` stands alone, so every stored
   *  character remains valid without migration. */
  armorRunes?: string[];
  /** The attack proficiency that gates your Strikes (Fighter is highest). */
  attackRank: PF2Rank;
  /** The class DC proficiency (for class features that impose saves). */
  classDcRank: PF2Rank;
  classDcAttribute: PF2AttributeKey;
  /** Active PF2 conditions with their values (Frightened 2, Sickened 1, Prone). The sheet folds their
   *  penalties into rolls under PF2's non-stacking rule (worst status + worst circumstance). Optional so
   *  legacy sidecars read as an empty list. */
  conditions?: { name: string; value?: number }[];
}

export interface PF2Attack {
  id: string;
  name: string;
  attribute: PF2AttributeKey; // STR (melee) or DEX (finesse/ranged)
  rank: PF2Rank;
  weaponBonus: number;        // item bonus (potency rune, etc.)
  /** The BASE damage die, e.g. "1d8". Traits, the striking rune line, attribute modifiers and the
   *  crit rules are resolved at render by `pf2ResolveStrike` — NOT baked in here. Baking them in
   *  is why an edited weapon used to display correctly and roll wrong (S15d). */
  damage: string;
  /** Damage type, e.g. "slashing". Kept separate from `damage` so the resolver can rebuild the
   *  expression after applying traits. */
  damageType?: string;
  traits: string[];           // agile, finesse, reach, …
  /** The striking rune line, which multiplies WEAPON dice only. */
  striking?: string;
  /** Runes etched on this weapon, by name (e.g. "+1 weapon potency", "greater striking",
   *  "flaming"). When present these DERIVE `weaponBonus` and `striking` at render via
   *  `pf2ResolveRunes`, so the sheet's numbers follow the runes the character actually has instead
   *  of being hand-entered and drifting out of sync. Absent → the manual fields stand alone. */
  runes?: string[];
  /** Hand-tuned away from how it came (S15) → drives the ✎ marker. */
  customized?: boolean;
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
  /** The spells the character actually HAS. The sidecar tracked slot COUNTS but never which
   *  spells filled them, so a PF2 sheet could say "3 rank-2 slots" and not name a single spell.
   *  Optional so every PF2 character already stored stays valid without migration. */
  spells?: PF2KnownSpell[];
  /** Current Focus Points in the pool (0–3). Focus spells are cast from this, not from slots; the pool
   *  refills to its max on a 10-minute Refocus. Optional — undefined = 0 — so no migration is needed. */
  focusPoints?: number;
}

/** A spell on a PF2 character: in a prepared caster's list for the day, or a spontaneous caster's
 *  repertoire. Cantrips are rank 0 and are always available. */
export interface PF2KnownSpell {
  name: string;
  rank: number;
  /** Prepared today. Meaningless for spontaneous casters, whose repertoire is always castable. */
  prepared?: boolean;
  /** A focus spell, cast from Focus Points rather than a slot. */
  focus?: boolean;
  /** Hand-tuned away from how it came (S15) → drives the ✎ marker, matching the 2024 sheet.
   *  A DIFFERENT axis from `offRules`: this says "edited", that says "not legally available". An
   *  element can carry both. */
  customized?: boolean;
  /** Overridden rules text, once the player has retuned it. Absent means "use the catalog entry". */
  effect?: string;
  /** Why this is outside what the character's class, level and tradition grant (Area MV). Set only
   *  on custom characters and DM grants — a vanilla one is refused outright. See Spell.offRules on
   *  the 5e side for why this is not `provenance`. */
  offRules?: string;
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
  /** Why this feat is outside what the character's level, class and prerequisites allow (Area MV).
   *  Set only on custom characters and DM grants. */
  offRules?: string;
  /** Hand-tuned away from how it came (S15) → drives the ✎ marker. Separate axis from offRules. */
  customized?: boolean;
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
  /** Special senses from ancestry/heritage (e.g. "Darkvision", "Low-light vision"). Display only. */
  senses?: string[];
}

/** A valid, empty PF2 character — level 1, all modifiers 0, untrained in everything.
 *
 *  The subsystem had only `buildPF2Character(picks)`, which forces every caller (and every test)
 *  to invent a full pick-set just to obtain a valid sidecar. This mirrors `blankIGCharacter` and
 *  5e's `blankCharacter` so the three systems are constructed the same way. */
export function blankPF2Character(name: string): PF2Character {
  const untrained = { rank: 'untrained' as PF2Rank, itemBonus: 0 };
  return {
    identity: {
      name, level: 1, ancestry: '', heritage: '', background: '', className: '', subclass: '',
      deity: '', size: 'Medium', alignment: '', bio: '', photoUrl: '',
    },
    attributes: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
    perception: { rank: 'untrained' },
    saves: { Fortitude: { ...untrained }, Reflex: { ...untrained }, Will: { ...untrained } },
    skills: [],
    combat: {
      ancestryHp: 0, classHpPerLevel: 0, currentHp: 0, tempHp: 0, dyingValue: 0, woundedValue: 0, heroPoints: 0,
      speed: 25, armorRank: 'untrained', dexCap: null, acItemBonus: 0,
      attackRank: 'untrained', classDcRank: 'untrained', classDcAttribute: 'STR',
      conditions: [],
    },
    attacks: [],
    // `tradition: 'none'` and `kind: 'none'` mean "does not cast" — a blank character is not a
    // caster, and the eligibility gate reads that rather than assuming.
    spellcasting: { tradition: 'none', kind: 'none', attribute: 'INT', rank: 'untrained', slots: [] },
    feats: [],
    languages: [],
  };
}

/** Runtime guard: is this stored value a PF2Character sidecar (character.data.pf2e)? */
export function isPF2Character(v: unknown): v is PF2Character {
  if (!v || typeof v !== 'object') return false;
  const c = v as Partial<PF2Character>;
  return !!c.identity && typeof c.identity === 'object' && !!c.attributes && Array.isArray(c.skills) && !!c.combat;
}
