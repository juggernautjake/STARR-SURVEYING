// lib/dnd/spells/index.ts — the system-keyed spell dispatcher.
//
// GROUND RULE 1: content is reached through a per-system dispatcher, never by widening one
// system's module. `system-integrity.test.ts` guards this. Feats/backgrounds/species are
// currently 2024-only and say so in their own headers; spells start with the dispatcher in
// place from the beginning so adding PF2's or 2014's list later is a registration, not a
// refactor of every call site.
//
// 2014 has its OWN catalog and never reuses 2024's. Many spells changed materially between
// editions (True Strike, Sleep, Cure Wounds, Chill Touch…), so serving 2024 data to a 2014 sheet
// would be quietly wrong — exactly the class of bug this per-system scoping exists to prevent.
//
// Until 2026-07-21 this case returned EMPTY, and the comment here explained that empty was the
// honest answer while no 2014 catalog existed. That was true when written and stopped being true
// once `dnd5e-2014.ts` was authored — the file had 200 verified records and simply exported none
// of them, so the fallthrough kept serving nothing. Registering it here is what turns a written
// catalog into a reachable one.
import { SPELLS_2024, SPELL_CATALOG_STATUS, type SpellDef, type SpellCatalogLevel, type SpellClass } from './dnd5e-2024';
import { SPELLS_2014, SPELLS_2014_STATUS } from './dnd5e-2014';

export type { SpellDef, SpellCatalogLevel, SpellClass, SpellSchool } from './dnd5e-2024';
export { SPELL_SCHOOLS, SPELLS_2024, SPELL_CATALOG_STATUS } from './dnd5e-2024';
export { SPELLS_2014, SPELLS_2014_STATUS } from './dnd5e-2014';

export interface SpellCatalog {
  spells: SpellDef[];
  /** False when the catalog is known to be partial — see SPELL_CATALOG_STATUS. */
  complete: boolean;
  note: string;
}

const EMPTY: SpellCatalog = {
  spells: [],
  complete: false,
  note: 'No spell catalog for this system yet.',
};

/** The spell catalog for a game system. Unknown or uncatalogued systems get an empty
 *  catalog — never another system's spells (Ground Rule 2: never invented). */
export function spellCatalog(system: string | null | undefined): SpellCatalog {
  switch (system) {
    case 'dnd5e-2024':
      return { spells: SPELLS_2024, complete: SPELL_CATALOG_STATUS.complete, note: SPELL_CATALOG_STATUS.note };
    case 'dnd5e-2014':
      return { spells: SPELLS_2014, complete: SPELLS_2014_STATUS.complete, note: SPELLS_2014_STATUS.note };
    default:
      return EMPTY;
  }
}

/** Every catalogued spell for a system, or [] when that system has no catalog. */
export function spellsForSystem(system: string | null | undefined): SpellDef[] {
  return spellCatalog(system).spells;
}

/** Resolve one spell within a system by key or display name (case-insensitive). */
export function findSpellForSystem(system: string | null | undefined, keyOrName: string): SpellDef | undefined {
  const q = keyOrName.trim().toLowerCase();
  return spellsForSystem(system).find((s) => s.key === q || s.name.toLowerCase() === q);
}
