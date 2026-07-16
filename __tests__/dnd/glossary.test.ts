// __tests__/dnd/glossary.test.ts — the fully-explained rules terms behind the library search and
// the sheet's clickable rules.
//
// Two things matter here: the entries must be SUBSTANTIVE (a one-line stub is not lookupable),
// and they must never cross systems — the same word means different things in different games.
import { describe, it, expect } from 'vitest';
import { glossaryFor, findTerm, searchGlossary, searchAllGlossaries, systemsWithGlossary, termsMentionedIn } from '@/lib/dnd/glossary';

const SYSTEMS = systemsWithGlossary();

describe('coverage', () => {
  it('covers the 9 systems with authored glossaries', () => {
    expect(SYSTEMS.length).toBeGreaterThanOrEqual(9);
    for (const s of ['dnd5e-2014', 'dnd5e-2024', 'pathfinder2e', 'pathfinder1e', 'starfinder1e', 'coc7e', 'blades', 'cyberpunk-red', 'shadowrun6e']) {
      expect(SYSTEMS, s).toContain(s);
    }
  });

  it('returns an empty glossary for an unknown system rather than throwing', () => {
    expect(glossaryFor('not-a-system')).toEqual([]);
    expect(findTerm('not-a-system', 'anything')).toBeNull();
  });
});

describe.each(SYSTEMS)('%s glossary', (system) => {
  const g = glossaryFor(system);

  it('has a substantial number of entries', () => {
    expect(g.length).toBeGreaterThanOrEqual(25);
  });

  it('every entry is genuinely explained, not stubbed', () => {
    for (const e of g) {
      expect(e.term.trim(), 'term').toBeTruthy();
      expect(e.short.trim().length, `${e.term} short`).toBeGreaterThan(15);
      // The whole point: a lookup must return a real explanation.
      expect(e.body.trim().length, `${e.term} body`).toBeGreaterThan(120);
      expect(['condition', 'mechanic', 'action', 'term', 'class', 'feature', 'stat'], `${e.term} kind`).toContain(e.kind);
    }
  });

  it('has no duplicate terms', () => {
    const seen = new Set<string>();
    for (const e of g) {
      const k = e.term.toLowerCase();
      expect(seen.has(k), `duplicate: ${e.term}`).toBe(false);
      seen.add(k);
    }
  });

  it('every seeAlso resolves inside the SAME system', () => {
    const terms = new Set(g.map((e) => e.term.toLowerCase()));
    for (const e of g) {
      for (const ref of e.seeAlso ?? []) {
        expect(terms.has(ref.toLowerCase()), `${e.term} → seeAlso "${ref}" does not exist in ${system}`).toBe(true);
      }
    }
  });

  it('every entry is findable by its own term', () => {
    for (const e of g) expect(findTerm(system, e.term)?.term, e.term).toBe(e.term);
  });

  it('every alias resolves to its entry', () => {
    for (const e of g) {
      for (const a of e.aliases ?? []) {
        const hit = findTerm(system, a);
        expect(hit, `${system}: alias "${a}" of ${e.term}`).toBeTruthy();
      }
    }
  });
});

describe('the editions genuinely differ where they should', () => {
  it('Exhaustion is the tiered staircase in 2014 and a flat −2 in 2024', () => {
    const a = findTerm('dnd5e-2014', 'Exhaustion')!;
    const b = findTerm('dnd5e-2024', 'Exhaustion')!;
    expect(a.body).not.toBe(b.body);
    expect(a.body).toMatch(/Speed halved|Hit point maximum halved/i);
    expect(b.body).toMatch(/−2|-2/);
    expect(b.body).toMatch(/every d20 Test|d20/i);
  });

  it('Surprise costs a turn in 2014 but only initiative in 2024', () => {
    expect(findTerm('dnd5e-2014', 'Surprise')!.body).toMatch(/cannot move or take an action/i);
    expect(findTerm('dnd5e-2024', 'Surprise')!.body).toMatch(/disadvantage on its Initiative/i);
  });

  it('2024 species grant no ability scores; 2014 feats are optional', () => {
    expect(findTerm('dnd5e-2024', 'Species')!.body).toMatch(/no ability score increases/i);
    expect(findTerm('dnd5e-2014', 'Feat')!.body).toMatch(/optional/i);
  });

  it('Weapon Mastery and Origin Feat exist ONLY in 2024', () => {
    expect(findTerm('dnd5e-2024', 'Weapon Mastery')).toBeTruthy();
    expect(findTerm('dnd5e-2014', 'Weapon Mastery')).toBeNull();
    expect(findTerm('dnd5e-2024', 'Origin Feat')).toBeTruthy();
    expect(findTerm('dnd5e-2014', 'Origin Feat')).toBeNull();
  });

  it('both editions still share the identical conditions', () => {
    for (const t of ['Blinded', 'Charmed', 'Poisoned', 'Restrained', 'Stunned']) {
      expect(findTerm('dnd5e-2014', t)!.body).toBe(findTerm('dnd5e-2024', t)!.body);
    }
  });
});

describe('search', () => {
  it('finds a term by name, alias and prefix', () => {
    expect(findTerm('dnd5e-2024', 'AC')?.term).toMatch(/Armor Class/);
    expect(findTerm('dnd5e-2024', 'nat 20')?.term).toBe('Critical Hit');
    expect(findTerm('coc7e', 'san check')).toBeTruthy();
  });

  it('scoped search never leaks another system', () => {
    for (const s of SYSTEMS) {
      for (const h of searchGlossary(s, 'damage')) expect(h.system).toBe(s);
    }
  });

  it('ranks an exact term first', () => {
    const hits = searchGlossary('dnd5e-2024', 'Exhaustion');
    expect(hits[0].term).toBe('Exhaustion');
  });

  it('requires every word to match', () => {
    expect(searchGlossary('dnd5e-2024', 'zzzznotaword exhaustion')).toEqual([]);
  });

  it('cross-system search labels each hit with its system', () => {
    const hits = searchAllGlossaries('advantage');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(SYSTEMS).toContain(h.system);
  });

  it('is empty for a blank query', () => {
    expect(searchGlossary('dnd5e-2024', '  ')).toEqual([]);
    expect(searchAllGlossaries('')).toEqual([]);
  });
});

describe('termsMentionedIn — what makes sheet text clickable', () => {
  it('finds the terms inside a feature body', () => {
    const terms = termsMentionedIn('dnd5e-2024', 'On a hit the target is knocked Prone and has disadvantage on its next attack roll.');
    const names = terms.map((t) => t.term);
    expect(names).toContain('Prone');
    expect(names).toContain('Advantage'); // "disadvantage" is one of its aliases
  });

  it('prefers the longest match', () => {
    const terms = termsMentionedIn('coc7e', 'Make a Sanity check when you see it.');
    expect(terms[0].term.toLowerCase()).toContain('sanity');
  });

  it('does not match a term inside a longer word', () => {
    const terms = termsMentionedIn('dnd5e-2024', 'The character is unpronounceable and proneness is irrelevant.');
    expect(terms.map((t) => t.term)).not.toContain('Prone');
  });

  it('returns nothing for empty text', () => {
    expect(termsMentionedIn('dnd5e-2024', '')).toEqual([]);
  });
});
