// __tests__/dnd/species.test.ts — 2024 species data (Slice 4).
//
// The invariant the doc names: "species grant no ASIs (the 2014-vs-2024 trap)." In 2024 the ability
// increases live entirely on the background; a species gives size/speed/type/traits and nothing else
// numeric to an ability. This asserts no species object carries an ability increase under ANY of the
// names one might sneak in as, so a 2014 habit can't quietly return.
import { describe, it, expect } from 'vitest';
import { SPECIES_2024, findSpecies } from '@/lib/dnd/species/dnd5e-2024';

// Names an ability increase could masquerade as, guarding against a 2014-style rider.
const ASI_KEYS = ['abilityScores', 'abilityIncrease', 'asi', 'abilityBonus', 'abilities', 'str', 'dex', 'con', 'int', 'wis', 'cha'];

describe('2024 species', () => {
  it('has the full 10-species PHB roster (plus any flagged homebrew), with unique keys', () => {
    const official = SPECIES_2024.filter((s) => !s.custom);
    expect(official).toHaveLength(10);
    const keys = SPECIES_2024.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length); // unique across official + homebrew
    for (const name of ['Aasimar', 'Dragonborn', 'Dwarf', 'Elf', 'Gnome', 'Goliath', 'Halfling', 'Human', 'Orc', 'Tiefling']) {
      expect(official.map((s) => s.name)).toContain(name);
    }
  });

  it('grant NO ability score increase — the 2014-vs-2024 trap', () => {
    for (const sp of SPECIES_2024) {
      for (const banned of ASI_KEYS) {
        expect(Object.prototype.hasOwnProperty.call(sp, banned), `${sp.name} must not have "${banned}"`).toBe(false);
      }
    }
  });

  it('each has a size, a positive speed, a creature type, and named traits with text', () => {
    for (const sp of SPECIES_2024) {
      expect(['Small', 'Medium', 'Small or Medium']).toContain(sp.size);
      expect(sp.speed).toBeGreaterThan(0);
      expect(sp.creatureType.length).toBeGreaterThan(0);
      expect(sp.traits.length).toBeGreaterThan(0);
      for (const t of sp.traits) {
        expect(t.name.length, `${sp.name} trait name`).toBeGreaterThan(0);
        expect(t.text.length, `${sp.name}: ${t.name}`).toBeGreaterThan(20);
      }
    }
  });

  it('spot-checks the distinctive numbers (dwarf/orc 120 ft darkvision, goliath 35 speed)', () => {
    expect(findSpecies('dwarf')?.darkvision).toBe(120);
    expect(findSpecies('orc')?.darkvision).toBe(120);
    expect(findSpecies('goliath')?.speed).toBe(35);
    expect(findSpecies('halfling')?.size).toBe('Small');
    expect(findSpecies('nope')).toBeUndefined();
  });

  it('every species has the RAW 2024 size / speed / darkvision (not just the spot-checked few)', () => {
    // Encodes the 2024-specific changes a typo would most likely miss: Dwarf & Gnome speed is 30 (up from
    // 25 in 2014), Dragonborn now HAS darkvision 60, Goliath moves at 35. darkvision is undefined for the
    // species without it. Pin all 10 so a wrong dark-sight range or speed can't slip past `speed > 0`.
    const GOLDEN: Record<string, { size: string; speed: number; darkvision?: number }> = {
      aasimar: { size: 'Small or Medium', speed: 30, darkvision: 60 },
      dragonborn: { size: 'Medium', speed: 30, darkvision: 60 },
      dwarf: { size: 'Medium', speed: 30, darkvision: 120 },
      elf: { size: 'Medium', speed: 30, darkvision: 60 },
      gnome: { size: 'Small', speed: 30, darkvision: 60 },
      goliath: { size: 'Medium', speed: 35 },
      halfling: { size: 'Small', speed: 30 },
      human: { size: 'Small or Medium', speed: 30 },
      orc: { size: 'Medium', speed: 30, darkvision: 120 },
      tiefling: { size: 'Small or Medium', speed: 30, darkvision: 60 },
    };
    // The golden table is the PHB (2024) roster; homebrew species (flagged `custom`) are additive and not
    // held to it — they just must not smuggle ability increases (asserted elsewhere).
    for (const sp of SPECIES_2024) {
      if (sp.custom) continue;
      const g = GOLDEN[sp.key];
      expect(g, `no golden entry for species "${sp.key}"`).toBeDefined();
      expect(sp.size, `${sp.name} size`).toBe(g.size);
      expect(sp.speed, `${sp.name} speed`).toBe(g.speed);
      expect(sp.darkvision, `${sp.name} darkvision`).toBe(g.darkvision); // undefined for no-darkvision species
    }
  });
});

describe('the sheet surfaces species as a rules-grounded picker (Slice 4 creation UI)', () => {
  const read = (p: string) => require('node:fs').readFileSync(require('node:path').join(process.cwd(), p), 'utf8');
  const HERO = read('app/dnd/_sheet/components/Hero.tsx');

  it('offers a 2024 species dropdown from SPECIES_2024, with a custom escape hatch', () => {
    expect(HERO).toContain("import { SPECIES_2024 }");
    expect(HERO).toContain('SpeciesPicker');
    expect(HERO).toContain('✎ Custom…');
    // gated to the 2024 system + edit mode
    expect(HERO).toContain("system === 'dnd5e-2024'");
    expect(HERO).toContain('editMode && is2024');
  });

  it('renders the system-agnostic Species/Ancestry traits panel (Area B)', () => {
    // The old 2024-only inline card became a shared, all-systems panel (SpeciesTraits + species/view).
    expect(HERO).toContain('SpeciesTraits');
    expect(HERO).toContain('<SpeciesTraits');
  });
});
