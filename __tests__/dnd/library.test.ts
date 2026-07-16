// __tests__/dnd/library.test.ts — the rules library's page model + search.
// Both are pure and DB-free on purpose: the library must be fully readable and searchable with
// no embeddings key and no seeded dnd_system_entries rows (which is the current live state).
import { describe, it, expect } from 'vitest';
import { libraryPageFor, allLibraryPages, searchLibrary, taglineFor } from '@/lib/dnd/library';
import { GAME_SYSTEMS } from '@/lib/dnd/systems';
import { rulesForSystem } from '@/lib/dnd/system-rules';

describe('library pages', () => {
  it('builds a page for every registered system', () => {
    const pages = allLibraryPages();
    expect(pages.length).toBe(GAME_SYSTEMS.length);
    expect(pages.length).toBeGreaterThanOrEqual(10);
    for (const p of pages) {
      expect(p.name, `${p.key} name`).toBeTruthy();
      expect(p.source, `${p.key} source`).toBeTruthy();
      expect(p.sections.length, `${p.key} sections`).toBeGreaterThanOrEqual(6);
      // Every section must actually carry content — no empty shells.
      for (const s of p.sections) {
        const filled = !!(s.body?.length || s.facts?.length || s.chips?.length || s.table?.rows.length);
        expect(filled, `${p.key} → ${s.title} has content`).toBe(true);
      }
    }
  });

  it('returns null for an unknown system', () => {
    expect(libraryPageFor('not-a-system')).toBeNull();
  });

  it('uses each system’s OWN nouns rather than calling everything a class', () => {
    const titles = (k: string) => libraryPageFor(k)!.sections.map((s) => s.title);
    expect(titles('blades')).toContain('Playbooks');
    expect(titles('blades')).toContain('Heritages');
    expect(titles('cyberpunk-red')).toContain('Roles');
    expect(titles('shadowrun6e')).toContain('Archetypes');
    expect(titles('shadowrun6e')).toContain('Metatypes');
    expect(titles('coc7e')).toContain('Occupations');
    expect(titles('pathfinder2e')).toContain('Ancestries');
    expect(titles('dnd5e-2024')).toContain('Classes');
  });

  it('states plainly when a system has no levels', () => {
    const adv = (k: string) => libraryPageFor(k)!.sections.find((s) => s.id === 'advancement')!.facts!.find((f) => f.label === 'Levels')!.value;
    expect(adv('coc7e')).toMatch(/NO character levels/);
    expect(adv('blades')).toMatch(/NO character levels/);
    expect(adv('dnd5e-2024')).toMatch(/Levels 1–20/);
  });

  it('taglines characterise the core maths honestly', () => {
    expect(taglineFor(rulesForSystem('coc7e')!)).toMatch(/d100 roll-under/);
    expect(taglineFor(rulesForSystem('coc7e')!)).toMatch(/no levels/);
    expect(taglineFor(rulesForSystem('blades')!)).toMatch(/highest die/);
    expect(taglineFor(rulesForSystem('shadowrun6e')!)).toMatch(/count hits/);
    expect(taglineFor(rulesForSystem('cyberpunk-red')!)).toMatch(/1d10/);
    expect(taglineFor(rulesForSystem('dnd5e-2014')!)).toMatch(/levels 1–20/);
  });

  it('the class table shows a hit die for 5e and flat HP for PF2', () => {
    const t = (k: string) => libraryPageFor(k)!.sections.find((s) => s.id === 'classes')!.table!;
    expect(t('dnd5e-2014').headers).toContain('Hit die');
    expect(t('dnd5e-2014').rows.find((r) => r[0] === 'Barbarian')![2]).toBe('d12');
    expect(t('pathfinder2e').headers).toContain('HP / level');
    expect(t('pathfinder2e').rows.find((r) => r[0] === 'Barbarian')![2]).toBe('12');
  });
});

describe('searchLibrary', () => {
  it('finds a rule by keyword within one system', () => {
    const hits = searchLibrary('sanity', 'coc7e');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.system === 'coc7e')).toBe(true);
  });

  it('scoped search NEVER leaks another system', () => {
    for (const key of GAME_SYSTEMS.map((s) => s.key)) {
      const hits = searchLibrary('attack', key);
      expect(hits.every((h) => h.system === key), `${key} scoped`).toBe(true);
    }
  });

  it('cross-system search reports which system each hit came from', () => {
    const hits = searchLibrary('barbarian');
    expect(hits.length).toBeGreaterThan(0);
    const systems = new Set(hits.map((h) => h.system));
    // Barbarian exists in both 5e editions and both Pathfinders.
    expect(systems.size).toBeGreaterThan(1);
    for (const h of hits) expect(h.systemName).toBeTruthy();
  });

  it('requires every word to match (AND, not OR)', () => {
    const hits = searchLibrary('zzzznotaword sanity', 'coc7e');
    expect(hits).toEqual([]);
  });

  it('ranks an exact name match first', () => {
    const hits = searchLibrary('stealth', 'dnd5e-2014');
    expect(hits[0].name.toLowerCase()).toBe('stealth');
    expect(hits[0].kind).toBe('skill');
  });

  it('finds classes, skills, species, conditions and feats by kind', () => {
    expect(searchLibrary('wizard', 'dnd5e-2014').some((h) => h.kind === 'class')).toBe(true);
    expect(searchLibrary('acrobatics', 'dnd5e-2014').some((h) => h.kind === 'skill')).toBe(true);
    expect(searchLibrary('tiefling', 'dnd5e-2014').some((h) => h.kind === 'species')).toBe(true);
    expect(searchLibrary('poisoned', 'dnd5e-2014').some((h) => h.kind === 'condition')).toBe(true);
    expect(searchLibrary('lucky', 'dnd5e-2014').some((h) => h.kind === 'feat')).toBe(true);
  });

  it('finds the non-d20 systems’ own vocabulary', () => {
    expect(searchLibrary('moxie', 'coc7e')).toEqual([]); // not a CoC concept
    expect(searchLibrary('trauma', 'blades').length).toBeGreaterThan(0);
    expect(searchLibrary('cyberpsychosis', 'cyberpunk-red').length).toBeGreaterThan(0);
    expect(searchLibrary('essence', 'shadowrun6e').length).toBeGreaterThan(0);
  });

  it('is empty for a blank query', () => {
    expect(searchLibrary('   ')).toEqual([]);
    expect(searchLibrary('')).toEqual([]);
  });
});
