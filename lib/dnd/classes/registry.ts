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

// D&D 5e 2014 (Slice 6a) — authored class-by-class; each is independently "known" (the registry
// degrades per class, so an un-authored 2014 class simply falls back to the AI/homebrew path).
import { BARBARIAN_2014, BARBARIAN_SUBCLASSES_2014 } from './dnd5e-2014/barbarian';
import { FIGHTER_2014, FIGHTER_SUBCLASSES_2014 } from './dnd5e-2014/fighter';
import { ROGUE_2014, ROGUE_SUBCLASSES_2014 } from './dnd5e-2014/rogue';
import { MONK_2014, MONK_SUBCLASSES_2014 } from './dnd5e-2014/monk';
import { RANGER_2014, RANGER_SUBCLASSES_2014 } from './dnd5e-2014/ranger';
import { PALADIN_2014, PALADIN_SUBCLASSES_2014 } from './dnd5e-2014/paladin';

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
 * `dnd5e-2024` is fully authored (all 12). `dnd5e-2014` is authored class-by-class (Slice 6a —
 * Barbarian first). Every other system has a rules catalog + glossary (enough to ground the AI,
 * validate a sheet and look rules up) but no level table — so the level builder reports
 * `classKnown: false` for them and offers the AI homebrew path, rather than pretending to walk a
 * table that doesn't exist. Resolution is PER CLASS, so a partially-authored system (2014 today)
 * offers its finished classes and falls back to homebrew for the rest.
 */
const DND5E_2014_CLASSES: ClassDefinition[] = [
  BARBARIAN_2014, FIGHTER_2014, ROGUE_2014, MONK_2014, RANGER_2014, PALADIN_2014,
];
const DND5E_2014_SUBCLASSES: SubclassDefinition[] = [
  ...BARBARIAN_SUBCLASSES_2014, ...FIGHTER_SUBCLASSES_2014, ...ROGUE_SUBCLASSES_2014,
  ...MONK_SUBCLASSES_2014, ...RANGER_SUBCLASSES_2014, ...PALADIN_SUBCLASSES_2014,
];

const BY_SYSTEM: Record<string, { classes: ClassDefinition[]; subclasses: SubclassDefinition[] }> = {
  'dnd5e-2024': { classes: DND5E_2024_CLASSES, subclasses: DND5E_2024_SUBCLASSES },
  // 2014 is authored class-by-class (Slice 6a). Barbarian first; the rest fall back to AI/homebrew
  // until authored — `findClass` resolves per class, so a partial system is not a broken one.
  'dnd5e-2014': { classes: DND5E_2014_CLASSES, subclasses: DND5E_2014_SUBCLASSES },
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

/**
 * The subclasses registered for a class, SCOPED TO ITS SYSTEM. The system is required because a
 * subclass key/name is only unique within an edition — a 2014 Barbarian and a 2024 Barbarian both
 * have a `barbarian` class and both a `berserker` subclass, and they must never be offered to each
 * other (Ground Rule 1/2). `extra` (homebrew) is likewise filtered to the system.
 */
export function subclassesFor(system: string, classKey: string, extra: SubclassDefinition[] = []): SubclassDefinition[] {
  const pool = [...(BY_SYSTEM[system]?.subclasses ?? []), ...extra.filter((s) => s.system === system)];
  return pool.filter((s) => s.classKey === classKey);
}

/** Find one subclass by key or name, scoped to its system (keys collide across editions). */
export function findSubclass(system: string, key: string, extra: SubclassDefinition[] = []): SubclassDefinition | null {
  const want = norm(key || '');
  if (!want) return null;
  const pool = [...(BY_SYSTEM[system]?.subclasses ?? []), ...extra.filter((s) => s.system === system)];
  return pool.find((s) => norm(s.key) === want) ?? pool.find((s) => norm(s.name) === want) ?? null;
}
