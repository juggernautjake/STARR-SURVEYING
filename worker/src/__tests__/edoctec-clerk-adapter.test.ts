// The eDocTec adapter's decisions, without a browser (plan R39).

import { describe, it, expect } from 'vitest';
import {
  EARLIEST_RECORD_DATE,
  EDOCTEC_COUNTIES,
  EDOCTEC_FIELDS,
  EdocTecClerkAdapter,
  edoctecBaseUrl,
  splitName,
  toSiteDate,
} from '../adapters/edoctec-clerk-adapter.js';
import { EDOCTEC_FIPS_SET, getClerkSystem, registrySummary } from '../services/clerk-registry.js';

describe('only counties that were actually driven are listed', () => {
  it('lists Coryell and Lampasas and nothing else', () => {
    // A URL returning 200 is not evidence a search works — that assumption is how the platform
    // came to claim 53 Kofile counties when it had 21.
    expect(Object.keys(EDOCTEC_COUNTIES).sort()).toEqual(['Coryell', 'Lampasas']);
  });

  it('builds each county\'s base URL', () => {
    expect(edoctecBaseUrl('Coryell')).toBe('https://mclennan.edoctec.com/CoryellPublicRecords');
    expect(edoctecBaseUrl('Lampasas')).toBe('https://mclennan.edoctec.com/LampasasPublicRecords');
  });

  it('tolerates the word County in the name', () => {
    expect(edoctecBaseUrl('Coryell County')).toBe('https://mclennan.edoctec.com/CoryellPublicRecords');
  });

  it('does NOT serve McLennan, despite the hostname', () => {
    // mclennan.edoctec.com/McLennan is a JP ticket-payment portal. Assuming the host name implied
    // records coverage would have put Waco deeds on a page that sells traffic-fine payments.
    expect(edoctecBaseUrl('McLennan')).toBeNull();
  });

  it('refuses to construct for an unverified county instead of guessing a URL', () => {
    expect(() => new EdocTecClerkAdapter('48309', 'McLennan')).toThrow(/not a verified eDocTec county/);
  });
});

describe('registry routing', () => {
  it('sends Coryell and Lampasas to eDocTec', () => {
    expect(getClerkSystem('48099')).toBe('edoctec');
    expect(getClerkSystem('48281')).toBe('edoctec');
  });

  it('holds exactly the two driven FIPS codes', () => {
    expect([...EDOCTEC_FIPS_SET].sort()).toEqual(['48099', '48281']);
  });

  it('counts eDocTec in the summary and takes those counties off the TexasFile remainder', () => {
    const before = registrySummary();
    expect(before.edoctec).toBe(2);
    // The fallback bucket must shrink by exactly the counties a real adapter now covers, or the
    // dashboard overstates how much of the state is stuck behind the paywall.
    expect(before.texasfile).toBe(
      254 - before.kofile - before.edoctec - before.uslandrecords - before.countyfusion - before.tyler - before.henschen - before.idocket - before.fidlar,
    );
  });
});

describe('dates are sent in the format the site reads', () => {
  it('converts ISO to US, because an ISO date silently matches nothing', () => {
    expect(toSiteDate('2019-03-04')).toBe('03/04/2019');
  });

  it('leaves an already-US date alone', () => {
    expect(toSiteDate('03/04/2019')).toBe('03/04/2019');
  });

  it('defaults the window back to 1836, not to the recent past', () => {
    // A default of "last 30 years" would return nothing for a 1912 deed and that empty result would
    // read as "this property has no deeds".
    expect(EARLIEST_RECORD_DATE).toBe('01/01/1836');
  });
});

describe('names are split the way the site indexes them', () => {
  it('splits a comma form into last and first', () => {
    expect(splitName('SMITH, CHRISTOPHER D.')).toEqual({ last: 'SMITH', first: 'CHRISTOPHER D.' });
  });

  it('keeps a company name whole', () => {
    // Splitting on the space would put "TECHNICAL SERVICES INC" in FirstName and match nothing.
    expect(splitName('STARR TECHNICAL SERVICES INC')).toEqual({ last: 'STARR TECHNICAL SERVICES INC', first: '' });
  });

  it('keeps a space-form personal name whole rather than guessing the surname', () => {
    expect(splitName('SMITH JONATHAN JR ETAL')).toEqual({ last: 'SMITH JONATHAN JR ETAL', first: '' });
  });

  it('handles an empty name without producing a blank search', () => {
    expect(splitName('   ')).toEqual({ last: '', first: '' });
  });
});

describe('the field names are the real ones', () => {
  it('records what the live forms use', () => {
    // Read off the pages on 2026-08-02, not guessed.
    expect(EDOCTEC_FIELDS.party.lastName).toBe('LastName');
    expect(EDOCTEC_FIELDS.party.firstName).toBe('FirstName');
    expect(EDOCTEC_FIELDS.document.instrumentNo).toBe('InstrumentNo');
    expect(EDOCTEC_FIELDS.common.dateFrom).toBe('DateFrom');
  });

  it('keeps the antiforgery token name the POST is rejected without', () => {
    expect(EDOCTEC_FIELDS.common.token).toBe('__RequestVerificationToken');
  });
});

describe('unbuilt capabilities throw instead of returning an empty array', () => {
  const adapter = new EdocTecClerkAdapter('48099', 'Coryell');

  it('says volume/page search is unimplemented', async () => {
    // [] here would read as "no such instrument recorded", which is a wrong answer about a
    // property rather than an honest gap in our tooling.
    await expect(adapter.searchByVolumePage('412', '88')).rejects.toThrow(/NOT implemented/);
  });

  it('says legal-description search is not offered by this vendor', async () => {
    await expect(adapter.searchByLegalDescription('ABS 123 SUR')).rejects.toThrow(/NOT offered/);
  });

  it('says images go through an unwired paid cart, not that there are none', async () => {
    await expect(adapter.getDocumentImages('395664')).rejects.toThrow(/paid cart/);
  });

  it('says pricing is unknown rather than free', async () => {
    await expect(adapter.getDocumentPricing('395664')).rejects.toThrow(/Unknown, not free/);
  });
});
