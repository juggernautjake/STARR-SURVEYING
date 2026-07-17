import { describe, it, expect } from 'vitest';
import { speciesView } from '@/lib/dnd/species/view';

describe('speciesView — system-agnostic traits resolver', () => {
  it('resolves a 2024 species with its full per-trait text', () => {
    const v = speciesView('dnd5e-2024', 'Dwarf')!;
    expect(v.noun).toBe('Species');
    expect(v.source).toBe('vanilla');
    expect(v.size).toBe('Medium');
    expect(v.senses).toEqual(['Darkvision 120 ft']);
    expect(v.traits.length).toBeGreaterThan(0);
    expect(v.traits.every((t) => t.name && t.text)).toBe(true);
  });

  it('resolves a PF2 ancestry with size/speed/senses/heritages', () => {
    const v = speciesView('pathfinder2e', 'Dwarf')!;
    expect(v.noun).toBe('Ancestry');
    expect(v.source).toBe('vanilla');
    expect(v.speed).toBe(20);
    expect(v.senses).toEqual(['Darkvision']);
    expect(v.heritages).toContain('Rock');
    expect(v.traits[0].text).toMatch(/darkvision/i);
  });

  it('is system-scoped — a PF2 ancestry name does NOT resolve as a 2024 species (and vice-versa)', () => {
    // Leshy is a PF2 ancestry, not a 2024 species → custom under 2024.
    expect(speciesView('dnd5e-2024', 'Leshy')!.source).toBe('custom');
    // Aasimar is a 2024 species, not a PF2 ancestry → custom under PF2.
    expect(speciesView('pathfinder2e', 'Aasimar')!.source).toBe('custom');
  });

  it('degrades a homebrew/unknown lineage to a name-only custom view (never blank)', () => {
    const v = speciesView('dnd5e-2024', 'Crystalborn')!;
    expect(v.source).toBe('custom');
    expect(v.name).toBe('Crystalborn');
    expect(v.traits).toEqual([]);
  });

  it('uses the right noun for the system even when custom', () => {
    expect(speciesView('pathfinder2e', 'Homebrew Folk')!.noun).toBe('Ancestry');
    expect(speciesView('dnd5e-2014', 'Homebrew Folk')!.noun).toBe('Species');
  });

  it('returns null when there is no species name', () => {
    expect(speciesView('dnd5e-2024', '')).toBeNull();
    expect(speciesView('dnd5e-2024', null)).toBeNull();
  });
});
