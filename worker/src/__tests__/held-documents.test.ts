// What the free pass hands the paid pass (plan S-13/S-14).
//
// The load-bearing assertion in this file is the watermark one. Kofile's free tier returns
// watermarked previews, and removing the watermark is the reason to buy the document. If a preview
// were registered as "held", the purchase step would skip it, the run would finish with a
// watermarked image standing in for a clean one, and nothing would say a document was missing.
// That is a false match — silent and unrecoverable — and it is the failure this subsystem exists to
// prevent.

import { describe, it, expect } from 'vitest';
import {
  allHarvestedDocuments,
  buildHeldIndexFromHarvest,
  isUsableCopy,
} from '../research/held-documents.js';
import type { HarvestResult, HarvestedDocument } from '../types/document-harvest.js';

function doc(over: Partial<HarvestedDocument> = {}): HarvestedDocument {
  return {
    instrumentNumber: '2019-3389',
    type: 'deed' as HarvestedDocument['type'],
    date: '03/14/2019',
    grantor: 'SMITH JOHN',
    grantee: 'JONES MARY',
    pages: 3,
    images: ['/tmp/harvest/p1.png'],
    isWatermarked: false,
    source: 'kofile',
    purchaseAvailable: true,
    estimatedPurchasePrice: 3,
    ...over,
  };
}

function harvest(docs: HarvestedDocument[]): HarvestResult {
  return {
    status: 'complete',
    documents: {
      target: { deeds: docs, plats: [], easements: [], restrictions: [], other: [] },
      subdivision: { masterPlat: null, restrictiveCovenants: [], utilityEasements: [], dedicationDocs: [] },
      adjacent: {},
    },
    documentIndex: {
      totalDocumentsFound: docs.length,
      totalPagesDownloaded: 0,
      totalPagesAvailableForPurchase: 0,
      estimatedPurchaseCost: 0,
      sources: [],
      failedSearches: 0,
      searchesPerformed: 1,
    },
    timing: { totalMs: 0, targetSearchMs: 0, subdivisionSearchMs: 0, adjacentSearchMs: 0 },
    errors: [],
  };
}

describe('a watermarked preview is seen, not held', () => {
  it('does not register a watermarked document', () => {
    const r = buildHeldIndexFromHarvest(harvest([doc({ isWatermarked: true })]), 'Bell');
    expect(r.registered).toBe(0);
    expect(r.watermarkedNotHeld).toBe(1);
  });

  it('lets that document still be bought — the watermark is the reason to buy it', () => {
    const r = buildHeldIndexFromHarvest(harvest([doc({ isWatermarked: true })]), 'Bell');
    const decision = r.index.decide({
      county: 'Bell',
      instrumentNumber: '2019-3389',
      recordingDate: '03/14/2019',
    });
    expect(decision.buy).toBe(true);
  });

  it('says so in the summary rather than reporting a bare zero', () => {
    const r = buildHeldIndexFromHarvest(harvest([doc({ isWatermarked: true })]), 'Bell');
    expect(r.summary).toContain('seen, NOT held');
    expect(r.summary).toContain('removing the watermark is the point of buying them');
  });

  it('registers a clean copy, and that one does block a purchase', () => {
    const r = buildHeldIndexFromHarvest(harvest([doc({ isWatermarked: false })]), 'Bell');
    expect(r.registered).toBe(1);
    const decision = r.index.decide({
      county: 'Bell',
      instrumentNumber: '2019-3389',
      recordingDate: '03/14/2019',
    });
    expect(decision.buy).toBe(false);
  });
});

describe('holding nothing is not the same as having seen something', () => {
  it('does not register a document with no downloaded image', () => {
    const r = buildHeldIndexFromHarvest(harvest([doc({ images: [] })]), 'Bell');
    expect(r.registered).toBe(0);
    expect(r.noImagesNotHeld).toBe(1);
  });

  it('isUsableCopy states the rule in one place', () => {
    expect(isUsableCopy(doc())).toBe(true);
    expect(isUsableCopy(doc({ isWatermarked: true }))).toBe(false);
    expect(isUsableCopy(doc({ images: [] }))).toBe(false);
  });
});

describe('a document we hold but cannot identify cannot prevent a purchase', () => {
  it('counts it as unkeyable instead of registering it', () => {
    // No readable recording date — identityKey returns null, because keying on an instrument number
    // that restarts across years would merge two unrelated conveyances.
    const r = buildHeldIndexFromHarvest(harvest([doc({ date: '' })]), 'Bell');
    expect(r.registered).toBe(0);
    expect(r.unkeyable).toBe(1);
  });

  it('says it will be bought again rather than hiding the gap', () => {
    const r = buildHeldIndexFromHarvest(harvest([doc({ date: '' })]), 'Bell');
    expect(r.summary).toContain('cannot prevent a duplicate purchase');
  });
});

describe('the cross-vendor match is the point', () => {
  it('matches the same instrument cited differently by two vendors', () => {
    // Kofile prints 2019-3389; Tyler Eagle prints 20193389. One document.
    const r = buildHeldIndexFromHarvest(harvest([doc({ instrumentNumber: '2019-3389' })]), 'Bell');
    const d = r.index.decide({
      county: 'Bell',
      instrumentNumber: '20193389',
      recordingDate: '2019-03-14',
    });
    expect(d.buy).toBe(false);
  });

  it('does not match the same number in a different county', () => {
    const r = buildHeldIndexFromHarvest(harvest([doc()]), 'Bell');
    const d = r.index.decide({
      county: 'Travis',
      instrumentNumber: '2019-3389',
      recordingDate: '03/14/2019',
    });
    expect(d.buy).toBe(true);
  });

  it('buys, and flags it, when the same number carries a different date', () => {
    // Instrument numbers restart in some counties, so this may be two different documents. Buying
    // is correct; doing it silently is not.
    const r = buildHeldIndexFromHarvest(harvest([doc()]), 'Bell');
    const d = r.index.decide({
      county: 'Bell',
      instrumentNumber: '2019-3389',
      recordingDate: '06/02/1994',
    });
    expect(d.buy).toBe(true);
    expect(d.underUncertainty).toBe(true);
  });
});

describe('every document in a harvest is considered, not just the target deeds', () => {
  it('flattens target, subdivision and adjacent documents', () => {
    const h = harvest([doc({ instrumentNumber: '1' })]);
    h.documents.subdivision.masterPlat = doc({ instrumentNumber: '2' });
    h.documents.subdivision.restrictiveCovenants = [doc({ instrumentNumber: '3' })];
    h.documents.adjacent = { rk_gaines: { deeds: [doc({ instrumentNumber: '4' })], plats: [] } };

    // An adjoiner's deed left out here would be bought again in the paid pass.
    expect(allHarvestedDocuments(h)).toHaveLength(4);
  });

  it('survives a harvest result with missing sections', () => {
    const bare = { status: 'partial', documents: {}, errors: [] } as unknown as HarvestResult;
    expect(() => allHarvestedDocuments(bare)).not.toThrow();
    expect(allHarvestedDocuments(bare)).toEqual([]);
  });
});
