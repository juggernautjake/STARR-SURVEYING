// lib/dnd/classes/homebrew-store.ts — the pure store for a character's HOMEBREW classes.
//
// A saved homebrew class is just a ClassDefinition kept on the character (character.data.homebrewClasses).
// The registry already accepts an `extra` array (findClass/subclassesFor), so once these are stored the
// level builder resolves a homebrew class exactly like an official one — a custom class is data, not a
// fork. This module manages that list: upsert by key (so re-saving an edited class replaces it),
// remove, and filter to a system (what the registry `extra` needs). Pure + unit-tested.
import type { ClassDefinition, SubclassDefinition } from './types';
import type { CustomFeat } from './custom';

/** Add or replace a homebrew class (matched by key). Returns a new array. */
export function upsertHomebrewClass(list: ClassDefinition[] | undefined, def: ClassDefinition): ClassDefinition[] {
  const rest = (list ?? []).filter((c) => c.key !== def.key);
  return [...rest, def];
}

/** Remove a homebrew class by key. */
export function removeHomebrewClass(list: ClassDefinition[] | undefined, key: string): ClassDefinition[] {
  return (list ?? []).filter((c) => c.key !== key);
}

/** The homebrew classes for a system — what to pass as the registry's `extra` (Ground Rule 1: a class
 *  is never valid outside its own system). */
export function homebrewClassesForSystem(list: ClassDefinition[] | undefined, system: string): ClassDefinition[] {
  return (list ?? []).filter((c) => c.system === system);
}

/** Read the homebrew-class list off a character's data blob, defensively (unknown/missing → []). */
export function readHomebrewClasses(data: unknown): ClassDefinition[] {
  const v = (data && typeof data === 'object' ? (data as { homebrewClasses?: unknown }).homebrewClasses : undefined);
  return Array.isArray(v) ? (v as ClassDefinition[]).filter((c) => c && typeof c === 'object' && typeof (c as ClassDefinition).key === 'string') : [];
}

// ── Homebrew feats (same key-based store) ──────────────────────────────────────────────────────────
/** Add or replace a homebrew feat (matched by key). */
export function upsertHomebrewFeat(list: CustomFeat[] | undefined, feat: CustomFeat): CustomFeat[] {
  return [...(list ?? []).filter((f) => f.key !== feat.key), feat];
}

/** Read the homebrew-feat list off a character's data blob, defensively. */
export function readHomebrewFeats(data: unknown): CustomFeat[] {
  const v = (data && typeof data === 'object' ? (data as { homebrewFeats?: unknown }).homebrewFeats : undefined);
  return Array.isArray(v) ? (v as CustomFeat[]).filter((f) => f && typeof f === 'object' && typeof (f as CustomFeat).key === 'string') : [];
}

// ── Homebrew subclasses (key-based store) ──────────────────────────────────────────────────────────
/** Add or replace a homebrew subclass (matched by key). */
export function upsertHomebrewSubclass(list: SubclassDefinition[] | undefined, sub: SubclassDefinition): SubclassDefinition[] {
  return [...(list ?? []).filter((s) => s.key !== sub.key), sub];
}

/** Read the homebrew-subclass list off a character's data blob, defensively. */
export function readHomebrewSubclasses(data: unknown): SubclassDefinition[] {
  const v = (data && typeof data === 'object' ? (data as { homebrewSubclasses?: unknown }).homebrewSubclasses : undefined);
  return Array.isArray(v) ? (v as SubclassDefinition[]).filter((s) => s && typeof s === 'object' && typeof (s as SubclassDefinition).key === 'string') : [];
}
