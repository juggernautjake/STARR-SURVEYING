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
