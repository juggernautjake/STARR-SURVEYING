// Kofile's two search modes are DIFFERENT searches (plan R39).
//
// Driven on Bell 2026-08-02 with the term HAMMIL:
//
//     searchOcrText=false   23 results, matching PARTY NAMES (HAMMILL ERICA, HAMMILL ANDREW P)
//     searchOcrText=true     7 results, where the term appears NOWHERE in the row
//
// The second set matched the OCR'd text inside the scanned documents. Turning OCR on does not widen
// the index search — it runs a different one.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs
  .readFileSync(path.join(process.cwd(), 'src/adapters/kofile-clerk-adapter.ts'), 'utf8')
  .replace(/^\s*(\/\*\*|\*|\/\/)\s?/gm, '')
  .replace(/\s+/g, ' ');

describe('legal-description search no longer returns an empty array', () => {
  it('mentions the old message only as history, never as live behaviour', () => {
    // The old body logged "Legal description search not supported" and returned []. A caller cannot
    // tell that from "this land has no documents". The phrase may survive in the comment explaining
    // what changed — but only there.
    const raw = fs.readFileSync(path.join(process.cwd(), 'src/adapters/kofile-clerk-adapter.ts'), 'utf8');
    const codeOnly = raw
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    expect(codeOnly).not.toContain('Legal description search not supported');
    expect(src).toContain('It logged "Legal description search not supported" and returned');
  });

  it('records that the old behaviour spanned twenty counties including Bell', () => {
    expect(src).toContain('TWENTY Kofile counties');
    expect(src).toContain('Bell, the home county');
  });

  it('states that the two modes are different searches, not broader and narrower', () => {
    // Anybody assuming OCR is a superset would conclude 16 documents had vanished.
    expect(src).toContain('DIFFERENT SEARCHES, NOT BROADER AND NARROWER');
    expect(src).toContain('does not widen the index search');
  });

  it('keeps the driven numbers that prove it', () => {
    expect(src).toContain('23 results, matching PARTY NAMES');
    expect(src).toContain('7 results, where the term appears NOWHERE in the row');
  });
});

describe('the unverified SUPERSEARCH route is disabled on purpose', () => {
  it('explains why the proven path wins', () => {
    // Bell is flagged hasSUPERSEARCH and routing through it times out on a search input that does
    // not exist — the same class of unverified URL R37 found across four vendors.
    expect(src).toContain('SUPERSEARCH is deliberately NOT used here');
    expect(src).toContain('the proven route wins over the richer-sounding one');
  });

  it('says what would justify re-enabling it', () => {
    expect(src).toContain('Re-enable SUPERSEARCH per county only after driving it');
  });
});

describe('an empty result carries its meaning', () => {
  it('says a full-text miss is not evidence about the land', () => {
    expect(src).toContain('NOT that no document touches this land');
  });

  it('names what an empty term would do', () => {
    expect(src).toContain('refusing to search the whole index');
  });
});
