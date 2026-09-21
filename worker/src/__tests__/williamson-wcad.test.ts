/**
 * Williamson — the appraisal client.
 *
 * Fixtures are verbatim responses captured from the live sites on 2026-09-21, not invented shapes.
 * The detail text is the rendered page for R075105, the property job 26144's run spent twelve
 * minutes failing to identify.
 */

import { describe, it, expect } from 'vitest';
import {
  wcadQuickSearch, wcadDetailUrl, parseWcadDetail, wcadSales, wcadSubdivision, subdivisionFromLegal,
  withoutStreetType,
} from '../counties/williamson/wcad.js';
import { WILLIAMSON_ENDPOINTS, WILLIAMSON_CLERK_BRIDGE } from '../counties/williamson/config/endpoints.js';
import { WILLIAMSON_COUNTY_CITIES, williamsonCityCode, isWilliamsonCity } from '../counties/williamson/config/towns.js';

/** Verbatim from GET /ProxyT/Search/Properties/quick/?f=1007%20CUSHING… on 2026-09-21. */
const QUICK_SEARCH_BODY = {
  ResultList: [{
    PropertyQuickRefID: 'R075105',
    PartyQuickRefID: 'O011710',
    OwnerQuickRefID: 'R075105',
    LegacyID: null,
    PropertyNumber: 'R-16-5591-EX00-0001',
    OwnerName: 'CITY OF ROUND ROCK',
    OwnerFullAddress: null,
    SitusAddress: '1007 CUSHING DR, ROUND ROCK, TX  78664',
    LegalDescription: null,
    TaxYear: 2027,
  }],
  HasMoreData: false,
  TotalPageCount: 1,
  CurrentPage: 1,
  RecordCount: 1,
  SearchText: '1007 CUSHING',
  TaxYear: 2027,
};

/**
 * A URL as a person would read it.
 *
 * `URLSearchParams` encodes a space as `+`, and `decodeURIComponent` does NOT turn that back into
 * a space — it only handles `%20`. Asserting on the raw decode therefore fails against perfectly
 * correct query strings, which is what it did here first time.
 */
const readable = (url: string) => decodeURIComponent(url).split('+').join(' ');

function fakeFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(String(url));
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('quick search — the call that replaces Stage 1', () => {
  it('reads the parcel out of a real response', async () => {
    const { impl } = fakeFetch(QUICK_SEARCH_BODY);
    const r = await wcadQuickSearch('1007 CUSHING', { fetchImpl: impl });

    expect(r.error).toBeNull();
    expect(r.recordCount).toBe(1);
    expect(r.hits[0]).toMatchObject({
      propertyQuickRefId: 'R075105',
      partyQuickRefId: 'O011710',
      propertyNumber: 'R-16-5591-EX00-0001',
      ownerName: 'CITY OF ROUND ROCK',
      taxYear: 2027,
    });
  });

  it('collapses the doubled space the site sends in a situs address', () => {
    // "ROUND ROCK, TX  78664" — two spaces, verbatim from the live response. An address compared
    // byte-for-byte against a normalised one would never match.
    expect(QUICK_SEARCH_BODY.ResultList[0]!.SitusAddress).toContain('TX  78664');
  });

  it('collapses it', async () => {
    const { impl } = fakeFetch(QUICK_SEARCH_BODY);
    const r = await wcadQuickSearch('1007 CUSHING', { fetchImpl: impl });
    expect(r.hits[0]!.situsAddress).toBe('1007 CUSHING DR, ROUND ROCK, TX 78664');
  });

  it('sends the text AS TYPED — no variants, no normalisation', async () => {
    // The whole reason this county is cheap. The endpoint answered "1007 CUSHING" — no street
    // type — with the right parcel, so generating variants in front of it would only reintroduce
    // the bug that sent "Cushing Dirve" to two counties' search boxes.
    const { impl, calls } = fakeFetch(QUICK_SEARCH_BODY);
    await wcadQuickSearch('1007 Cushing Dirve', { fetchImpl: impl });
    expect(readable(calls[0]!)).toContain('f=1007 Cushing Dirve');
  });

  it('sends the property-type list the site sends, unchanged', async () => {
    // A different `pt` silently drops whole property classes, so it is not a tuning knob.
    const { impl, calls } = fakeFetch(QUICK_SEARCH_BODY);
    await wcadQuickSearch('x', { fetchImpl: impl });
    expect(readable(calls[0]!)).toContain('pt=RP;PP;MH;NR');
  });

  it('defaults to the tax year the district is actually serving', async () => {
    // WCAD served 2027 in September 2026 — districts run a year ahead, so "this year" would ask
    // for a year with no values in it.
    expect(WILLIAMSON_ENDPOINTS.cad.defaultTaxYear).toBe(2027);
    const { impl, calls } = fakeFetch(QUICK_SEARCH_BODY);
    await wcadQuickSearch('x', { fetchImpl: impl });
    expect(calls[0]).toContain('ty=2027');
  });

  it('an empty query is refused without a request', async () => {
    const { impl, calls } = fakeFetch(QUICK_SEARCH_BODY);
    const r = await wcadQuickSearch('   ', { fetchImpl: impl });
    expect(r.error).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('a non-200 is an error, not an empty result', async () => {
    // "No such property" and "the site is down" must not look the same — one of those is a fact
    // about the property.
    const { impl } = fakeFetch({}, { ok: false, status: 503 });
    const r = await wcadQuickSearch('anything', { fetchImpl: impl });
    expect(r.hits).toEqual([]);
    expect(r.error).toContain('503');
  });

  it('a thrown fetch is reported, not swallowed', async () => {
    const impl = (async () => { throw new Error('getaddrinfo ENOTFOUND'); }) as unknown as typeof fetch;
    const r = await wcadQuickSearch('anything', { fetchImpl: impl });
    expect(r.error).toContain('ENOTFOUND');
  });

  it('drops a row with no property id rather than emitting a blank one', async () => {
    const { impl } = fakeFetch({ ResultList: [{ OwnerName: 'NOBODY' }, QUICK_SEARCH_BODY.ResultList[0]] });
    const r = await wcadQuickSearch('x', { fetchImpl: impl });
    expect(r.hits).toHaveLength(1);
  });
});

describe('the detail URL', () => {
  it('carries both ids', () => {
    const u = wcadDetailUrl('R075105', 'O011710');
    expect(u).toContain('PropertyQuickRefID=R075105');
    expect(u).toContain('PartyQuickRefID=O011710');
  });

  it('works without the party id', () => {
    expect(wcadDetailUrl('R075105')).not.toContain('PartyQuickRefID');
  });
});

/** The rendered detail page for R075105, trimmed to the labelled fields. Captured 2026-09-21. */
const DETAIL_TEXT = `
PROPERTY:
R075105
OWNER:
CITY OF ROUND ROCK
PROPERTY ADDRESS:
1007 CUSHING DR, ROUND ROCK, TX 78664
TAX YEAR:
2027

2027 GENERAL INFORMATION

Property Status
Active

Property Type
C3

Legal Description
VILLAGE GREEN (EXEMPT), LOT 1, ACRES 2.82

Neighborhood
R20QARR-EAST RRISD RENT RESTRICTED APTS

Account
R-16-5591-EX00-0001

Map Number
3-5927

Effective Acres
0.000000

2027 OWNER INFORMATION

Owner Name
CITY OF ROUND ROCK

Exemptions
Exempt Property (Active )

Mailing Address
221 MAIN ST ROUND ROCK, TX 78664-5299

2027 IMPROVEMENTS

Total Main Area (Exterior Measured):
24,420 Sq. Ft
RECORD:
1
YEAR BUILT:
2002

2027 LAND SEGMENTS
TOTALS
LAND SIZE:
122,839 Sq. ft / 2.820000 acres
`;

describe('the detail page, read by label', () => {
  const d = parseWcadDetail('R075105', DETAIL_TEXT);

  it('reads every field the run needed and did not get', () => {
    expect(d).toMatchObject({
      propertyId: 'R075105',
      ownerName: 'CITY OF ROUND ROCK',
      legalDescription: 'VILLAGE GREEN (EXEMPT), LOT 1, ACRES 2.82',
      account: 'R-16-5591-EX00-0001',
      mapNumber: '3-5927',
      propertyType: 'C3',
      situsAddress: '1007 CUSHING DR, ROUND ROCK, TX 78664',
      mailingAddress: '221 MAIN ST ROUND ROCK, TX 78664-5299',
    });
  });

  it('takes the acreage from the land segment, not from "Effective Acres"', () => {
    // Effective Acres reads 0.000000 on this parcel while the land segment says 2.82. Trusting the
    // first would report a two-and-a-half-acre property as having no land.
    expect(d.acres).toBe(2.82);
  });

  it('reads the improvement and the land size', () => {
    expect(d.improvementSqFt).toBe(24420);
    expect(d.landSqFt).toBe(122839);
    expect(d.yearBuilt).toBe(2002);
  });

  it('returns nulls rather than throwing on a page with nothing in it', () => {
    const empty = parseWcadDetail('R1', '');
    expect(empty.propertyId).toBe('R1');
    expect(empty.ownerName).toBeNull();
    expect(empty.acres).toBeNull();
  });
});

describe('subdivisionFromLegal — the step the run skipped', () => {
  it('pulls the subdivision out of a platted description', () => {
    // The run announced "No subdivision name yet … this is a metes-and-bounds parcel" about
    // exactly this string. It is Lot 1 of a recorded subdivision.
    expect(subdivisionFromLegal('VILLAGE GREEN (EXEMPT), LOT 1, ACRES 2.82')).toBe('VILLAGE GREEN');
  });

  it.each([
    ['SUNSET ACRES, BLOCK 2, LOT 4', 'SUNSET ACRES'],
    ['CEDAR RIDGE PHASE 3, LOT 12', 'CEDAR RIDGE PHASE 3'],
    ['village green (exempt), lot 1', 'VILLAGE GREEN'],
  ])('%s → %s', (legal, want) => {
    expect(subdivisionFromLegal(legal)).toBe(want);
  });

  it('refuses metes and bounds rather than searching for a survey as if it were a plat', () => {
    // "18.308 AC GARCIA M SVY ABST 246" is a real legal description from this county's clerk.
    // Handing it to a subdivision search wastes a request and can match something unrelated.
    for (const l of [
      '18.308 AC GARCIA M SVY ABST 246',
      'A0246 GARCIA M, 10.0 ACRES',
      '2.5 ACRES OUT OF THE J SMITH SURVEY, ABSTRACT 12',
    ]) {
      expect(subdivisionFromLegal(l), l).toBeNull();
    }
  });

  it('refuses a description that starts with a lot reference', () => {
    expect(subdivisionFromLegal('LOT 4, BLOCK 2')).toBeNull();
  });

  it.each([['empty', ''], ['spaces', '  '], ['null', null], ['undefined', undefined]])(
    '%s is null', (_l, v) => { expect(subdivisionFromLegal(v as string | null)).toBeNull(); },
  );
});

describe('sales — the clerk bridge', () => {
  it('is book/page for this county, not instrument', () => {
    // Bell cites deeds by instrument number. Williamson's appraisal data carries none at all, so a
    // Bell-shaped run finds no deeds here against a perfectly healthy clerk.
    expect(WILLIAMSON_CLERK_BRIDGE).toBe('volume_page');
  });

  it('reads book, page and deed date off a real row', async () => {
    const { impl } = fakeFetch([{
      adhoctaxyear: '2026', propertyid: '145198', book: '1539', page: '526',
      deeddate: '1987-06-05T00:00:00.000', instrumenttypecode: 'Conv',
      transfervaliditydesc: 'Invalid',
    }]);
    const { sales } = await wcadSales('145198', { fetchImpl: impl });
    expect(sales[0]).toMatchObject({
      propertyId: '145198', book: '1539', page: '526', instrumentTypeCode: 'Conv',
    });
    expect(sales[0]!.deedDate).toContain('1987-06-05');
  });

  it('drops a row with no book, page or date — it cites nothing', async () => {
    const { impl } = fakeFetch([{ propertyid: '1' }, { propertyid: '2', book: '10', page: '2' }]);
    const { sales } = await wcadSales('1', { fetchImpl: impl });
    expect(sales).toHaveLength(1);
  });

  it('asks for the certified dataset by default and preliminary on request', async () => {
    const a = fakeFetch([]); await wcadSales('1', { fetchImpl: a.impl });
    expect(a.calls[0]).toContain(WILLIAMSON_ENDPOINTS.data.datasets.salesCertified);

    const b = fakeFetch([]); await wcadSales('1', { certified: false, fetchImpl: b.impl });
    expect(b.calls[0]).toContain(WILLIAMSON_ENDPOINTS.data.datasets.salesPreliminary);
  });
});

describe('the subdivision index', () => {
  it('finds a subdivision and reports whether it has a polygon', async () => {
    const { impl } = fakeFetch([{
      name: 'VILLAGE GREEN SUB', scode: 'S4892', type: 'Subdivision',
      acres: 0.0, numberlots: 0, geometry: { type: 'MultiPolygon' },
    }]);
    const { matches } = await wcadSubdivision('VILLAGE GREEN', impl);
    expect(matches[0]).toMatchObject({ name: 'VILLAGE GREEN SUB', code: 'S4892', hasGeometry: true });
  });

  it('matches loosely, because the district adds suffixes a deed does not', async () => {
    const { impl, calls } = fakeFetch([]);
    await wcadSubdivision('village green', impl);
    const q = readable(calls[0]!);
    expect(q).toContain("upper(name) like '%VILLAGE GREEN%'");
  });

  it('escapes a quote instead of breaking the query', async () => {
    // "O'BRIEN ADDITION" is an ordinary subdivision name and an unescaped quote would end the
    // literal mid-word.
    const { impl, calls } = fakeFetch([]);
    await wcadSubdivision("O'BRIEN ADDITION", impl);
    expect(readable(calls[0]!)).toContain("O''BRIEN ADDITION");
  });

  it('an empty name makes no request', async () => {
    const { impl, calls } = fakeFetch([]);
    await wcadSubdivision('  ', impl);
    expect(calls).toHaveLength(0);
  });
});

describe('the towns list', () => {
  it('came from the county\'s own annexation data', () => {
    for (const c of ['ROUND ROCK', 'GEORGETOWN', 'TAYLOR', 'CEDAR PARK', 'HUTTO', 'LEANDER']) {
      expect(WILLIAMSON_COUNTY_CITIES, c).toContain(c);
    }
  });

  it('includes Austin, which crosses the county line', () => {
    expect(WILLIAMSON_COUNTY_CITIES).toContain('AUSTIN');
  });

  it('includes unincorporated places the annexation data cannot contain', () => {
    // The dataset lists CITIES. These have no city government to annex anything, and an address
    // parser that has never heard of them treats the place name as part of the street.
    expect(WILLIAMSON_COUNTY_CITIES).toContain('ANDICE');
    expect(WILLIAMSON_COUNTY_CITIES).toContain('WALBURG');
  });

  it('maps a city to the taxing-entity code the district prints', () => {
    expect(williamsonCityCode('Round Rock')).toBe('CRR');
    expect(williamsonCityCode('GEORGETOWN')).toBe('CGT');
    expect(williamsonCityCode('Temple')).toBeNull();
    expect(williamsonCityCode(null)).toBeNull();
  });

  it('recognises a place in the county', () => {
    expect(isWilliamsonCity('hutto')).toBe(true);
    expect(isWilliamsonCity('Belton')).toBe(false);
    expect(isWilliamsonCity('')).toBe(false);
  });
});

/**
 * The street type lives in the street, not at the end of the line.
 *
 * `withoutStreetType` dropped the last word of the WHOLE line. That is the street type only when
 * the caller passed a bare street address; given a full one it dropped the STATE and left the
 * street type — the one word it exists to remove — exactly where it was.
 *
 * Measured against the live district on 2026-09-21, which is what makes this worth a test rather
 * than an opinion:
 *
 *     "1007 Cushing Drive, Round Rock, TX"        0 hits
 *     "1007 Cushing, Round Rock, TX"              1 hit  → R075105, CITY OF ROUND ROCK
 *
 * Job 26144 is that parcel, and its research had been searching for the client instead.
 */
describe('withoutStreetType', () => {
  it('drops the street type from a FULL address, keeping city and state', () => {
    expect(withoutStreetType('1007 Cushing Drive, Round Rock, TX')).toBe('1007 Cushing, Round Rock, TX');
    expect(withoutStreetType('2119 Jasmine Path, Round Rock, TX 78664')).toBe('2119 Jasmine, Round Rock, TX 78664');
  });

  it('still works on a bare street address, which is what it was written for', () => {
    expect(withoutStreetType('1007 Cushing Dirve')).toBe('1007 Cushing');
  });

  it('refuses when there is no street type to drop', () => {
    // A word is REMOVED here, never guessed — so anything that is not plainly a numbered street
    // address with a trailing type returns null rather than a mangled query.
    expect(withoutStreetType('1007 Cushing')).toBeNull();
    expect(withoutStreetType('Cushing Drive, Round Rock, TX')).toBeNull();
    expect(withoutStreetType('')).toBeNull();
    expect(withoutStreetType('   ')).toBeNull();
  });

  it('never returns the line it was given', () => {
    for (const s of ['1007 Cushing Drive, Round Rock, TX', '1007 Cushing Dirve']) {
      expect(withoutStreetType(s)).not.toBe(s);
    }
  });
});
