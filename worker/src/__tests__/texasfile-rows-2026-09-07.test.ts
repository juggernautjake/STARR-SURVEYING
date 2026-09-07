// TexasFile result rows parsed BY COLUMN. Every fixture below is a row copied verbatim from the live
// site on 2026-09-07 (worker, Bell County, the 1401 North East St parcel — "WINNIE MAE ADDITION,
// BLOCK 001, LOT 4, PT 3"). The old text scrape read the tooltip's injected CSS and returned nulls
// for all of these, so a name search's first row (a lien on another lot) was what got bought.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalInstrument, instrumentsMatch, normaliseSubdivisionName, parseLegal, parsePagesAndPrice,
  parseTexasFileRow, fieldsOf, type RawTexasFileRow,
} from '../services/texasfile-rows.js';
import { chooseTexasFileResult, priceTexasFileResult, type TexasFileResult } from '../services/texasfile-buy.js';
import { texasFileResultToManifest, texasFilePlatResultToManifest } from '../research/live-source-adapters.js';
import { clusterEntries } from '../research/cross-source-match.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

const DEED_HEADERS = ['Hide All Info', 'Date Filed', 'Type', 'Number', 'Book', 'Volume', 'Page', 'Grantor', 'Grantee', 'Legal Desc.'];
const PLAT_HEADERS = ['', 'Filed Date', 'Subdivision Name', 'Number', 'Cabinet/Volume', 'Slide/Page', 'Description'];
const ACTIONS = 'Purchase Preview Cart Extract Text My File Report Issue';

/** The subject's 2004 deed, found by volume/page 5456/704. TexasFile numbers it "34968"; the CAD "2004034968". */
const subjectDeed: RawTexasFileRow = {
  guid: 'EB724CB6-EC06-4314-87B0-59D665B7BD40', headers: DEED_HEADERS,
  cells: [ACTIONS, '08/13/2004', 'DEED', '34968', 'OR', '5456', '704', 'HELEN P FERRELL DIANNE LOUISE FERRELL GEORGE W FERRELL', 'BARBARA SPEER CAFFREY ADRIANNE CAFFREY EVERS BARBARA SPEER CAFFEY', 'Lot: 3 Block: 1 Subdivision: WINNIE MAE ADDITION Lot: 4 More Info'],
  tooltip: 'Purchase: Click to purchase 3 pages for $3.00', detail: 'Reference Documents: Pages: 3 County Type: - Additional Information: -',
};
/** The first row of the owner-name search — a different lot entirely. */
const otherLotDeed: RawTexasFileRow = {
  guid: '3E02EAC9-7CBD-4995-8AE3-FA0EF25CB50D', headers: DEED_HEADERS,
  cells: [ACTIONS, '11/23/2020', 'WARRANTY DEED', '2020064728', 'OPR', '-', '-', 'BARBARA A CAFFREY', 'ADRIANNE CAFFREY EVERS', 'Lot: 2 Block: 5 Subdivision: FRENCH ADDITION, W L'],
  tooltip: 'Purchase: Click to purchase 3 pages for $3.00', detail: 'Reference Documents: Pages: 3 County Type: - Additional Information: -',
};
const lien: RawTexasFileRow = {
  guid: '40808550-48FD-4540-B363-2FA6306C9455', headers: DEED_HEADERS,
  cells: [ACTIONS, '01/23/2019', 'RELEASE', '2586', 'OR', '10717', '44', 'OCWEN LOAN SERVICING LLC', 'BARBARA A CAFFREY RAYMOND J SR CAFFREY', 'Lot: 2 Block: 5 Subdivision: FRENCH ADDITION, W L'],
  tooltip: 'Purchase: Click to purchase 2 pages for $2.00', detail: 'Reference Documents: Pages: 2 County Type: Lien Additional Information: -',
};
const plat1: RawTexasFileRow = {
  guid: '0FE0A9D8-E8E0-4B47-804C-9DAB544CE025', headers: PLAT_HEADERS,
  cells: ['Purchase Cart My File', '09/21/1954', 'WINNIE MAE ADD', '-', 'A', '166A', '-'],
  tooltip: 'Purchase: Click to purchase 1 pages for $10.00', detail: '',
};
const plat2: RawTexasFileRow = { ...plat1, guid: 'D5C38C1F-FB36-4974-AEB5-669A09849164' };

describe('parseTexasFileRow — a clerk-record row', () => {
  it('reads every column of the subject deed, with the instrument in Bell canonical form', () => {
    const r = parseTexasFileRow(subjectDeed, 'instrument');
    expect(r).toMatchObject({
      guid: 'EB724CB6-EC06-4314-87B0-59D665B7BD40', date: '08/13/2004', type: 'DEED',
      instrument: '2004034968', instrumentRaw: '34968', book: 'OR', volume: '5456', page: '704', bookVolPage: '5456/704',
      pages: 3, priceUsd: 3, subdivision: 'WINNIE MAE ADDITION', lots: ['3', '4'], block: '1',
    });
    expect(r.grantor).toContain('GEORGE W FERRELL');
    expect(r.grantee).toContain('BARBARA SPEER CAFFREY');
    expect(r.text).not.toMatch(/color:|background:|\{/);
  });
  it('keeps a ten-digit number as is, treats "-" as empty, and carries the County Type', () => {
    const r = parseTexasFileRow(otherLotDeed, 'instrument');
    expect(r.instrument).toBe('2020064728');
    expect(r.volume).toBeNull();
    expect(r.page).toBeNull();
    expect(r.bookVolPage).toBeNull();
    expect(r.subdivision).toBe('FRENCH ADDITION, W L');
    const l = parseTexasFileRow(lien, 'instrument');
    expect(l.countyType).toBe('Lien');
    expect(l.type).toBe('RELEASE');
    expect(l.instrument).toBe('2019002586');
  });
  it('falls back to positions when the headers are missing', () => {
    const r = parseTexasFileRow({ ...subjectDeed, headers: [] }, 'instrument');
    expect(r.instrument).toBe('2004034968');
    expect(r.volume).toBe('5456');
    expect(r.grantee).toContain('CAFFREY');
  });
  it('maps headers even when their order changes', () => {
    const swapped: RawTexasFileRow = {
      ...subjectDeed,
      headers: ['Hide All Info', 'Type', 'Date Filed', 'Number', 'Book', 'Volume', 'Page', 'Grantee', 'Grantor', 'Legal Desc.'],
      cells: [ACTIONS, 'DEED', '08/13/2004', '34968', 'OR', '5456', '704', 'THE GRANTEE', 'THE GRANTOR', subjectDeed.cells[9]!],
    };
    const f = fieldsOf(swapped, 'instrument');
    expect(f.date).toBe('08/13/2004');
    expect(f.grantor).toBe('THE GRANTOR');
    expect(f.grantee).toBe('THE GRANTEE');
  });
});

describe('parseTexasFileRow — a plat row', () => {
  it('reads the name (normalised), the cabinet/slide letters intact, the date and the flat price', () => {
    const r = parseTexasFileRow(plat1, 'plat');
    expect(r).toMatchObject({ type: 'plat', name: 'WINNIE MAE ADDITION', subdivision: 'WINNIE MAE ADDITION', volume: 'A', page: '166A', bookVolPage: 'A/166A', date: '09/21/1954', pages: 1, priceUsd: 10, instrument: null });
    expect(priceTexasFileResult(r, 'plat')).toBe(10);
  });
  it('two rows in the same cabinet/slide become ONE plat to buy, not two $10s', async () => {
    const entries = [plat1, plat2].map((raw) => texasFilePlatResultToManifest(parseTexasFileRow(raw, 'plat'), 'Bell', 'WINNIE MAE ADDITION'));
    expect(entries[0]).toMatchObject({ docType: 'plat', book: 'A', page: '166A', subdivision: 'WINNIE MAE ADDITION', unitCostUsd: 10, previewRef: plat1.guid });
    const clusters = await clusterEntries(entries);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.sources).toHaveLength(2);
  });
});

describe('the legal description', () => {
  it('parses several lots, a block, and the subdivision, and drops "More Info"', () => {
    expect(parseLegal('Lot: 3 Block: 1 Subdivision: WINNIE MAE ADDITION Lot: 4 More Info')).toEqual({ subdivision: 'WINNIE MAE ADDITION', lots: ['3', '4'], block: '1' });
  });
  it('handles letter blocks, partial lots, rural abstracts and an empty column', () => {
    expect(parseLegal('Lot: 12-A Block: C Subdivision: SUNRIDGE ESTS PH 2')).toEqual({ subdivision: 'SUNRIDGE ESTATES PHASE 2', lots: ['12-A'], block: 'C' });
    expect(parseLegal('Abstract: 123 Survey: J SMITH Acres: 10.5')).toEqual({ lots: [], abstract: '123', survey: 'J SMITH' });
    expect(parseLegal('-')).toEqual({ lots: [] });
    expect(parseLegal(null)).toEqual({ lots: [] });
  });
  it('normalises the abbreviations the plat index and the CAD disagree on', () => {
    expect(normaliseSubdivisionName('WINNIE MAE ADD')).toBe('WINNIE MAE ADDITION');
    expect(normaliseSubdivisionName('winnie mae addn.')).toBe('WINNIE MAE ADDITION');
    expect(normaliseSubdivisionName('OAK HTS SUBD SEC 3')).toBe('OAK HEIGHTS SUBDIVISION SECTION 3');
    expect(normaliseSubdivisionName('ADDISON PLACE')).toBe('ADDISON PLACE'); // a WORD, not the abbreviation
  });
});

describe('instrument numbers across TexasFile and the CAD', () => {
  it('canonicalises a short sequence with its filing year, and leaves full numbers alone', () => {
    expect(canonicalInstrument('34968', '08/13/2004')).toBe('2004034968');
    expect(canonicalInstrument('2020064728', '11/23/2020')).toBe('2020064728');
    expect(canonicalInstrument('2586', '2019-01-23')).toBe('2019002586');
    expect(canonicalInstrument('34968', null)).toBe('34968');
    expect(canonicalInstrument('-', '08/13/2004')).toBeNull();
  });
  it('matches the CAD form to the TexasFile form, and refuses a tail too short to be safe', () => {
    expect(instrumentsMatch('2004034968', '34968')).toBe(true);
    expect(instrumentsMatch('34968', '2004-034968')).toBe(true);
    expect(instrumentsMatch('2004034968', '2004034968')).toBe(true);
    expect(instrumentsMatch('2004034968', '968')).toBe(false);
    expect(instrumentsMatch('2004034968', '2005034968')).toBe(false);
    expect(instrumentsMatch(null, '34968')).toBe(false);
  });
});

describe('pages and price', () => {
  it('reads the tooltip first, then the detail row', () => {
    expect(parsePagesAndPrice('Purchase: Click to purchase 3 pages for $3.00', '')).toEqual({ pages: 3, priceUsd: 3 });
    expect(parsePagesAndPrice('', 'Reference Documents: Pages: 12 County Type: -')).toEqual({ pages: 12, priceUsd: null });
    expect(parsePagesAndPrice('', '')).toEqual({ pages: null, priceUsd: null });
  });
});

describe('chooseTexasFileResult picks the SUBJECT\'S document out of a name search', () => {
  const rows = [otherLotDeed, lien, subjectDeed].map((r) => parseTexasFileRow(r, 'instrument'));

  it('by the CAD\'s year-prefixed instrument against TexasFile\'s short number', () => {
    expect(chooseTexasFileResult(rows, { instrumentNumber: '2004034968' })?.guid).toBe(subjectDeed.guid);
  });
  it('by volume/page', () => {
    expect(chooseTexasFileResult(rows, { volume: '5456', page: '704' })?.guid).toBe(subjectDeed.guid);
  });
  it('by the subject\'s subdivision + lot when only a name was searched — not the first row', () => {
    expect(chooseTexasFileResult(rows, { subdivision: 'WINNIE MAE ADD', lot: '4', block: '1' })?.guid).toBe(subjectDeed.guid);
    // Right subdivision, no lot given: still the DEED, not a lien on the other lot.
    expect(chooseTexasFileResult(rows, { subdivision: 'WINNIE MAE ADDITION' })?.guid).toBe(subjectDeed.guid);
  });
  it('prefers a deed over a release within the wanted subdivision', () => {
    const frenchRows = [lien, otherLotDeed].map((r) => parseTexasFileRow(r, 'instrument'));
    expect(chooseTexasFileResult(frenchRows, { subdivision: 'FRENCH ADDITION' })?.guid).toBe(otherLotDeed.guid);
  });
  it('still falls back to the first row when nothing identifies one', () => {
    expect(chooseTexasFileResult(rows, {})?.guid).toBe(otherLotDeed.guid);
  });
});

describe('the manifest carries the legal identifiers, so ranking + clustering can tell rows apart', () => {
  it('maps volume/page, grantor/grantee, subdivision/lot/block and the stated price', () => {
    const e = texasFileResultToManifest(parseTexasFileRow(subjectDeed, 'instrument'), 'Bell');
    expect(e).toMatchObject({ docType: 'deed', instrument: '2004034968', book: '5456', page: '704', subdivision: 'WINNIE MAE ADDITION', lot: '3', block: '1', unitCostUsd: 3, pageCount: 3, previewRef: subjectDeed.guid });
    expect(e.grantee).toContain('CAFFREY');
  });
  it('clusters the TexasFile row with the CAD\'s free copy of the same deed (different instrument forms)', async () => {
    const paid = texasFileResultToManifest(parseTexasFileRow(subjectDeed, 'instrument'), 'Bell');
    const free = { sourceId: 'bell-clerk', kind: 'free' as const, docType: 'deed', instrument: '2004034968', unitCostUsd: 0, canFreeCapture: true, canPurchase: false };
    const clusters = await clusterEntries([free, paid]);
    expect(clusters).toHaveLength(1);
  });
});

describe('WIRED: the live searches use the column extractor, not the text scrape', () => {
  const src = read('services/texasfile-buy.ts');
  it('both searches evaluate extractTexasFileRawRows and parse in Node', () => {
    expect(src.split('page.evaluate(extractTexasFileRawRows)').length - 1).toBe(2);
    expect(src).toContain("parseTexasFileRow(r, 'instrument')");
    expect(src).toContain("parseTexasFileRow(r, 'plat')");
    expect(src).not.toContain('row?.textContent');
  });
  it('the buy picks by GUID, instrument, volume/page, then the legal description', () => {
    expect(src).toContain('instrumentsMatch(r.instrument, input.instrumentNumber)');
    expect(src).toContain('normaliseSubdivisionName(input.subdivision)');
  });
  it('the extractor removes injected styles and tooltips before reading a cell', () => {
    const rows = read('services/texasfile-rows.ts');
    expect(rows).toContain("c.querySelectorAll('style, script, .__react_component_tooltip').forEach((n) => n.remove())");
  });
});

// The literal shape the fixtures assert on, so a future TexasFileResult change is a conscious one.
const _shape: TexasFileResult = parseTexasFileRow(subjectDeed, 'instrument');
void _shape;
