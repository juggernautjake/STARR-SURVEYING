// __tests__/recon/phase13-statewide-adapters.test.ts
// Unit tests for STARR RECON Phase 13: Statewide Clerk Adapters &
// Interactive Boundary Viewer.
//
// Phase 13 adds:
//   • Henschen & Associates clerk adapter  (~40 TX counties — Module A)
//   • iDocket clerk adapter                (~20 TX counties — Module B)
//   • Fidlar Technologies clerk adapter    (~15 TX counties — Module C)
//   • Services clerk-registry routing for Henschen / iDocket / Fidlar (Module D)
//   • Pre-existing HCAD/TAD selector fixes (already patched in phase1)
//
// All tests cover pure-logic code that does not require live external APIs,
// Playwright browsers, or a real Supabase/Anthropic connection.
//
// Test index:
//
// ── Module A: Henschen Clerk Adapter ─────────────────────────────────────────
// Henschen config coverage:
//  1.  HENSCHEN_CONFIGS has ≥ 10 entries
//  2.  HENSCHEN_FIPS_SET is derived from HENSCHEN_CONFIGS keys
//  3.  Burnet County (48053) is in HENSCHEN_FIPS_SET
//  4.  Llano County (48299) is in HENSCHEN_FIPS_SET
//  5.  San Saba County (48411) is in HENSCHEN_FIPS_SET
//  6.  Kimble County (48267) is in HENSCHEN_FIPS_SET
//  7.  All HENSCHEN_CONFIGS entries have a non-empty baseUrl
//  8.  All HENSCHEN_CONFIGS entries have a non-empty searchPath
//  9.  createHenschenAdapter returns HenschenClerkAdapter instance
//  10. HenschenClerkAdapter.classifyDocumentType 'WD' → 'warranty_deed'
//  11. HenschenClerkAdapter.classifyDocumentType 'PLT' → 'plat'
//  12. HenschenClerkAdapter.classifyDocumentType 'ESMT' → 'easement'
//  13. HenschenClerkAdapter.classifyDocumentType 'ROW' → 'right_of_way'
//  14. HenschenClerkAdapter.classifyDocumentType unknown → 'other'
//  15. smartSearch with instrument# resolves when adapter returns results
//  16. smartSearch returns empty array when all searches fail
//  17. HenschenClerkAdapter has correct logPrefix format
//  18. HENSCHEN_CONFIGS entries with hasImageAccess = false still have a baseUrl
//  19. Gillespie County (48171) config has hasImageAccess defined
//  20. Randall County (48381) is in HENSCHEN_FIPS_SET
//
// ── Module B: iDocket Clerk Adapter ──────────────────────────────────────────
//  21. IDOCKET_CONFIGS has ≥ 10 entries
//  22. IDOCKET_FIPS_SET is derived from IDOCKET_CONFIGS keys
//  23. Collin County (48085) is in IDOCKET_FIPS_SET
//  24. Denton County (48121) is in IDOCKET_FIPS_SET
//  25. Rockwall County (48397) is in IDOCKET_FIPS_SET
//  26. All IDOCKET_CONFIGS entries have a non-empty baseUrl
//  27. All IDOCKET_CONFIGS entries have a countySlug that appears in baseUrl
//  28. createIDocketAdapter returns IDocketClerkAdapter instance
//  29. IDocketClerkAdapter.classifyDocumentType 'QCD' → 'quitclaim_deed'
//  30. IDocketClerkAdapter.classifyDocumentType 'DOT' → 'deed_of_trust'
//  31. IDocketClerkAdapter.classifyDocumentType 'OGL' → 'oil_gas_lease'
//  32. smartSearch with grantee name resolves even when instrument# empty
//  33. IDOCKET_COUNTY_NAMES maps 48085 → 'Collin'
//  34. IDOCKET_COUNTY_NAMES maps 48121 → 'Denton'
//  35. All IDOCKET_CONFIGS entries have a countyDisplayName
//
// ── Module C: Fidlar Clerk Adapter ────────────────────────────────────────────
//  36. FIDLAR_CONFIGS has ≥ 10 entries
//  37. FIDLAR_FIPS_SET is derived from FIDLAR_CONFIGS keys
//  38. Ward County (48475) is in FIDLAR_FIPS_SET
//  39. Jasper County (48241) is in FIDLAR_FIPS_SET
//  40. All FIDLAR_CONFIGS entries have a valid variant ('laredo'|'direct'|'publicsearch')
//  41. All FIDLAR_CONFIGS entries have a non-empty baseUrl
//  42. All FIDLAR_CONFIGS entries have a non-empty searchPath
//  43. createFidlarAdapter returns FidlarClerkAdapter instance
//  44. FidlarClerkAdapter.classifyDocumentType 'GWD' → 'warranty_deed'
//  45. FidlarClerkAdapter.classifyDocumentType 'SWD' → 'special_warranty_deed'
//  46. FidlarClerkAdapter.classifyDocumentType 'REL' → 'release_of_lien'
//  47. FidlarClerkAdapter.classifyDocumentType 'MD' → 'oil_gas_lease'
//  48. FidlarClerkAdapter.classifyDocumentType 'REPLAT' → 'replat'
//
// ── Module D: Services clerk-registry routing ────────────────────────────────
//  49. Kimble (48267) is a Henschen county but routes to TexasFile — Henschen URLs dead
//  50. Rockwall (48397) is an iDocket county but routes to TexasFile — iDocket URLs 404
//  51. Ward (48475) is a Fidlar county but routes to TexasFile — Fidlar URLs dead
//  52. getClerkSystem returns 'texasfile' for Kimble Co (48267)
//  53. getClerkSystem returns 'texasfile' for Rockwall Co (48397)
//  54. getClerkSystem returns 'texasfile' for Ward Co (48475)
//  54b. no county of an unproven vendor routes to that vendor
//  55. Kofile priority beats iDocket when FIPS appears in both
//  56. registrySummary includes henschen count
//  57. registrySummary includes idocket count
//  58. registrySummary includes fidlar count
//  59. registrySummary.henschen equals HENSCHEN_FIPS_SET.size
//  60. registrySummary.idocket equals IDOCKET_FIPS_SET.size

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Playwright mock (same pattern as phase2-harvest.test.ts) ─────────────────
vi.mock('playwright', () => {
  const mockPage = {
    goto:                vi.fn().mockResolvedValue(undefined),
    waitForLoadState:    vi.fn().mockResolvedValue(undefined),
    waitForSelector:     vi.fn().mockResolvedValue(null),
    waitForResponse:     vi.fn().mockResolvedValue({ json: async () => ({}) }),
    $:                   vi.fn().mockResolvedValue(null),
    $$:                  vi.fn().mockResolvedValue([]),
    $eval:               vi.fn().mockResolvedValue(''),
    $$eval:              vi.fn().mockResolvedValue([]),
    click:               vi.fn().mockResolvedValue(undefined),
    fill:                vi.fn().mockResolvedValue(undefined),
    selectOption:        vi.fn().mockResolvedValue(undefined),
    type:                vi.fn().mockResolvedValue(undefined),
    press:               vi.fn().mockResolvedValue(undefined),
    evaluate:            vi.fn().mockResolvedValue(null),
    screenshot:          vi.fn().mockResolvedValue(Buffer.from('fake-screenshot')),
    close:               vi.fn().mockResolvedValue(undefined),
    waitForTimeout:      vi.fn().mockResolvedValue(undefined),
    setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
    content:             vi.fn().mockResolvedValue('<html><body></body></html>'),
    innerText:           vi.fn().mockResolvedValue(''),
    on:                  vi.fn(),
  };

  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close:   vi.fn().mockResolvedValue(undefined),
  };

  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    newPage:    vi.fn().mockResolvedValue(mockPage),
    close:      vi.fn().mockResolvedValue(undefined),
  };

  return {
    chromium: {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    },
  };
});

// ── fs mock (avoid real disk ops) ─────────────────────────────────────────────
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync:  vi.fn(),
      writeFileSync: vi.fn(),
    },
    existsSync:    vi.fn().mockReturnValue(true),
    mkdirSync:     vi.fn(),
    writeFileSync: vi.fn(),
  };
});

// ── node:https mock (avoid real network) ──────────────────────────────────────
vi.mock('https', () => ({ default: { get: vi.fn() }, get: vi.fn() }));
vi.mock('http',  () => ({ default: { get: vi.fn() }, get: vi.fn() }));

// ── Imports ───────────────────────────────────────────────────────────────────
import {
  HenschenClerkAdapter,
  HENSCHEN_CONFIGS,
  HENSCHEN_FIPS_SET,
  createHenschenAdapter,
} from '../../worker/src/adapters/henschen-clerk-adapter.js';

import {
  IDocketClerkAdapter,
  IDOCKET_CONFIGS,
  IDOCKET_FIPS_SET,
  IDOCKET_COUNTY_NAMES,
  createIDocketAdapter,
} from '../../worker/src/adapters/idocket-clerk-adapter.js';

import {
  FidlarClerkAdapter,
  FIDLAR_CONFIGS,
  FIDLAR_FIPS_SET,
  createFidlarAdapter,
} from '../../worker/src/adapters/fidlar-clerk-adapter.js';

import {
  getClerkAdapter,
  getClerkSystem,
  isVendorProven,
  registrySummary,
} from '../../worker/src/services/clerk-registry.js';

import { TexasFileAdapter } from '../../worker/src/adapters/texasfile-adapter.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal concrete ClerkAdapter for smartSearch tests */
class EmptyAdapter extends HenschenClerkAdapter {
  constructor() { super('48053', 'Burnet'); }
  override async searchByInstrumentNumber()   { return []; }
  override async searchByVolumePage()          { return []; }
  override async searchByGranteeName()         { return []; }
  override async searchByGrantorName()         { return []; }
  override async searchByLegalDescription()    { return []; }
  override async getDocumentImages()           { return []; }
  override async getDocumentPricing()          { return { available: false, source: 'henschen' }; }
  override async initSession()                 { /* no-op */ }
  override async destroySession()              { /* no-op */ }
}

const FAKE_RESULT = {
  instrumentNumber: 'TEST-001',
  documentType:     'warranty_deed' as const,
  recordingDate:    '2020-01-01',
  grantors:         ['Smith, John'],
  grantees:         ['Jones, Jane'],
  source:           'henschen-test',
};

// ── Module A: Henschen Clerk Adapter ─────────────────────────────────────────

describe('Henschen Clerk Adapter — config coverage (henschen-clerk-adapter.ts)', () => {
  it('1. HENSCHEN_CONFIGS has ≥ 10 entries', () => {
    expect(Object.keys(HENSCHEN_CONFIGS).length).toBeGreaterThanOrEqual(10);
  });

  it('2. HENSCHEN_FIPS_SET is derived from HENSCHEN_CONFIGS keys', () => {
    for (const fips of HENSCHEN_FIPS_SET) {
      expect(HENSCHEN_CONFIGS).toHaveProperty(fips);
    }
  });

  it('3. Burnet County (48053) is in HENSCHEN_FIPS_SET', () => {
    expect(HENSCHEN_FIPS_SET.has('48053')).toBe(true);
  });

  it('4. Llano County (48299) is NOT Henschen — its real portal is Kofile PublicSearch', () => {
    // ── INVERTED 2026-08-04 (R39d) ───────────────────────────────────────────────────────────────
    //
    // This asserted Llano was a Henschen county, on the strength of a config entry pointing at
    // `llano.co.texas.us` — a hostname that **does not exist and never did** (R39b measured all 16
    // Henschen hosts as ENOTFOUND).
    //
    // Llano's actual records portal is `llano.tx.publicsearch.us`: it resolves on 35.247.2.99, the
    // same cluster as the proven Bell and Travis portals, and renders the Llano County clerk record
    // search with the field labels the Kofile adapter drives.
    //
    // The entry is removed rather than repointed, and Llano is recorded in
    // `KOFILE_IDENTIFIED_NOT_DRIVEN` — identified, not yet driven, which is the bar that file sets.
    expect(HENSCHEN_FIPS_SET.has('48299')).toBe(false);
  });

  it('5. San Saba County (48411) is in HENSCHEN_FIPS_SET', () => {
    expect(HENSCHEN_FIPS_SET.has('48411')).toBe(true);
  });

  it('6. Kimble County (48267) is in HENSCHEN_FIPS_SET', () => {
    expect(HENSCHEN_FIPS_SET.has('48267')).toBe(true);
  });

  it('7. All HENSCHEN_CONFIGS entries have a non-empty baseUrl', () => {
    for (const [fips, cfg] of Object.entries(HENSCHEN_CONFIGS)) {
      expect(cfg.baseUrl, `FIPS ${fips} missing baseUrl`).toBeTruthy();
      expect(cfg.baseUrl.length, `FIPS ${fips} empty baseUrl`).toBeGreaterThan(5);
    }
  });

  it('8. All HENSCHEN_CONFIGS entries have a non-empty searchPath', () => {
    for (const [fips, cfg] of Object.entries(HENSCHEN_CONFIGS)) {
      expect(cfg.searchPath, `FIPS ${fips} missing searchPath`).toBeTruthy();
    }
  });

  it('9. createHenschenAdapter returns HenschenClerkAdapter instance', () => {
    const adapter = createHenschenAdapter('48053', 'Burnet');
    expect(adapter).toBeInstanceOf(HenschenClerkAdapter);
  });

  it('10. HenschenClerkAdapter.classifyDocumentType "WD" → warranty_deed', () => {
    const adapter = createHenschenAdapter('48053', 'Burnet');
    expect(adapter.classifyDocumentType('WD')).toBe('warranty_deed');
  });

  it('11. HenschenClerkAdapter.classifyDocumentType "PLT" → plat', () => {
    const adapter = createHenschenAdapter('48053', 'Burnet');
    expect(adapter.classifyDocumentType('PLT')).toBe('plat');
  });

  it('12. HenschenClerkAdapter.classifyDocumentType "ESMT" → easement', () => {
    const adapter = createHenschenAdapter('48053', 'Burnet');
    expect(adapter.classifyDocumentType('ESMT')).toBe('easement');
  });

  it('13. HenschenClerkAdapter.classifyDocumentType "ROW" → right_of_way', () => {
    const adapter = createHenschenAdapter('48053', 'Burnet');
    expect(adapter.classifyDocumentType('ROW')).toBe('right_of_way');
  });

  it('14. HenschenClerkAdapter.classifyDocumentType unknown string → other', () => {
    const adapter = createHenschenAdapter('48053', 'Burnet');
    expect(adapter.classifyDocumentType('ZZUNKNO')).toBe('other');
  });

  it('15. smartSearch with instrument# resolves when adapter returns results', async () => {
    class HitAdapter extends HenschenClerkAdapter {
      constructor() { super('48053', 'Burnet'); }
      override async searchByInstrumentNumber() { return [FAKE_RESULT]; }
      override async searchByVolumePage()        { return []; }
      override async searchByGranteeName()       { return []; }
      override async searchByGrantorName()       { return []; }
      override async searchByLegalDescription()  { return []; }
      override async getDocumentImages()         { return []; }
      override async getDocumentPricing()        { return { available: false, source: 'henschen' }; }
      override async initSession()               { /* no-op */ }
      override async destroySession()            { /* no-op */ }
    }
    const adapter = new HitAdapter();
    const results = await adapter.smartSearch({ instrumentNumber: 'TEST-001' });
    expect(results).toHaveLength(1);
    expect(results[0].instrumentNumber).toBe('TEST-001');
  });

  it('16. smartSearch returns empty array when all search strategies fail', async () => {
    const adapter = new EmptyAdapter();
    const results = await adapter.smartSearch({
      granteeName: 'Jones',
      grantorName: 'Smith',
    });
    expect(results).toHaveLength(0);
  });

  it('17. HenschenClerkAdapter has correct countyName set in constructor', () => {
    // Access private field via type cast to verify constructor correctness
    const adapter = createHenschenAdapter('48053', 'Burnet') as any;
    expect(adapter.countyName).toBe('Burnet');
    expect(adapter.countyFIPS).toBe('48053');
  });

  it('18. HENSCHEN_CONFIGS entries with hasImageAccess = false still have a baseUrl', () => {
    const noImageEntries = Object.entries(HENSCHEN_CONFIGS).filter(
      ([, cfg]) => !cfg.hasImageAccess,
    );
    for (const [fips, cfg] of noImageEntries) {
      expect(cfg.baseUrl, `FIPS ${fips} missing baseUrl even though image not available`)
        .toBeTruthy();
    }
  });

  it('19. Gillespie County (48171) is NOT Henschen — its own website links to Kofile', () => {
    // Same inversion as case 4, with stronger evidence: gillespiecounty.gov links to
    // `gillespie.tx.publicsearch.us` as the county's records portal, and the Henschen entry pointed
    // at `records.gillespiecountyclerk.com`, which does not resolve.
    //
    // Worth stating plainly, because it is the shape R38 was written to find: the platform believed
    // it knew where a county's records were and was wrong, while the real portal sat on a vendor it
    // had already proven, at the exact hostname the Kofile adapter derives for an unconfigured
    // county. The wrong answer was not "no coverage" — it was confident coverage of nothing.
    expect(HENSCHEN_CONFIGS['48171']).toBeUndefined();
  });

  it('20. Randall County (48381) is in HENSCHEN_FIPS_SET', () => {
    expect(HENSCHEN_FIPS_SET.has('48381')).toBe(true);
  });
});

// ── Module B: iDocket Clerk Adapter ──────────────────────────────────────────

describe('iDocket Clerk Adapter — config coverage (idocket-clerk-adapter.ts)', () => {
  it('21. IDOCKET_CONFIGS has ≥ 10 entries', () => {
    expect(Object.keys(IDOCKET_CONFIGS).length).toBeGreaterThanOrEqual(10);
  });

  it('22. IDOCKET_FIPS_SET is derived from IDOCKET_CONFIGS keys', () => {
    for (const fips of IDOCKET_FIPS_SET) {
      expect(IDOCKET_CONFIGS).toHaveProperty(fips);
    }
  });

  it('23. Collin County (48085) is in IDOCKET_FIPS_SET', () => {
    expect(IDOCKET_FIPS_SET.has('48085')).toBe(true);
  });

  it('24. Denton County (48121) is in IDOCKET_FIPS_SET', () => {
    expect(IDOCKET_FIPS_SET.has('48121')).toBe(true);
  });

  it('25. Rockwall County (48397) is in IDOCKET_FIPS_SET', () => {
    expect(IDOCKET_FIPS_SET.has('48397')).toBe(true);
  });

  it('26. All IDOCKET_CONFIGS entries have a non-empty baseUrl', () => {
    for (const [fips, cfg] of Object.entries(IDOCKET_CONFIGS)) {
      expect(cfg.baseUrl, `FIPS ${fips} missing baseUrl`).toBeTruthy();
      expect(cfg.baseUrl.startsWith('https://'), `FIPS ${fips} baseUrl should start with https`)
        .toBe(true);
    }
  });

  it('27. All IDOCKET_CONFIGS entries have a countySlug that appears in baseUrl', () => {
    for (const [fips, cfg] of Object.entries(IDOCKET_CONFIGS)) {
      expect(
        cfg.baseUrl.includes(cfg.countySlug),
        `FIPS ${fips}: countySlug "${cfg.countySlug}" not found in baseUrl "${cfg.baseUrl}"`,
      ).toBe(true);
    }
  });

  it('28. createIDocketAdapter returns IDocketClerkAdapter instance', () => {
    const adapter = createIDocketAdapter('48085', 'Collin');
    expect(adapter).toBeInstanceOf(IDocketClerkAdapter);
  });

  it('29. IDocketClerkAdapter.classifyDocumentType "QCD" → quitclaim_deed', () => {
    const adapter = createIDocketAdapter('48085', 'Collin');
    expect(adapter.classifyDocumentType('QCD')).toBe('quitclaim_deed');
  });

  it('30. IDocketClerkAdapter.classifyDocumentType "DOT" → deed_of_trust', () => {
    const adapter = createIDocketAdapter('48085', 'Collin');
    expect(adapter.classifyDocumentType('DOT')).toBe('deed_of_trust');
  });

  it('31. IDocketClerkAdapter.classifyDocumentType "OGL" → oil_gas_lease', () => {
    const adapter = createIDocketAdapter('48085', 'Collin');
    expect(adapter.classifyDocumentType('OGL')).toBe('oil_gas_lease');
  });

  it('32. smartSearch with grantee name resolves even when instrument# empty', async () => {
    class GranteeHitAdapter extends IDocketClerkAdapter {
      constructor() { super('48085', 'Collin'); }
      override async searchByInstrumentNumber() { return []; }
      override async searchByVolumePage()        { return []; }
      override async searchByGranteeName()       { return [FAKE_RESULT]; }
      override async searchByGrantorName()       { return []; }
      override async searchByLegalDescription()  { return []; }
      override async getDocumentImages()         { return []; }
      override async getDocumentPricing()        { return { available: false, source: 'idocket' }; }
      override async initSession()               { /* no-op */ }
      override async destroySession()            { /* no-op */ }
    }
    const adapter = new GranteeHitAdapter();
    const results = await adapter.smartSearch({ granteeName: 'Jones, Jane' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].instrumentNumber).toBe('TEST-001');
  });

  it('33. IDOCKET_COUNTY_NAMES maps 48085 → "Collin"', () => {
    expect(IDOCKET_COUNTY_NAMES['48085']).toBe('Collin');
  });

  it('34. IDOCKET_COUNTY_NAMES maps 48121 → "Denton"', () => {
    expect(IDOCKET_COUNTY_NAMES['48121']).toBe('Denton');
  });

  it('35. All IDOCKET_CONFIGS entries have a countyDisplayName', () => {
    for (const [fips, cfg] of Object.entries(IDOCKET_CONFIGS)) {
      expect(cfg.countyDisplayName, `FIPS ${fips} missing countyDisplayName`).toBeTruthy();
    }
  });
});

// ── Module C: Fidlar Clerk Adapter ────────────────────────────────────────────

describe('Fidlar Technologies Clerk Adapter — config coverage (fidlar-clerk-adapter.ts)', () => {
  it('36. FIDLAR_CONFIGS has ≥ 10 entries', () => {
    expect(Object.keys(FIDLAR_CONFIGS).length).toBeGreaterThanOrEqual(10);
  });

  it('37. FIDLAR_FIPS_SET is derived from FIDLAR_CONFIGS keys', () => {
    for (const fips of FIDLAR_FIPS_SET) {
      expect(FIDLAR_CONFIGS).toHaveProperty(fips);
    }
  });

  it('38. Ward County (48475) is in FIDLAR_FIPS_SET', () => {
    expect(FIDLAR_FIPS_SET.has('48475')).toBe(true);
  });

  it('39. Jasper County (48241) is in FIDLAR_FIPS_SET', () => {
    expect(FIDLAR_FIPS_SET.has('48241')).toBe(true);
  });

  it('40. All FIDLAR_CONFIGS entries have a valid variant', () => {
    const validVariants = new Set(['laredo', 'direct', 'publicsearch']);
    for (const [fips, cfg] of Object.entries(FIDLAR_CONFIGS)) {
      expect(
        validVariants.has(cfg.variant),
        `FIPS ${fips} has invalid variant "${cfg.variant}"`,
      ).toBe(true);
    }
  });

  it('41. All FIDLAR_CONFIGS entries have a non-empty baseUrl', () => {
    for (const [fips, cfg] of Object.entries(FIDLAR_CONFIGS)) {
      expect(cfg.baseUrl, `FIPS ${fips} missing baseUrl`).toBeTruthy();
    }
  });

  it('42. All FIDLAR_CONFIGS entries have a non-empty searchPath', () => {
    for (const [fips, cfg] of Object.entries(FIDLAR_CONFIGS)) {
      expect(cfg.searchPath, `FIPS ${fips} missing searchPath`).toBeTruthy();
    }
  });

  it('43. createFidlarAdapter returns FidlarClerkAdapter instance', () => {
    const adapter = createFidlarAdapter('48475', 'Ward');
    expect(adapter).toBeInstanceOf(FidlarClerkAdapter);
  });

  it('44. FidlarClerkAdapter.classifyDocumentType "GWD" → warranty_deed', () => {
    const adapter = createFidlarAdapter('48475', 'Ward');
    expect(adapter.classifyDocumentType('GWD')).toBe('warranty_deed');
  });

  it('45. FidlarClerkAdapter.classifyDocumentType "SWD" → special_warranty_deed', () => {
    const adapter = createFidlarAdapter('48475', 'Ward');
    expect(adapter.classifyDocumentType('SWD')).toBe('special_warranty_deed');
  });

  it('46. FidlarClerkAdapter.classifyDocumentType "REL" → release_of_lien', () => {
    const adapter = createFidlarAdapter('48475', 'Ward');
    expect(adapter.classifyDocumentType('REL')).toBe('release_of_lien');
  });

  it('47. FidlarClerkAdapter.classifyDocumentType "MD" → oil_gas_lease', () => {
    const adapter = createFidlarAdapter('48475', 'Ward');
    expect(adapter.classifyDocumentType('MD')).toBe('oil_gas_lease');
  });

  it('48. FidlarClerkAdapter.classifyDocumentType "REPLAT" → replat', () => {
    const adapter = createFidlarAdapter('48475', 'Ward');
    expect(adapter.classifyDocumentType('REPLAT')).toBe('replat');
  });
});

// ── Module D: Services clerk-registry routing ────────────────────────────────

describe('Services clerk-registry routing for Phase 13 adapters (services/clerk-registry.ts)', () => {
  // Tests 49–54 used to assert that these counties routed to the Henschen, iDocket and Fidlar
  // adapters. Every base URL of all three vendors was probed on 2026-08-02 and every one is dead —
  // Henschen 16/16 ERR_NAME_NOT_RESOLVED, iDocket 18/18 HTTP 404, Fidlar 6/6 ERR_NAME_NOT_RESOLVED
  // (plan R37/R38). Routing to them produced "no records found", which reads as a statement about
  // the property rather than about our routing, so `isVendorProven` gates them off and the counties
  // fall through to TexasFile, which answers.
  //
  // These tests now pin that gate. They must NOT be "fixed" by marking a vendor proven; a vendor
  // becomes proven by probing its URLs, and then these expectations change with it.

  it('49. Kimble Co (48267) is a Henschen county but routes to TexasFile — Henschen URLs are dead', () => {
    expect(HENSCHEN_FIPS_SET.has('48267')).toBe(true);   // the knowledge is kept…
    expect(isVendorProven('henschen')).toBe(false);      // …but the reachability is not claimed
    expect(getClerkAdapter('48267', 'Kimble')).toBeInstanceOf(TexasFileAdapter);
  });

  it('50. Rockwall Co (48397) is an iDocket county but routes to TexasFile — iDocket URLs 404', () => {
    expect(IDOCKET_FIPS_SET.has('48397')).toBe(true);
    expect(isVendorProven('idocket')).toBe(false);
    expect(getClerkAdapter('48397', 'Rockwall')).toBeInstanceOf(TexasFileAdapter);
  });

  it('51. Ward Co (48475) is a Fidlar county but routes to TexasFile — Fidlar URLs are dead', () => {
    expect(FIDLAR_FIPS_SET.has('48475')).toBe(true);
    expect(isVendorProven('fidlar')).toBe(false);
    expect(getClerkAdapter('48475', 'Ward')).toBeInstanceOf(TexasFileAdapter);
  });

  it('52. getClerkSystem returns "texasfile" for Kimble Co (48267) while Henschen is unproven', () => {
    expect(getClerkSystem('48267')).toBe('texasfile');
  });

  it('53. getClerkSystem returns "texasfile" for Rockwall Co (48397) while iDocket is unproven', () => {
    expect(getClerkSystem('48397')).toBe('texasfile');
  });

  it('54. getClerkSystem returns "texasfile" for Ward Co (48475) while Fidlar is unproven', () => {
    expect(getClerkSystem('48475')).toBe('texasfile');
  });

  it('54b. an unproven vendor never routes, for every county it lists', () => {
    // The gate is a property of the vendor, not of the three counties sampled above. If a future
    // edit flips one FIPS through without probing, this fails.
    for (const fips of [...HENSCHEN_FIPS_SET, ...IDOCKET_FIPS_SET, ...FIDLAR_FIPS_SET]) {
      expect(getClerkSystem(fips)).not.toBe('henschen');
      expect(getClerkSystem(fips)).not.toBe('idocket');
      expect(getClerkSystem(fips)).not.toBe('fidlar');
    }
  });

  it('55. Kofile priority beats Henschen when Lampasas (48283) appears in both FIPS sets', () => {
    // 48283 is Lampasas County.  If it exists in both Kofile and Henschen FIPS
    // sets, the Kofile adapter (higher priority) should be returned.
    // We just verify the returned adapter is NOT an IDocketClerkAdapter, which
    // would indicate wrong routing.
    const adapter = getClerkAdapter('48283', 'Lampasas');
    expect(adapter).not.toBeInstanceOf(IDocketClerkAdapter);
    expect(adapter).not.toBeInstanceOf(FidlarClerkAdapter);
  });

  it('56. registrySummary includes henschen count', () => {
    const summary = registrySummary();
    expect(summary).toHaveProperty('henschen');
    expect(typeof summary.henschen).toBe('number');
  });

  it('57. registrySummary includes idocket count', () => {
    const summary = registrySummary();
    expect(summary).toHaveProperty('idocket');
    expect(typeof summary.idocket).toBe('number');
  });

  it('58. registrySummary includes fidlar count', () => {
    const summary = registrySummary();
    expect(summary).toHaveProperty('fidlar');
    expect(typeof summary.fidlar).toBe('number');
  });

  // ── 59/60 INVERTED 2026-08-04 (research plan R39b) ─────────────────────────────────────────────
  //
  // These pinned `registrySummary.<vendor> === <VENDOR>_FIPS_SET.size` — the exact behaviour that
  // slice found to be wrong in two directions at once. `getClerkSystem` routes to a vendor only when
  // `isVendorProven`, so for an unproven vendor the summary credited counties that route elsewhere
  // AND subtracted them from the TexasFile remainder. Both errors lean the same way: unproven
  // vendors look real and the fallback that actually serves those counties looks smaller.
  //
  // Henschen's sixteen configured hosts are all ENOTFOUND (measured, `check-adapter-hosts.mjs`), so
  // the old assertions were pinning coverage that has never existed.
  //
  // **These failed for a day before being noticed**, because R39b's verification ran the worker
  // suite — where `clerk-registry.ts` lives — and these tests live in the main repo's `__tests__`.
  // A module and its tests on opposite sides of a package boundary is a real gap in "run the tests
  // for what you changed", and the fix is to run both, which the standing rule now says.
  it('59. registrySummary credits henschen with ZERO, because it is unproven and routes nothing', () => {
    const summary = registrySummary();
    expect(summary.henschen).toBe(0);
    // …and the configured list is still there, as the R38/R39 work list rather than as coverage.
    expect(HENSCHEN_FIPS_SET.size).toBeGreaterThan(0);
  });

  it('60. registrySummary credits idocket with ZERO for the same reason', () => {
    const summary = registrySummary();
    expect(summary.idocket).toBe(0);
    expect(IDOCKET_FIPS_SET.size).toBeGreaterThan(0);
  });
});
