/**
 * The filter that keeps a portfolio owner's other houses out of this parcel's file.
 *
 * Every string below is real: taken from the Williamson clerk's index and the appraisal district
 * on 2026-09-21, for parcel R093992 (2119 Jasmine Path) and its owner AMH 2015-2 BORROWER LLC.
 */

import { describe, it, expect } from 'vitest';
import { rowCouldBeThisParcel, placeTokens } from '../counties/williamson/parcel-match.js';

const PARCEL = 'SOUTH CREEK SEC 16 AMENDED, BLOCK A, LOT 14';

describe('placeTokens', () => {
  it('keeps the subdivision name and nothing else', () => {
    expect(placeTokens(PARCEL)).toEqual(['SOUTH', 'CREEK']);
  });

  it('discards the county\'s internal parcel codes', () => {
    // `000F02280010` identifies nothing a human would recognise and would match across parcels.
    expect(placeTokens('000F02280010 00A SOUTH CK 16')).toEqual(['SOUTH']);
  });

  it('discards position words, which every description has', () => {
    expect(placeTokens('LOT 20, BLOCK M, PHASE 3')).toEqual([]);
  });
});

describe('rowCouldBeThisParcel', () => {
  it('keeps the parcel\'s own rows across four spellings of one subdivision', () => {
    // The index abbreviates with no system whatsoever. All four are this parcel.
    for (const legal of [
      '000F02280010 00A SOUTH CK 16',
      'LT 14 BK A SOUTHCREEK S-16A AMND',
      '000H01570014 00A SOUTHCK 16',
      '000H01550033 00A SOUTH CK',
    ]) {
      expect(rowCouldBeThisParcel(legal, PARCEL).keep, legal).toBe(true);
    }
  });

  it('drops the same landlord\'s other houses', () => {
    for (const legal of [
      'LOT 20, BLOCK M, HUTTO PARKE SECTION 3',
      'LOT 20, BLOCK B, GEORGETOWN CROSSING PHASE 1',
      'LOT 7, BLOCK F, MALLARD PARK, PHASE 2',
    ]) {
      const m = rowCouldBeThisParcel(legal, PARCEL);
      expect(m.keep, legal).toBe(false);
      expect(m.why).toMatch(/which is not/);
    }
  });

  it('KEEPS a row with no legal description', () => {
    // The whole point. Instrument 2015084337 — the deed that vests the current owner — is a
    // portfolio conveyance and carries no description. Dropping it to be tidy would discard the
    // single most important document on the parcel.
    expect(rowCouldBeThisParcel(null, PARCEL).keep).toBe(true);
    expect(rowCouldBeThisParcel('', PARCEL).keep).toBe(true);
    expect(rowCouldBeThisParcel(null, PARCEL).why).toMatch(/portfolio conveyance/);
  });

  it('keeps everything when the appraisal district gave us nothing to compare', () => {
    expect(rowCouldBeThisParcel('LOT 20, BLOCK M, HUTTO PARKE SECTION 3', '').keep).toBe(true);
    expect(rowCouldBeThisParcel('anything', null).keep).toBe(true);
  });

  it('does not match two different places that merely share a position word', () => {
    // "PARK" against "SOUTH CREEK" must not pass on the strength of being a place-ish noun.
    expect(rowCouldBeThisParcel('LOT 1, BLOCK A, MALLARD PARK', PARCEL).keep).toBe(false);
  });

  it('handles a metes-and-bounds parcel by surveyor name', () => {
    const survey = 'A0246 GARCIA M SUR, ACRES 18.308';
    expect(rowCouldBeThisParcel('18.308 AC GARCIA M SVY ABST 246', survey).keep).toBe(true);
    expect(rowCouldBeThisParcel('LOT 20, BLOCK M, HUTTO PARKE SECTION 3', survey).keep).toBe(false);
  });

  it('explains itself either way, because a run log is read by a person', () => {
    expect(rowCouldBeThisParcel('LT 14 BK A SOUTHCREEK S-16A AMND', PARCEL).why)
      .toMatch(/SOUTHCREEK.*matches.*SOUTH/);
  });
});
