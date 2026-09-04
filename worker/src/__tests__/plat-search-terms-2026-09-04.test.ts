import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { platSearchTerms, expandSubdivisionTerms } from '../research/plat-search-terms.js';

// ── C1: the plat search recipe — one subdivision name → the terms the county may have filed it under
//
// The appraisal roll says "OAK ESTATES SECTION 1"; the clerk filed the plat under "OAK ESTATES".
// "WILLIAMS CRK EST" is recorded "WILLIAMS CREEK ESTATES". A single-string search misses both.

describe('platSearchTerms', () => {
  it('keeps the base name first, then strips the section/phase suffix', () => {
    const t = platSearchTerms('Oak Estates Section 1');
    expect(t[0]).toBe('OAK ESTATES SECTION 1');
    expect(t).toContain('OAK ESTATES');
  });

  it('strips PHASE / UNIT / NO. designators too', () => {
    expect(platSearchTerms('Cedar Ridge Phase Two')).toContain('CEDAR RIDGE');
    expect(platSearchTerms('Cedar Ridge Unit 3')).toContain('CEDAR RIDGE');
    expect(platSearchTerms('Cedar Ridge No. 4')).toContain('CEDAR RIDGE');
  });

  it('expands recording-form abbreviations', () => {
    expect(platSearchTerms('Williams Crk Est')).toContain('WILLIAMS CREEK ESTATES');
    expect(platSearchTerms('Sunset Hgts Add')).toContain('SUNSET HEIGHTS ADDITION');
  });

  it('returns nothing for a name too short to search on', () => {
    expect(platSearchTerms('')).toEqual([]);
    expect(platSearchTerms('  ')).toEqual([]);
    expect(platSearchTerms(null)).toEqual([]);
  });

  it('deduplicates and caps the term count', () => {
    const t = platSearchTerms('OAK ESTATES');   // base == stripped == expanded
    expect(t).toEqual(['OAK ESTATES']);
    expect(platSearchTerms('A B C D E F G SECTION 1 PHASE 2').length).toBeLessThanOrEqual(6);
  });
});

describe('expandSubdivisionTerms', () => {
  it('keeps every original name (original spelling) first, then adds the recipe terms', () => {
    const terms = expandSubdivisionTerms(['Oak Estates Section 1', 'Cedar Ridge']);
    expect(terms[0]).toBe('Oak Estates Section 1');   // original spelling preserved and first
    expect(terms).toContain('Cedar Ridge');
    expect(terms).toContain('OAK ESTATES');            // recipe term added after
  });

  it('deduplicates case-insensitively and drops blanks', () => {
    const terms = expandSubdivisionTerms(['OAK ESTATES', 'oak estates', null, '']);
    expect(terms.filter((t) => t.toUpperCase() === 'OAK ESTATES')).toHaveLength(1);
  });
});

describe('the Bell run feeds the expanded terms into the plat search', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/counties/bell/orchestrator.ts'), 'utf8');
  it('uniqueSubdivisions is built from expandSubdivisionTerms', () => {
    expect(src).toContain('const uniqueSubdivisions = expandSubdivisionTerms([...knownIds.subdivisionNames])');
  });
});
