// lib/dnd/species/view.ts — a system-agnostic "species / ancestry traits" view for the character sheet.
//
// Each system stores its playable-lineage data in its own shape (5e 2024 → SPECIES_2024 with per-trait
// text; 5e 2014 → RACES_2014 with racial ability increases + subraces; Pathfinder 2e → PF2_ANCESTRIES
// with hp/size/speed/senses/heritages + a summary). The sheet wants ONE well-formatted panel that works
// for any system and degrades to whatever's recorded for a custom/homebrew lineage. This normalizes them
// to a single `SpeciesView`. Pure + data-only.
//
// THIS FILE IS THE SYSTEM-KEYED DISPATCHER for lineage data (Ground Rule 1) — the same role
// `spellCatalog()` plays for spells. Adding an edition is a `case` here plus its own typed catalog
// module; it is never a widening of another edition's type.
//
// Until 2026-07-21 a `dnd5e-2014` character fell straight through to the `custom` arm and got a name
// with NO traits at all — no darkvision, no speed, no racial ability increase — so the panel read as
// though the player had invented "Dwarf". The catalog existed only as nine names in
// `system-rules.ts` with nothing behind them. 14-S7 gave 2014 its own data and registered it here.
import { SPECIES_2024, findSpecies } from './dnd5e-2024';
import { RACES_2014, RACES_2014_STATUS, resolveRace2014, raceAbilityIncreases2014, raceTraits2014 } from './dnd5e-2014';
import { PF2_ANCESTRIES } from '@/lib/dnd/systems/pathfinder2e/content';
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';

export interface SpeciesTraitLine { name: string; text: string }
export interface SpeciesView {
  /** The system's noun for this concept — "Species" (5e) or "Ancestry" (PF2). */
  noun: 'Species' | 'Ancestry';
  name: string;
  size?: string;
  speed?: number;
  senses?: string[];
  languages?: string[];
  /** Sub-lineage / heritage options for this lineage (Elf lineages, Dwarf heritages…). */
  heritages?: string[];
  /**
   * The racial ability score increases, summed across race + subrace. **2014 only, and that is the
   * point of the field**: in 2024 the increases come from the BACKGROUND and a species grants none,
   * so a 2024 view leaves this undefined and `species.test.ts` keeps it that way. A consumer that
   * finds this populated is looking at a 2014 sheet.
   *
   * It is ALSO rendered as the first trait line (see `abilityIncreaseLine`), because the existing
   * panel only knows how to draw `traits[]` — so the edition's headline rule reaches the player
   * today rather than waiting for a UI change.
   */
  abilityIncreases?: Partial<Record<AbilityKey, number>>;
  traits: SpeciesTraitLine[];
  /** 'vanilla' when resolved from a system's data; 'custom' when only the recorded name is known. */
  source: 'vanilla' | 'custom';
}

const norm = (s: string) => s.trim().toLowerCase();

/** Resolve the traits view for a character's species/ancestry under its system. Returns a `custom`
 *  view (name only) when the name doesn't match the system's data, and null when there's no name at
 *  all. System-scoped: a 5e species name never resolves against PF2 data and vice-versa (Ground Rule 1). */
export function speciesView(system: string | null | undefined, speciesName: string | null | undefined): SpeciesView | null {
  const name = (speciesName ?? '').trim();
  if (!name) return null;

  if (system === 'dnd5e-2024') {
    const sp = SPECIES_2024.find((s) => norm(s.name) === norm(name)) ?? findSpecies(name);
    if (sp) {
      const senses: string[] = [];
      if (sp.darkvision) senses.push(`Darkvision ${sp.darkvision} ft`);
      return {
        noun: 'Species', name: sp.name, size: sp.size, speed: sp.speed,
        senses: senses.length ? senses : undefined, heritages: sp.lineages,
        traits: sp.traits.map((t) => ({ name: t.name, text: t.text })), source: 'vanilla',
      };
    }
  }

  // ── 5e 2014 ────────────────────────────────────────────────────────────────────────────────────
  // Resolves BOTH "Dwarf" and "Hill Dwarf", because a 2014 sheet stores a free-text lineage name and
  // both are things a player legitimately types. A subrace answer carries the parent's traits too.
  if (system === 'dnd5e-2014') {
    const hit = resolveRace2014(name);
    if (hit) {
      const senses: string[] = [];
      if (hit.race.darkvision) senses.push(`Darkvision ${hit.race.darkvision} ft`);
      const languages = [...hit.race.languages];
      if (hit.race.extraLanguages) languages.push(hit.race.extraLanguages);
      const increases = raceAbilityIncreases2014(hit);
      return {
        noun: 'Species',
        // The subrace's own name when the player recorded one — "Hill Dwarf" is what they are.
        name: hit.subrace ? hit.subrace.name : hit.race.name,
        size: hit.race.size,
        speed: hit.race.speed,
        senses: senses.length ? senses : undefined,
        languages: languages.length ? languages : undefined,
        // Subrace NAMES only, so the panel can offer them the way it offers 2024 lineages.
        heritages: hit.race.subraces?.map((s) => s.name),
        abilityIncreases: increases,
        traits: [
          // The ability increase leads, because it is the thing 2024 does not have and the thing a
          // player most needs told. Free-choice increases (Half-Elf) are described, never chosen for
          // them — inventing the pick would be exactly the fabrication this catalog avoids.
          { name: 'Ability Score Increase', text: abilityIncreaseLine(increases, hit.race.abilityChoice?.text) },
          ...raceTraits2014(hit).map((t) => ({ name: t.name, text: t.text })),
        ],
        source: 'vanilla',
      };
    }
  }

  if (system === 'pathfinder2e') {
    const anc = PF2_ANCESTRIES.find((a) => norm(a.name) === norm(name));
    if (anc) {
      return {
        noun: 'Ancestry', name: anc.name, size: anc.size, speed: anc.speed,
        senses: anc.senses ? [anc.senses] : undefined, languages: anc.languages,
        heritages: anc.heritages,
        // PF2 ancestry rules text lives as a summary + traits list in the content library; surface the
        // summary as the headline trait and its keywords (Humanoid, Dwarf…) as a second line.
        traits: [
          { name: anc.name, text: anc.summary },
          ...(anc.traits.length ? [{ name: 'Traits', text: anc.traits.join(', ') }] : []),
        ],
        source: 'vanilla',
      };
    }
  }

  // Intuitive Games / unknown / homebrew, and any 5e name that ISN'T in its edition's catalog: no
  // structured trait data — show what's recorded (the name), so a custom lineage reads as intentional
  // rather than blank. The noun follows the system.
  return { noun: system === 'pathfinder2e' ? 'Ancestry' : 'Species', name, traits: [], source: 'custom' };
}

/** Render a summed ability-increase map as "STR +2, CHA +1", with any free-choice clause appended.
 *  Kept next to the view rather than in the catalog: this is presentation, and the catalog holds
 *  facts. Never returns an empty string — every 2014 race grants something. */
function abilityIncreaseLine(
  increases: Partial<Record<AbilityKey, number>>,
  choiceText?: string,
): string {
  const ORDER: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  const parts = ORDER.filter((a) => (increases[a] ?? 0) !== 0)
    .map((a) => `${a.toUpperCase()} +${increases[a]}`);
  // The 2014 Human is +1 to all six; say so rather than listing six near-identical clauses.
  const listed = parts.length === 6 && ORDER.every((a) => increases[a] === 1)
    ? 'Every ability score increases by 1.'
    : `${parts.join(', ')}.`;
  return choiceText ? `${listed} ${choiceText}` : listed;
}

/** Every lineage a system catalogs, as views — for pickers and coverage reporting. Unknown systems
 *  get [], never another system's list (Ground Rule 1, `system-bleed.test.ts`). */
export function speciesCatalogFor(system: string | null | undefined): SpeciesView[] {
  switch (system) {
    case 'dnd5e-2024': return SPECIES_2024.map((s) => speciesView(system, s.name)!).filter(Boolean);
    case 'dnd5e-2014': return RACES_2014.map((r) => speciesView(system, r.name)!).filter(Boolean);
    default: return [];
  }
}

/** Coverage for a system's lineage catalog, reported honestly (Ground Rule 2). Consumed by tests and
 *  available to any surface that wants to state what it does and does not hold. */
export interface SpeciesCoverage {
  system: string;
  total: number;
  /** Whether this edition's lineages grant ability score increases at all. 2014 yes, 2024 no. */
  grantsAbilityIncreases: boolean;
  completeForSources: boolean;
  completeForEdition: boolean;
  note: string;
}

export function speciesCoverage(system: string | null | undefined): SpeciesCoverage {
  switch (system) {
    case 'dnd5e-2024':
      return {
        system: 'dnd5e-2024', total: SPECIES_2024.length, grantsAbilityIncreases: false,
        completeForSources: true, completeForEdition: true,
        note: "The 10 Player's Handbook (2024) species plus any homebrew. A 2024 species grants NO ability score increases — those come from the background.",
      };
    case 'dnd5e-2014':
      return {
        system: 'dnd5e-2014', total: RACES_2014.length, grantsAbilityIncreases: true,
        completeForSources: RACES_2014_STATUS.completeForSources,
        completeForEdition: RACES_2014_STATUS.completeForEdition,
        note: RACES_2014_STATUS.note,
      };
    default:
      return {
        system: String(system ?? 'unknown'), total: 0, grantsAbilityIncreases: false,
        completeForSources: false, completeForEdition: false,
        note: 'No lineage catalog for this system.',
      };
  }
}
