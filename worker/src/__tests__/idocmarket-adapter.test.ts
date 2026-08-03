// iDocMarket — the one vendor that marks up its data properly (plan R39).

import { describe, it, expect } from 'vitest';
import { IDocMarketAdapter, matchSubdivision, usableRecords, type IDocMarketRecord } from '../adapters/idocmarket-adapter.js';
import { IDOCMARKET_FIPS_SET, getClerkSystem, isVendorProven, registrySummary } from '../services/clerk-registry.js';

const rec = (over: Partial<IDocMarketRecord> = {}): IDocMarketRecord => ({
  documentType: 'AFFIDAVIT',
  instrumentNumber: '2025-00232',
  recordingDate: '1/24/2025',
  grantors: ['SMITH CHARLES EDWARD DECEASED'],
  grantees: ['CURRY SARAH'],
  ...over,
});

describe('routing', () => {
  it('sends Bosque to iDocMarket', () => {
    expect(getClerkSystem('48035')).toBe('idocmarket');
    expect(isVendorProven('idocmarket')).toBe(true);
    expect([...IDOCMARKET_FIPS_SET]).toEqual(['48035']);
  });

  it('counts it in the summary and off the TexasFile remainder', () => {
    const s = registrySummary();
    expect(s.idocmarket).toBe(1);
    expect(s.texasfile).toBe(
      254 - s.kofile - s.edoctec - s.uslandrecords - s.aumentum - s.idocmarket -
        s.countyfusion - s.tyler - s.henschen - s.idocket - s.fidlar,
    );
  });

  it('refuses to construct for a county this vendor does not serve', () => {
    expect(() => new IDocMarketAdapter('48027', 'Bell')).toThrow(/not an iDocMarket county/);
  });
});

describe('only identifiable records are kept', () => {
  it('keeps a complete record', () => {
    expect(usableRecords([rec()])).toHaveLength(1);
  });

  it('drops a record with no instrument number', () => {
    // Nothing to key a document on; keeping it would put an unidentifiable row in a chain of title.
    expect(usableRecords([rec({ instrumentNumber: '' })])).toHaveLength(0);
  });

  it('drops a record with no recording date', () => {
    expect(usableRecords([rec({ recordingDate: '' })])).toHaveLength(0);
  });

  it('keeps a record with parties on only one side', () => {
    // A one-sided party list is normal here and is NOT a reason to discard the document.
    expect(usableRecords([rec({ grantees: [] })])).toHaveLength(1);
  });
});

describe('unbuilt capabilities throw rather than returning nothing', () => {
  const a = new IDocMarketAdapter('48035', 'Bosque');

  it('says instrument-number search is unimplemented, not empty', async () => {
    await expect(a.searchByInstrumentNumber('2025-00232')).rejects.toThrow(/NOT implemented/);
  });

  it('says book/page search is unimplemented', async () => {
    await expect(a.searchByVolumePage('412', '88')).rejects.toThrow(/NOT implemented/);
  });

  it('says the document view is ACCOUNT-GATED, not charged, and not absent', async () => {
    // This test used to assert "charged and unwired". Driving Bosque on 2026-08-03 showed the
    // opposite of the money half: /Document/Status returns owned:true with a $0.00 balance and no
    // card on file, so there is no charge — but /Document/Detail redirects to "Must be signed in to
    // continue". The index is free; the VIEW needs a free registration nobody has made.
    //
    // The distinction decides what to do next: "charged" would mean a wallet and a spending
    // decision, "signed in" means somebody creates an account. Different errands entirely.
    await expect(a.getDocumentImages('2025-00232')).rejects.toThrow(/signed-in iDocMarket account/);
    await expect(a.getDocumentImages('2025-00232')).rejects.toThrow(/NOT a charge/);
    await expect(a.getDocumentImages('2025-00232')).rejects.toThrow(/Not "no images"/);
  });

  it('treats quoted pricing as unconfirmed', async () => {
    await expect(a.getDocumentPricing('2025-00232')).rejects.toThrow(/unconfirmed/);
  });
});

describe('legal-description search picks the right kind of search', () => {
  // Real values from Bosque's dropdown, which enumerates 396 subdivisions.
  const SUBS = ['#1 LAKE PLACE PHASE 1', 'LAKE PLACE PHASE 1', 'A P ANDERSON ADD', 'ACKERMAN SUDIVISION'];

  it('matches an exact subdivision', () => {
    expect(matchSubdivision('#1 LAKE PLACE PHASE 1', SUBS)).toEqual({ kind: 'exact', value: '#1 LAKE PLACE PHASE 1' });
  });

  it('matches case-insensitively and ignores surrounding space', () => {
    expect(matchSubdivision('  a p anderson add ', SUBS)).toEqual({ kind: 'exact', value: 'A P ANDERSON ADD' });
  });

  it('refuses a near miss rather than searching free-form', () => {
    // This is the case that matters. "LAKE PLACE" free-form returns nothing, and that nothing reads
    // as "no documents touch this land" when it means "no subdivision by that name exists here".
    const m = matchSubdivision('LAKE PLACE', SUBS);
    expect(m.kind).toBe('near_miss');
    if (m.kind === 'near_miss') expect(m.candidates).toEqual(['#1 LAKE PLACE PHASE 1', 'LAKE PLACE PHASE 1']);
  });

  it('allows genuine free-form text that resembles no subdivision', () => {
    // Nothing looks like it, so the caller meant free-form and gets it.
    expect(matchSubdivision('ABST 123 J ORTIZ SURVEY', SUBS)).toEqual({ kind: 'free_form' });
  });

  it('treats an empty term as free-form rather than matching everything', () => {
    expect(matchSubdivision('', SUBS)).toEqual({ kind: 'free_form' });
    expect(matchSubdivision('   ', SUBS)).toEqual({ kind: 'free_form' });
  });

  it('caps the near-miss list so an error stays readable', () => {
    const many = Array.from({ length: 30 }, (_, i) => `OAK RIDGE PHASE ${i}`);
    const m = matchSubdivision('OAK RIDGE', many);
    if (m.kind === 'near_miss') expect(m.candidates.length).toBeLessThanOrEqual(8);
  });

  it('refuses an empty legal description outright', async () => {
    const a = new IDocMarketAdapter('48035', 'Bosque');
    await expect(a.searchByLegalDescription('  ')).rejects.toThrow(/refusing to search the whole index/i);
  });
});
