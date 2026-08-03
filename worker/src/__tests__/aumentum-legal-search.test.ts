// Aumentum's legal-description field matches BEGINS WITH (plan R39).
//
// Driven on Bastrop 2026-08-02, and the numbers are the whole argument:
//
//     ORTIZ         0 records
//     JOSE        100 records
//     JOSE ORTIZ  100 records
//
// Bastrop's records reference the JOSE ORTIZ SURVEY constantly. "ORTIZ" — the obvious thing for a
// surveyor to type — returns nothing.

import { describe, it, expect } from 'vitest';
import {
  AumentumClerkAdapter,
  LEGAL_FREEFORM_FIELD,
  LEGAL_MATCH_MODE,
  looksLikeMidStringLegal,
} from '../adapters/aumentum-clerk-adapter.js';

describe('the field and its match mode are recorded', () => {
  it('names the free-form legal input', () => {
    expect(LEGAL_FREEFORM_FIELD).toBe('#cphNoMargin_f_txtLDFreeForm');
  });

  it('records that it matches begins-with, quoted from the portal', () => {
    // The results header says so itself: "Freeform Legal begins with ORTIZ".
    expect(LEGAL_MATCH_MODE).toBe('begins with');
  });
});

describe('terms likely to fail on a begins-with field', () => {
  it('flags a term naming a survey', () => {
    // A surveyor types the distinctive part, not the leading given name.
    expect(looksLikeMidStringLegal('ORTIZ SURVEY')).toBe(true);
    expect(looksLikeMidStringLegal('J CHAMBERS ABSTRACT')).toBe(true);
  });

  it('flags a term starting with a descriptor', () => {
    expect(looksLikeMidStringLegal('LOT 3 BLOCK 1')).toBe(true);
    expect(looksLikeMidStringLegal('TRACT 4')).toBe(true);
  });

  it('does not flag a plain leading name', () => {
    expect(looksLikeMidStringLegal('JOSE ORTIZ')).toBe(false);
    expect(looksLikeMidStringLegal('FARWELL HEIGHTS ADDITION')).toBe(false);
  });

  it('says nothing about an empty term', () => {
    expect(looksLikeMidStringLegal('')).toBe(false);
    expect(looksLikeMidStringLegal('   ')).toBe(false);
  });
});

describe('an empty legal description is refused before a browser opens', () => {
  it('refuses rather than searching the whole index', async () => {
    const a = new AumentumClerkAdapter('48021', 'Bastrop');
    await expect(a.searchByLegalDescription('   ')).rejects.toThrow(/refusing to search the whole index/i);
  });
});
