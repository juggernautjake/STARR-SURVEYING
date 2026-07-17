// lib/dnd/species/view.ts — a system-agnostic "species / ancestry traits" view for the character sheet.
//
// Each system stores its playable-lineage data in its own shape (5e 2024 → SPECIES_2024 with per-trait
// text; Pathfinder 2e → PF2_ANCESTRIES with hp/size/speed/senses/heritages + a summary). The sheet wants
// ONE well-formatted panel that works for any system and degrades to whatever's recorded for a
// custom/homebrew lineage. This normalizes them to a single `SpeciesView`. Pure + data-only.
import { SPECIES_2024, findSpecies } from './dnd5e-2024';
import { PF2_ANCESTRIES } from '@/lib/dnd/systems/pathfinder2e/content';

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

  // 2014 / Intuitive Games / unknown / homebrew: no structured trait data — show what's recorded (the
  // name), so a custom lineage reads as intentional rather than blank. The noun follows the system.
  return { noun: system === 'pathfinder2e' ? 'Ancestry' : 'Species', name, traits: [], source: 'custom' };
}
