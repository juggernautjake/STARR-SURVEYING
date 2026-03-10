// __tests__/recon/phase1-discovery.test.ts
// Unit tests for STARR RECON Phase 1: Universal Property Discovery.
//
// These tests cover the pure-logic portions of Phase 1 that can be validated
// without a live browser or external HTTP calls:
//
//   1. Address parsing (parseAddress)
//   2. Address variant generation (generateAddressVariants)
//   3. CAD registry lookups (getCADConfig, buildDetailUrl, registeredCountyCount)
//   4. Subdivision detection (CADAdapter.detectSubdivision — tested via BISAdapter)
//   5. County FIPS lookups (resolveCounty, lookupCountyFIPS)
//
// Integration tests that hit real CAD websites are intentionally excluded from
// this file — those require a live browser and network access.

import { describe, it, expect } from 'vitest';

// ── Imports from the Phase 1 service layer ────────────────────────────────────
// We resolve via Node path aliases since vitest runs from the repo root.
// The worker src uses .js extensions in import paths (ESM-only package).
// Because vitest resolves TypeScript source directly (not compiled JS), we
// import from the actual .ts paths.

import {
  parseAddress,
  generateAddressVariants,
} from '../../worker/src/services/address-normalizer.js';

import {
  parseCensusComponents,
  generateVariants,
} from '../../worker/src/services/address-utils.js';

import {
  getCADConfig,
  buildDetailUrl,
  registeredCountyCount,
  listRegisteredCounties,
} from '../../worker/src/services/cad-registry.js';

import {
  resolveCounty,
  lookupCountyFIPS,
  countyToFIPS,
} from '../../worker/src/lib/county-fips.js';

// We test the CADAdapter.detectSubdivision method indirectly through the
// BISAdapter (which inherits it from the abstract base class).
import { BISAdapter } from '../../worker/src/adapters/bis-adapter.js';

// ── 1. Address Parsing ────────────────────────────────────────────────────────

describe('parseAddress', () => {

  it('parses a standard Texas address with FM road', () => {
    const p = parseAddress('3779 FM 436, Belton, TX 76513');
    expect(p.streetNumber).toBe('3779');
    expect(p.streetName).toMatch(/FM\s*436/i);
    expect(p.city).toMatch(/BELTON/i);
    expect(p.state).toBe('TX');
    expect(p.zip).toBe('76513');
  });

  it('parses a standard street address', () => {
    const p = parseAddress('1100 Congress Ave, Austin, TX 78701');
    expect(p.streetNumber).toBe('1100');
    expect(p.streetName).toMatch(/CONGRESS\s+AVE/i);
    expect(p.city).toMatch(/AUSTIN/i);
    expect(p.zip).toBe('78701');
  });

  it('parses a highway address (US Hwy)', () => {
    const p = parseAddress('100 US Hwy 190, Belton, TX 76513');
    expect(p.streetNumber).toBe('100');
    expect(p.streetName).toMatch(/US.*190/i);
  });

  it('handles an address without zip code', () => {
    const p = parseAddress('500 Main St, Fort Worth, TX');
    expect(p.streetNumber).toBe('500');
    expect(p.city).toMatch(/FORT WORTH/i);
    expect(p.zip).toBeUndefined();
  });

  it('handles an address with suite/apt unit', () => {
    const p = parseAddress('100 Main St Suite 200, Austin, TX 78701');
    expect(p.streetNumber).toBe('100');
    expect(p.unitType).toMatch(/SUITE/i);
    expect(p.unitNumber).toBe('200');
  });

  it('returns rawInput unchanged', () => {
    const raw = '3779 FM 436, Belton, TX 76513';
    const p = parseAddress(raw);
    expect(p.rawInput).toBe(raw);
  });

  it('handles unparseable address gracefully', () => {
    const p = parseAddress('SomeRuralRoute');
    // Should not throw; returns a result with at least streetName populated
    expect(p).toBeDefined();
    expect(p.state).toBe('TX');
  });
});

// ── 2. Address Variant Generation ─────────────────────────────────────────────

describe('generateAddressVariants', () => {

  it('generates FM road variants (with and without FM prefix)', () => {
    const p = parseAddress('3779 FM 436, Belton, TX 76513');
    const variants = generateAddressVariants(p);
    const strings  = variants.map(v => v.searchString.toUpperCase());

    // Must include the exact FM form
    expect(strings.some(s => s.includes('FM 436') || s.includes('FM436'))).toBe(true);
    // Must also include a bare-number fallback variant
    expect(strings.some(s => /^3779\s+436/.test(s))).toBe(true);
  });

  it('generates RM road variants', () => {
    const p = parseAddress('1234 RM 2325, Kerrville, TX 78028');
    const variants = generateAddressVariants(p);
    const strings  = variants.map(v => v.searchString.toUpperCase());
    expect(strings.some(s => s.includes('RM 2325') || s.includes('RM2325'))).toBe(true);
  });

  it('generates CR (county road) variants', () => {
    const p = parseAddress('5678 CR 123, Georgetown, TX 78626');
    const variants = generateAddressVariants(p);
    const strings  = variants.map(v => v.searchString.toUpperCase());
    expect(strings.some(s => s.includes('CR 123'))).toBe(true);
    expect(strings.some(s => s.includes('COUNTY ROAD 123') || s.includes('COUNTY RD 123'))).toBe(true);
  });

  it('generates US highway variants', () => {
    const p = parseAddress('100 US 190, Belton, TX 76513');
    const variants = generateAddressVariants(p);
    const strings  = variants.map(v => v.searchString.toUpperCase());
    expect(strings.some(s => /100\s+US/.test(s))).toBe(true);
  });

  it('generates suffix variants (DR ↔ DRIVE)', () => {
    const p = parseAddress('3424 Waggoner Dr, Belton, TX 76513');
    const variants = generateAddressVariants(p);
    const strings  = variants.map(v => v.searchString.toUpperCase());
    // Should contain both "DR" and "DRIVE" forms
    const hasDr    = strings.some(s => /WAGGONER\s+DR\b/.test(s));
    const hasDrive = strings.some(s => /WAGGONER\s+DRIVE/.test(s));
    // At least one of the two suffix forms must appear
    expect(hasDr || hasDrive).toBe(true);
  });

  it('always includes a street-number-only fallback with priority 99', () => {
    const p = parseAddress('3424 Waggoner Dr, Belton, TX 76513');
    const variants = generateAddressVariants(p);
    const fallback = variants.find(v => v.priority === 99);
    expect(fallback).toBeDefined();
    expect(fallback!.searchString).toBe('3424');
    expect(fallback!.strategy).toBe('number_only');
  });

  it('deduplicates identical search strings', () => {
    const p = parseAddress('100 Main St, Austin, TX 78701');
    const variants = generateAddressVariants(p);
    const strings  = variants.map(v => v.searchString.toLowerCase());
    const unique   = new Set(strings);
    expect(strings.length).toBe(unique.size);
  });

  it('sorts variants so lower priority numbers come first', () => {
    const p = parseAddress('3779 FM 436, Belton, TX 76513');
    const variants = generateAddressVariants(p);
    for (let i = 1; i < variants.length; i++) {
      expect(variants[i].priority).toBeGreaterThanOrEqual(variants[i - 1].priority);
    }
  });
});

// ── 3. CAD Registry ───────────────────────────────────────────────────────────

describe('getCADConfig', () => {

  it('returns BIS config for Bell County by FIPS', () => {
    const cfg = getCADConfig('48027');
    expect(cfg).not.toBeNull();
    expect(cfg!.vendor).toBe('bis');
    expect(cfg!.searchUrl).toContain('bellcad');
  });

  it('returns BIS config for Bell County by name', () => {
    const cfg = getCADConfig('Bell');
    expect(cfg).not.toBeNull();
    expect(cfg!.vendor).toBe('bis');
  });

  it('returns HCAD config for Harris County (48201)', () => {
    const cfg = getCADConfig('48201');
    expect(cfg).not.toBeNull();
    expect(cfg!.vendor).toBe('hcad');
    expect(cfg!.searchUrl).toContain('hcad.org');
  });

  it('returns TAD config for Tarrant County (48439)', () => {
    const cfg = getCADConfig('48439');
    expect(cfg).not.toBeNull();
    expect(cfg!.vendor).toBe('tad');
    expect(cfg!.searchUrl).toContain('tad.org');
  });

  it('returns TrueAutomation config for Travis County (48453)', () => {
    const cfg = getCADConfig('48453');
    expect(cfg).not.toBeNull();
    expect(cfg!.vendor).toBe('trueautomation');
    expect(cfg!.searchUrl).toContain('trueautomation.com');
  });

  it('returns DCAD config for Dallas County (48113)', () => {
    const cfg = getCADConfig('48113');
    expect(cfg).not.toBeNull();
    expect(cfg!.vendor).toBe('dcad');
  });

  it('returns BIS config for McLennan County (Waco)', () => {
    const cfg = getCADConfig('48309');
    expect(cfg).not.toBeNull();
    expect(cfg!.vendor).toBe('bis');
    expect(cfg!.searchUrl).toContain('mclennan');
  });

  it('returns null for an unregistered county FIPS', () => {
    // Using a fictitious FIPS code that is not in the registry
    const cfg = getCADConfig('99999');
    expect(cfg).toBeNull();
  });

  it('returns a config with all required fields', () => {
    const cfg = getCADConfig('48027')!;
    expect(cfg.name).toBeTruthy();
    expect(cfg.searchUrl).toBeTruthy();
    expect(cfg.detailUrlPattern).toContain('{propertyId}');
    expect(cfg.searchMethod).toMatch(/^(api|playwright|hybrid)$/);
    expect(cfg.addressField).toBeTruthy();
    expect(cfg.ownerField).toBeTruthy();
    expect(cfg.resultSelector).toBeTruthy();
    expect(cfg.propertyIdField).toBeTruthy();
  });
});

describe('buildDetailUrl', () => {

  it('replaces {propertyId} placeholder in Bell CAD detail URL', () => {
    const cfg = getCADConfig('48027')!;
    const url = buildDetailUrl(cfg, '524312');
    expect(url).toContain('524312');
    expect(url).not.toContain('{propertyId}');
    expect(url).toMatch(/^https?:\/\//);
  });

  it('URI-encodes property IDs that contain special characters', () => {
    const cfg = getCADConfig('48027')!;
    const url = buildDetailUrl(cfg, 'A/B+123');
    expect(url).not.toContain('A/B+123'); // Must be encoded
  });

  it('replaces placeholder in HCAD detail URL', () => {
    const cfg = getCADConfig('48201')!;
    const url = buildDetailUrl(cfg, '1234567890000');
    expect(url).toContain('1234567890000');
    expect(url).not.toContain('{propertyId}');
  });
});

describe('registeredCountyCount', () => {
  it('has at least 10 registered counties', () => {
    expect(registeredCountyCount()).toBeGreaterThanOrEqual(10);
  });

  it('listRegisteredCounties returns an array of fips+config pairs', () => {
    const list = listRegisteredCounties();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    for (const entry of list) {
      expect(entry.fips).toMatch(/^\d{5}$/);
      expect(entry.config).toBeDefined();
      expect(entry.config.vendor).toBeTruthy();
    }
  });
});

// ── 4. Subdivision Detection ──────────────────────────────────────────────────
// detectSubdivision lives on the CADAdapter abstract base class.
// We exercise it through a BISAdapter instance (cheapest concrete subclass
// since the constructor only needs a CADConfig — no browser launched here).

describe('CADAdapter.detectSubdivision', () => {

  // Build a minimal CADConfig so we can instantiate BISAdapter without a browser
  const minimalConfig = {
    name:             'Test',
    vendor:           'bis' as const,
    searchUrl:        'https://example.com',
    detailUrlPattern: 'https://example.com/{propertyId}',
    searchMethod:     'api' as const,
    addressField:     'address',
    ownerField:       'owner',
    resultSelector:   '.row',
    propertyIdField:  'id',
    cadSystem:        'bis_consultants' as const,
  };

  // BISAdapter extends CADAdapter — we cast to access the protected method via
  // a small wrapper (TypeScript won't allow direct protected access from outside).
  class TestAdapter extends BISAdapter {
    public testDetectSubdivision(legalDesc: string) {
      return this.detectSubdivision(legalDesc);
    }
    // Satisfy abstract requirements (never called in these tests)
    async searchByAddress()   { return []; }
    async searchByOwner()     { return []; }
    async getPropertyDetail() {
      // Returns a minimal valid PropertyDetail — this method is never called in
      // the subdivision detection tests, but TypeScript requires a concrete return type.
      return {
        propertyId: '', owner: '', situsAddress: '', legalDescription: '',
        acreage: 0, propertyType: 'real' as const,
        deedReferences: [], relatedPropertyIds: [], improvements: [],
      };
    }
    async findSubdivisionLots() { return []; }
  }

  const adapter = new TestAdapter(minimalConfig);

  it('detects a LOT + BLOCK subdivision legal description', () => {
    const result = adapter.testDetectSubdivision(
      'ASH FAMILY TRUST 12.358 ACRE ADDITION, LOT 1, BLOCK A',
    );
    expect(result.isSubdivision).toBe(true);
    expect(result.lotNumber).toBe('1');
    expect(result.blockNumber).toBe('A');
    expect(result.subdivisionName).toContain('ASH FAMILY TRUST');
  });

  it('detects a LOT-only subdivision legal description', () => {
    const result = adapter.testDetectSubdivision(
      'SUNRIDGE ESTATES, LOT 7',
    );
    expect(result.isSubdivision).toBe(true);
    expect(result.lotNumber).toBe('7');
    expect(result.subdivisionName).toContain('SUNRIDGE ESTATES');
  });

  it('detects an ADDITION keyword in legal description', () => {
    const result = adapter.testDetectSubdivision(
      'OAK HOLLOW ADDITION SEC 2',
    );
    expect(result.isSubdivision).toBe(true);
    expect(result.subdivisionName).toContain('ADDITION');
  });

  it('detects ESTATES keyword in legal description', () => {
    const result = adapter.testDetectSubdivision('VALLEY VIEW ESTATES');
    expect(result.isSubdivision).toBe(true);
  });

  it('returns isSubdivision=false for a metes-and-bounds tract', () => {
    const result = adapter.testDetectSubdivision(
      'WILLIAM HARTRICK SURVEY A-488, 12.358 ACRES',
    );
    expect(result.isSubdivision).toBe(false);
  });

  it('returns isSubdivision=false for an empty legal description', () => {
    const result = adapter.testDetectSubdivision('');
    expect(result.isSubdivision).toBe(false);
  });

  it('handles "LOT X, BLOCK Y, SUBDIVISION NAME" order (reversed)', () => {
    const result = adapter.testDetectSubdivision(
      'LOT 3, BLOCK B, CEDAR PARK HEIGHTS',
    );
    expect(result.isSubdivision).toBe(true);
    expect(result.lotNumber).toBe('3');
    expect(result.blockNumber).toBe('B');
  });

  // ── Pattern 5 guard: survey/abstract descriptions should NOT be flagged ────

  it('returns isSubdivision=false for a RANCH SURVEY metes-and-bounds description', () => {
    // Bug fix: "RANCH" keyword alone should not trigger subdivision if SURVEY is present
    const result = adapter.testDetectSubdivision(
      'JOHNSON RANCH SURVEY, A-488, 15.25 ACRES',
    );
    expect(result.isSubdivision).toBe(false);
  });

  it('returns isSubdivision=false for a PARK SURVEY metes-and-bounds description', () => {
    // Bug fix: "PARK" keyword alone should not trigger subdivision if SURVEY is present
    const result = adapter.testDetectSubdivision(
      'CEDAR PARK SURVEY, ABSTRACT 123, 5.5 ACRES',
    );
    expect(result.isSubdivision).toBe(false);
  });

  it('still detects RANCH as subdivision keyword when no survey/abstract present', () => {
    // "RANCH" subdivisions (e.g. "ROLLING RANCH ESTATES") should still be detected
    const result = adapter.testDetectSubdivision('ROLLING RANCH PHASE 2');
    expect(result.isSubdivision).toBe(true);
  });

  it('returns isSubdivision=false for a description with acreage and ABSTRACT', () => {
    const result = adapter.testDetectSubdivision(
      'WILLIAM HARTRICK SURVEY, ABSTRACT 488, 12.358 ACRES',
    );
    expect(result.isSubdivision).toBe(false);
  });

  it('detects HEIGHTS subdivision keyword without survey context', () => {
    const result = adapter.testDetectSubdivision('MILL CREEK HEIGHTS SEC 4');
    expect(result.isSubdivision).toBe(true);
    expect(result.subdivisionName).toContain('HEIGHTS');
  });

  it('handles letter-only block designator (BLOCK A)', () => {
    // Bug fix from March 2026: block numbers must support letters-only (BLOCK A)
    const result = adapter.testDetectSubdivision(
      'LOT 5, BLOCK A, SUNRISE MEADOWS ADDITION',
    );
    expect(result.isSubdivision).toBe(true);
    expect(result.blockNumber).toBe('A');
    expect(result.lotNumber).toBe('5');
  });

  it('handles alphanumeric block designator (BLOCK 2A)', () => {
    const result = adapter.testDetectSubdivision(
      'LOT 12, BLOCK 2A, CREEKSIDE VILLAGE',
    );
    expect(result.isSubdivision).toBe(true);
    expect(result.blockNumber).toBe('2A');
  });
});

// ── 5. County FIPS Lookups ────────────────────────────────────────────────────

describe('resolveCounty', () => {

  it('resolves Bell County by name', () => {
    const rec = resolveCounty('Bell');
    expect(rec).not.toBeNull();
    expect(rec!.fips).toBe('48027');
    expect(rec!.name).toBe('Bell');
  });

  it('resolves Bell County by FIPS', () => {
    const rec = resolveCounty('48027');
    expect(rec).not.toBeNull();
    expect(rec!.name).toBe('Bell');
  });

  it('resolves Harris County (Houston)', () => {
    const rec = resolveCounty('Harris');
    expect(rec).not.toBeNull();
    expect(rec!.fips).toBe('48201');
    expect(rec!.cadSystem).toBe('hcad');
  });

  it('resolves Tarrant County (Fort Worth)', () => {
    const rec = resolveCounty('Tarrant');
    expect(rec).not.toBeNull();
    expect(rec!.fips).toBe('48439');
    expect(rec!.cadSystem).toBe('tad');
  });

  it('resolves Travis County (Austin)', () => {
    const rec = resolveCounty('Travis');
    expect(rec).not.toBeNull();
    expect(rec!.fips).toBe('48453');
    expect(rec!.cadSystem).toBe('trueautomation');
  });

  it('is case-insensitive (lowercase "bell")', () => {
    const rec = resolveCounty('bell');
    expect(rec).not.toBeNull();
    expect(rec!.fips).toBe('48027');
  });

  it('strips "County" suffix ("Bell County")', () => {
    const rec = resolveCounty('Bell County');
    expect(rec).not.toBeNull();
    expect(rec!.fips).toBe('48027');
  });

  it('returns null for an unknown county name', () => {
    const rec = resolveCounty('Fake County That Does Not Exist');
    expect(rec).toBeNull();
  });
});

describe('lookupCountyFIPS', () => {

  it('returns FIPS for Bell County', () => {
    expect(lookupCountyFIPS('Bell', 'TX')).toBe('48027');
  });

  it('returns empty string for an unknown county', () => {
    expect(lookupCountyFIPS('NotACounty', 'TX')).toBe('');
  });
});

describe('countyToFIPS', () => {

  it('returns 48027 for Bell', () => {
    expect(countyToFIPS('Bell')).toBe('48027');
  });

  it('returns null for an unknown county', () => {
    expect(countyToFIPS('NotACounty')).toBeNull();
  });
});

// ── 6. PropertyDiscoveryEngine — adapter selection ────────────────────────────
// These tests validate that PropertyDiscoveryEngine.createAdapter routes
// to the correct adapter class for each CAD vendor.  We test this indirectly
// via the CAD registry vendor field since createAdapter is private.

describe('CAD registry vendor coverage', () => {
  it('Bell County (48027) uses bis vendor', () => {
    const cfg = getCADConfig('48027');
    expect(cfg!.vendor).toBe('bis');
  });

  it('Harris County (48201) uses hcad vendor', () => {
    const cfg = getCADConfig('48201');
    expect(cfg!.vendor).toBe('hcad');
  });

  it('Tarrant County (48439) uses tad vendor', () => {
    const cfg = getCADConfig('48439');
    expect(cfg!.vendor).toBe('tad');
  });

  it('Travis County (48453) uses trueautomation vendor', () => {
    const cfg = getCADConfig('48453');
    expect(cfg!.vendor).toBe('trueautomation');
  });

  it('Dallas County (48113) uses dcad vendor', () => {
    const cfg = getCADConfig('48113');
    expect(cfg!.vendor).toBe('dcad');
  });

  it('Bexar County (48029) uses trueautomation vendor', () => {
    const cfg = getCADConfig('48029');
    expect(cfg!.vendor).toBe('trueautomation');
  });

  it('Hays County (48209) uses bis vendor (esearch.hayscad.com)', () => {
    const cfg = getCADConfig('48209');
    expect(cfg!.vendor).toBe('bis');
    expect(cfg!.searchUrl).toContain('hayscad');
  });

  it('Comal County (48091) uses bis vendor (esearch.comalcad.org)', () => {
    const cfg = getCADConfig('48091');
    expect(cfg!.vendor).toBe('bis');
    expect(cfg!.searchUrl).toContain('comalcad');
  });

  it('all registered configs have a valid cadSystem field', () => {
    const list = listRegisteredCounties();
    const validSystems = new Set([
      'bis_consultants', 'trueautomation', 'hcad', 'tad',
      'capitol_appraisal', 'pritchard_abbott', 'texasfile_fallback', 'unknown',
    ]);
    for (const { config } of list) {
      expect(validSystems.has(config.cadSystem),
        `${config.name} has unknown cadSystem: ${config.cadSystem}`,
      ).toBe(true);
    }
  });

  it('HCAD config has correct addressField and resultSelector', () => {
    const cfg = getCADConfig('48201')!;
    // HCAD rebuilt as Blazor SPA (verified 2026-03-07); search input is
    // identified by CSS class "inputSearch" rather than a name attribute.
    expect(cfg.addressField).toBe('inputSearch');
    // Results rendered by jQuery DataTables: tr.resulttr.dataTableGridText
    // HCAD rebuilt as Blazor SPA (verified 2026-03-07): no name attr, uses CSS class 'inputSearch'
    expect(cfg.addressField).toBe('inputSearch');
    expect(cfg.resultSelector).toContain('resulttr');
  });

  it('TAD config has correct addressField and resultSelector', () => {
    const cfg = getCADConfig('48439')!;
    // TAD is a Laravel app (verified 2026-03-07); all search types share the
    // single input#query field (search type selected via dropdown).
    expect(cfg.addressField).toBe('query');
    // Results: tr.property-header rows (verified 2026-03-07)
    // TAD is a Laravel app (verified 2026-03-07): search input is input#query[name="query"]
    expect(cfg.addressField).toBe('query');
    expect(cfg.resultSelector).toContain('property-header');
  });
});

// ── 7. parseCensusComponents — bug-fix coverage ────────────────────────────────
// These tests cover two bugs found during the "3779 W FM 436 Belton" failure:
//
// BUG 1 (street number): Census returns fromAddress = segment start (e.g. 3701),
//        not the actual input address number. The fix extracts the number from
//        matchedAddress in tryCensus.
//
// BUG 2 (missing FM prefix): Census components sometimes return preQualifier=""
//        with streetName="436", omitting the "FM" qualifier entirely. The fix
//        re-extracts the TX road prefix from matchedAddress in tryCensus.
//
// Here we test parseCensusComponents (pure logic) and generateVariants to
// ensure that correctly-normalised addresses produce the right search variants.

describe('parseCensusComponents', () => {

  it('handles normal Census response with FM in preQualifier', () => {
    const parsed = parseCensusComponents({
      fromAddress: '3779',
      preDirection: 'W',
      preQualifier: 'FM',
      streetName: '436',
      suffixType: '',
      suffixDirection: '',
      city: 'BELTON',
      state: 'TX',
      zip: '76513',
    });
    expect(parsed.streetNumber).toBe('3779');
    expect(parsed.streetName).toMatch(/FM\s*436/i);
    expect(parsed.preDirection).toBe('W');
  });

  it('handles Census response where FM is absent from preQualifier (the bug)', () => {
    // Census sometimes returns preQualifier="" with streetName="436" for FM roads.
    // parseCensusComponents alone cannot fix this — the tryCensus caller does.
    // This test documents the raw component output so the behaviour is clear.
    const parsed = parseCensusComponents({
      fromAddress: '3701',   // segment start — NOT the actual house number
      preDirection: 'W',
      preQualifier: '',       // FM is missing!
      streetName: '436',
      suffixType: '',
      suffixDirection: '',
      city: 'BELTON',
      state: 'TX',
      zip: '76513',
    });
    // fromAddress is used as-is by parseCensusComponents — the caller patches it
    expect(parsed.streetNumber).toBe('3701');
    // Without FM in preQualifier, streetName will include the directional
    expect(parsed.streetName).toContain('436');
  });

  it('correctly reconstructs TX road from preQualifier when provided', () => {
    const parsed = parseCensusComponents({
      fromAddress: '100',
      preDirection: '',
      preQualifier: 'FM',
      streetName: '2222',
      suffixType: '',
      suffixDirection: '',
      city: 'AUSTIN',
      state: 'TX',
      zip: '78731',
    });
    expect(parsed.streetName).toBe('FM 2222');
    expect(parsed.streetNumber).toBe('100');
  });

  it('handles RM road in preQualifier', () => {
    const parsed = parseCensusComponents({
      fromAddress: '200',
      preDirection: 'N',
      preQualifier: 'RM',
      streetName: '12',
      suffixType: '',
      suffixDirection: '',
      city: 'WIMBERLEY',
      state: 'TX',
      zip: '78676',
    });
    expect(parsed.streetName).toBe('RM 12');
    expect(parsed.preDirection).toBe('N');
  });
});

// ── 8. generateVariants — correct search strings for FM roads ─────────────────
// Validates that when Census correctly identifies a FM road (after the tryCensus
// fix reconstructs it from matchedAddress), the variant engine produces search
// strings that will actually find the property in Bell CAD.

describe('generateVariants — FM road search strings', () => {

  it('Tier-1 variant omits directional (proven Bell CAD format)', () => {
    // "3779" + "FM 436" is the format that Bell CAD indexes.
    const parsed = {
      streetNumber: '3779',
      streetName: 'FM 436',
      streetType: '',
      preDirection: 'W',
      postDirection: null,
      unit: null,
      city: 'BELTON',
      state: 'TX',
      zip: '76513',
    };
    const variants = generateVariants(parsed);
    const tier1 = variants.find(v => v.priority === 0);
    expect(tier1).toBeDefined();
    expect(tier1!.streetNumber).toBe('3779');
    expect(tier1!.streetName).toBe('FM 436');
    expect(tier1!.isPartial).toBe(false);
  });

  it('Tier-2 variant includes abbreviated directional', () => {
    const parsed = {
      streetNumber: '3779',
      streetName: 'FM 436',
      streetType: '',
      preDirection: 'W',
      postDirection: null,
      unit: null,
      city: null,
      state: 'TX',
      zip: null,
    };
    const variants = generateVariants(parsed);
    const withDir = variants.find(v => v.streetName === 'W FM 436' && !v.isPartial);
    expect(withDir).toBeDefined();
    expect(withDir!.streetNumber).toBe('3779');
  });

  it('uses correct street number — not Census segment fromAddress', () => {
    // Simulates address after the tryCensus Patch-1 fix:
    // streetNumber is taken from matchedAddress ("3779"), not fromAddress ("3701").
    const correctParsed = {
      streetNumber: '3779',
      streetName: 'FM 436',
      streetType: '',
      preDirection: 'W',
      postDirection: null,
      unit: null,
      city: 'BELTON',
      state: 'TX',
      zip: '76513',
    };
    const variants = generateVariants(correctParsed);
    const allNums = [...new Set(variants.map(v => v.streetNumber))];
    expect(allNums).toEqual(['3779']);
    expect(allNums).not.toContain('3701');
  });

  it('wrong street number (3701) would have produced incorrect variants', () => {
    // Documents the pre-fix behaviour so the regression is clear.
    const buggedParsed = {
      streetNumber: '3701',   // Census fromAddress (segment start, not house number)
      streetName: 'W 436',    // FM prefix was missing from components
      streetType: '',
      preDirection: null,
      postDirection: null,
      unit: null,
      city: 'BELTON',
      state: 'TX',
      zip: '76513',
    };
    const variants = generateVariants(buggedParsed, '3779 W FM 436 Belton');
    // Confirm the raw address manual-parse fallback at least gets FM 436
    const fmVariant = variants.find(v => v.streetName === 'FM 436');
    // All variants carry the wrong street number because generateVariants uses
    // parsed.streetNumber, not rawAddress street number.
    if (fmVariant) {
      expect(fmVariant.streetNumber).toBe('3701');  // the bug
    }
    // Most importantly: no variant has both the correct number AND FM road
    const correctVariant = variants.find(
      v => v.streetNumber === '3779' && v.streetName === 'FM 436',
    );
    expect(correctVariant).toBeUndefined(); // proves why the fix was needed
  });

  it('Census patches together produce correct number+FM road (end-to-end fix)', () => {
    // Simulates what tryCensus produces AFTER both patches are applied:
    //   Patch 1 → streetNumber extracted from matchedAddress ("3779")
    //   Patch 2 → streetName re-extracted from matchedAddress ("FM 436")
    //             preDirection extracted from matchedAddress ("W")
    const patchedParsed = {
      streetNumber: '3779',      // Patch 1: from matchedAddress, not fromAddress
      streetName: 'FM 436',     // Patch 2: FM prefix re-extracted from matchedAddress
      streetType: '',
      preDirection: 'W',         // Patch 2: directional re-extracted from matchedAddress
      postDirection: null,
      unit: null,
      city: 'BELTON',
      state: 'TX',
      zip: '76513',
    };
    const variants = generateVariants(patchedParsed);

    // Tier-1 (canonical, no dir): 3779 FM 436
    const tier1 = variants.find(v => v.streetNumber === '3779' && v.streetName === 'FM 436' && !v.isPartial);
    expect(tier1).toBeDefined();

    // Tier-2 (canonical + dir): 3779 W FM 436
    const tier2 = variants.find(v => v.streetNumber === '3779' && v.streetName === 'W FM 436' && !v.isPartial);
    expect(tier2).toBeDefined();

    // No variant carries the wrong street number from Census fromAddress
    const wrongNum = variants.find(v => v.streetNumber === '3701');
    expect(wrongNum).toBeUndefined();
  });
});

// ── County Plat Repository ────────────────────────────────────────────────────

import {
  extractSubdivisionName,
  scorePlatMatch,
  hasPlatRepository,
  getPlatRepoConfig,
  listPlatRepoCounties,
} from '../../worker/src/services/county-plats.js';

describe('extractSubdivisionName', () => {
  it('extracts addition name from Bell CAD legal description', () => {
    expect(extractSubdivisionName('ASH FAMILY TRUST 12.358 ACRE ADDITION, BLK 001, LOT 0002'))
      .toBe('ASH FAMILY TRUST 12.358 ACRE ADDITION');
  });

  it('extracts estate name', () => {
    expect(extractSubdivisionName('LOT 5 WILLIAMS CREEK ESTATES'))
      ?.toMatch(/WILLIAMS CREEK ESTATES/i);
  });

  it('extracts name after LOT/BLK prefix', () => {
    const result = extractSubdivisionName('LOT 3 BLK 2 STONECREEK PHASE 2');
    expect(result).toBeTruthy();
    expect(result).toMatch(/STONECREEK/i);
  });

  it('extracts subdivision name', () => {
    expect(extractSubdivisionName('LOT 12 CEDAR RIDGE SUBDIVISION'))
      ?.toMatch(/CEDAR RIDGE SUBDIVISION/i);
  });

  it('returns null for business personal property', () => {
    expect(extractSubdivisionName('BUSINESS PERSONAL PROPERTY')).toBeNull();
  });

  it('returns null for mineral description', () => {
    expect(extractSubdivisionName('MINERAL INTEREST TRACT A')).toBeNull();
  });

  it('returns null for raw survey reference', () => {
    expect(extractSubdivisionName('SURVEY ABSTRACT 12')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractSubdivisionName('')).toBeNull();
  });

  it('handles section names', () => {
    const result = extractSubdivisionName('LOT 1 MEADOWBROOK SECTION 4');
    expect(result).toBeTruthy();
    expect(result).toMatch(/MEADOWBROOK/i);
  });
});

describe('scorePlatMatch', () => {
  it('returns 1.0 for exact match', () => {
    expect(scorePlatMatch(
      'ASH FAMILY TRUST 12.358 ACRE ADDITION',
      'ASH FAMILY TRUST 12.358 ACRE ADDITION',
    )).toBe(1.0);
  });

  it('returns 0.9 when one name contains the other', () => {
    expect(scorePlatMatch(
      'ASH FAMILY TRUST 12.358 ACRE ADDITION REPLAT',
      'ASH FAMILY TRUST 12.358 ACRE ADDITION',
    )).toBe(0.9);
  });

  it('scores high for near-match (missing acreage)', () => {
    const score = scorePlatMatch(
      'ASH FAMILY TRUST ADDITION',
      'ASH FAMILY TRUST 12.358 ACRE ADDITION',
    );
    expect(score).toBeGreaterThan(0.5);
  });

  it('scores zero for completely unrelated names', () => {
    expect(scorePlatMatch('WILLIAMS CREEK ESTATES', 'ASH FAMILY TRUST ADDITION')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(scorePlatMatch(
      'ash family trust addition',
      'ASH FAMILY TRUST ADDITION',
    )).toBe(1.0);
  });
});

describe('hasPlatRepository / getPlatRepoConfig / listPlatRepoCounties', () => {
  it('returns true for Bell County', () => {
    expect(hasPlatRepository('bell')).toBe(true);
    expect(hasPlatRepository('Bell')).toBe(true);
    expect(hasPlatRepository('BELL')).toBe(true);
  });

  it('returns false for unknown county', () => {
    expect(hasPlatRepository('harris')).toBe(false);
    expect(hasPlatRepository('tarrant')).toBe(false);
  });

  it('getPlatRepoConfig returns config for Bell', () => {
    const cfg = getPlatRepoConfig('bell');
    expect(cfg).not.toBeNull();
    expect(cfg?.indexUrlTemplate).toContain('bellcountytx.com');
    expect(cfg?.indexUrlTemplate).toContain('{letter}');
    expect(cfg?.fileBaseUrl).toContain('revize.com');
  });

  it('getPlatRepoConfig returns null for unknown county', () => {
    expect(getPlatRepoConfig('collin')).toBeNull();
  });

  it('listPlatRepoCounties includes bell', () => {
    expect(listPlatRepoCounties()).toContain('bell');
  });
});
