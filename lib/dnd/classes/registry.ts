// lib/dnd/classes/registry.ts — the one place a class is looked up.
//
// Keyed by SYSTEM first, because a class is never valid outside its own system: a 2024 Ranger and
// a 2014 Ranger are genuinely different classes, and asking for "Ranger" without saying which book
// is the exact mistake this platform exists to prevent.
//
// Homebrew classes are looked up through the same functions (`findClass` accepts a runtime list),
// so nothing downstream needs to know whether a class came from a book or a player.
import type { ClassDefinition, SubclassDefinition } from './types';

import { BARBARIAN_2024, BARBARIAN_SUBCLASSES_2024 } from './dnd5e-2024/barbarian';
import { BARD_2024, BARD_SUBCLASSES_2024 } from './dnd5e-2024/bard';
import { CLERIC_2024, CLERIC_SUBCLASSES_2024 } from './dnd5e-2024/cleric';
import { DRUID_2024, DRUID_SUBCLASSES_2024 } from './dnd5e-2024/druid';
import { FIGHTER_2024, FIGHTER_SUBCLASSES_2024 } from './dnd5e-2024/fighter';
import { MONK_2024, MONK_SUBCLASSES_2024 } from './dnd5e-2024/monk';
import { PALADIN_2024, PALADIN_SUBCLASSES_2024 } from './dnd5e-2024/paladin';
import { RANGER_2024, RANGER_SUBCLASSES_2024 } from './dnd5e-2024/ranger';
import { ROGUE_2024, ROGUE_SUBCLASSES_2024 } from './dnd5e-2024/rogue';
import { SORCERER_2024, SORCERER_SUBCLASSES_2024 } from './dnd5e-2024/sorcerer';
import { WARLOCK_2024, WARLOCK_SUBCLASSES_2024 } from './dnd5e-2024/warlock';
import { WIZARD_2024, WIZARD_SUBCLASSES_2024 } from './dnd5e-2024/wizard';

const DND5E_2024_CLASSES: ClassDefinition[] = [
  BARBARIAN_2024, BARD_2024, CLERIC_2024, DRUID_2024, FIGHTER_2024, MONK_2024,
  PALADIN_2024, RANGER_2024, ROGUE_2024, SORCERER_2024, WARLOCK_2024, WIZARD_2024,
];

const DND5E_2024_SUBCLASSES: SubclassDefinition[] = [
  ...BARBARIAN_SUBCLASSES_2024, ...BARD_SUBCLASSES_2024, ...CLERIC_SUBCLASSES_2024,
  ...DRUID_SUBCLASSES_2024, ...FIGHTER_SUBCLASSES_2024, ...MONK_SUBCLASSES_2024,
  ...PALADIN_SUBCLASSES_2024, ...RANGER_SUBCLASSES_2024, ...ROGUE_SUBCLASSES_2024,
  ...SORCERER_SUBCLASSES_2024, ...WARLOCK_SUBCLASSES_2024, ...WIZARD_SUBCLASSES_2024,
];

/**
 * Classes with FULL level 1–20 data, by system.
 *
 * Only `dnd5e-2024` is authored so far. Every other system has a rules catalog + glossary (enough
 * to ground the AI, validate a sheet and look rules up) but no level table — so the level builder
 * reports `classKnown: false` for them and offers the AI homebrew path, rather than pretending to
 * walk a table that doesn't exist.
 */
const BY_SYSTEM: Record<string, { classes: ClassDefinition[]; subclasses: SubclassDefinition[] }> = {
  'dnd5e-2024': { classes: DND5E_2024_CLASSES, subclasses: DND5E_2024_SUBCLASSES },
};

/** True when a system has full class progression data (not just a rules catalog). */
export function systemHasClasses(system: string): boolean {
  return !!BY_SYSTEM[system]?.classes.length;
}

/** Every class of a system, official only. */
export function classesForSystem(system: string): ClassDefinition[] {
  return BY_SYSTEM[system]?.classes ?? [];
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Find a class by key OR display name, within a system.
 *
 * `extra` lets a caller pass homebrew classes (from the character or campaign) so they resolve
 * exactly like official ones — the whole point of custom classes being plain data.
 */
export function findClass(system: string, keyOrName: string, extra: ClassDefinition[] = []): ClassDefinition | null {
  const want = norm(keyOrName || '');
  if (!want) return null;
  const pool = [...classesForSystem(system), ...extra.filter((c) => c.system === system)];
  return pool.find((c) => norm(c.key) === want) ?? pool.find((c) => norm(c.name) === want) ?? null;
}

/** The subclasses registered for a class key. */
export function subclassesFor(classKey: string, extra: SubclassDefinition[] = []): SubclassDefinition[] {
  const all = [...Object.values(BY_SYSTEM).flatMap((s) => s.subclasses), ...extra];
  return all.filter((s) => s.classKey === classKey);
}

/** Find one subclass by key. */
export function findSubclass(key: string, extra: SubclassDefinition[] = []): SubclassDefinition | null {
  const want = norm(key || '');
  if (!want) return null;
  const all = [...Object.values(BY_SYSTEM).flatMap((s) => s.subclasses), ...extra];
  return all.find((s) => norm(s.key) === want) ?? all.find((s) => norm(s.name) === want) ?? null;
}
