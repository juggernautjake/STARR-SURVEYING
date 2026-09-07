// The owner-name queries TexasFile answers (plan PLATS_FIRST_AND_VIEWER 2.4). The CAD's owner
// string answered 0 rows three times on the 2026-09-07 run; "CAFFREY BARBARA" answers 39.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownerParties, splitPersonName, primaryNameQueries, texasFileNameVariants } from '../services/texasfile-names.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');
const CAD = 'CAFFREY, BARBARA SPEER & ADRIANNE CAFFERY EVERS';

describe('the CAD owner string', () => {
  it('splits into its parties and drops marital/estate markers', () => {
    expect(ownerParties(CAD)).toEqual(['CAFFREY, BARBARA SPEER', 'ADRIANNE CAFFERY EVERS']);
    expect(ownerParties('FERRELL, GEORGE W ETUX HELEN P')).toEqual(['FERRELL, GEORGE W HELEN P']);
    expect(ownerParties('SMITH JOHN JR AND SMITH JANE')).toEqual(['SMITH JOHN', 'SMITH JANE']);
  });
  it('reads a comma form and a natural form', () => {
    expect(splitPersonName('CAFFREY, BARBARA SPEER')).toEqual({ last: 'CAFFREY', first: 'BARBARA', middle: ['SPEER'] });
    expect(splitPersonName('ADRIANNE CAFFERY EVERS')).toEqual({ last: 'EVERS', first: 'ADRIANNE', middle: ['CAFFERY'] });
    expect(splitPersonName('MADONNA')).toEqual({ last: 'MADONNA', first: '', middle: [] });
  });
  it('the discovery pass gets one LAST FIRST query per party', () => {
    expect(primaryNameQueries(CAD)).toEqual(['CAFFREY BARBARA', 'EVERS ADRIANNE']);
    expect(primaryNameQueries('EVERS, JONATHAN')).toEqual(['EVERS JONATHAN']);
    expect(primaryNameQueries('ASH FAMILY TRUST')).toEqual(['ASH FAMILY TRUST']);
    expect(primaryNameQueries(null)).toEqual([]);
  });
  it('the buy tries the widening variants in order, surname last', () => {
    expect(texasFileNameVariants(CAD)).toEqual([
      'CAFFREY BARBARA', 'BARBARA CAFFREY', 'CAFFREY, BARBARA',
      'EVERS ADRIANNE', 'ADRIANNE EVERS', 'EVERS, ADRIANNE',
      'CAFFREY', 'EVERS',
    ]);
    expect(texasFileNameVariants('OAK CREEK HOLDINGS LLC')).toEqual(['OAK CREEK HOLDINGS LLC', 'OAK CREEK HOLDINGS']);
  });
});

describe('WIRED (check the CALLER)', () => {
  it('buyDocument retries a name search with the variants before giving up', () => {
    const src = read('services/texasfile-buy.ts');
    expect(src).toContain('for (const variant of texasFileNameVariants(input.name)) {');
    expect(src).toContain('const again = await searchTexasFile(page, { ...input, name: variant }, log);');
  });
  it('the discovery pass submits the per-party LAST FIRST queries', () => {
    expect(read('research/live-search.ts')).toContain('for (const name of primaryNameQueries(target.ownerName)) inputs.push({ county, name });');
  });
});
