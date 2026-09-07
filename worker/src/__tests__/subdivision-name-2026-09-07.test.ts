// The subdivision name is the key to the plat. Three parsers each covered a different subset of the
// shapes a CAD legal description takes; the Bell run used the one that needed a KEYWORD, so a
// residential subdivision named without one produced no plat search at all. One parser now, every
// shape, and the three legacy exports delegate (checked as CALLERS, not just as a module).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSubdivisionName } from '../research/subdivision-name.js';
import { extractSubdivisionNameFromLegal as fromPlatScraper } from '../counties/bell/scrapers/plat-scraper.js';
import { extractSubdivisionNameFromLegal as fromClassifier } from '../services/bell-county-classifier.js';
import { extractSubdivisionName as fromCountyPlats } from '../services/county-plats.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

const cases: Array<[string, string | null]> = [
  // Bell CAD, the 1401 North East St parcel (live, 2026-09-07)
  ["WINNIE MAE ADDITION, BLOCK 001, LOT 4, PT 3, (E 34' OF 3)", 'WINNIE MAE ADDITION'],
  // A residential subdivision with NO keyword in its name — the shape the Bell path missed
  ['NORTH BELTON, BLOCK 12, LOT 4', 'NORTH BELTON'],
  ['ORIGINAL TOWN OF BELTON, BLOCK 5, LOT 3', 'ORIGINAL TOWN OF BELTON'],
  // Keep the phase / section / unit
  ['SUNRIDGE ESTATES PHASE 2, BLOCK A, LOT 3', 'SUNRIDGE ESTATES PHASE 2'],
  ['OAK HTS SUBD SEC 3, BLOCK 2, LOT 1', 'OAK HEIGHTS SUBDIVISION SECTION 3'],
  ['ASH FAMILY TRUST 12.358 ACRE ADDITION, BLOCK 001, LOT 0002', 'ASH FAMILY TRUST 12.358 ACRE ADDITION'],
  // Reversed
  ['LOT 3, BLOCK A, SUNRIDGE ESTATES', 'SUNRIDGE ESTATES'],
  ['BLOCK A, LOT 3, SUNRIDGE ESTATES, ACRES 0.25', 'SUNRIDGE ESTATES'],
  ['LOT 7, WESTWOOD', 'WESTWOOD'],
  // Space forms, abbreviated
  ['LOT 5 BLK 2 OAK CREEK ADDN', 'OAK CREEK ADDITION'],
  ['WINNIE MAE ADDITION LOT 4 BLK 1', 'WINNIE MAE ADDITION'],
  ['LAKESIDE VILLAGE BLK 3 LOT 12', 'LAKESIDE VILLAGE'],
  // No block
  ['WINNIE MAE ADDITION, LOT 4', 'WINNIE MAE ADDITION'],
  // Keyword name with no lot/block clause
  ['OAK CREEK ADDITION', 'OAK CREEK ADDITION'],
  ['PECAN GROVE SUBDIVISION, ACRES 2.0', 'PECAN GROVE SUBDIVISION'],
  // Not a platted lot
  ['A0123 J SMITH SURVEY, ACRES 10.5', null],
  ['ABSTRACT 456 TRACT 12, ACRES 3.2', null],
  ['BUSINESS PERSONAL PROPERTY AT 1401 N EAST ST', null],
  ['MINERAL INTEREST, A0123', null],
  ['', null],
  ['LOT 4', null],
  ['BLOCK 001, LOT 4', null],
];

describe('extractSubdivisionName — every shape Bell CAD writes', () => {
  for (const [legal, expected] of cases) {
    it(`${JSON.stringify(legal)} → ${expected === null ? 'null' : JSON.stringify(expected)}`, () => {
      expect(extractSubdivisionName(legal)).toBe(expected);
    });
  }
  it('is case-insensitive and whitespace-tolerant', () => {
    expect(extractSubdivisionName('  winnie mae addition ,  block 001 , lot 4 ')).toBe('WINNIE MAE ADDITION');
  });
});

describe('the three legacy exports are the same parser (the CALLERS)', () => {
  it('all three answer the no-keyword form the Bell path used to miss', () => {
    for (const f of [fromPlatScraper, fromClassifier, fromCountyPlats]) {
      expect(f('NORTH BELTON, BLOCK 12, LOT 4')).toBe('NORTH BELTON');
      expect(f('LOT 5 BLK 2 OAK CREEK ADDN')).toBe('OAK CREEK ADDITION');
      expect(f('A0123 J SMITH SURVEY, ACRES 10.5')).toBeNull();
    }
  });
  it('the Bell orchestrator still feeds the plat-scraper export into knownIds (the plat search key)', () => {
    const orch = read('counties/bell/orchestrator.ts');
    expect(orch).toContain('platScraper.extractSubdivisionNameFromLegal(ids.legalDescription)');
    expect(orch).toContain('knownIds.subdivisionNames.add(subdivName)');
  });
  it('none of the three keeps a private pattern set any more', () => {
    for (const rel of ['counties/bell/scrapers/plat-scraper.ts', 'services/bell-county-classifier.ts', 'services/county-plats.ts']) {
      const src = read(rel);
      expect(src, rel).toContain("research/subdivision-name.js'");
      expect(src, rel).not.toMatch(/const (?:additionMatch|lotBlkMatch|beforeBlock|afterBlock) = /);
    }
  });
});
