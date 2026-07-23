// lib/dnd/classes/multiclass-resolve.ts — the ONE multiclass-aware resolver (MC-5e-5 foundation).
//
// The 5e sheet resolves the character's class in many places. Rather than teach each of them the multiclass
// rules, they will all route through this: given a character's stored class fields, it produces the resolved
// class list and the aggregated `MulticlassSnapshot` (features / HP / proficiency / spell slots combined). It
// lives above `engine` + `registry` (engine can't import registry — that would cycle) so it owns the
// registry lookup. Single-class characters resolve to their one class exactly as before, so routing the
// sheet through this is safe for every character.
import { findClass } from './registry';
import { resolveClassLevels, multiclassSnapshot, formatClassLevels, type MulticlassSnapshot } from './engine';
import type { ClassDefinition, SubclassDefinition, ClassLevel } from './types';

/** The sheet's stored standard spell-slot block: `current`/`max` pips per rank (1–9). */
export type SlotBlock = Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, { max: number; current: number }>>;

/** Rebuild the standard spell-slot block from a multiclass slot row (`[_, r1..r9]`), PRESERVING spent pips:
 *  a rank's `current` is clamped to the new max, and a newly-gained rank starts full. Pact (warlock) slots are
 *  separate in the rules and the sheet has no pact-slot field, so they are intentionally not merged here.
 *  Returns the new block, or `null` when there is no leveled caster row (so a non-caster split is untouched).
 *  This is what makes the level manager's "(multiclass table)" preview and the saved sheet agree (MC-5e-5). */
export function applyMulticlassSlots(
  row: readonly number[] | undefined,
  prev: SlotBlock | undefined,
): SlotBlock | null {
  if (!row) return null;
  const next: SlotBlock = {};
  for (let rank = 1 as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; rank <= 9; rank = (rank + 1) as typeof rank) {
    const max = Math.max(0, Math.floor(row[rank] ?? 0));
    if (max <= 0) continue;
    const had = prev?.[rank];
    const current = had ? Math.min(had.current, max) : max; // keep how many are spent; new rank starts full
    next[rank] = { max, current };
  }
  return next;
}

/** The class line a SHEET shows: the multiclass split ("Fighter 3 / Wizard 2") when the character holds more
 *  than one class, else the single class · subclass exactly as before. Display only — safe for every sheet. */
export function classDisplayFor(
  system: string,
  meta: { className?: string; subclass?: string; classes?: readonly ClassLevel[] | null },
): string {
  const classes = meta.classes ?? [];
  if (classes.length > 1) return formatClassLevels(classes, (k) => findClass(system, k)?.name ?? k);
  return [meta.className, meta.subclass].filter(Boolean).join(' · ');
}

/** A class-key → definition lookup for a system, honouring any homebrew classes/subclasses the character
 *  carries (resolved identically to official ones). Subclass resolution is left to the caller for now
 *  (the sheet threads its own subclass); the manager passes `null`. */
export function classLookupFor(
  system: string,
  extraClasses: ClassDefinition[] = [],
): (key: string) => { def: ClassDefinition; sub?: SubclassDefinition | null } | null {
  return (key: string) => {
    const def = findClass(system, key, extraClasses);
    return def ? { def, sub: null } : null;
  };
}

/** Resolve a character's classes + the aggregated multiclass snapshot in one call — the single entry point
 *  the sheet's class-resolution paths will use. `single` is the legacy `{className/subclass/level}` (its key
 *  form) and `multi` is `data.meta.classes`; `resolveClassLevels` picks whichever is authoritative. */
export function characterMulticlass(
  system: string,
  single: { classKey?: string | null; subclassKey?: string | null; level?: number | null },
  multi?: readonly ClassLevel[] | null,
  extraClasses: ClassDefinition[] = [],
): { classes: ClassLevel[]; snapshot: MulticlassSnapshot } {
  const classes = resolveClassLevels(single, multi);
  return { classes, snapshot: multiclassSnapshot(classes, classLookupFor(system, extraClasses)) };
}
