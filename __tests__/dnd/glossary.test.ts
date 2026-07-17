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

describe('the 2024 action economy is defined and searchable (library buildout)', () => {
  // The 12 standard 2024 actions + Bonus Action — the "action economy" the library must explain.
  const ACTIONS = ['Attack', 'Dash', 'Disengage', 'Dodge', 'Help', 'Hide', 'Influence', 'Magic', 'Ready', 'Search', 'Study', 'Utilize', 'Bonus Action'];

  it('defines every standard 2024 action with a substantive article', () => {
    for (const a of ACTIONS) {
      const entry = findTerm('dnd5e-2024', a);
      expect(entry, a).not.toBeNull();
      expect(entry!.body.length, a).toBeGreaterThan(80);
    }
  });

  it('surfaces core combat mechanics players look up (cover, temp HP, resistance, vision)', () => {
    for (const t of ['Cover', 'Temporary Hit Points', 'Damage Types & Resistance', 'Difficult Terrain', 'Vision & Light', 'Bloodied']) {
      expect(findTerm('dnd5e-2024', t), t).not.toBeNull();
    }
  });

  it('is reachable through search by common phrasings', () => {
    expect(searchGlossary('dnd5e-2024', 'disengage').some((h) => h.term === 'Disengage')).toBe(true);
    expect(searchGlossary('dnd5e-2024', 'temp hp').some((h) => h.term === 'Temporary Hit Points')).toBe(true);
    // aliases resolve too
    expect(findTerm('dnd5e-2024', 'resistance')?.term).toBe('Damage Types & Resistance');
    expect(findTerm('dnd5e-2024', 'darkvision')?.term).toBe('Vision & Light');
  });

  it('does NOT leak the 2024 action renames into 2014 (Influence/Study/Utilize/Magic are 2024)', () => {
    // These are 2024-named actions; the 2014 glossary must not resolve them (Ground Rule 2).
    for (const a of ['Influence', 'Study', 'Utilize', 'Bloodied']) {
      expect(findTerm('dnd5e-2014', a), a).toBeNull();
    }
  });
});

describe('the 2014 action economy is defined with 2014 names (not the 2024 renames)', () => {
  it('defines the 2014 standard actions including Cast a Spell and Use an Object', () => {
    for (const a of ['Action', 'Attack', 'Cast a Spell', 'Dash', 'Disengage', 'Dodge', 'Help', 'Hide', 'Ready', 'Search', 'Use an Object', 'Bonus Action']) {
      const e = findTerm('dnd5e-2014', a);
      expect(e, a).not.toBeNull();
      expect(e!.body.length, a).toBeGreaterThan(60);
    }
  });

  it('the editions carry their own action NAMES: 2014 Cast a Spell / Use an Object; 2024 Magic / Utilize', () => {
    // Positive existence per edition (the negative cross-edition leak is guarded by
    // system-integrity.test.ts, which asserts scoped lookups system-by-system).
    expect(findTerm('dnd5e-2014', 'Cast a Spell')?.term).toBe('Cast a Spell');
    expect(findTerm('dnd5e-2014', 'Use an Object')?.term).toBe('Use an Object');
    expect(findTerm('dnd5e-2024', 'Magic')?.term).toBe('Magic');
    expect(findTerm('dnd5e-2024', 'Utilize')?.term).toBe('Utilize');
    // The 2014 glossary array does not DEFINE the 2024-only renames as terms.
    const t2014 = glossaryFor('dnd5e-2014').map((e) => e.term);
    for (const n of ['Influence', 'Study', 'Utilize', 'Bloodied']) expect(t2014, n).not.toContain(n);
  });

  it('gives 2014 the same core combat mechanics as 2024 (cover, temp HP, resistance, vision)', () => {
    for (const t of ['Cover', 'Temporary Hit Points', 'Damage Types & Resistance', 'Difficult Terrain', 'Vision & Light']) {
      expect(findTerm('dnd5e-2014', t), t).not.toBeNull();
    }
  });
});

describe('no system glossary contains duplicate terms (integrity)', () => {
  it('every term (case-insensitive) is unique within each system', () => {
    for (const sys of SYSTEMS) {
      const terms = glossaryFor(sys).map((e) => e.term.toLowerCase());
      const dupes = terms.filter((t, i) => terms.indexOf(t) !== i);
      expect(dupes, `${sys} has duplicate terms: ${[...new Set(dupes)].join(', ')}`).toEqual([]);
    }
  });
});
