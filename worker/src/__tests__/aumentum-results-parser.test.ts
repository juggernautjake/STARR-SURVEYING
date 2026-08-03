// Harris/Aumentum's flat results grid (plan R39).
//
// Cells verbatim from Bastrop County on 2026-08-02, party search "SMITH JAMES".

import { describe, it, expect } from 'vitest';
import {
  AUMENTUM_RESULT_CAP,
  DATE_CELL,
  describeParse,
  parseParties,
  parseRecord,
  parseResults,
  roleForMarker,
} from '../adapters/aumentum-results-parser.js';

/** The first record as the grid served it, including the padding and duplicate cells. */
const RECORD_ONE = [
  '1', 'View', '', '2325', '2325 101-231', '2325', '101', '231', '10/24/1974',
  'DEED OF TRUST', 'DEED OF TRUST', '[E] SMITH JAMES (+) [R] JENSEN DONALD (+)', 'E', '',
  'SMITH JAMES (+)', '', '', 'JENSEN DONALD (+)', '', '', 'Perm', '',
];

/** A second record, this one a lien with the roles reversed. */
const RECORD_TWO = [
  '6', 'View', '', '6003760', '6003760 375-419', '6003760', '375', '419', '06/04/1985',
  'MECHANICS LIEN', 'MECHANICS LIEN', '[R] SMITH JAMES (+) [E] SWIM-TEX INCORPORATED', 'R', '',
  'SMITH JAMES (+)', '', '', 'SWIM-TEX INCORPORATED', '', '', 'Perm', '',
];

describe('the party summary is the source of truth', () => {
  it('reads both parties and their roles from one cell', () => {
    // The individual name cells sit at unstable offsets; this cell carries every party inline.
    const p = parseParties('[E] SMITH JAMES (+) [R] JENSEN DONALD (+)');
    expect(p).toEqual([
      { name: 'SMITH JAMES (+)', role: 'grantee' },
      { name: 'JENSEN DONALD (+)', role: 'grantor' },
    ]);
  });

  it('maps R to grantor and E to grantee', () => {
    // Confirmed against the search form's own party-type radio values, not guessed.
    expect(roleForMarker('R')).toBe('grantor');
    expect(roleForMarker('E')).toBe('grantee');
    expect(roleForMarker('X')).toBeNull();
  });

  it('keeps the (+) "and others" marker', () => {
    // Dropping it would silently turn a conveyance by several people into one by a single person.
    expect(parseParties('[R] SMITH JAMES (+)')[0].name).toBe('SMITH JAMES (+)');
  });

  it('handles a company name containing no marker characters', () => {
    expect(parseParties('[E] SWIM-TEX INCORPORATED')).toEqual([{ name: 'SWIM-TEX INCORPORATED', role: 'grantee' }]);
  });

  it('does not repeat a party listed twice in the same role', () => {
    expect(parseParties('[R] A ONE [R] A ONE')).toHaveLength(1);
  });

  it('returns nothing for a cell with no markers', () => {
    expect(parseParties('SMITH JAMES')).toEqual([]);
    expect(parseParties('')).toEqual([]);
  });
});

describe('a record is cut at the date boundary', () => {
  it('reads the first record end to end', () => {
    const r = parseRecord(RECORD_ONE, 8)!;
    expect(r.instrumentNumber).toBe('2325');
    expect(r.recordingDate).toBe('10/24/1974');
    expect(r.documentType).toBe('DEED OF TRUST');
    expect(r.book).toBe('101');
    expect(r.page).toBe('231');
    expect(r.bookVolumePage).toBe('101-231');
    expect(r.grantees).toEqual(['SMITH JAMES (+)']);
    expect(r.grantors).toEqual(['JENSEN DONALD (+)']);
  });

  it('reads a record with the roles the other way round', () => {
    const r = parseRecord(RECORD_TWO, 8)!;
    expect(r.documentType).toBe('MECHANICS LIEN');
    expect(r.grantors).toEqual(['SMITH JAMES (+)']);
    expect(r.grantees).toEqual(['SWIM-TEX INCORPORATED']);
  });

  it('does not mistake the party summary for the document type', () => {
    // The summary starts with "[", which is what keeps it out of the type field.
    expect(parseRecord(RECORD_ONE, 8)!.documentType).not.toContain('[');
  });

  it('refuses a record it cannot identify at all', () => {
    // No instrument number and no citation — nothing to key a document on.
    const cells = ['', '', '', '', '', '', '', '', '01/01/1990', 'DEED', '', '[R] SOMEBODY'];
    expect(parseRecord(cells, 8)).toBeNull();
  });

  it('falls back to book-page when there is no instrument number', () => {
    const cells = ['', 'View', '', '', '', '', '412', '88', '05/06/1978', 'WARRANTY DEED', '', '[R] OLD OWNER'];
    const r = parseRecord(cells, 8)!;
    expect(r.instrumentNumber).toBe('412-88');
    expect(r.bookVolumePage).toBe('412-88');
  });

  it('recognises only an exact date as a boundary', () => {
    // "Date From: 1/1/1800" style text must never start a record — the lesson from Avenu.
    expect(DATE_CELL.test('10/24/1974')).toBe(true);
    expect(DATE_CELL.test('Date From: 1/1/1800')).toBe(false);
    expect(DATE_CELL.test('10/24/1974 08:40 AM')).toBe(false);
  });
});

describe('the whole grid', () => {
  const GRID = [...RECORD_ONE, ...RECORD_TWO];

  it('splits a run-together grid into separate records', () => {
    // Per-<tr> parsing returns ONE record however many came back; cutting at dates fixes that.
    const report = parseResults(GRID, '2 records');
    expect(report.rows).toHaveLength(2);
    expect(report.boundaries).toBe(2);
    expect(report.rows.map((r) => r.instrumentNumber)).toEqual(['2325', '6003760']);
  });

  it('reads the grid\'s own record counter', () => {
    expect(parseResults(GRID, 'Showing 100 records').reportedRecords).toBe(100);
  });

  it('says INCOMPLETE when fewer records parsed than the grid reported', () => {
    const report = parseResults(GRID, '100 records');
    expect(report.short).toBe(true);
    expect(describeParse(report, 'Bastrop')).toContain('INCOMPLETE');
    expect(describeParse(report, 'Bastrop')).toContain('treat this page as partial');
  });

  it('does not cry INCOMPLETE when the counts agree', () => {
    expect(parseResults(GRID, '2 records').short).toBe(false);
    expect(describeParse(parseResults(GRID, '2 records'), 'Bastrop')).not.toContain('INCOMPLETE');
  });

  it('claims nothing about completeness when the grid states no count', () => {
    // Asserting completeness from silence is how a partial answer starts looking whole.
    const report = parseResults(GRID, 'no counter here');
    expect(report.reportedRecords).toBeNull();
    expect(report.short).toBe(false);
    expect(describeParse(report, 'Bastrop')).not.toContain('INCOMPLETE');
  });

  it('counts a boundary even when the record behind it is unusable', () => {
    // So a silently dropped record shows up as boundaries > rows rather than vanishing.
    const cells = [...RECORD_ONE, '', '', '', '', '', '', '', '', '01/01/1990', 'DEED'];
    const report = parseResults(cells);
    expect(report.boundaries).toBe(2);
    expect(report.rows).toHaveLength(1);
  });
});

describe('the portal caps results at 100 and says nothing about it', () => {
  const record = (n: number): string[] => ['', 'View', '', String(1000 + n), '', String(1000 + n), '10', String(n), '01/02/1990', 'DEED', '', `[R] PARTY ${n} [E] OTHER ${n}`];
  const grid = (count: number): string[] => Array.from({ length: count }, (_, i) => record(i)).flat();

  it('records the cap', () => {
    // Verified on Bastrop: "SMITH", "SMITH JAMES" and "ENSERCH" each returned exactly 100, and the
    // first/prev/next/last controls are absent from the results list entirely.
    expect(AUMENTUM_RESULT_CAP).toBe(100);
  });

  it('flags a result sitting exactly on the cap as truncated', () => {
    expect(parseResults(grid(100), '100 records').capped).toBe(true);
  });

  it('does not flag a result below the cap', () => {
    expect(parseResults(grid(12), '12 records').capped).toBe(false);
  });

  it('says the true total is unknown and how to narrow', () => {
    // Unlike Tyler's over-limit banner or Avenu's timeout modal, NOTHING on this page announces
    // that the result is partial. Landing on the cap is the only signal there is.
    const s = describeParse(parseResults(grid(100), '100 records'), 'Bastrop');
    expect(s).toContain('TRUNCATED');
    expect(s).toContain('NO pagination');
    expect(s).toContain('true total is UNKNOWN');
    expect(s).toContain('Do NOT treat this as the complete set');
  });

  it('cannot tell "exactly 100 exist" from "thousands exist", and says so rather than choosing', () => {
    // Both cases produce an identical page; the warning fires for both, which is the safe direction.
    expect(describeParse(parseResults(grid(100), '100 records'), 'Bastrop')).toContain('probably larger');
  });

  it('stays quiet about truncation on a genuinely empty result', () => {
    const r = parseResults([], '0 records');
    expect(r.capped).toBe(false);
    expect(describeParse(r, 'Bastrop')).not.toContain('TRUNCATED');
  });
});
