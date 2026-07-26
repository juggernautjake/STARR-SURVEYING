// lib/dnd/spells/counts.ts — how many spells a character actually gets (slot plan S7, first half).
//
// The counts have been authored on the class definitions all along — `cantripsKnown` and `spellsKnown`,
// one entry per level, on thirteen class files. `snapshotAtLevel` even carries them onto every
// `LevelSnapshot`. And then exactly one place read them: the progression *display* table, which prints
// `cantripsKnown` and does not print `spellsKnown` at all. Nothing anywhere asked "may this character take
// another spell?" — the sheet's picker let a level-1 Bard add all four Bard cantrips and thirty more, and
// `preparedCap` was a field displayed on the sheet whose only value in the entire repo was hand-typed on a
// demo character.
//
// This is the same defect S1–S5 fixed for feats, in the same shape: the number was computed, shown to the
// player, and then not used. So this module is the missing counterpart to `maxSpellLevelFor` — that answers
// "how HIGH can they cast?", this answers "how MANY do they get?".
//
// It deliberately stops at reporting. Enforcing a cap in the pickers is the second half of S7 and a
// behaviour change on live characters; a count source that nothing yet blocks on is safe to land now and is
// what any enforcement has to be built on.
import { findClass } from '../classes/registry';
import { snapshotAtLevel } from '../classes/engine';

export interface SpellCounts {
  /** Cantrips the class grants at this level, or null when the class has no cantrip progression. */
  cantripsKnown: number | null;
  /**
   * Spells known — or, for a 2024 preparer, spells PREPARED.
   *
   * The field carries both meanings because the class data does: 2024 folded "known" and "prepared" into
   * one fixed per-level number, and the class files record it under `spellsKnown` (the wizard file says so
   * explicitly). `prepares` below is what tells them apart, so a caller can label it correctly rather than
   * guessing from the system.
   */
  spellsKnown: number | null;
  /** True when this class PREPARES from a list rather than knowing a fixed set. */
  prepares: boolean;
  /** The class's own sentence about how preparation works, when it has one — never paraphrased here. */
  preparedRule: string | null;
}

/**
 * Does this class prepare, or know?
 *
 * NOT `!!preparedRule`, which was the obvious guess and is wrong: the 2014 Bard carries one reading
 * *"Spells KNOWN (a Bard does not prepare)"*. That field describes how the class handles its list in
 * general, including saying it doesn't prepare at all.
 *
 * The real rule is an edition difference, stated in `dnd5e-2024/wizard.ts`: **2024 has no known-spells
 * casters**, so every 2024 caster prepares. 2014 has both, and its preparers are exactly the casters with a
 * `preparedRule` and no `spellsKnown` table — because a 2014 preparer's count is `level + ability modifier`,
 * which cannot be tabled per level at all.
 */
function preparesSpells(system: string, sc: { preparedRule?: string; spellsKnown?: number[] }): boolean {
  if (system === 'dnd5e-2024') return true;
  return !!sc.preparedRule && !Array.isArray(sc.spellsKnown);
}

const EMPTY: SpellCounts = { cantripsKnown: null, spellsKnown: null, prepares: false, preparedRule: null };

/** Read a per-level array the way the class files write them: index = character level, index 0 unused. */
function atLevel(table: number[] | undefined, level: number): number | null {
  if (!Array.isArray(table) || !table.length) return null;
  const i = Math.max(0, Math.min(table.length - 1, Math.round(level)));
  const n = table[i];
  return Number.isFinite(n) ? n : null;
}

/**
 * What a single-class character of this class and level gets.
 *
 * Returns nulls rather than zeros for a class that has no such progression — a Fighter is not a caster with
 * zero spells, and a Cleric with no `spellsKnown` array is unknown rather than none. A cap built on a zero
 * that meant "unknown" would block every pick, which is the worse failure.
 */
export function spellCountsFor(system: string, classKeyOrName: string | undefined, level: number): SpellCounts {
  if (!classKeyOrName) return EMPTY;
  const def = findClass(system, classKeyOrName);
  if (!def?.spellcasting) return EMPTY;
  const lvl = Math.max(1, Math.min(20, Math.round(level || 1)));
  // Read through the snapshot rather than the raw definition, so a subclass that alters the progression is
  // honoured by construction — the same reason the level walker reads snapshots.
  const snap = snapshotAtLevel(def, lvl);
  const preparedRule = typeof def.spellcasting.preparedRule === 'string' ? def.spellcasting.preparedRule : null;
  return {
    cantripsKnown: snap.cantripsKnown ?? atLevel(def.spellcasting.cantripsKnown, lvl),
    spellsKnown: snap.spellsKnown ?? atLevel(def.spellcasting.spellsKnown, lvl),
    prepares: preparesSpells(def.system, def.spellcasting),
    preparedRule,
  };
}

/**
 * The number to show beside "Prepared" on the sheet, or null when the class does not work that way.
 *
 * `Character.spellcasting.preparedCap` exists and is rendered, but was only ever SET on one hand-authored
 * demo character — so every real character displayed a bare count against no cap. Deriving it means the
 * number on the sheet is the class's actual number instead of a blank.
 *
 * Null for a 2014 preparer on purpose, not by oversight: that edition's count is `level + ability modifier`,
 * which this function cannot know from class and level alone. Returning a number there would mean inventing
 * one, and a wrong cap on the sheet is worse than no cap — a player would believe it.
 */
export function preparedCapFor(system: string, classKeyOrName: string | undefined, level: number): number | null {
  const counts = spellCountsFor(system, classKeyOrName, level);
  return counts.prepares ? counts.spellsKnown : null;
}
