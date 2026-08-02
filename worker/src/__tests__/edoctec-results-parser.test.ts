// One row per PARTY, not per document (plan R39).
//
// Every fixture below is verbatim from the live sites on 2026-08-02:
//   Coryell   https://mclennan.edoctec.com/CoryellPublicRecords/Search/PartySearch
//   Lampasas  https://mclennan.edoctec.com/LampasasPublicRecords/Search/PartySearch

import { describe, it, expect } from 'vitest';
import {
  REQUIRED_FIELDS,
  describeParse,
  fieldForHeader,
  groupByInstrument,
  mapColumns,
  parseResults,
  parseRow,
  sideForPartyType,
} from '../adapters/edoctec-results-parser.js';

/** The header row both counties served, character for character. */
const HEADERS = ['Instrument No', 'Filed Date', 'Party Type', 'Full Name', 'Document Type', 'Book/Volume', 'Page/Line', 'Pages', 'Actions'];

/** Lampasas, LastName=SMITH. Note both rows are GRANTORS of the same instrument. */
const LAMPASAS_ROWS = [
  ['212478', '07/28/2026', 'Grantor', 'SMITH, CHRISTOPHER D.', 'SPECIAL WARRANTY DEED', '0', '0', '3', ''],
  ['212478', '07/28/2026', 'Grantor', 'SMITH, SONYA N.', 'SPECIAL WARRANTY DEED', '0', '0', '3', ''],
];

/** Coryell, LastName=SMITH — three different instruments, mixed party types. */
const CORYELL_ROWS = [
  ['395664', '07/30/2026', 'Grantor', 'SMITH JONATHAN JR ETAL', 'UCC 1 STANDARD', '0', '0', '3', ''],
  ['395622', '07/28/2026', 'Grantee', 'SMITH TROY L', 'ABSTRACT OF JUDGMENT', '0', '0', '2', ''],
  ['395574', '07/27/2026', 'Grantee', 'SMITH ANGELIKA RE:', 'ASSIGNMENT', '0', '0', '1', ''],
];

describe('the header row maps', () => {
  it('recognises every data column the sites serve', () => {
    const map = mapColumns(HEADERS);
    expect(map.missing).toEqual([]);
    expect(map.index.instrument).toBe(0);
    expect(map.index.filedDate).toBe(1);
    expect(map.index.partyType).toBe(2);
    expect(map.index.fullName).toBe(3);
    expect(map.index.docType).toBe(4);
  });

  it('reports "Actions" as unmapped rather than silently eating it', () => {
    // An unrecognised column is reported so a human can tell a harmless one from a renamed Grantor.
    expect(mapColumns(HEADERS).unmapped).toContain('Actions');
  });

  it('does not require book and page', () => {
    // eDocTec writes literal 0 for both on e-filed instruments.
    expect(REQUIRED_FIELDS).not.toContain('book');
    expect(REQUIRED_FIELDS).not.toContain('page');
  });

  it('reads a header by its text, not its position', () => {
    expect(fieldForHeader('Instrument No')).toBe('instrument');
    expect(fieldForHeader('Filed Date')).toBe('filedDate');
    expect(fieldForHeader('Full Name')).toBe('fullName');
    expect(fieldForHeader('Actions')).toBeNull();
  });

  it('survives a county reordering its columns', () => {
    const reordered = ['Document Type', 'Full Name', 'Party Type', 'Filed Date', 'Instrument No'];
    const map = mapColumns(reordered);
    expect(map.missing).toEqual([]);
    expect(map.index.instrument).toBe(4);
    expect(map.index.docType).toBe(0);
  });
});

describe('a party search never claims a complete party list', () => {
  it('marks documents partial by default', () => {
    // Lampasas 212478 came back with two grantors and NO grantee — because the grantee is not a
    // Smith. The grantee exists; it is not in this result set. Saying "no grantee" would be a
    // wrong recorded fact and would stop the chain walker dead.
    const [doc] = groupByInstrument(LAMPASAS_ROWS.map((r) => parseRow(r, mapColumns(HEADERS))!));
    expect(doc.grantees).toEqual([]);
    expect(doc.partiesComplete).toBe(false);
  });

  it('defaults to partial when nobody says otherwise', () => {
    // Assuming completeness is the dangerous direction, so it is never the default.
    expect(groupByInstrument([parseRow(CORYELL_ROWS[0], mapColumns(HEADERS))!])[0].partiesComplete).toBe(false);
  });

  it('marks documents complete only when the caller says it was a document search', () => {
    const rows = LAMPASAS_ROWS.map((r) => parseRow(r, mapColumns(HEADERS))!);
    expect(groupByInstrument(rows, { complete: true })[0].partiesComplete).toBe(true);
  });

  it('says so in the human-readable summary', () => {
    const text = describeParse(parseResults(HEADERS, LAMPASAS_ROWS), 'Lampasas');
    expect(text).toContain('PARTIAL');
    expect(text).toContain('before relying on its grantee');
  });
});

describe('party rows group back into documents', () => {
  it('collapses two grantor rows into ONE deed', () => {
    // The site reported "12,705 Documents / 20,267 Total Records" for one Coryell search. Counting
    // rows as documents would inflate every result set by the number of parties per instrument.
    const report = parseResults(HEADERS, LAMPASAS_ROWS);
    expect(report.rowsSeen).toBe(2);
    expect(report.documents).toHaveLength(1);
    expect(report.documents[0].grantors).toEqual(['SMITH, CHRISTOPHER D.', 'SMITH, SONYA N.']);
    expect(report.documents[0].rowCount).toBe(2);
  });

  it('keeps genuinely distinct instruments apart', () => {
    const report = parseResults(HEADERS, CORYELL_ROWS);
    expect(report.documents).toHaveLength(3);
    expect(report.documents.map((d) => d.instrumentNumber)).toEqual(['395664', '395622', '395574']);
  });

  it('puts each party on the side its type names', () => {
    const report = parseResults(HEADERS, CORYELL_ROWS);
    expect(report.documents[0].grantors).toEqual(['SMITH JONATHAN JR ETAL']);
    expect(report.documents[0].grantees).toEqual([]);
    expect(report.documents[1].grantees).toEqual(['SMITH TROY L']);
  });

  it('does not merge two documents that share a number in different years', () => {
    // Some counties restart instrument numbers. Merging would invent a deed with four parties.
    const rows = [
      ['4471', '03/02/1994', 'Grantor', 'ALPHA A', 'WARRANTY DEED', '0', '0', '2', ''],
      ['4471', '03/02/2011', 'Grantor', 'BETA B', 'WARRANTY DEED', '0', '0', '2', ''],
    ];
    expect(parseResults(HEADERS, rows).documents).toHaveLength(2);
  });

  it('carries the recording date onto the document', () => {
    expect(parseResults(HEADERS, LAMPASAS_ROWS).documents[0].recordingDate).toBe('07/28/2026');
  });

  it('does not repeat a name that appears twice on the same side', () => {
    const rows = [
      ['900', '01/02/2020', 'Grantor', 'SMITH, JOHN', 'DEED', '0', '0', '1', ''],
      ['900', '01/02/2020', 'Grantor', 'SMITH, JOHN', 'DEED', '0', '0', '1', ''],
    ];
    expect(parseResults(HEADERS, rows).documents[0].grantors).toEqual(['SMITH, JOHN']);
  });
});

describe('book and page', () => {
  it('does not invent a citation from eDocTec\'s literal zeroes', () => {
    // "0/0" is how this vendor writes "never in a book". Storing it would produce a book-and-page
    // reference to Volume 0, Page 0.
    expect(parseResults(HEADERS, LAMPASAS_ROWS).documents[0].bookVolumePage).toBeUndefined();
  });

  it('joins a real book and page', () => {
    const rows = [['1234', '05/06/1978', 'Grantor', 'OLD, OWNER', 'WARRANTY DEED', '412', '88', '3', '']];
    expect(parseResults(HEADERS, rows).documents[0].bookVolumePage).toBe('412/88');
  });

  it('keeps a book that has no page', () => {
    const rows = [['1234', '05/06/1978', 'Grantor', 'OLD, OWNER', 'WARRANTY DEED', '412', '0', '3', '']];
    expect(parseResults(HEADERS, rows).documents[0].bookVolumePage).toBe('412');
  });
});

describe('party types beyond grantor and grantee', () => {
  it('reads the synonyms other instrument classes use', () => {
    expect(sideForPartyType('Debtor')).toBe('grantor');
    expect(sideForPartyType('Secured Party')).toBe('grantee');
    expect(sideForPartyType('Beneficiary')).toBe('grantee');
    expect(sideForPartyType('Lessor')).toBe('grantor');
  });

  it('keeps a party it cannot classify instead of dropping it', () => {
    // Dropping silently loses a person from the chain of title.
    const rows = [['777', '01/01/2020', 'Filer', 'MYSTERY PARTY', 'MISC', '0', '0', '1', '']];
    const doc = parseResults(HEADERS, rows).documents[0];
    expect(doc.unclassified).toEqual(['MYSTERY PARTY']);
    expect(sideForPartyType('Filer')).toBe('unknown');
  });

  it('counts unclassified parties in the summary', () => {
    const rows = [['777', '01/01/2020', 'Filer', 'MYSTERY PARTY', 'MISC', '0', '0', '1', '']];
    expect(describeParse(parseResults(HEADERS, rows), 'Coryell')).toContain('unclassified');
  });
});

describe('an unreadable table is never reported as empty', () => {
  it('refuses to parse when a required column is missing', () => {
    const bad = ['Something', 'Else Entirely'];
    const report = parseResults(bad, [['a', 'b']]);
    expect(report.unusable).toBe(true);
    expect(report.documents).toEqual([]);
  });

  it('says "treat as unread, NOT as no records"', () => {
    const report = parseResults(['Something'], [['a']]);
    expect(describeParse(report, 'Coryell')).toContain('Treat as unread');
    expect(describeParse(report, 'Coryell')).toContain('NOT as "no records"');
  });

  it('drops a row with no instrument rather than grouping it under a blank key', () => {
    const rows = [['', '07/28/2026', 'Grantor', 'SMITH, A', 'DEED', '0', '0', '1', '']];
    expect(parseResults(HEADERS, rows).documents).toHaveLength(0);
  });

  it('drops a row with no name rather than storing a blank party', () => {
    const rows = [['212478', '07/28/2026', 'Grantor', '', 'DEED', '0', '0', '1', '']];
    expect(parseResults(HEADERS, rows).documents).toHaveLength(0);
  });

  it('reports rows seen even when some were dropped', () => {
    const rows = [...LAMPASAS_ROWS, ['', '', '', '', '', '', '', '', '']];
    const report = parseResults(HEADERS, rows);
    expect(report.rowsSeen).toBe(3);
    expect(report.rowsParsed).toBe(2);
  });
});
