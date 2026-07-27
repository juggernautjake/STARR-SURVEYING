// __tests__/dnd/homebrew-library.test.ts — Area H2. The homebrew catalog projects into a per-system library
// section, into AI grounding, and into library search; seeded with the Rangor race + Pugilist class.
//
// SCOPE CHANGED 2026-07-27 by the owner: *"The rangor will be shown in the custom races for all systems, and
// the pugilist will be shown in the custom classes for 5e 2024"*, with the Pugilist *"attributed to Andrew
// and Jacob"*. So the seeds are no longer uniform — one is `'any'`, one is `'dnd5e-2024'` — and the
// assertions below are per-seed rather than a loop over a shared expectation. That difference is the point:
// a loop asserting every seed is identical is what made the old scoping look deliberate when it was just
// the default.
import { describe, it, expect } from 'vitest';
import { HOMEBREW_SEEDS } from '@/lib/dnd/homebrew/seeds';
import { homebrewLibrarySection, homebrewGrounding, HOMEBREW_SECTION_ID } from '@/lib/dnd/homebrew/projection';
import { normalizeHomebrew } from '@/lib/dnd/homebrew/model';
import { libraryPageFor, searchLibrary } from '@/lib/dnd/library';

const byId = Object.fromEntries(HOMEBREW_SEEDS.map((s) => [s.id, s]));
const OTHER_SYSTEMS = ['dnd5e-2014', 'pathfinder2e', 'intuitive-games'] as const;

describe('seeds (H2)', () => {
  it('every seed is a complete, valid, approved row', () => {
    // `name` is asserted explicitly because omitting it is silent at the projection layer: the library
    // entry still renders its "Race · by Jacob" brief and simply has no title. That is exactly what a
    // careless edit to this file produced while making this very change — the section looked populated
    // and one card had no name.
    for (const s of HOMEBREW_SEEDS) {
      expect(s.name, `${s.id} has no name`).toBeTruthy();
      expect(s.status, `${s.id}`).toBe('approved');
      expect(s.creator.name, `${s.id} must never be anonymous`).toBeTruthy();
      expect(normalizeHomebrew(s), `${s.id} must parse`).not.toBeNull();
    }
  });

  it('Rangor is a race scoped to EVERY system', () => {
    expect(byId['hb-rangor-race'].kind).toBe('race');
    expect(byId['hb-rangor-race'].name).toBe('Rangor');
    expect(byId['hb-rangor-race'].system).toBe('any');
    expect(byId['hb-rangor-race'].creator.name).toBe('Jacob');
  });

  it('Pugilist is a 2024 class co-credited to Andrew & Jacob', () => {
    expect(byId['hb-pugilist-class'].kind).toBe('class');
    expect(byId['hb-pugilist-class'].name).toBe('Pugilist');
    expect(byId['hb-pugilist-class'].system).toBe('dnd5e-2024');
    expect(byId['hb-pugilist-class'].creator.name).toBe('Andrew & Jacob');
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
    const pugilist = sec!.entries!.find((e) => e.name === 'Pugilist')!;
    expect(pugilist.brief).toBe('Class · by Andrew & Jacob');
  });

  it('every other system now shows Rangor, and ONLY Rangor', () => {
    // The owner's decision in its observable form. The Pugilist must not leak with it — Ground Rule 1 is
    // that content is never valid outside its own system, and `'any'` is a scope, not an escape hatch.
    for (const sys of OTHER_SYSTEMS) {
      const sec = homebrewLibrarySection(HOMEBREW_SEEDS, sys);
      expect(sec, `${sys} should now have a homebrew section`).not.toBeNull();
      expect(sec!.entries!.map((e) => e.name)).toEqual(['Rangor']);
    }
  });

  it('the homebrew section now appears on every one of those library pages', () => {
    for (const sys of ['dnd5e-2024', ...OTHER_SYSTEMS]) {
      const page = libraryPageFor(sys);
      expect(page, `${sys} has no library page`).not.toBeNull();
      expect(page!.sections.some((s) => s.id === HOMEBREW_SECTION_ID), `${sys}`).toBe(true);
    }
  });
});

describe('AI grounding projection (H2)', () => {
  it('lists each piece with a DM-permission caveat', () => {
    const g = homebrewGrounding(HOMEBREW_SEEDS, 'dnd5e-2024');
    expect(g).toMatch(/only if the DM has allowed it/);
    expect(g).toMatch(/Rangor \(Race, by Jacob\)/);
    expect(g).toMatch(/Pugilist \(Class, by Andrew & Jacob\)/);
  });

  it('and grounds Rangor — but not the Pugilist — for the other systems', () => {
    for (const sys of OTHER_SYSTEMS) {
      const g = homebrewGrounding(HOMEBREW_SEEDS, sys);
      expect(g, `${sys}`).toMatch(/Rangor \(Race, by Jacob\)/);
      expect(g, `${sys} must not ground a 2024-only class`).not.toMatch(/Pugilist/);
    }
  });
});

describe('search integration (H2)', () => {
  it('finds homebrew by name in the right system', () => {
    expect(searchLibrary('Pugilist', 'dnd5e-2024').some((h) => h.name === 'Pugilist')).toBe(true);
    // Still scoped: the 2024-only class does not surface under PF2, even though Rangor now does.
    expect(searchLibrary('Pugilist', 'pathfinder2e').some((h) => h.name === 'Pugilist')).toBe(false);
  });

  it('and finds Rangor from every system', () => {
    for (const sys of ['dnd5e-2024', ...OTHER_SYSTEMS]) {
      expect(searchLibrary('Rangor', sys).some((h) => h.name === 'Rangor'), `${sys}`).toBe(true);
    }
  });
});

describe('what these seeds deliberately do NOT do yet', () => {
  // The owner asked for a class people can "find and use". Find: done, above. USE means adoption onto a
  // character, and `homebrewToClassDefinition` requires a structurally-valid 20-level ClassDefinition —
  // it refuses anything less rather than storing a class the level builder cannot level.
  //
  // The repo holds real Pugilist rules only through level 3. The authoritative source is a shared PDF that
  // is not in the repo, so levels 4–20 would have to be invented, which Ground Rule 3 forbids. This pins
  // the boundary in BOTH directions: it fails if someone quietly invents a payload, and it is the first
  // thing to delete when the real table arrives.
  it('neither seed carries a mechanical payload, so neither is adoptable', () => {
    for (const s of HOMEBREW_SEEDS) {
      expect(s.payload, `${s.id} gained a payload — was it sourced, or invented?`).toBeUndefined();
    }
  });

  it('the prose that IS there is real, lifted from the character sheet', () => {
    // Guards against the other failure mode: a summary that drifts from what the sheet actually grants.
    expect(byId['hb-pugilist-class'].description).toMatch(/Fisticuffs/);
    expect(byId['hb-pugilist-class'].description).toMatch(/Moxie/);
    expect(byId['hb-rangor-race'].description).toMatch(/Natural Armor/);
  });
});
