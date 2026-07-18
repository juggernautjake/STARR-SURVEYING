// __tests__/dnd/homebrew-library.test.ts — Area H2. The homebrew catalog projects into a per-system library
// section, into AI grounding, and into library search; seeded with the Rangor race + Pugilist class.
import { describe, it, expect } from 'vitest';
import { HOMEBREW_SEEDS } from '@/lib/dnd/homebrew/seeds';
import { homebrewLibrarySection, homebrewGrounding, HOMEBREW_SECTION_ID } from '@/lib/dnd/homebrew/projection';
import { normalizeHomebrew } from '@/lib/dnd/homebrew/model';
import { libraryPageFor, searchLibrary } from '@/lib/dnd/library';

describe('seeds (H2)', () => {
  it('ship the Rangor race + Pugilist class, valid + approved + scoped to 2024', () => {
    const byId = Object.fromEntries(HOMEBREW_SEEDS.map((s) => [s.id, s]));
    expect(byId['hb-rangor-race'].kind).toBe('race');
    expect(byId['hb-pugilist-class'].kind).toBe('class');
    for (const s of HOMEBREW_SEEDS) {
      expect(s.status).toBe('approved');
      expect(s.system).toBe('dnd5e-2024');
      expect(s.creator.name).toBe('Jacob');
      expect(normalizeHomebrew(s)).not.toBeNull(); // each is a valid, parseable row
    }
  });
});

describe('library section projection (H2)', () => {
  it('builds a Custom/Homebrew section of collapsible entries with kind + creator attribution', () => {
    const sec = homebrewLibrarySection(HOMEBREW_SEEDS, 'dnd5e-2024');
    expect(sec).not.toBeNull();
    expect(sec!.id).toBe(HOMEBREW_SECTION_ID);
    expect(sec!.entries!.map((e) => e.name).sort()).toEqual(['Pugilist', 'Rangor']);
    const rangor = sec!.entries!.find((e) => e.name === 'Rangor')!;
    expect(rangor.brief).toBe('Race · by Jacob');
    expect(rangor.detail).toMatch(/Natural Armor/);
  });
  it('returns null for a system with no homebrew (section omitted)', () => {
    expect(homebrewLibrarySection(HOMEBREW_SEEDS, 'pathfinder2e')).toBeNull();
  });
  it('the 2024 library page includes the homebrew section; PF2 does not', () => {
    const page2024 = libraryPageFor('dnd5e-2024')!;
    expect(page2024.sections.some((s) => s.id === HOMEBREW_SECTION_ID)).toBe(true);
    const pagePf2 = libraryPageFor('pathfinder2e')!;
    expect(pagePf2.sections.some((s) => s.id === HOMEBREW_SECTION_ID)).toBe(false);
  });
});

describe('AI grounding projection (H2)', () => {
  it('lists each piece with a DM-permission caveat; empty for a bare system', () => {
    const g = homebrewGrounding(HOMEBREW_SEEDS, 'dnd5e-2024');
    expect(g).toMatch(/only if the DM has allowed it/);
    expect(g).toMatch(/Rangor \(Race, by Jacob\)/);
    expect(homebrewGrounding(HOMEBREW_SEEDS, 'pathfinder2e')).toBe('');
  });
});

describe('search integration (H2)', () => {
  it('finds homebrew by name in the right system', () => {
    const hits = searchLibrary('Pugilist', 'dnd5e-2024');
    expect(hits.some((h) => h.name === 'Pugilist')).toBe(true);
    // scoped: searching PF2 doesn't surface the 2024 homebrew
    expect(searchLibrary('Pugilist', 'pathfinder2e').some((h) => h.name === 'Pugilist')).toBe(false);
  });
});
