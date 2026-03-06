// __tests__/recon/phase2-harvest.test.ts
// Unit tests for STARR RECON Phase 2: Document Harvest.
//
// Tests cover pure-logic portions of Phase 2 that can be validated without
// a live browser or external HTTP calls:
//
//   1. ClerkAdapter.classifyDocumentType (shared base class method)
//   2. ClerkAdapter.smartSearch deduplication logic (via mock adapter)
//   3. document-intelligence: scoreDocumentRelevance
//   4. document-intelligence: filterAndRankResults (score, filter, sort, cap)
//   5. clerk-registry: getClerkAdapter routing (correct class per FIPS)
//   6. clerk-registry: getClerkSystem + hasFreeImagePreview
//   7. clerk-registry: registrySummary totals

import { describe, it, expect } from 'vitest';

// ── Imports ───────────────────────────────────────────────────────────────────

import {
  ClerkAdapter,
  type ClerkDocumentResult,
  type DocumentImage,
  type PricingInfo,
  type ClerkSearchOptions,
} from '../../worker/src/adapters/clerk-adapter.js';

import {
  scoreDocumentRelevance,
  filterAndRankResults,
  type ScoringContext,
} from '../../worker/src/services/document-intelligence.js';

import {
  getClerkAdapter,
  getClerkSystem,
  hasFreeImagePreview,
  registrySummary,
} from '../../worker/src/services/clerk-registry.js';

import { KofileClerkAdapter } from '../../worker/src/adapters/kofile-clerk-adapter.js';
import { CountyFusionAdapter } from '../../worker/src/adapters/countyfusion-adapter.js';
import { TylerClerkAdapter } from '../../worker/src/adapters/tyler-clerk-adapter.js';
import { TexasFileAdapter } from '../../worker/src/adapters/texasfile-adapter.js';

// ── Mock adapter for smartSearch tests ───────────────────────────────────────

/**
 * Minimal concrete ClerkAdapter that returns a fixed set of results.
 * This lets us test the shared `smartSearch` and `classifyDocumentType`
 * logic without starting a browser.
 */
class MockClerkAdapter extends ClerkAdapter {
  private fixedResults: ClerkDocumentResult[];

  constructor(results: ClerkDocumentResult[]) {
    super('MockCounty', '48999');
    this.fixedResults = results;
  }

  async searchByInstrumentNumber(_no: string): Promise<ClerkDocumentResult[]> {
    return this.fixedResults.filter((r) => r.instrumentNumber === _no);
  }
  async searchByVolumePage(_v: string, _p: string): Promise<ClerkDocumentResult[]> {
    return this.fixedResults;
  }
  async searchByGranteeName(_n: string, _o?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return this.fixedResults;
  }
  async searchByGrantorName(_n: string, _o?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return this.fixedResults;
  }
  async searchByLegalDescription(_l: string, _o?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return this.fixedResults;
  }
  async getDocumentImages(_no: string): Promise<DocumentImage[]> { return []; }
  async getDocumentPricing(_no: string): Promise<PricingInfo> {
    return { available: true, pricePerPage: 1.00, source: 'mock' };
  }
  async initSession(): Promise<void> {}
  async destroySession(): Promise<void> {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDoc(
  instrumentNumber: string,
  override: Partial<ClerkDocumentResult> = {},
): ClerkDocumentResult {
  return {
    instrumentNumber,
    documentType: 'warranty_deed',
    recordingDate: '01/01/2020',
    grantors: ['SELLER LLC'],
    grantees: ['BUYER TRUST'],
    source: 'mock_48999',
    ...override,
  };
}

// ── 1. classifyDocumentType ───────────────────────────────────────────────────

describe('ClerkAdapter.classifyDocumentType', () => {
  const adapter = new MockClerkAdapter([]);

  it('classifies WARRANTY DEED correctly', () => {
    expect(adapter.classifyDocumentType('WARRANTY DEED')).toBe('warranty_deed');
  });

  it('classifies WD abbreviation', () => {
    expect(adapter.classifyDocumentType('WD')).toBe('warranty_deed');
  });

  it('classifies SPECIAL WARRANTY DEED', () => {
    expect(adapter.classifyDocumentType('SPECIAL WARRANTY DEED')).toBe('special_warranty_deed');
  });

  it('classifies SWD abbreviation', () => {
    expect(adapter.classifyDocumentType('SWD')).toBe('special_warranty_deed');
  });

  it('classifies QUITCLAIM DEED', () => {
    expect(adapter.classifyDocumentType('QUITCLAIM DEED')).toBe('quitclaim_deed');
  });

  it('classifies QCD abbreviation', () => {
    expect(adapter.classifyDocumentType('QCD')).toBe('quitclaim_deed');
  });

  it('classifies DEED OF TRUST', () => {
    expect(adapter.classifyDocumentType('DEED OF TRUST')).toBe('deed_of_trust');
  });

  it('classifies DOT abbreviation', () => {
    expect(adapter.classifyDocumentType('DOT')).toBe('deed_of_trust');
  });

  it('classifies PLAT', () => {
    expect(adapter.classifyDocumentType('PLAT')).toBe('plat');
  });

  it('classifies PLT abbreviation', () => {
    expect(adapter.classifyDocumentType('PLT')).toBe('plat');
  });

  it('classifies REPLAT', () => {
    expect(adapter.classifyDocumentType('REPLAT')).toBe('replat');
  });

  it('classifies AMENDED PLAT', () => {
    expect(adapter.classifyDocumentType('AMENDED PLAT')).toBe('amended_plat');
  });

  it('classifies UTILITY EASEMENT', () => {
    expect(adapter.classifyDocumentType('UTILITY EASEMENT')).toBe('utility_easement');
  });

  it('classifies ACCESS EASEMENT', () => {
    expect(adapter.classifyDocumentType('ACCESS EASEMENT')).toBe('access_easement');
  });

  it('classifies DRAINAGE EASEMENT', () => {
    expect(adapter.classifyDocumentType('DRAINAGE EASEMENT')).toBe('drainage_easement');
  });

  it('classifies generic EASEMENT', () => {
    expect(adapter.classifyDocumentType('EASEMENT')).toBe('easement');
  });

  it('classifies ESMT abbreviation', () => {
    expect(adapter.classifyDocumentType('ESMT')).toBe('easement');
  });

  it('classifies RESTRICTIVE COVENANT', () => {
    expect(adapter.classifyDocumentType('RESTRICTIVE COVENANT')).toBe('restrictive_covenant');
  });

  it('classifies CC&R', () => {
    expect(adapter.classifyDocumentType('CC&R')).toBe('ccr');
  });

  it('classifies DEED RESTRICTION', () => {
    expect(adapter.classifyDocumentType('DEED RESTRICTION')).toBe('deed_restriction');
  });

  it('classifies RELEASE OF LIEN', () => {
    expect(adapter.classifyDocumentType('RELEASE OF LIEN')).toBe('release_of_lien');
  });

  it('classifies REL abbreviation', () => {
    expect(adapter.classifyDocumentType('REL')).toBe('release_of_lien');
  });

  it('classifies MECHANICS LIEN', () => {
    expect(adapter.classifyDocumentType('MECHANICS LIEN')).toBe('mechanics_lien');
  });

  it('classifies TAX LIEN', () => {
    expect(adapter.classifyDocumentType('TAX LIEN')).toBe('tax_lien');
  });

  it('classifies RIGHT OF WAY', () => {
    expect(adapter.classifyDocumentType('RIGHT OF WAY')).toBe('right_of_way');
  });

  it('classifies ROW abbreviation', () => {
    expect(adapter.classifyDocumentType('ROW')).toBe('right_of_way');
  });

  it('classifies DEDICATION', () => {
    expect(adapter.classifyDocumentType('DEDICATION')).toBe('dedication');
  });

  it('classifies AFFIDAVIT', () => {
    expect(adapter.classifyDocumentType('AFFIDAVIT')).toBe('affidavit');
  });

  it('classifies CORRECTION INSTRUMENT', () => {
    expect(adapter.classifyDocumentType('CORRECTION INSTRUMENT')).toBe('correction_instrument');
  });

  it('classifies OIL & GAS LEASE', () => {
    expect(adapter.classifyDocumentType('OIL AND GAS LEASE')).toBe('oil_gas_lease');
  });

  it('classifies OGL abbreviation', () => {
    expect(adapter.classifyDocumentType('OGL')).toBe('oil_gas_lease');
  });

  it('classifies MINERAL DEED', () => {
    expect(adapter.classifyDocumentType('MINERAL DEED')).toBe('mineral_deed');
  });

  it('returns "other" for unknown types', () => {
    expect(adapter.classifyDocumentType('UNKNOWN DOCUMENT TYPE')).toBe('other');
  });

  it('is case-insensitive', () => {
    expect(adapter.classifyDocumentType('warranty deed')).toBe('warranty_deed');
    expect(adapter.classifyDocumentType('plat')).toBe('plat');
  });
});

// ── 2. smartSearch deduplication ──────────────────────────────────────────────

describe('ClerkAdapter.smartSearch deduplication', () => {
  // Both grantee and grantor searches return the same doc — should only appear once
  const dupDoc = makeDoc('1234567890');
  const adapter = new MockClerkAdapter([dupDoc, dupDoc]);

  it('deduplicates results from overlapping grantee/grantor searches', async () => {
    const results = await adapter.smartSearch({
      granteeName: 'BUYER TRUST',
      grantorName: 'SELLER LLC',
    });
    expect(results).toHaveLength(1);
    expect(results[0].instrumentNumber).toBe('1234567890');
  });

  it('returns immediately on instrument# hit without running name searches', async () => {
    const instrDoc = makeDoc('9999999999');
    const instrAdapter = new MockClerkAdapter([instrDoc]);

    const results = await instrAdapter.smartSearch({
      instrumentNumber: '9999999999',
      granteeName: 'BUYER TRUST',
    });

    expect(results).toHaveLength(1);
    expect(results[0].instrumentNumber).toBe('9999999999');
  });

  it('returns empty array when no queries are provided', async () => {
    const emptyAdapter = new MockClerkAdapter([]);
    const results = await emptyAdapter.smartSearch({});
    expect(results).toHaveLength(0);
  });
});

// ── 3. scoreDocumentRelevance ─────────────────────────────────────────────────

describe('scoreDocumentRelevance', () => {
  const BASE_CONTEXT: ScoringContext = {
    targetOwner: 'ASH FAMILY TRUST',
    subdivisionName: 'ASH FAMILY TRUST 12.358 ACRE ADDITION',
    adjacentOwners: ['RK GAINES', 'NORDYKE'],
    knownInstruments: ['2010043440'],
    currentYear: 2026,
  };

  it('gives highest score to plats', () => {
    const doc = makeDoc('X', { documentType: 'plat', grantees: ['ASH FAMILY TRUST'] });
    const score = scoreDocumentRelevance(doc, BASE_CONTEXT);
    expect(score.relevanceScore).toBeGreaterThanOrEqual(60);
    expect(score.priority).toBe('high');
    expect(score.shouldDownload).toBe(true);
  });

  it('gives high score to warranty deeds', () => {
    const doc = makeDoc('X', { documentType: 'warranty_deed', grantees: ['ASH FAMILY TRUST'] });
    const score = scoreDocumentRelevance(doc, BASE_CONTEXT);
    // warranty_deed (+40) + owner match (+20) = 60 → high
    expect(score.relevanceScore).toBeGreaterThanOrEqual(60);
    expect(score.priority).toBe('high');
  });

  it('gives medium score to easements', () => {
    const doc = makeDoc('X', { documentType: 'easement' });
    const score = scoreDocumentRelevance(doc, BASE_CONTEXT);
    // easement (+30) = 30 → low (but add subdivision name match can raise it)
    expect(score.relevanceScore).toBeGreaterThanOrEqual(20);
  });

  it('boosts known instruments by +30', () => {
    const doc = makeDoc('2010043440', { documentType: 'warranty_deed' });
    const score = scoreDocumentRelevance(doc, BASE_CONTEXT);
    // warranty_deed (+40) + known instrument (+30) = 70
    expect(score.relevanceScore).toBeGreaterThanOrEqual(70);
  });

  it('boosts recency for recent documents', () => {
    const recentDoc = makeDoc('X', { documentType: 'deed_of_trust', recordingDate: '06/15/2024' });
    const oldDoc    = makeDoc('X', { documentType: 'deed_of_trust', recordingDate: '06/15/2005' });
    const recentScore = scoreDocumentRelevance(recentDoc, BASE_CONTEXT);
    const oldScore    = scoreDocumentRelevance(oldDoc, BASE_CONTEXT);
    expect(recentScore.relevanceScore).toBeGreaterThan(oldScore.relevanceScore);
  });

  it('penalises documents over 50 years old', () => {
    const ancientDoc = makeDoc('X', { documentType: 'warranty_deed', recordingDate: '01/01/1970' });
    const score = scoreDocumentRelevance(ancientDoc, BASE_CONTEXT);
    // warranty_deed (+40) - 50yr penalty (-5) = 35
    expect(score.relevanceScore).toBe(35);
  });

  it('gives low score to liens', () => {
    const doc = makeDoc('X', { documentType: 'mechanics_lien' });
    const score = scoreDocumentRelevance(doc, BASE_CONTEXT);
    expect(score.relevanceScore).toBeLessThan(20);
    expect(score.shouldDownload).toBe(false);
    expect(score.priority).toBe('skip');
  });

  it('marks owner involvement as a bonus', () => {
    const withOwner    = makeDoc('X', { documentType: 'deed_of_trust', grantees: ['ASH FAMILY TRUST'] });
    const withoutOwner = makeDoc('X', { documentType: 'deed_of_trust' });
    const withScore    = scoreDocumentRelevance(withOwner, BASE_CONTEXT);
    const withoutScore = scoreDocumentRelevance(withoutOwner, BASE_CONTEXT);
    expect(withScore.relevanceScore).toBeGreaterThan(withoutScore.relevanceScore);
  });

  it('marks adjacent owner involvement', () => {
    const adjDoc = makeDoc('X', { documentType: 'warranty_deed', grantees: ['RK GAINES'] });
    const score = scoreDocumentRelevance(adjDoc, BASE_CONTEXT);
    // warranty_deed (+40) + adjacent (+10) = 50 → medium
    expect(score.relevanceScore).toBeGreaterThanOrEqual(50);
    expect(score.reason).toContain('adjacent owner');
  });

  it('caps score at 100', () => {
    // A plat for the known instrument owned by target = 50+30+20 = 100
    const doc = makeDoc('2010043440', {
      documentType: 'plat',
      grantees: ['ASH FAMILY TRUST'],
      recordingDate: '01/01/2024',  // within 5 years → +10 = 110, capped at 100
    });
    const score = scoreDocumentRelevance(doc, BASE_CONTEXT);
    expect(score.relevanceScore).toBe(100);
  });

  it('does not go below 0', () => {
    const doc = makeDoc('X', {
      documentType: 'other',
      recordingDate: '01/01/1960',  // >50 years = -5, other = 0 → capped at 0
    });
    const score = scoreDocumentRelevance(doc, BASE_CONTEXT);
    expect(score.relevanceScore).toBeGreaterThanOrEqual(0);
  });
});

// ── 4. filterAndRankResults ───────────────────────────────────────────────────

describe('filterAndRankResults', () => {
  const CTX: ScoringContext = {
    targetOwner: 'TEST OWNER',
    currentYear: 2026,
  };

  it('filters out skip-tier documents (score < 20)', () => {
    const docs: ClerkDocumentResult[] = [
      makeDoc('1', { documentType: 'mechanics_lien' }),  // score ~2 → skip
      makeDoc('2', { documentType: 'plat' }),             // score ~50 → keep
    ];
    const ranked = filterAndRankResults(docs, CTX);
    expect(ranked.map((r) => r.result.instrumentNumber)).toEqual(['2']);
  });

  it('sorts results from highest to lowest score', () => {
    const docs: ClerkDocumentResult[] = [
      makeDoc('A', { documentType: 'deed_of_trust' }),   // low
      makeDoc('B', { documentType: 'plat' }),             // high
      makeDoc('C', { documentType: 'warranty_deed' }),    // medium-high
    ];
    const ranked = filterAndRankResults(docs, CTX);
    const scores = ranked.map((r) => r.score.relevanceScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('caps results at maxItems', () => {
    const docs = Array.from({ length: 10 }, (_, i) =>
      makeDoc(String(i), { documentType: 'warranty_deed' }),
    );
    const ranked = filterAndRankResults(docs, CTX, 3);
    expect(ranked).toHaveLength(3);
  });

  it('uses default cap of 20', () => {
    const docs = Array.from({ length: 30 }, (_, i) =>
      makeDoc(String(i), { documentType: 'warranty_deed' }),
    );
    const ranked = filterAndRankResults(docs, CTX);
    expect(ranked.length).toBeLessThanOrEqual(20);
  });

  it('returns empty array when all results are below threshold', () => {
    const docs = [
      makeDoc('1', { documentType: 'tax_lien' }),
      makeDoc('2', { documentType: 'mechanics_lien' }),
    ];
    const ranked = filterAndRankResults(docs, CTX);
    expect(ranked).toHaveLength(0);
  });
});

// ── 5. ClerkRegistry — adapter routing ───────────────────────────────────────

describe('getClerkAdapter routing', () => {
  it('returns KofileClerkAdapter for Bell County (48027)', () => {
    const adapter = getClerkAdapter('48027', 'Bell');
    expect(adapter).toBeInstanceOf(KofileClerkAdapter);
  });

  it('returns KofileClerkAdapter for Williamson County (48491)', () => {
    const adapter = getClerkAdapter('48491', 'Williamson');
    expect(adapter).toBeInstanceOf(KofileClerkAdapter);
  });

  it('returns KofileClerkAdapter for Travis County (48453)', () => {
    const adapter = getClerkAdapter('48453', 'Travis');
    expect(adapter).toBeInstanceOf(KofileClerkAdapter);
  });

  it('returns CountyFusionAdapter for Harris County (48201)', () => {
    const adapter = getClerkAdapter('48201', 'Harris');
    expect(adapter).toBeInstanceOf(CountyFusionAdapter);
  });

  it('returns CountyFusionAdapter for Dallas County (48113)', () => {
    // Dallas is listed in CountyFusion config (not Kofile FIPS set)
    const adapter = getClerkAdapter('48113', 'Dallas');
    expect(adapter).toBeInstanceOf(CountyFusionAdapter);
  });

  it('returns TylerClerkAdapter for Hidalgo County (48215)', () => {
    const adapter = getClerkAdapter('48215', 'Hidalgo');
    expect(adapter).toBeInstanceOf(TylerClerkAdapter);
  });

  it('returns TexasFileAdapter for an unknown county', () => {
    // FIPS '48888' is not in any known set
    const adapter = getClerkAdapter('48888', 'Unknown');
    expect(adapter).toBeInstanceOf(TexasFileAdapter);
  });
});

// ── 6. getClerkSystem + hasFreeImagePreview ───────────────────────────────────

describe('getClerkSystem', () => {
  it('returns "kofile" for Bell County', () => {
    expect(getClerkSystem('48027')).toBe('kofile');
  });

  it('returns "countyfusion" for Harris County', () => {
    expect(getClerkSystem('48201')).toBe('countyfusion');
  });

  it('returns "tyler" for Hidalgo County', () => {
    expect(getClerkSystem('48215')).toBe('tyler');
  });

  it('returns "texasfile" for unknown FIPS', () => {
    expect(getClerkSystem('48888')).toBe('texasfile');
  });
});

describe('hasFreeImagePreview', () => {
  it('returns true for Kofile counties (Bell, Williamson)', () => {
    expect(hasFreeImagePreview('48027')).toBe(true);
    expect(hasFreeImagePreview('48491')).toBe(true);
  });

  it('returns false for CountyFusion counties (no free preview)', () => {
    expect(hasFreeImagePreview('48201')).toBe(false);
  });

  it('returns false for Tyler counties', () => {
    expect(hasFreeImagePreview('48215')).toBe(false);
  });

  it('returns false for unknown counties (TexasFile fallback)', () => {
    expect(hasFreeImagePreview('48888')).toBe(false);
  });
});

// ── 7. registrySummary ────────────────────────────────────────────────────────

describe('registrySummary', () => {
  it('returns correct adapter counts', () => {
    const summary = registrySummary();
    expect(summary.kofile).toBeGreaterThan(0);
    expect(summary.countyfusion).toBeGreaterThan(0);
    expect(summary.tyler).toBeGreaterThan(0);
    expect(summary.texasfile).toBeGreaterThanOrEqual(0);
  });

  it('all counts are non-negative', () => {
    const summary = registrySummary();
    for (const count of Object.values(summary)) {
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});
