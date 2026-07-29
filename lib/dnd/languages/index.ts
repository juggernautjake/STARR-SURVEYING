// lib/dnd/languages/index.ts — which languages a system has, for the surfaces that offer a choice (P5-6).
//
// AUDIT C-9: `lib/dnd/languages/` held exactly one file, `dnd5e-2024.ts`. Every other system's language
// selection fell to free text — including Pathfinder 2e, whose sheet *displays* a languages line and had
// no catalogue behind it to pick from.
//
// GROUND RULE 3 SHAPES THIS FILE MORE THAN ANYTHING ELSE, and it is worth being explicit about what is and
// is not sourced:
//
//   · **5e 2024** — an authored, curated list. Sourced.
//   · **Pathfinder 2e** — DERIVED from `PF2_ANCESTRIES_FULL`, which already carries each ancestry's
//     languages verbatim from Player Core. This is aggregation, not authorship: every name here is one a
//     real ancestry grants, and if the ancestry data is right this is right.
//   · **5e 2014** — NOT the 2024 list. They differ in ways that matter: 2024 added Common Sign Language and
//     recategorised Druidic and Thieves' Cant as languages, where 2014 treats them as class features.
//     Reusing 2024's list would put four wrong entries in a 2014 picker, so 2014 has no catalogue until
//     one is sourced.
//   · **Intuitive Games** — no language list exists in the scrape. Free text, and it says so.
//
// The pattern is the same one `lib/dnd/xp.ts` uses for IG's missing XP table: a system with no source gets
// an honest "none catalogued" rather than a neighbour's data wearing its name.
import { normalizeSystem, type CharacterSystem } from '../systems';
import { LANGUAGES_2024, type Language } from './dnd5e-2024';
import { PF2_ANCESTRIES_FULL } from '@/lib/dnd/systems/pathfinder2e/data/ancestries';

export type { Language } from './dnd5e-2024';

export interface LanguageCatalog {
  languages: Language[];
  /** False when the system has no sourced list — the UI offers free text and says why. */
  catalogued: boolean;
  note: string;
}

/**
 * Pathfinder 2e's languages, aggregated from the ancestries that grant them.
 *
 * Every entry's `origin` is the ancestries that actually list it, which makes the derivation auditable at a
 * glance: if "Dwarven — Dwarf" ever reads "Dwarven — Dwarf, Elf", the ancestry data changed and someone
 * should look. `rarity` is deliberately left at `standard` for all of them rather than guessed — PF2 does
 * have common/uncommon/rare languages, and that classification is not in the ancestry rows.
 */
function derivePf2Languages(): Language[] {
  const origins = new Map<string, string[]>();
  for (const a of PF2_ANCESTRIES_FULL) {
    for (const raw of a.languages ?? []) {
      const name = String(raw).trim();
      if (!name) continue;
      const list = origins.get(name) ?? [];
      if (!list.includes(a.name)) list.push(a.name);
      origins.set(name, list);
    }
  }
  return [...origins.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, from]) => ({
      name,
      rarity: 'standard' as const,
      origin: from.join(', '),
    }));
}

// Derived once — the ancestry data is static, and recomputing it per render would be pure waste.
const PF2_LANGUAGES = derivePf2Languages();

export function languageCatalogFor(system: CharacterSystem | null | undefined): LanguageCatalog {
  switch (normalizeSystem(system)) {
    case 'dnd5e-2024':
      return { languages: LANGUAGES_2024, catalogued: true, note: 'The 2024 Player’s Handbook languages.' };
    case 'pathfinder2e':
      return {
        languages: PF2_LANGUAGES,
        catalogued: true,
        note: 'Derived from the ancestries that grant them — every entry is one a real ancestry lists.',
      };
    case 'dnd5e-2014':
      return {
        languages: [],
        catalogued: false,
        // Being specific about WHY is what stops someone "helpfully" pointing this at the 2024 list.
        note: 'No 2014 language list is catalogued yet. The 2024 list is deliberately not reused: it adds Common Sign Language and counts Druidic and Thieves’ Cant as languages, which 2014 treats as class features.',
      };
    default:
      return {
        languages: [],
        catalogued: false,
        note: 'No language list has been sourced for this system — enter languages as free text.',
      };
  }
}

/**
 * How many EXTRA languages a PF2 character may pick, beyond the ones their ancestry grants.
 *
 * The rule is recorded in `data/ancestries.ts` itself — "each ancestry also gets additional languages equal
 * to a positive Intelligence modifier; that is a universal rule, not a per-ancestry one" — which is why it
 * lives here beside the catalogue rather than being re-derived by whatever surface draws the picker. Note
 * "positive": a negative Intelligence modifier takes nothing away, so this floors at zero.
 */
export function pf2BonusLanguageSlots(intModifier: number): number {
  return Math.max(0, intModifier);
}

/** Just the names, for a picker. Empty when nothing is catalogued. */
export function languageNamesFor(system: CharacterSystem | null | undefined): string[] {
  return languageCatalogFor(system).languages.map((l) => l.name);
}
