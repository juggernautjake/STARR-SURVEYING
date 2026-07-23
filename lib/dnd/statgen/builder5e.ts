// statgen/builder5e — the pure LOGIC layer for the 5e manual builder (MB-2).
//
// The builder UI (MB-2) is dropdowns over the real 5e catalogs; this module answers the questions those
// dropdowns depend on, from the catalog data, WITHOUT any React — so the rules are unit-tested and the UI is a
// thin binding. It resolves the ability increases the `StatGenPanel` needs (racial for 2014, background spread
// for 2024), the level a class gets its subclass, the levels feats/ASIs are offered, and validates a set of
// picks (class exists, subclass only once it's unlocked, etc.).
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';
import { speciesView } from '@/lib/dnd/species/view';
import { backgroundsForSystem, backgroundsGrantAbilityIncreases } from '@/lib/dnd/backgrounds/index';
import { findClass, subclassesFor } from '@/lib/dnd/classes/registry';

export interface Dnd5ePicks {
  system: string;
  level: number;
  species?: string;
  className?: string;
  subclass?: string;
  background?: string;
}

/** The racial ability increases for a chosen species (2014 grants them; 2024 does not — increases come from
 *  the background there). `speciesView` resolves both a base race and a subrace ("Hill Dwarf"), summing the
 *  subrace's increase in. Returns {} when there's no species or the edition grants none. */
export function dnd5eSpeciesIncreases(system: string, speciesName?: string): Partial<Record<AbilityKey, number>> {
  if (!speciesName) return {};
  const view = speciesView(system, speciesName);
  return view?.abilityIncreases ?? {};
}

/** The three abilities a 2024 background lets its +2/+1 (or +1/+1/+1) spread go to. Empty for 2014 (its
 *  backgrounds grant no increase) or an unknown background. */
export function dnd5eBackgroundAbilities(system: string, backgroundName?: string): AbilityKey[] {
  if (!backgroundName || !backgroundsGrantAbilityIncreases(system)) return [];
  const bg = backgroundsForSystem(system).find((b) => b.name.toLowerCase() === backgroundName.toLowerCase());
  return bg ? [...bg.abilityScores] : [];
}

/** The level a class unlocks its subclass (Cleric 1, most others 3). 0 if the class isn't found. */
export function dnd5eSubclassLevelFor(system: string, classKeyOrName?: string): number {
  if (!classKeyOrName) return 0;
  return findClass(system, classKeyOrName)?.subclassLevel ?? 0;
}

/** The levels this class offers an ASI/feat (e.g. 4, 8, 12, 16, 19). Empty if the class isn't found. */
export function dnd5eFeatLevelsFor(system: string, classKeyOrName?: string): number[] {
  if (!classKeyOrName) return [];
  return findClass(system, classKeyOrName)?.asiLevels ?? [];
}

/** How many ASI/feat choices a character of `level` has had from this class (the count of asiLevels ≤ level). */
export function dnd5eFeatSlotsAtLevel(system: string, classKeyOrName: string | undefined, level: number): number {
  return dnd5eFeatLevelsFor(system, classKeyOrName).filter((l) => l <= level).length;
}

/** The subclass options for a class, as {key,name}. Empty if the class isn't found. */
export function dnd5eSubclassOptions(system: string, classKeyOrName?: string): { key: string; name: string }[] {
  if (!classKeyOrName) return [];
  const cls = findClass(system, classKeyOrName);
  if (!cls) return [];
  return subclassesFor(system, cls.key).map((s) => ({ key: s.key, name: s.name }));
}

export interface PicksValidation {
  valid: boolean;
  errors: string[];
  /** True once `level` has reached the class's subclass level, so the UI knows to require a subclass. */
  subclassUnlocked: boolean;
}

/** Validate a builder's picks against the catalogs: a real class, a level in 1–20, and — once the subclass
 *  level is reached — a chosen subclass that belongs to the class. Species/background are validated as
 *  present in the catalog when given. */
export function dnd5eValidatePicks(picks: Dnd5ePicks): PicksValidation {
  const errors: string[] = [];
  const level = Math.round(picks.level);
  if (!Number.isFinite(level) || level < 1 || level > 20) errors.push(`Level must be 1–20 (got ${picks.level}).`);

  const cls = picks.className ? findClass(picks.system, picks.className) : null;
  if (!picks.className) errors.push('Choose a class.');
  else if (!cls) errors.push(`Unknown class "${picks.className}" for this system.`);

  const subLevel = cls?.subclassLevel ?? 0;
  const subclassUnlocked = !!cls && level >= subLevel && subLevel > 0;
  if (subclassUnlocked) {
    const options = dnd5eSubclassOptions(picks.system, cls!.key);
    if (!picks.subclass) errors.push(`${cls!.name} chooses a subclass at level ${subLevel}.`);
    else if (!options.some((o) => o.key === picks.subclass || o.name.toLowerCase() === picks.subclass!.toLowerCase())) {
      errors.push(`"${picks.subclass}" isn't a subclass of ${cls!.name}.`);
    }
  }

  if (picks.species && !speciesView(picks.system, picks.species)) {
    errors.push(`Unknown species "${picks.species}" for this system.`);
  }
  if (picks.background && !backgroundsForSystem(picks.system).some((b) => b.name.toLowerCase() === picks.background!.toLowerCase())) {
    errors.push(`Unknown background "${picks.background}" for this system.`);
  }

  return { valid: errors.length === 0, errors, subclassUnlocked };
}
