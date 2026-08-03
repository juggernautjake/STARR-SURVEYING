// iDocMarket — the one vendor that marks up its data properly (plan R39).

import { describe, it, expect } from 'vitest';
import { IDocMarketAdapter, usableRecords, type IDocMarketRecord } from '../adapters/idocmarket-adapter.js';
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

  it('says legal-description search EXISTS but is undriven', async () => {
    // A smaller and different claim than "not offered" — saying the wrong one would send a
    // researcher to a courthouse for something the portal can answer.
    await expect(a.searchByLegalDescription('LOT 3 BLOCK 1')).rejects.toThrow(/EXISTS .* but has NOT been driven/);
  });

  it('says images are charged and unwired, not absent', async () => {
    await expect(a.getDocumentImages('2025-00232')).rejects.toThrow(/not "no images"/);
  });

  it('treats quoted pricing as unconfirmed', async () => {
    await expect(a.getDocumentPricing('2025-00232')).rejects.toThrow(/unconfirmed/);
  });
});
