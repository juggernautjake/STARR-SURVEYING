// worker/src/__tests__/source-licence.test.ts — what may be done with a document, by where it came from.
//
// The imagery equivalent's test says it in one line: it "refuses to guess a redistribution right".
// This is that rule for documents, and the case it exists for is the plan it contradicts — "once we
// own the document we can do whatever we want with it", which is true of a thing bought and untrue
// of a licence bought.
import { describe, it, expect } from 'vitest';
import {
  licenceFor, mayShareFirmWide, mayRetrieveInBulk, explainLicence, SOURCE_LICENCES,
} from '../research/source-licence.js';

describe('the county and the vendor are not the same right', () => {
  it('a county record may be kept and shared', () => {
    // Texas government records carry no copyright, and the county publishes these for anyone.
    expect(mayShareFirmWide('county_portal')).toBe(true);
    expect(mayRetrieveInBulk('county_portal')).toBe(true);
  });

  it('a TexasFile purchase serves the customer who paid, and no one else', () => {
    // texasfile.com/about/tos/: information "may not be copied, republished, redistributed... without
    // prior written permission", "may not be resold online or utilized for building title abstract
    // plants". A searchable firm-wide archive of county records is close enough to that last phrase
    // that nobody should want to argue it after the fact.
    expect(mayShareFirmWide('texasfile')).toBe(false);
    expect(licenceFor('texasfile').redistribution).toBe('customer_only');
  });

  it('TexasFile forbids bulk retrieval, which rules out harvesting it the way Bell was harvested', () => {
    // "Retrieving information by any automated means is specifically prohibited... bulk downloading
    // images from the Website."
    expect(mayRetrieveInBulk('texasfile')).toBe(false);
    // The county has no such term — which is the whole reason the plat archive was possible.
    expect(mayRetrieveInBulk('county_portal')).toBe(true);
  });

  it("a customer's own file never enters a shared library", () => {
    expect(mayShareFirmWide('customer_upload')).toBe(false);
  });
});

describe('silence is not consent', () => {
  it('an unrecognised source is unknown, never permitted', () => {
    // The failure that matters: a new vendor is added, nobody records its terms, and the library
    // starts serving its documents to everyone because the default was true.
    expect(licenceFor('some-new-vendor').redistribution).toBe('unknown');
    expect(mayShareFirmWide('some-new-vendor')).toBe(false);
    expect(mayRetrieveInBulk('some-new-vendor')).toBe(false);
  });

  it('a missing source is unknown too', () => {
    expect(mayShareFirmWide(null)).toBe(false);
    expect(mayShareFirmWide(undefined)).toBe(false);
    expect(mayShareFirmWide('')).toBe(false);
  });

  it('Kofile is unknown rather than assumed, because nobody has read its terms', () => {
    expect(licenceFor('kofile').redistribution).toBe('unknown');
    expect(licenceFor('kofile').basis).toMatch(/not yet read/i);
  });
});

describe('every entry carries its evidence', () => {
  it('cites a basis and a date, so the next reader can check rather than trust', () => {
    for (const [key, l] of Object.entries(SOURCE_LICENCES)) {
      expect(l.basis.length, `${key} has no stated basis`).toBeGreaterThan(40);
      expect(l.reviewedOn, `${key} has no review date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('quotes the vendor rather than paraphrasing it', () => {
    // A paraphrase drifts. The terms are what they are, so the entry carries their words.
    expect(SOURCE_LICENCES.texasfile.basis).toContain('may not be resold online');
    expect(SOURCE_LICENCES.texasfile.basis).toContain('title abstract plants');
  });

  it('only sources whose terms were actually read are permitted', () => {
    for (const [key, l] of Object.entries(SOURCE_LICENCES)) {
      if (l.redistribution !== 'permitted') continue;
      // A permitted source must say WHY it is permitted in terms of the source, not of convenience.
      expect(l.basis, `${key} is permitted without a reason that survives reading`)
        .toMatch(/public record|no copyright|our own work|publishes these/i);
    }
  });
});

describe('the refusal explains itself', () => {
  it('carries the reason, so a log line does not just say no', () => {
    expect(explainLicence('county_portal')).toMatch(/may be kept and shared/);
    const tf = explainLicence('texasfile');
    expect(tf).toMatch(/not shared/);
    expect(tf).toContain('texasfile.com/about/tos/');
  });
});
