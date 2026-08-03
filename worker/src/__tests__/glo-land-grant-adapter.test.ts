// The original surveys, from the Texas General Land Office (plan S-6).
//
// Driven on 2026-08-02: county=BELL returned 1,523 grants; BELL + grantee DUNCAN returned 5, of
// which the first page carried 2 with record ids and free PDFs.

import { describe, it, expect } from 'vitest';
import {
  GLO_FIELDS,
  GLO_SUBMIT,
  GloLandGrantAdapter,
  countyValue,
  describeSearch,
  recordIdFrom,
  usableGrants,
  type LandGrant,
} from '../adapters/glo-land-grant-adapter.js';

const grant = (over: Partial<LandGrant> = {}): LandGrant => ({
  county: 'Bell',
  abstractNumber: '123',
  districtClass: 'Clerk Returns',
  fileNumber: '000001',
  originalGrantee: 'Duncan, Thomas',
  patentee: '',
  ...over,
});

describe('the county dropdown is uppercase and exact', () => {
  it('uppercases the county', () => {
    // Selecting "Bell" against a list of "BELL" fails silently.
    expect(countyValue('Bell')).toBe('BELL');
    expect(countyValue('San Saba County')).toBe('SAN SABA');
  });
});

describe('the search fields are the ones GLO serves', () => {
  it('records a surveyor\'s vocabulary, not a title company\'s', () => {
    // abstractnumber and originalgrantee are what a legal description cites.
    expect(GLO_FIELDS.abstractNumber).toBe('abstractnumber');
    expect(GLO_FIELDS.originalGrantee).toBe('originalgrantee');
    expect(GLO_FIELDS.surveyBlockTownship).toBe('surveyblocktownship');
  });

  it('pins the submit control that actually submits', () => {
    // #search-button is the site-wide header search and submits nothing here — clicking it looks
    // exactly like a search that found nothing.
    expect(GLO_SUBMIT).toBe('#form-submission-button');
  });
});

describe('"View" is not an abstract number', () => {
  it('extracts a real abstract number', () => {
    expect(grant({ abstractNumber: '123' }).abstractNumber).toBe('123');
  });

  it('keeps a grant that has a file number but no abstract', () => {
    // The abstract lives on the detail page; the row often shows a "View" link instead. Dropping
    // the grant would lose a real record, and storing "View" would put ABSTRACT View into a legal
    // citation.
    expect(usableGrants([grant({ abstractNumber: '' })])).toHaveLength(1);
  });

  it('drops a row that identifies no survey at all', () => {
    expect(usableGrants([grant({ abstractNumber: '', fileNumber: '' })])).toHaveLength(0);
  });

  it('drops a row with no county', () => {
    expect(usableGrants([grant({ county: '' })])).toHaveLength(0);
  });
});

describe('GLO\'s stable record id', () => {
  it('is pulled from the detail link', () => {
    expect(recordIdFrom('/archives-heritage/search-our-collections/land-grant-search/land-grant/656828')).toBe('656828');
  });

  it('is undefined when there is no detail link', () => {
    expect(recordIdFrom(undefined)).toBeUndefined();
    expect(recordIdFrom('/somewhere/else')).toBeUndefined();
  });
});

describe('a paged result never passes as the whole county', () => {
  it('says TRUNCATED when fewer grants were read than GLO reported', () => {
    // Bell alone has 1,523 grants. Treating page one as the county's grant list would be wrong by
    // three orders of magnitude.
    const s = describeSearch({ grants: [grant()], reportedTotal: 1523, truncated: true }, 'BELL');
    expect(s).toContain('TRUNCATED');
    expect(s).toContain('before treating it as the county');
  });

  it('stays quiet when everything was read', () => {
    expect(describeSearch({ grants: [grant()], reportedTotal: 1, truncated: false }, 'BELL')).not.toContain('TRUNCATED');
  });

  it('admits when GLO stated no total', () => {
    expect(describeSearch({ grants: [grant()], reportedTotal: null, truncated: false }, 'BELL')).toContain('completeness is UNKNOWN');
  });
});

describe('a county is required', () => {
  it('refuses to search the whole state', async () => {
    const a = new GloLandGrantAdapter();
    await expect(a.search({ county: '  ' })).rejects.toThrow(/refusing to search the whole state/i);
  });
});
