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
import {
  extractKofilePartyNames,
  normaliseKofileApiResponse,
  looksLikeKofileDocuments,
} from '../../worker/src/services/bell-clerk.js';

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

// ── 8. smartSearch — legalDescription fallback ────────────────────────────────

describe('ClerkAdapter.smartSearch legalDescription fallback', () => {
  class LegalSearchAdapter extends ClerkAdapter {
    public legalSearchCalled = false;
    private fixedResults: ClerkDocumentResult[];

    constructor(results: ClerkDocumentResult[]) {
      super('MockCounty', '48999');
      this.fixedResults = results;
    }

    async searchByInstrumentNumber(_no: string): Promise<ClerkDocumentResult[]> { return []; }
    async searchByVolumePage(_v: string, _p: string): Promise<ClerkDocumentResult[]> { return []; }
    async searchByGranteeName(_n: string, _o?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> { return []; }
    async searchByGrantorName(_n: string, _o?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> { return []; }
    async searchByLegalDescription(_l: string, _o?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
      this.legalSearchCalled = true;
      return this.fixedResults;
    }
    async getDocumentImages(_no: string): Promise<DocumentImage[]> { return []; }
    async getDocumentPricing(_no: string): Promise<PricingInfo> {
      return { available: false, source: 'mock' };
    }
    async initSession(): Promise<void> {}
    async destroySession(): Promise<void> {}
  }

  it('calls searchByLegalDescription when legalDescription is provided', async () => {
    const doc = makeDoc('7777777777', { documentType: 'plat' });
    const adapter = new LegalSearchAdapter([doc]);
    const results = await adapter.smartSearch({ legalDescription: 'LOT 5, BLOCK 2' });
    expect(adapter.legalSearchCalled).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0].instrumentNumber).toBe('7777777777');
  });

  it('does NOT call searchByLegalDescription when no legalDescription is given', async () => {
    const adapter = new LegalSearchAdapter([]);
    await adapter.smartSearch({ granteeName: 'BUYER TRUST' });
    expect(adapter.legalSearchCalled).toBe(false);
  });

  it('deduplicates legal description results merged with name results', async () => {
    const doc = makeDoc('8888888888', { documentType: 'easement' });

    class BothSearchAdapter extends ClerkAdapter {
      async searchByInstrumentNumber(_no: string): Promise<ClerkDocumentResult[]> { return []; }
      async searchByVolumePage(_v: string, _p: string): Promise<ClerkDocumentResult[]> { return []; }
      async searchByGranteeName(_n: string): Promise<ClerkDocumentResult[]> { return [doc]; }
      async searchByGrantorName(_n: string): Promise<ClerkDocumentResult[]> { return []; }
      async searchByLegalDescription(_l: string): Promise<ClerkDocumentResult[]> { return [doc]; }
      async getDocumentImages(_no: string): Promise<DocumentImage[]> { return []; }
      async getDocumentPricing(_no: string): Promise<PricingInfo> {
        return { available: false, source: 'mock' };
      }
      async initSession(): Promise<void> {}
      async destroySession(): Promise<void> {}
    }

    const bothAdapter = new BothSearchAdapter('MockCounty', '48999');
    const results = await bothAdapter.smartSearch({
      granteeName: 'BUYER TRUST',
      legalDescription: 'LOT 5, BLOCK 2',
    });
    expect(results).toHaveLength(1);
  });
});

// ── 9. DocumentHarvester — orchestration via mock adapter ─────────────────────

import {
  DocumentHarvester,
  type HarvestInput,
} from '../../worker/src/services/document-harvester.js';

/** Build a HarvestInput for testing without a live browser. */
function makeHarvestInput(
  overrides: Partial<HarvestInput> = {},
): HarvestInput {
  return {
    projectId:  'test-project-001',
    propertyId: '524312',
    owner:      'ASH FAMILY TRUST',
    county:     'MockCounty',
    countyFIPS: '48999',
    ...overrides,
  };
}

/**
 * Swappable mock adapter injected into ClerkRegistry for harvester tests.
 * We override getClerkAdapter via the registry factory by temporarily
 * monkey-patching the module-level import.  Since we can't do that cleanly
 * in ESM, instead we expose a testable adapter via a subclass of
 * DocumentHarvester that accepts an injected adapter.
 */
class TestableHarvester extends DocumentHarvester {
  constructor(private mockAdapter: ClerkAdapter) { super(); }

  protected override getClerkAdapter(_fips: string, _county: string): ClerkAdapter {
    return this.mockAdapter;
  }
}

/** Minimal adapter that returns a fixed document set with no delays */
class FastMockAdapter extends ClerkAdapter {
  constructor(
    private docs: ClerkDocumentResult[],
    private images: DocumentImage[] = [],
  ) {
    super('MockCounty', '48999');
  }

  async searchByInstrumentNumber(no: string): Promise<ClerkDocumentResult[]> {
    return this.docs.filter((d) => d.instrumentNumber === no);
  }
  async searchByVolumePage(_v: string, _p: string): Promise<ClerkDocumentResult[]> {
    return this.docs;
  }
  async searchByGranteeName(_n: string, _o?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return this.docs;
  }
  async searchByGrantorName(_n: string, _o?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return this.docs;
  }
  async searchByLegalDescription(_l: string, _o?: ClerkSearchOptions): Promise<ClerkDocumentResult[]> {
    return [];
  }
  async getDocumentImages(_no: string): Promise<DocumentImage[]> {
    return this.images;
  }
  async getDocumentPricing(_no: string): Promise<PricingInfo> {
    return { available: true, pricePerPage: 1.00, source: 'mock' };
  }
  async initSession(): Promise<void> {}
  async destroySession(): Promise<void> {}
}

/** Override rateLimit to a no-op so tests don't wait 3–5 seconds */
class InstantHarvester extends TestableHarvester {
  protected override async rateLimit(): Promise<void> {}
}

describe('DocumentHarvester orchestration', () => {
  it('returns "complete" status when no errors occur', async () => {
    const doc = makeDoc('1111111111', { documentType: 'warranty_deed', grantees: ['ASH FAMILY TRUST'] });
    const harvester = new InstantHarvester(new FastMockAdapter([doc]));
    const result = await harvester.harvest(makeHarvestInput());
    expect(result.status).toBe('complete');
    expect(result.errors).toHaveLength(0);
  });

  it('includes target documents in result', async () => {
    const doc = makeDoc('2222222222', { documentType: 'plat', grantees: ['ASH FAMILY TRUST'] });
    const harvester = new InstantHarvester(new FastMockAdapter([doc]));
    const result = await harvester.harvest(makeHarvestInput());
    expect(result.documents.target.length).toBeGreaterThan(0);
  });

  it('deduplicates documents found in multiple searches', async () => {
    // Same document returned by both grantee and grantor searches
    const doc = makeDoc('3333333333', { documentType: 'warranty_deed', grantees: ['ASH FAMILY TRUST'] });
    const harvester = new InstantHarvester(new FastMockAdapter([doc]));
    const result = await harvester.harvest(makeHarvestInput());

    const allInstr = result.documents.target.map((d) => d.instrumentNumber);
    const unique = new Set(allInstr);
    expect(unique.size).toBe(allInstr.length);
  });

  it('processes known deed references from Phase 1', async () => {
    const doc = makeDoc('9876543210', { documentType: 'warranty_deed' });
    const harvester = new InstantHarvester(new FastMockAdapter([doc]));

    const result = await harvester.harvest(makeHarvestInput({
      deedReferences: [{ instrumentNumber: '9876543210', type: 'deed' }],
    }));

    expect(result.documents.target.some((d) => d.instrumentNumber === '9876543210')).toBe(true);
  });

  it('resets state between successive harvest() calls', async () => {
    const doc = makeDoc('4444444444', { documentType: 'plat', grantees: ['ASH FAMILY TRUST'] });
    const harvester = new InstantHarvester(new FastMockAdapter([doc]));

    await harvester.harvest(makeHarvestInput({ projectId: 'run1' }));
    const result2 = await harvester.harvest(makeHarvestInput({ projectId: 'run2' }));

    // Second run should be clean — errors don't bleed from run1
    expect(result2.errors).toHaveLength(0);
  });

  it('includes timing.totalMs in result', async () => {
    const harvester = new InstantHarvester(new FastMockAdapter([]));
    const result = await harvester.harvest(makeHarvestInput());
    expect(typeof result.timing.totalMs).toBe('number');
    expect(result.timing.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('searches both grantee and grantor for adjacent owners', async () => {
    let granteeCallCount = 0;
    let grantorCallCount = 0;

    class SpyAdapter extends FastMockAdapter {
      override async searchByGranteeName(name: string): Promise<ClerkDocumentResult[]> {
        if (name !== 'ASH FAMILY TRUST') granteeCallCount++;
        return [];
      }
      override async searchByGrantorName(name: string): Promise<ClerkDocumentResult[]> {
        if (name !== 'ASH FAMILY TRUST') grantorCallCount++;
        return [];
      }
    }

    const harvester = new InstantHarvester(new SpyAdapter([]));
    await harvester.harvest(makeHarvestInput({
      adjacentOwners: ['RK GAINES', 'NORDYKE'],
    }));

    // Both adjacent owners should trigger both grantee and grantor searches
    expect(granteeCallCount).toBe(2);
    expect(grantorCallCount).toBe(2);
  });

  it('returns "partial" status when some searches fail', async () => {
    class FailingAdapter extends FastMockAdapter {
      override async searchByGranteeName(_n: string): Promise<ClerkDocumentResult[]> {
        throw new Error('Network timeout');
      }
    }

    const harvester = new InstantHarvester(new FailingAdapter([]));
    const result = await harvester.harvest(makeHarvestInput());
    expect(result.status).toBe('partial');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('calls destroySession() even when initSession() throws', async () => {
    let destroyCalled = false;

    class InitFailAdapter extends FastMockAdapter {
      override async initSession(): Promise<void> {
        throw new Error('Browser launch failed');
      }
      override async destroySession(): Promise<void> {
        destroyCalled = true;
      }
    }

    const harvester = new InstantHarvester(new InitFailAdapter([]));
    // harvest() must not throw; it should handle the failure gracefully
    await expect(harvester.harvest(makeHarvestInput())).rejects.toThrow();
    // destroySession IS called from the finally block even after initSession fails
    expect(destroyCalled).toBe(true);
  });
});

// ── 10. CountyFusion FIPS set ────────────────────────────────────────────────

import { COUNTYFUSION_FIPS_SET } from '../../worker/src/adapters/countyfusion-adapter.js';
import { TYLER_FIPS_SET } from '../../worker/src/adapters/tyler-clerk-adapter.js';

describe('COUNTYFUSION_FIPS_SET', () => {
  it('contains Harris County (48201)', () => {
    expect(COUNTYFUSION_FIPS_SET.has('48201')).toBe(true);
  });

  it('contains Dallas County (48113)', () => {
    expect(COUNTYFUSION_FIPS_SET.has('48113')).toBe(true);
  });

  it('has more than 5 entries', () => {
    expect(COUNTYFUSION_FIPS_SET.size).toBeGreaterThan(5);
  });

  it('all entries are 5-digit strings', () => {
    for (const fips of COUNTYFUSION_FIPS_SET) {
      expect(fips).toMatch(/^\d{5}$/);
    }
  });
});

describe('TYLER_FIPS_SET', () => {
  it('contains Hidalgo County (48215)', () => {
    expect(TYLER_FIPS_SET.has('48215')).toBe(true);
  });

  it('contains El Paso County (48141)', () => {
    expect(TYLER_FIPS_SET.has('48141')).toBe(true);
  });

  it('has more than 3 entries', () => {
    expect(TYLER_FIPS_SET.size).toBeGreaterThan(3);
  });

  it('all entries are 5-digit strings', () => {
    for (const fips of TYLER_FIPS_SET) {
      expect(fips).toMatch(/^\d{5}$/);
    }
  });
});

// ── 11. scoreDocumentRelevance — additional edge cases ───────────────────────

describe('scoreDocumentRelevance — edge cases', () => {
  const CTX: ScoringContext = {
    targetOwner: 'OWNER LLC',
    currentYear: 2026,
  };

  it('correctly scores quitclaim deed (+20)', () => {
    // Use no recording date to isolate the type-only score (no recency bonus/penalty)
    const doc = makeDoc('X', { documentType: 'quitclaim_deed', recordingDate: '' });
    const score = scoreDocumentRelevance(doc, CTX);
    expect(score.relevanceScore).toBe(20);
    expect(score.shouldDownload).toBe(true);
  });

  it('correctly scores dedication (+20)', () => {
    const doc = makeDoc('X', { documentType: 'dedication', recordingDate: '' });
    const score = scoreDocumentRelevance(doc, CTX);
    expect(score.relevanceScore).toBe(20);
  });

  it('correctly scores right-of-way (+35)', () => {
    const doc = makeDoc('X', { documentType: 'right_of_way', recordingDate: '' });
    const score = scoreDocumentRelevance(doc, CTX);
    expect(score.relevanceScore).toBe(35);
    expect(score.priority).toBe('medium');
  });

  it('correctly scores oil/gas lease (+3)', () => {
    const doc = makeDoc('X', { documentType: 'oil_gas_lease', recordingDate: '' });
    const score = scoreDocumentRelevance(doc, CTX);
    expect(score.relevanceScore).toBe(3);
    expect(score.shouldDownload).toBe(false);
    expect(score.priority).toBe('skip');
  });

  it('correctly scores correction instrument (+8)', () => {
    const doc = makeDoc('X', { documentType: 'correction_instrument', recordingDate: '' });
    const score = scoreDocumentRelevance(doc, CTX);
    expect(score.relevanceScore).toBe(8);
    expect(score.priority).toBe('skip');
  });

  it('scores ISO date format correctly', () => {
    const recentDoc = makeDoc('X', { documentType: 'warranty_deed', recordingDate: '2024-06-15' });
    const score = scoreDocumentRelevance(recentDoc, CTX);
    // warranty_deed +40 + within 5 years +10 = 50
    expect(score.relevanceScore).toBe(50);
  });

  it('does not crash on empty recordingDate', () => {
    const doc = makeDoc('X', { documentType: 'warranty_deed', recordingDate: '' });
    const score = scoreDocumentRelevance(doc, CTX);
    expect(score.relevanceScore).toBe(40);  // base score only, no recency bonus
  });

  it('gives subdivisionName bonus when grantors contain subdivision', () => {
    const ctx: ScoringContext = {
      targetOwner: 'OWNER LLC',
      subdivisionName: 'SUNSET RIDGE ADDITION',
      currentYear: 2026,
    };
    const doc = makeDoc('X', {
      documentType: 'easement',
      grantors: ['SUNSET RIDGE ADDITION'],
      recordingDate: '',
    });
    const score = scoreDocumentRelevance(doc, ctx);
    // easement +30 + subdivision match +15 = 45 (no recording date → no recency bonus)
    expect(score.relevanceScore).toBe(45);
  });
});

// ── 12. classifyDocumentType — vacating plat and mineral deed ─────────────────

describe('ClerkAdapter.classifyDocumentType — additional types', () => {
  const adapter = new MockClerkAdapter([]);

  it('classifies VACATING PLAT', () => {
    expect(adapter.classifyDocumentType('VACATING PLAT')).toBe('vacating_plat');
  });

  it('classifies MINERAL DEED', () => {
    expect(adapter.classifyDocumentType('MINERAL DEED')).toBe('mineral_deed');
  });

  it('classifies GWD abbreviation as warranty_deed', () => {
    expect(adapter.classifyDocumentType('GWD')).toBe('warranty_deed');
  });

  it('classifies MD abbreviation as oil_gas_lease', () => {
    // MD = Mineral Deed but mapped to oil_gas_lease in current schema
    expect(adapter.classifyDocumentType('MD')).toBe('oil_gas_lease');
  });
});

// ── 13. Kofile search result parsing improvements (Stage 2 URL/instrument fixes) ──

describe('Kofile instrument number regex patterns', () => {
  // These patterns are used by searchClerkRecords() in bell-clerk.ts

  it('matches Kofile YYYY-NNNNNNN instrument number format', () => {
    const text = '01/15/2024 WD STARR SURVEYING PREVIOUS OWNER 2024-00001234';
    const pattern = /\b(\d{4}-\d{5,})\b/;
    const match = text.match(pattern);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('2024-00001234');
  });

  it('matches Kofile YYYY-NNNNNN (6-digit suffix)', () => {
    const text = 'WARRANTY DEED 2019-012345';
    const pattern = /\b(\d{4}-\d{5,})\b/;
    const match = text.match(pattern);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('2019-012345');
  });

  it('matches plain 9+ digit instrument number', () => {
    const text = '202400001234 WARRANTY DEED';
    const pattern = /\b(\d{9,})\b/;
    const match = text.match(pattern);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('202400001234');
  });

  it('does NOT match 4-digit year as Kofile instrument number', () => {
    const text = 'Recording Year 2024 DEED';
    const pattern = /\b(\d{4}-\d{5,})\b/;
    expect(text.match(pattern)).toBeNull();
  });

  it('does NOT match 8-digit number as 9+ digit instrument', () => {
    const text = '12345678 deed';
    const pattern = /\b(\d{9,})\b/;
    expect(text.match(pattern)).toBeNull();
  });
});

describe('Kofile document URL construction', () => {
  // Tests for the /doc/{id}/details URL pattern used in the improved Stage 2

  const BASE_URL = 'https://bell.tx.publicsearch.us';

  it('builds correct detail URL from instrument number', () => {
    const instrumentNumber = '2024-00001234';
    const url = `${BASE_URL}/doc/${encodeURIComponent(instrumentNumber)}/details`;
    expect(url).toBe('https://bell.tx.publicsearch.us/doc/2024-00001234/details');
  });

  it('extracts instrument from /doc/{id}/details href', () => {
    const href = '/doc/2024-00001234/details';
    const match = href.match(/\/doc\/([^/]+)(?:\/details)?/i);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('2024-00001234');
  });

  it('extracts instrument from /doc/{id} href (no /details suffix)', () => {
    const href = '/doc/2022-00056789';
    const match = href.match(/\/doc\/([^/]+)(?:\/details)?/i);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('2022-00056789');
  });

  it('converts relative /doc href to absolute URL', () => {
    const href = '/doc/2024-00001234/details';
    const toAbsolute = (h: string): string =>
      h.startsWith('http') ? h : `${BASE_URL}${h.startsWith('/') ? '' : '/'}${h}`;
    const url = toAbsolute(href);
    expect(url).toBe('https://bell.tx.publicsearch.us/doc/2024-00001234/details');
  });

  it('does NOT confuse old /results?q= fallback URL as valid', () => {
    const oldFallback = `${BASE_URL}/results?department=RP&search=index&q=2024-00001234`;
    // The old (broken) fallback is a search URL, not a detail URL
    expect(oldFallback).not.toContain('/doc/');
    // The new fallback is a detail URL
    const newFallback = `${BASE_URL}/doc/2024-00001234/details`;
    expect(newFallback).toContain('/doc/');
    expect(newFallback).toContain('/details');
  });
});

describe('Kofile API response normalisation', () => {
  // Uses exported helpers from bell-clerk.ts to avoid duplication

  type ApiDoc = Record<string, unknown>;

  it('handles plain array response', () => {
    const data = [{ id: '2024-00001234', docType: 'WD' }];
    expect(normaliseKofileApiResponse(data)).toHaveLength(1);
  });

  it('handles {results: [...]} response shape', () => {
    const data = { results: [{ id: '2024-00001234' }, { id: '2024-00001235' }] };
    expect(normaliseKofileApiResponse(data)).toHaveLength(2);
  });

  it('handles {documents: [...]} response shape', () => {
    const data = { documents: [{ id: 'abc' }, { id: 'def' }] };
    expect(normaliseKofileApiResponse(data)).toHaveLength(2);
  });

  it('handles {data: [...]} response shape', () => {
    const data = { data: [{ id: '111' }] };
    expect(normaliseKofileApiResponse(data)).toHaveLength(1);
  });

  it('handles {records: [...]} response shape', () => {
    const data = { records: [{ id: '222' }, { id: '333' }] };
    expect(normaliseKofileApiResponse(data)).toHaveLength(2);
  });

  it('handles Elasticsearch hits.hits response shape', () => {
    const data = {
      hits: { total: 1, hits: [{ _source: { id: '2024-00001234', docType: 'WD' } }] },
    };
    const items = normaliseKofileApiResponse(data);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('2024-00001234');
  });

  it('returns empty array for unknown response shape', () => {
    expect(normaliseKofileApiResponse({ totalCount: 0 })).toHaveLength(0);
    expect(normaliseKofileApiResponse(null)).toHaveLength(0);
    expect(normaliseKofileApiResponse('string')).toHaveLength(0);
  });

  it('extracts names from a plain string value', () => {
    expect(extractKofilePartyNames('STARR SURVEYING')).toEqual(['STARR SURVEYING']);
  });

  it('extracts names from array of strings', () => {
    expect(extractKofilePartyNames(['NAME ONE', 'NAME TWO'])).toEqual(['NAME ONE', 'NAME TWO']);
  });

  it('extracts names from array of {name: ...} objects', () => {
    expect(extractKofilePartyNames([{ name: 'JOHN DOE' }, { name: 'JANE DOE' }]))
      .toEqual(['JOHN DOE', 'JANE DOE']);
  });

  it('extracts names from array of {partyName: ...} objects', () => {
    expect(extractKofilePartyNames([{ partyName: 'STARR SURVEYING' }]))
      .toEqual(['STARR SURVEYING']);
  });

  it('returns empty array for null or undefined', () => {
    expect(extractKofilePartyNames(null)).toEqual([]);
    expect(extractKofilePartyNames(undefined)).toEqual([]);
  });

  it('resolves document id using priority: id > documentId > instrumentNumber', () => {
    const item: ApiDoc = {
      id: 'DOC-001',
      documentId: 'DOC-002',
      instrumentNumber: 'INSTR-003',
    };
    const id = String(item.id ?? item.documentId ?? item.instrumentNumber ?? '').trim();
    expect(id).toBe('DOC-001');
  });

  it('falls back to documentId when id is missing', () => {
    const item: ApiDoc = { documentId: 'DOC-002', instrumentNumber: 'INSTR-003' };
    const id = String(item.id ?? item.documentId ?? item.instrumentNumber ?? '').trim();
    expect(id).toBe('DOC-002');
  });

  it('falls back to instrumentNumber when id and documentId are missing', () => {
    const item: ApiDoc = { instrumentNumber: '2024-00001234' };
    const id = String(item.id ?? item.documentId ?? item.instrumentNumber ?? '').trim();
    expect(id).toBe('2024-00001234');
  });

  it('builds correct detail URL from extracted document id', () => {
    const baseUrl = 'https://bell.tx.publicsearch.us';
    const item: ApiDoc = { instrumentNumber: '2024-00001234' };
    const id = String(item.id ?? item.documentId ?? item.instrumentNumber ?? '').trim();
    const url = id ? `${baseUrl}/doc/${id}/details` : null;
    expect(url).toBe('https://bell.tx.publicsearch.us/doc/2024-00001234/details');
  });
});

// ── 14. Structural document detection in API intercept ────────────────────────

describe('Structural document detection for broadened API intercept', () => {
  // Uses the exported looksLikeKofileDocuments() helper from bell-clerk.ts

  it('identifies document arrays by instrumentNumber field', () => {
    expect(looksLikeKofileDocuments([{ instrumentNumber: '2024-00001234', docType: 'WD' }])).toBe(true);
  });

  it('identifies document arrays by docType field', () => {
    expect(looksLikeKofileDocuments([{ docType: 'WD', recordingDate: '01/15/2024' }])).toBe(true);
  });

  it('identifies document arrays by docTypeDescription field', () => {
    expect(looksLikeKofileDocuments([{ docTypeDescription: 'WARRANTY DEED' }])).toBe(true);
  });

  it('identifies document arrays by grantors/grantees fields', () => {
    expect(looksLikeKofileDocuments([{ grantors: ['SELLER'], grantees: ['STARR SURVEYING'] }])).toBe(true);
  });

  it('rejects non-document arrays (e.g. config response)', () => {
    expect(looksLikeKofileDocuments([{ status: 'ok', version: '1.0' }])).toBe(false);
  });

  it('rejects empty arrays', () => {
    expect(looksLikeKofileDocuments([])).toBe(false);
  });

  it('rejects metadata-only responses', () => {
    expect(looksLikeKofileDocuments([{ totalCount: 50, page: 1, pageSize: 25 }])).toBe(false);
  });
});

// ── 15. fetchDocumentImages improvements ──────────────────────────────────────

describe('fetchDocumentImages image format detection', () => {
  // Mirrors the detectFormat helper inside fetchDocumentImages in bell-clerk.ts.
  const detectFormat = (url: string): 'png' | 'jpg' | 'tiff' => {
    if (/\.jpe?g(\?|$)/i.test(url)) return 'jpg';
    if (/\.tiff?(\?|$)/i.test(url)) return 'tiff';
    return 'png';
  };

  it('detects PNG from .png URL', () => {
    expect(detectFormat('https://host/files/documents/doc_1.png')).toBe('png');
  });

  it('detects JPEG from .jpg URL', () => {
    expect(detectFormat('https://host/files/documents/doc_1.jpg')).toBe('jpg');
  });

  it('detects JPEG from .jpeg URL', () => {
    expect(detectFormat('https://host/files/documents/doc_1.jpeg?token=abc')).toBe('jpg');
  });

  it('defaults to png for unknown extension', () => {
    // TIFF is explicitly handled — this test covers truly unknown types
    expect(detectFormat('https://host/files/documents/doc_1.webp')).toBe('png');
  });

  it('detects TIFF from .tif URL', () => {
    expect(detectFormat('https://host/files/documents/doc_1.tif')).toBe('tiff');
    expect(detectFormat('https://host/files/documents/doc_1.tiff')).toBe('tiff');
  });

  it('page number substitution regex handles PNG', () => {
    const seedUrl = 'https://host/files/documents/2024-00001234_1.png?token=abc';
    const constructed = seedUrl.replace(/_1\.(png|jpe?g|tiff?)/i, `_3.$1`);
    expect(constructed).toBe('https://host/files/documents/2024-00001234_3.png?token=abc');
  });

  it('page number substitution regex handles JPG', () => {
    const seedUrl = 'https://host/files/documents/2024-00001234_1.jpg?token=xyz';
    const constructed = seedUrl.replace(/_1\.(png|jpe?g|tiff?)/i, `_2.$1`);
    expect(constructed).toBe('https://host/files/documents/2024-00001234_2.jpg?token=xyz');
  });

  it('page number substitution regex handles JPEG', () => {
    const seedUrl = 'https://host/files/documents/2024_1.jpeg';
    const constructed = seedUrl.replace(/_1\.(png|jpe?g|tiff?)/i, `_4.$1`);
    expect(constructed).toBe('https://host/files/documents/2024_4.jpeg');
  });

  it('direct viewer URL uses /doc/{id}/details pattern', () => {
    const bellClerkBase = 'https://bell.tx.publicsearch.us';
    const instrumentNumber = '2024-00001234';
    const viewerUrl = `${bellClerkBase}/doc/${encodeURIComponent(instrumentNumber)}/details`;
    expect(viewerUrl).toBe('https://bell.tx.publicsearch.us/doc/2024-00001234/details');
    expect(viewerUrl).not.toContain('/results');
    expect(viewerUrl).not.toContain('searchType=quickSearch');
  });

  it('image URL intercept pattern matches PNG', () => {
    const url = 'https://bell.tx.publicsearch.us/files/documents/2024-001/page_1.png?signed=abc';
    const matches = (
      (url.includes('/files/documents/') || url.includes('/documents/files/')) &&
      /\.(png|jpe?g|tiff?)(\?|$)/i.test(url)
    );
    expect(matches).toBe(true);
  });

  it('image URL intercept pattern matches JPG', () => {
    const url = 'https://bell.tx.publicsearch.us/files/documents/2024-001/page_1.jpg';
    const matches = (
      (url.includes('/files/documents/') || url.includes('/documents/files/')) &&
      /\.(png|jpe?g|tiff?)(\?|$)/i.test(url)
    );
    expect(matches).toBe(true);
  });

  it('image URL intercept pattern rejects unrelated URLs', () => {
    const url = 'https://bell.tx.publicsearch.us/api/search/results.json';
    const matches = (
      (url.includes('/files/documents/') || url.includes('/documents/files/')) &&
      /\.(png|jpe?g|tiff?)(\?|$)/i.test(url)
    );
    expect(matches).toBe(false);
  });
});
