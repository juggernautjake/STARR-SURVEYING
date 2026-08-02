// Reading the Kofile results table by its headers (research plan R38).
//
// Two bugs this replaces, both found by driving five live counties on 2026-08-02.
//
// 1. The old parser required an instrument number matching `\d{10,13}` and skipped any row without
//    one. Real Kofile instrument numbers are `2019-3389` and `1981-147096` — NEITHER matches. Every
//    row was dropped, and the adapter returned an empty array from a page of 220,777 records.
//
// 2. It then read cells positionally, from a comment describing "typical Kofile column order".
//    There is no typical order: Bell renames the columns, and Montgomery has 17 of them in a
//    different sequence with Doc Number first and Grantor fifth. A fixed index reads Montgomery's
//    document number as its grantor.
//
// The header sets below are verbatim from those live sites.

import { describe, it, expect } from 'vitest';
import {
  REQUIRED_FIELDS,
  describeParse,
  fieldForHeader,
  mapColumns,
  parseResults,
  parseRow,
  splitParties,
} from '../adapters/kofile-results-parser.js';

/** Verbatim from milam/leon/walker.tx.publicsearch.us — 3 blank icon columns, then 7 named. */
const STANDARD = ['', '', '', 'Grantor', 'Grantee', 'Doc Type', 'Recorded Date', 'Doc Number', 'Book/Volume/Page', 'Legal Description'];
/** Verbatim from bell.tx.publicsearch.us — same shape, different labels. */
const BELL = ['', '', '', 'Grantor', 'Grantee', 'Doc Type', 'Recorded Date', 'Inst Number', 'Book/Volume/Page', 'Property Description'];
/** Verbatim from montgomery.tx.publicsearch.us — 17 columns, different order. */
const MONTGOMERY = ['', '', '', 'Doc Number', 'Vol/Bk/Pg', 'Doc Type', 'Image Code', 'Grantor', 'Grantee', 'Notary', 'Recorded Date', 'High Lot', 'Low Lot', 'Block', 'Subdivision', 'Acreage', 'Comment'];

describe('every live header set maps', () => {
  it('maps the standard set', () => {
    const m = mapColumns(STANDARD);
    expect(m.missing).toEqual([]);
    expect(m.index.grantor).toBe(3);
    expect(m.index.instrument).toBe(7);
    expect(m.index.legalDescription).toBe(9);
  });

  it('maps Bell despite its different labels', () => {
    // "Inst Number" and "Property Description" — the same fields under other names.
    const m = mapColumns(BELL);
    expect(m.missing).toEqual([]);
    expect(m.index.instrument).toBe(7);
    expect(m.index.legalDescription).toBe(9);
  });

  it('maps Montgomery despite its different ORDER', () => {
    // The failure a fixed index guarantees: Doc Number is first here, Grantor fifth.
    const m = mapColumns(MONTGOMERY);
    expect(m.missing).toEqual([]);
    expect(m.index.instrument).toBe(3);
    expect(m.index.grantor).toBe(7);
    expect(m.index.recordedDate).toBe(10);
  });

  it('ignores the blank icon columns without reporting them', () => {
    // They are structural, and listing them as unmapped would bury the headers that matter.
    expect(mapColumns(STANDARD).unmapped).toEqual([]);
  });

  it('reports a county’s extra columns rather than swallowing them', () => {
    // A county adding "Notary" is harmless; a vendor renaming "Grantor" is not, and only a person
    // can tell those apart.
    expect(mapColumns(MONTGOMERY).unmapped).toContain('Notary');
    expect(mapColumns(MONTGOMERY).unmapped).toContain('Subdivision');
  });
});

describe('header synonyms', () => {
  it('accepts the document-number spellings counties use', () => {
    for (const h of ['Doc Number', 'Document Number', 'Inst Number', 'Instrument No.', 'Instrument #', "Clerk's File Number"]) {
      expect(fieldForHeader(h), h).toBe('instrument');
    }
  });

  it('accepts both description labels', () => {
    expect(fieldForHeader('Legal Description')).toBe('legalDescription');
    expect(fieldForHeader('Property Description')).toBe('legalDescription');
  });

  it('accepts the book/volume/page spellings', () => {
    expect(fieldForHeader('Book/Volume/Page')).toBe('bookVolumePage');
    expect(fieldForHeader('Vol/Bk/Pg')).toBe('bookVolumePage');
  });

  it('does not claim a column it does not recognise', () => {
    expect(fieldForHeader('Notary')).toBeNull();
    expect(fieldForHeader('Acreage')).toBeNull();
    expect(fieldForHeader('')).toBeNull();
  });
});

describe('the instrument numbers that broke the old parser', () => {
  it('accepts the real formats', () => {
    const m = mapColumns(STANDARD);
    for (const instr of ['2019-3389', '1981-147096', '2019-4779']) {
      const cells = ['', '', '', 'KORTH CLAY', 'MORENO REGINA', 'WARRANTY DEED', '9/12/2019', instr, '', 'LOT 19 BLOCK 1'];
      expect(parseRow(cells, m)?.instrumentNumber, instr).toBe(instr);
    }
  });

  it('drops a row with no instrument number, and counts it', () => {
    // Without one a row cannot be cited, fetched, or deduplicated against the purchase library.
    const r = parseResults(STANDARD, [
      ['', '', '', 'A', 'B', 'DEED', '1/1/2020', '2020-1', '', ''],
      ['', '', '', 'C', 'D', 'DEED', '1/2/2020', '',        '', ''],
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });
});

describe('cells that would poison a chain of title', () => {
  it('does not store Kofile’s empty-date placeholder', () => {
    // "--/--/--" in a recording date would order a chain by a date that does not exist.
    const m = mapColumns(STANDARD);
    const row = parseRow(['', '', '', 'A', 'B', 'PLAT', '--/--/--', '2019-1', '', ''], m);
    expect(row?.recordingDate).toBe('');
  });

  it('splits stacked parties without splitting one name', () => {
    // Splitting on commas turns "SMITH, JOHN A" into two people, which is how a grantor becomes two
    // grantors and a chain stops joining.
    expect(splitParties('SMITH, JOHN A')).toEqual(['SMITH, JOHN A']);
    expect(splitParties('SMITH, JOHN A\nSMITH, MARY B')).toEqual(['SMITH, JOHN A', 'SMITH, MARY B']);
    expect(splitParties('  --  ')).toEqual([]);
  });
});

describe('a missing column is not "no records"', () => {
  it('refuses to parse and names the column that vanished', () => {
    const r = parseResults(['', '', '', 'Grantor', 'Grantee', 'Doc Type', 'Recorded Date'], [['', '', '', 'A', 'B', 'DEED', '1/1/2020']]);
    expect(r.rows).toEqual([]);
    expect(r.fatal).toContain('instrument');
    expect(r.fatal).toContain('do not treat this as "no records"');
  });

  it('treats an unrendered page as a failure, not an empty result', () => {
    // The SPA renders its table after mount; reading too early gives no headers at all.
    const r = parseResults([], []);
    expect(r.fatal).toContain('(none)');
  });

  it('requires only the fields a chain link genuinely needs', () => {
    // Plenty of counties leave book/page and legal description blank.
    expect(REQUIRED_FIELDS).not.toContain('bookVolumePage');
    expect(REQUIRED_FIELDS).not.toContain('legalDescription');
  });
});

describe('the run log explains an empty page', () => {
  it('says why nothing parsed', () => {
    expect(describeParse(parseResults([], []), 'Milam')).toContain('Milam');
    expect(describeParse(parseResults([], []), 'Milam')).toContain('missing column');
  });

  it('reports dropped rows and unrecognised columns', () => {
    const r = parseResults(MONTGOMERY, [
      ['', '', '', '2020-1', '', 'DEED', '', 'A', 'B', '', '1/1/2020', '', '', '', '', '', ''],
      ['', '', '', '',       '', 'DEED', '', 'C', 'D', '', '1/2/2020', '', '', '', '', '', ''],
    ]);
    const line = describeParse(r, 'Montgomery');
    expect(line).toContain('Parsed 1 result');
    expect(line).toContain('1 row(s) had no instrument number');
    expect(line).toContain('Notary');
  });
});
