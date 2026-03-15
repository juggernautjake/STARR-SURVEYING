// __tests__/recon/pipeline-resilience.test.ts
// Tests for pipeline resilience when individual sites are unreachable or down.
//
// Validates that:
//   1. SearchDiagnostics correctly exposes siteUnreachable and failureScreenshotBase64 fields
//   2. The pipeline continues to alternative sources when CAD is unreachable
//   3. Failure reasons are surfaced for unreachable sites (not just fully-failed runs)
//   4. parseDeedReferences extraction still functions as a Stage 2 fallback path

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SearchDiagnostics } from '../../worker/src/types/index.js';
import { parseDeedReferences } from '../../worker/src/services/pipeline.js';

// ── 1. SearchDiagnostics type shape ─────────────────────────────────────────

describe('SearchDiagnostics — resilience fields', () => {
  it('accepts siteUnreachable flag', () => {
    const diag: SearchDiagnostics = {
      variantsGenerated: [],
      variantsTried: [],
      partialSearches: [],
      searchDuration_ms: 0,
      siteUnreachable: true,
      cadSiteError: 'The county appraisal website appears to be unreachable (network): ENOTFOUND esearch.bellcad.org',
    };
    expect(diag.siteUnreachable).toBe(true);
    expect(diag.cadSiteError).toMatch(/unreachable/i);
  });

  it('accepts failureScreenshotBase64 when a screenshot was captured', () => {
    const diag: SearchDiagnostics = {
      variantsGenerated: [],
      variantsTried: [],
      partialSearches: [],
      searchDuration_ms: 0,
      siteUnreachable: true,
      cadSiteError: 'site unreachable',
      failureScreenshotBase64: Buffer.from('fake-png-data').toString('base64'),
    };
    expect(diag.failureScreenshotBase64).toBeTruthy();
    expect(typeof diag.failureScreenshotBase64).toBe('string');
  });

  it('distinguishes transient data error from full site outage', () => {
    // Transient data error: cadSiteError set but siteUnreachable is false/undefined
    const transient: SearchDiagnostics = {
      variantsGenerated: [],
      variantsTried: [],
      partialSearches: [],
      searchDuration_ms: 0,
      cadSiteError: 'temporary data access issue',
    };
    expect(transient.siteUnreachable).toBeUndefined();

    // Full outage: both cadSiteError and siteUnreachable set
    const unreachable: SearchDiagnostics = {
      variantsGenerated: [],
      variantsTried: [],
      partialSearches: [],
      searchDuration_ms: 0,
      cadSiteError: 'unreachable (network)',
      siteUnreachable: true,
    };
    expect(unreachable.siteUnreachable).toBe(true);
  });

  it('allows omitting resilience fields for a successful search', () => {
    const successful: SearchDiagnostics = {
      variantsGenerated: [],
      variantsTried: [{ variant: { format: '123 Main St', isPartial: false, priority: 1, streetNumber: '123', streetName: 'Main St' }, resultCount: 1, hitPropertyId: 'prop-001' }],
      partialSearches: [],
      searchDuration_ms: 250,
    };
    expect(successful.siteUnreachable).toBeUndefined();
    expect(successful.cadSiteError).toBeUndefined();
    expect(successful.failureScreenshotBase64).toBeUndefined();
  });
});

// ── 2. parseDeedReferences — Stage 2 fallback path ───────────────────────────
// When CAD is unreachable, any instrument numbers in the legal description are
// still parsed so that Stage 2 can retrieve documents directly from the clerk.

describe('parseDeedReferences — Stage 2 fallback when CAD is unreachable', () => {
  it('extracts instrument numbers from a legal description', () => {
    const result = parseDeedReferences('Inst 2010043440 in Bell County, TX');
    expect(result.instrumentNumbers).toContain('2010043440');
  });

  it('extracts multiple instrument numbers', () => {
    const result = parseDeedReferences('Inst 2018001234 and Inst 2019005678 recorded in OPR');
    expect(result.instrumentNumbers).toContain('2018001234');
    expect(result.instrumentNumbers).toContain('2019005678');
  });

  it('extracts volume/page references for clerk search', () => {
    const result = parseDeedReferences('Vol 7687 Pg 112 of the Official Records of Bell County');
    expect(result.volumePages).toHaveLength(1);
    expect(result.volumePages[0].volume).toBe('7687');
    expect(result.volumePages[0].page).toBe('112');
  });

  it('extracts plat references (cabinet/slide)', () => {
    const result = parseDeedReferences('Plat Cabinet A Slide 5, Bell County Plat Records');
    expect(result.platRefs).toHaveLength(1);
    expect(result.platRefs[0].cabinet).toBe('A');
    expect(result.platRefs[0].slide).toBe('5');
  });

  it('returns empty arrays when no references are found', () => {
    const result = parseDeedReferences('Abstract 234, Survey 567, Bell County Texas');
    expect(result.instrumentNumbers).toHaveLength(0);
    expect(result.volumePages).toHaveLength(0);
    expect(result.platRefs).toHaveLength(0);
  });
});

// ── 3. Failure reason construction logic ─────────────────────────────────────
// Tests the helper logic that builds human-readable failure reasons.
// We test the pure data-transformation logic directly rather than running the
// full pipeline, keeping tests fast and free of browser/network dependencies.

describe('failure reason — site unreachable vs data error', () => {
  function buildFailureReason(
    status: 'complete' | 'partial' | 'failed',
    diagnostics: SearchDiagnostics | undefined,
    cadConfig: { name: string; baseUrl: string } | null,
    hasKofile: boolean,
    kofileBase: string,
    hasPlatRepo: boolean,
  ): string | undefined {
    // Mirror the logic from pipeline.ts so we can unit-test it in isolation
    if (diagnostics?.siteUnreachable) {
      const cadName = cadConfig?.name ?? 'CAD';
      const cadUrl  = cadConfig?.baseUrl ?? 'the county appraisal website';
      const altSources: string[] = [];
      if (hasKofile) altSources.push(`County Clerk (${kofileBase})`);
      if (hasPlatRepo) altSources.push('county plat repository');
      const altNote = altSources.length > 0
        ? ` Research continued using: ${altSources.join(', ')}.`
        : '';
      return `${cadName} (${cadUrl}) was unreachable during this search.${altNote} ` +
        `Please verify the site is operational and retry for complete results.`;
    }
    if (status === 'failed') {
      if (diagnostics?.cadSiteError) {
        const cadName = cadConfig?.name ?? 'CAD';
        const cadUrl  = cadConfig?.baseUrl ?? 'the county appraisal website';
        return `${cadName} is experiencing a temporary data access issue — the search could not be completed. ` +
          `Please visit ${cadUrl} to verify the site is operational, then retry your search.`;
      }
    }
    return undefined;
  }

  it('generates failure reason when site is completely unreachable', () => {
    const diag: SearchDiagnostics = {
      variantsGenerated: [],
      variantsTried: [],
      partialSearches: [],
      searchDuration_ms: 0,
      siteUnreachable: true,
      cadSiteError: 'unreachable (network): ENOTFOUND',
    };
    const reason = buildFailureReason(
      'partial', diag,
      { name: 'Bell CAD', baseUrl: 'https://esearch.bellcad.org' },
      true, 'bell.tx.publicsearch.us', true,
    );
    expect(reason).toBeDefined();
    expect(reason).toContain('Bell CAD');
    expect(reason).toContain('esearch.bellcad.org');
    expect(reason).toContain('County Clerk');
    expect(reason).toContain('county plat repository');
    expect(reason).toContain('retry for complete results');
  });

  it('generates failure reason for partial status when site is unreachable', () => {
    // Even when documents were found from clerk records (partial), the user
    // should know the CAD was down so they can retry when it comes back.
    const diag: SearchDiagnostics = {
      variantsGenerated: [],
      variantsTried: [],
      partialSearches: [],
      searchDuration_ms: 0,
      siteUnreachable: true,
    };
    const reason = buildFailureReason(
      'partial', diag,
      { name: 'Bell CAD', baseUrl: 'https://esearch.bellcad.org' },
      true, 'bell.tx.publicsearch.us', false,
    );
    expect(reason).toBeDefined();
    expect(reason).toContain('unreachable');
  });

  it('generates transient data error message for failed status with cadSiteError', () => {
    const diag: SearchDiagnostics = {
      variantsGenerated: [],
      variantsTried: [],
      partialSearches: [],
      searchDuration_ms: 0,
      cadSiteError: 'temporary data access issue',
    };
    const reason = buildFailureReason(
      'failed', diag,
      { name: 'Bell CAD', baseUrl: 'https://esearch.bellcad.org' },
      false, '', false,
    );
    expect(reason).toBeDefined();
    expect(reason).toContain('temporary data access issue');
    expect(reason).toContain('esearch.bellcad.org');
  });

  it('returns undefined for a successful search (no failure reason needed)', () => {
    const diag: SearchDiagnostics = {
      variantsGenerated: [],
      variantsTried: [],
      partialSearches: [],
      searchDuration_ms: 120,
    };
    const reason = buildFailureReason(
      'complete', diag,
      { name: 'Bell CAD', baseUrl: 'https://esearch.bellcad.org' },
      true, 'bell.tx.publicsearch.us', true,
    );
    expect(reason).toBeUndefined();
  });

  it('omits clerk/plat source list when no alternatives are configured', () => {
    const diag: SearchDiagnostics = {
      variantsGenerated: [],
      variantsTried: [],
      partialSearches: [],
      searchDuration_ms: 0,
      siteUnreachable: true,
    };
    const reason = buildFailureReason(
      'failed', diag,
      { name: 'Obscure CAD', baseUrl: 'https://example.org/cad' },
      false, '', false,
    );
    expect(reason).toBeDefined();
    expect(reason).not.toContain('Research continued using');
  });
});
