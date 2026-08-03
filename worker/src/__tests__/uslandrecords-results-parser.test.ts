// Party rows keyed on book/page, and a timeout that is not an empty index (plan R39).
//
// Fixtures verbatim from Robertson (i2j) and Falls (i2i) on 2026-08-02, searching Last=SMITH
// First=JAMES. Robertson reported 239 rows; Falls reported 40.

import { describe, it, expect } from 'vitest';
import {
  USLR_HEADERS,
  groupByCitation,
  mapColumns,
  parseCitation,
  parseRow,
  readResults,
  roleFor,
} from '../adapters/uslandrecords-results-parser.js';

const HEADERS = ['File Date', 'Name/Corporation', 'Book/Vol/Page', 'Pages', 'Type Desc.', 'Type', 'View Img.', 'Add to Basket'];

/** Robertson, including the lettered 19th-century volumes. */
const ROBERTSON = [
  ['9/13/1871', 'SMITH JAMES', 'OR/0000U/271', '2', 'DEED', 'GT', '', ''],
  ['5/5/1894', 'SMITH JAMES', 'DT/0000L/150', '16', 'TAX DEED', 'GR', '', ''],
  ['1/22/1870', 'SMITH JAMES A J', 'OR/0000R/226', '1', 'POWER OF ATTORNEY', 'GT', '', ''],
  ['11/5/1908', 'SMITH JAMES A', 'OR/00050/534', '2', 'WARRANTY DEED', 'GT', '', ''],
];

const FALLS = [
  ['6/3/1971', 'SMITH JAMES', 'OR/00284/624', '1', 'AFFIDAVIT', 'GR', '', ''],
  ['1/4/2007', 'SMITH JAMES CALYTO', 'OR/00200/811', '2', 'WARRANTY DEED', 'GT', '', ''],
];

describe('the columns are read by header, not position', () => {
  it('maps every column the grid serves', () => {
    const m = mapColumns(HEADERS);
    expect(m).toMatchObject({ fileDate: 0, name: 1, bookVolPage: 2, pages: 3, docType: 4, role: 5 });
  });

  it('does not confuse "Type" with "Type Desc."', () => {
    // "Type" is the party ROLE (GR/GT); "Type Desc." is the document type. Taking the last column
    // as the type would file every deed under "GR".
    const m = mapColumns(HEADERS);
    expect(m.docType).not.toBe(m.role);
    expect(parseRow(ROBERTSON[0], m)!.documentType).toBe('DEED');
    expect(parseRow(ROBERTSON[0], m)!.role).toBe('grantee');
  });

  it('survives a reordered grid', () => {
    const m = mapColumns(['Type', 'Book/Vol/Page', 'File Date', 'Name/Corporation', 'Type Desc.']);
    expect(m.role).toBe(0);
    expect(m.fileDate).toBe(2);
  });

  it('records the header set that was actually served', () => {
    expect(USLR_HEADERS).toContain('Book/Vol/Page');
    expect(USLR_HEADERS).toContain('Type Desc.');
  });
});

describe('GR is grantor and GT is grantee', () => {
  it('reads both codes', () => {
    expect(roleFor('GR')).toBe('grantor');
    expect(roleFor('GT')).toBe('grantee');
  });

  it('keeps an unrecognised code as unknown instead of guessing a side', () => {
    // Putting a party on the wrong side of a conveyance is worse than admitting we cannot tell.
    expect(roleFor('XX')).toBe('unknown');
    const doc = groupByCitation([parseRow(['1/1/1990', 'DOE JANE', 'OR/1/2', '1', 'DEED', 'XX', '', ''], mapColumns(HEADERS))!])[0];
    expect(doc.unclassified).toEqual(['DOE JANE']);
  });
});

describe('the citation is the identity — there is no instrument number', () => {
  it('splits series, volume and page', () => {
    expect(parseCitation('OR/00062/223')).toEqual({ series: 'OR', volume: '00062', page: '223' });
  });

  it('keeps a LETTERED volume as a string', () => {
    // Robertson's 19th-century volumes are lettered. Number("0000U") is NaN, which would collapse
    // every lettered volume into one bucket and merge unrelated 1870s deeds.
    expect(parseCitation('OR/0000U/271')?.volume).toBe('0000U');
    expect(parseCitation('OR/0000R/226')?.volume).toBe('0000R');
  });

  it('uses the citation as the instrument number, since the vendor publishes none', () => {
    const doc = groupByCitation([parseRow(ROBERTSON[0], mapColumns(HEADERS))!])[0];
    expect(doc.instrumentNumber).toBe('OR/0000U/271');
    expect(doc.bookVolumePage).toBe('OR/0000U/271');
  });

  it('returns null for an unparseable citation rather than a partial one', () => {
    expect(parseCitation('OR/271')).toBeNull();
    expect(parseCitation('')).toBeNull();
  });

  it('does not merge two different lettered volumes', () => {
    const m = mapColumns(HEADERS);
    const rows = [ROBERTSON[0], ROBERTSON[2]].map((r) => parseRow(r, m)!);
    expect(groupByCitation(rows)).toHaveLength(2);
  });

  it('treats padded and unpadded volumes as the same document', () => {
    const m = mapColumns(HEADERS);
    const rows = [
      ['3/1/1990', 'A ONE', 'OR/00062/223', '2', 'DEED', 'GR', '', ''],
      ['3/1/1990', 'B TWO', 'OR/62/223', '2', 'DEED', 'GT', '', ''],
    ].map((r) => parseRow(r, m)!);
    const docs = groupByCitation(rows);
    expect(docs).toHaveLength(1);
    expect(docs[0].grantors).toEqual(['A ONE']);
    expect(docs[0].grantees).toEqual(['B TWO']);
  });

  it('shows the citation as the county prints it', () => {
    // The key is normalised; what a human reads is not.
    expect(groupByCitation([parseRow(ROBERTSON[0], mapColumns(HEADERS))!])[0].bookVolumePage).toBe('OR/0000U/271');
  });
});

describe('a timeout is never an empty index', () => {
  const TIMEOUT_PAGE = 'Your search has reached the configured timeout period. Please narrow your search criteria by clicking on the "Advanced" button';

  it('reports a too-broad search as too broad', () => {
    // Third variant of this defect found in one day, after Kofile's empty department and Tyler's
    // totalPages: 0.
    const r = readResults({ headers: HEADERS, rows: [], pageText: TIMEOUT_PAGE }, 'Robertson');
    expect(r.state).toBe('too_broad');
    expect(r.statement).toContain('did not report that there are no records');
    expect(r.statement).toContain('Never record this as "no records found"');
  });

  it('says how to narrow', () => {
    const r = readResults({ headers: HEADERS, rows: [], pageText: TIMEOUT_PAGE }, 'Robertson');
    expect(r.statement).toMatch(/add a first name, or a date range/);
  });

  it('reports a genuine empty as empty', () => {
    const r = readResults({ headers: HEADERS, rows: [], pageText: 'no matching records' }, 'Falls');
    expect(r.state).toBe('empty');
    expect(r.statement).toContain('genuinely nothing recorded');
  });
});

describe('reading a real result set', () => {
  it('groups Robertson rows into documents', () => {
    const r = readResults({ headers: HEADERS, rows: ROBERTSON, pageText: '' }, 'Robertson');
    expect(r.state).toBe('has_results');
    if (r.state !== 'has_results') return;
    expect(r.documents).toHaveLength(4);
    expect(r.rowsSeen).toBe(4);
  });

  it('marks party lists partial on a name search', () => {
    const r = readResults({ headers: HEADERS, rows: FALLS, pageText: '' }, 'Falls');
    expect(r.statement).toContain('PARTIAL');
    if (r.state === 'has_results') expect(r.documents[0].partiesComplete).toBe(false);
  });

  it('warns that one page is not the whole result set', () => {
    // The grid paginates at 20 and Robertson reported 239 rows. Treating page one as the answer
    // would silently drop 219 records.
    const r = readResults({ headers: HEADERS, rows: ROBERTSON, pageText: '', reportedRows: 239 }, 'Robertson');
    expect(r.statement).toContain('ONE PAGE of a larger result set');
    expect(r.statement).toContain('page through before concluding');
  });

  it('does not warn when the page holds every reported row', () => {
    const r = readResults({ headers: HEADERS, rows: ROBERTSON, pageText: '', reportedRows: 4 }, 'Robertson');
    expect(r.statement).not.toContain('ONE PAGE');
  });

  it('keeps the page count when the grid gives one', () => {
    const r = readResults({ headers: HEADERS, rows: [ROBERTSON[1]], pageText: '' }, 'Robertson');
    if (r.state === 'has_results') expect(r.documents[0].pageCount).toBe(16);
  });

  it('drops a row with no citation rather than inventing a document', () => {
    const r = readResults({ headers: HEADERS, rows: [['1/1/1990', 'NO CITATION', '', '1', 'DEED', 'GR', '', '']], pageText: '' }, 'Falls');
    expect(r.state).toBe('empty');
  });
});
