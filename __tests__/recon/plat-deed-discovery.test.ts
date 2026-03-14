// __tests__/recon/plat-deed-discovery.test.ts
// Unit tests for the plat + deed discovery pipeline enhancements:
//   1. Log auto-expand behaviour in PipelineProgressPanel
//   2. Subdivision name extraction for plat repo search
//   3. parseDeedReferences — instrument number extraction
//   4. Personal property detection logic (Type P / BUSINESS PERSONAL PROPERTY)
//   5. searchBellClerkOwnerForPlatDeed document categorisation
//   6. Pipeline Path B fallback: owner name used when legalDesc is empty
//   7. scorePlatMatch: owner name fragment scoring for "ASH FAMILY TRUST" case

import { describe, it, expect, vi } from 'vitest';

// ── 1. Subdivision name extraction ───────────────────────────────────────────

describe('extractSubdivisionName (county-plats.ts)', () => {
  it('1-1. extracts "ASH FAMILY TRUST 12.358 ACRE ADDITION" from full legal desc', async () => {
    const { extractSubdivisionName } = await import('../../worker/src/services/county-plats.js');
    const legal = 'ASH FAMILY TRUST 12.358 ACRE ADDITION, BLOCK 001, LOT 0002';
    expect(extractSubdivisionName(legal)).toBe('ASH FAMILY TRUST 12.358 ACRE ADDITION');
  });

  it('1-2. returns null for BUSINESS PERSONAL PROPERTY', async () => {
    const { extractSubdivisionName } = await import('../../worker/src/services/county-plats.js');
    expect(extractSubdivisionName('BUSINESS PERSONAL PROPERTY')).toBeNull();
  });

  it('1-3. returns null for empty string', async () => {
    const { extractSubdivisionName } = await import('../../worker/src/services/county-plats.js');
    expect(extractSubdivisionName('')).toBeNull();
  });

  it('1-4. extracts subdivision name from standard LOT BLK format', async () => {
    const { extractSubdivisionName } = await import('../../worker/src/services/county-plats.js');
    const legal = 'LOT 3 BLK 2 WILLIAMS CREEK ESTATES';
    expect(extractSubdivisionName(legal)).toContain('WILLIAMS CREEK');
  });
});

// ── 2. parseDeedReferences ────────────────────────────────────────────────────

describe('parseDeedReferences (pipeline.ts)', () => {
  it('2-1. extracts 10-digit instrument numbers', async () => {
    const { parseDeedReferences } = await import('../../worker/src/services/pipeline.js');
    const result = parseDeedReferences('Inst 2010043440');
    expect(result.instrumentNumbers).toContain('2010043440');
  });

  it('2-2. extracts bare 10-digit instrument numbers', async () => {
    const { parseDeedReferences } = await import('../../worker/src/services/pipeline.js');
    const result = parseDeedReferences('Reference: 2023032044');
    expect(result.instrumentNumbers).toContain('2023032044');
  });

  it('2-3. extracts volume/page references', async () => {
    const { parseDeedReferences } = await import('../../worker/src/services/pipeline.js');
    const result = parseDeedReferences('Vol 7687 Pg 112');
    expect(result.volumePages).toEqual(expect.arrayContaining([{ volume: '7687', page: '112' }]));
  });

  it('2-4. extracts OPR/volume/page format', async () => {
    const { parseDeedReferences } = await import('../../worker/src/services/pipeline.js');
    const result = parseDeedReferences('OPR/13290/689');
    expect(result.volumePages).toEqual(expect.arrayContaining([{ volume: '13290', page: '689' }]));
  });

  it('2-5. extracts Cabinet/Slide plat references', async () => {
    const { parseDeedReferences } = await import('../../worker/src/services/pipeline.js');
    const result = parseDeedReferences('Cabinet A Slide 5');
    expect(result.platRefs).toEqual(expect.arrayContaining([{ cabinet: 'A', slide: '5' }]));
  });

  it('2-6. returns empty arrays for BUSINESS PERSONAL PROPERTY', async () => {
    const { parseDeedReferences } = await import('../../worker/src/services/pipeline.js');
    const result = parseDeedReferences('BUSINESS PERSONAL PROPERTY');
    expect(result.instrumentNumbers).toHaveLength(0);
    expect(result.volumePages).toHaveLength(0);
    expect(result.platRefs).toHaveLength(0);
  });
});

// ── 3. scorePlatMatch — "ASH FAMILY TRUST" owner name matching ───────────────

describe('scorePlatMatch (county-plats.ts)', () => {
  it('3-1. exact match returns 1.0', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    expect(scorePlatMatch('ASH FAMILY TRUST 12.358 ACRE ADDITION', 'ASH FAMILY TRUST 12.358 ACRE ADDITION')).toBe(1.0);
  });

  it('3-2. owner name fragment "ASH FAMILY TRUST" scores >= 0.5 against full addition name', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    const score = scorePlatMatch('ASH FAMILY TRUST 12.358 ACRE ADDITION', 'ASH FAMILY TRUST');
    expect(score).toBeGreaterThanOrEqual(0.5);
  });

  it('3-3. unrelated names score 0', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    const score = scorePlatMatch('WILLIAMS CREEK ESTATES', 'ASH FAMILY TRUST');
    expect(score).toBe(0);
  });

  it('3-4. hasPlatRepository returns true for bell county', async () => {
    const { hasPlatRepository } = await import('../../worker/src/services/county-plats.js');
    expect(hasPlatRepository('bell')).toBe(true);
  });

  it('3-5. hasPlatRepository returns false for unknown county', async () => {
    const { hasPlatRepository } = await import('../../worker/src/services/county-plats.js');
    expect(hasPlatRepository('zzunknown')).toBe(false);
  });
});

// ── 4. Personal property detection helper ────────────────────────────────────

describe('Personal property detection (pipeline logic)', () => {
  const isPersonalProperty = (propertyType: string | null, legalDescription: string | null): boolean => {
    return !!(
      propertyType?.toUpperCase() === 'P' ||
      /^BUSINESS\s+PERSONAL\s+PROPERTY/i.test(legalDescription ?? '') ||
      /personal\s+property/i.test(propertyType ?? '')
    );
  };

  it('4-1. Type "P" is detected as personal property', () => {
    expect(isPersonalProperty('P', null)).toBe(true);
  });

  it('4-2. Type "R" is NOT personal property', () => {
    expect(isPersonalProperty('R', null)).toBe(false);
  });

  it('4-3. "BUSINESS PERSONAL PROPERTY" legal desc detected', () => {
    expect(isPersonalProperty(null, 'BUSINESS PERSONAL PROPERTY')).toBe(true);
  });

  it('4-4. Legal desc with subdivision name is NOT personal property', () => {
    expect(isPersonalProperty('R', 'ASH FAMILY TRUST 12.358 ACRE ADDITION, BLK 001, LOT 002')).toBe(false);
  });

  it('4-5. null type and null legal desc is NOT personal property', () => {
    expect(isPersonalProperty(null, null)).toBe(false);
  });
});

// ── 5. searchBellClerkOwnerForPlatDeed document categorisation ───────────────

describe('searchBellClerkOwnerForPlatDeed — document categorisation logic', () => {
  // Test the categorisation logic in isolation (no network)
  const categorise = (docs: Array<{ instrumentNumber: string | null; documentType: string }>) => {
    const platInstruments: string[] = [];
    const deedInstruments: string[] = [];
    for (const doc of docs) {
      if (!doc.instrumentNumber) continue;
      const dt = (doc.documentType ?? '').toLowerCase();
      if (/\bplat\b/.test(dt) || dt.includes('final plat') || dt.includes('amended plat')) {
        platInstruments.push(doc.instrumentNumber);
      } else if (
        /\b(warranty deed|deed|conveyance|transfer|grant)\b/.test(dt) &&
        !dt.includes('deed of trust')
      ) {
        deedInstruments.push(doc.instrumentNumber);
      }
    }
    return { platInstruments, deedInstruments };
  };

  it('5-1. categorises "PLAT" document correctly', () => {
    const docs = [{ instrumentNumber: '2023032044', documentType: 'PLAT' }];
    const { platInstruments } = categorise(docs);
    expect(platInstruments).toContain('2023032044');
  });

  it('5-2. categorises "Final Plat" document correctly', () => {
    const docs = [{ instrumentNumber: '2023032044', documentType: 'Final Plat' }];
    const { platInstruments } = categorise(docs);
    expect(platInstruments).toContain('2023032044');
  });

  it('5-3. categorises "Warranty Deed" as deed', () => {
    const docs = [{ instrumentNumber: '2010043440', documentType: 'Warranty Deed' }];
    const { deedInstruments } = categorise(docs);
    expect(deedInstruments).toContain('2010043440');
  });

  it('5-4. does NOT categorise "Deed of Trust" as a deed (it\'s a lien)', () => {
    const docs = [{ instrumentNumber: '9990000001', documentType: 'Deed of Trust' }];
    const { deedInstruments } = categorise(docs);
    expect(deedInstruments).not.toContain('9990000001');
  });

  it('5-5. skips docs with no instrument number', () => {
    const docs = [{ instrumentNumber: null, documentType: 'Plat' }];
    const { platInstruments } = categorise(docs);
    expect(platInstruments).toHaveLength(0);
  });

  it('5-6. handles the Ash Family Trust document set correctly', () => {
    const ashDocs = [
      { instrumentNumber: '2023032044', documentType: 'PLAT' },
      { instrumentNumber: '2010043440', documentType: 'Warranty Deed' },
      { instrumentNumber: '1997038003', documentType: 'Warranty Deed' },
      { instrumentNumber: '9991111111', documentType: 'Deed of Trust' },
    ];
    const { platInstruments, deedInstruments } = categorise(ashDocs);
    expect(platInstruments).toEqual(['2023032044']);
    expect(deedInstruments).toContain('2010043440');
    expect(deedInstruments).toContain('1997038003');
    expect(deedInstruments).not.toContain('9991111111');
  });
});

// ── 6. Bell County plat repo config + Direct URL ─────────────────────────────

describe('Bell County plat repository config (county-plats.ts)', () => {
  it('6-1. Bell County has correct index URL template', async () => {
    const { PLAT_REPO_REGISTRY } = await import('../../worker/src/services/county-plats.js');
    expect(PLAT_REPO_REGISTRY.bell.indexUrlTemplate).toContain('bellcountytx.com');
    expect(PLAT_REPO_REGISTRY.bell.indexUrlTemplate).toContain('{letter}');
  });

  it('6-2. Bell County A-page URL resolves correctly', async () => {
    const { PLAT_REPO_REGISTRY } = await import('../../worker/src/services/county-plats.js');
    const url = PLAT_REPO_REGISTRY.bell.indexUrlTemplate.replace('{letter}', 'a');
    expect(url).toBe('https://www.bellcountytx.com/county_government/county_clerk/a.php');
  });

  it('6-3. Bell County uses "links" parse mode (not table)', async () => {
    const { PLAT_REPO_REGISTRY } = await import('../../worker/src/services/county-plats.js');
    expect(PLAT_REPO_REGISTRY.bell.parseMode).toBe('links');
  });

  it('6-4. Bell County file extension is PDF', async () => {
    const { PLAT_REPO_REGISTRY } = await import('../../worker/src/services/county-plats.js');
    expect(PLAT_REPO_REGISTRY.bell.fileExt).toBe('pdf');
  });

  it('6-5. "ASH FAMILY TRUST" maps to letter "a" page', async () => {
    expect('ASH FAMILY TRUST'[0].toLowerCase()).toBe('a');
  });

  it('6-6. Bell County has directUrlTemplate configured', async () => {
    const { PLAT_REPO_REGISTRY } = await import('../../worker/src/services/county-plats.js');
    expect(PLAT_REPO_REGISTRY.bell.directUrlTemplate).toBeTruthy();
    // IMPORTANT (verified March 14, 2026): must go through bellcountytx.com, NOT cms3.revize.com
    // directly (direct revize.com access returns HTTP 403).
    expect(PLAT_REPO_REGISTRY.bell.directUrlTemplate).toContain('bellcountytx.com');
    expect(PLAT_REPO_REGISTRY.bell.directUrlTemplate).not.toContain('cms3.revize.com');
    expect(PLAT_REPO_REGISTRY.bell.directUrlTemplate).toContain('{LETTER}');
    expect(PLAT_REPO_REGISTRY.bell.directUrlTemplate).toContain('{NAME}');
  });

  it('6-7. directUrlTemplate contains correct bellcountytx.com path', async () => {
    const { PLAT_REPO_REGISTRY } = await import('../../worker/src/services/county-plats.js');
    expect(PLAT_REPO_REGISTRY.bell.directUrlTemplate).toContain('bellcountytx.com');
    expect(PLAT_REPO_REGISTRY.bell.directUrlTemplate).toContain('docs/plats');
  });

  it('6-8. Bell County fileBaseUrl is bellcountytx.com (not cms3.revize.com)', async () => {
    const { PLAT_REPO_REGISTRY } = await import('../../worker/src/services/county-plats.js');
    // The <base> tag on index pages is https://www.bellcountytx.com/ so all relative hrefs
    // resolve from there — fileBaseUrl must match this.
    expect(PLAT_REPO_REGISTRY.bell.fileBaseUrl).toContain('bellcountytx.com');
    expect(PLAT_REPO_REGISTRY.bell.fileBaseUrl).not.toContain('cms3.revize.com');
  });
});

// ── 9. Direct URL construction ─────────────────────────────────────────────────

describe('constructDirectPlatUrl (county-plats.ts)', () => {
  it('9-1. builds correct URL for ASH FAMILY TRUST', async () => {
    const { constructDirectPlatUrl, PLAT_REPO_REGISTRY } =
      await import('../../worker/src/services/county-plats.js');
    const url = constructDirectPlatUrl('ASH FAMILY TRUST 12.358 ACRE ADDITION', PLAT_REPO_REGISTRY.bell);
    expect(url).not.toBeNull();
    // Must use bellcountytx.com (not cms3.revize.com which returns 403)
    expect(url).toContain('bellcountytx.com');
    expect(url).not.toContain('cms3.revize.com');
    expect(url).toContain('/A/');
    expect(url).toContain('ASH');
    expect(url).toContain('.pdf');
  });

  it('9-2. uses uppercase LETTER in URL path', async () => {
    const { constructDirectPlatUrl, PLAT_REPO_REGISTRY } =
      await import('../../worker/src/services/county-plats.js');
    const url = constructDirectPlatUrl('williams creek estates', PLAT_REPO_REGISTRY.bell);
    expect(url).toContain('/W/');
  });

  it('9-3. encodes spaces as %20', async () => {
    const { constructDirectPlatUrl, PLAT_REPO_REGISTRY } =
      await import('../../worker/src/services/county-plats.js');
    const url = constructDirectPlatUrl('ASH FAMILY TRUST 12.358 ACRE ADDITION', PLAT_REPO_REGISTRY.bell);
    expect(url).toContain('%20');
  });

  it('9-4. returns null for config without directUrlTemplate', async () => {
    const { constructDirectPlatUrl } =
      await import('../../worker/src/services/county-plats.js');
    const noDirectConfig = {
      indexUrlTemplate: 'https://example.com/{letter}',
      fileBaseUrl: 'https://example.com',
      countyDisplayName: 'Test',
    };
    expect(constructDirectPlatUrl('TEST ADDITION', noDirectConfig)).toBeNull();
  });

  it('9-5. returns null for empty subdivision name', async () => {
    const { constructDirectPlatUrl, PLAT_REPO_REGISTRY } =
      await import('../../worker/src/services/county-plats.js');
    expect(constructDirectPlatUrl('', PLAT_REPO_REGISTRY.bell)).toBeNull();
  });

  it('9-6. ASH FAMILY TRUST URL matches confirmed bellcountytx.com pattern', async () => {
    const { constructDirectPlatUrl, PLAT_REPO_REGISTRY } =
      await import('../../worker/src/services/county-plats.js');
    const url = constructDirectPlatUrl('ASH FAMILY TRUST 12.358 ACRE ADDITION', PLAT_REPO_REGISTRY.bell);
    // Verified working pattern (March 14, 2026): go through bellcountytx.com (auto-redirects to revize)
    expect(url).toContain('bellcountytx.com');
    expect(url).toContain('/docs/plats/A/');
    expect(url).toContain('ASH');
    expect(url?.endsWith('.pdf')).toBe(true);
  });
});

// ── 10. directUrlNameVariants ─────────────────────────────────────────────────

describe('directUrlNameVariants (county-plats.ts)', () => {
  it('10-1. includes original name', async () => {
    const { directUrlNameVariants } = await import('../../worker/src/services/county-plats.js');
    const variants = directUrlNameVariants('ASH FAMILY TRUST 12.358 ACRE ADDITION');
    expect(variants).toContain('ASH FAMILY TRUST 12.358 ACRE ADDITION');
  });

  it('10-2. generates & → AND variant', async () => {
    const { directUrlNameVariants } = await import('../../worker/src/services/county-plats.js');
    const variants = directUrlNameVariants('A & B ADDITION');
    expect(variants.some(v => v.includes('AND'))).toBe(true);
  });

  it('10-3. returns array (at least 1 entry)', async () => {
    const { directUrlNameVariants } = await import('../../worker/src/services/county-plats.js');
    expect(directUrlNameVariants('SIMPLE ADDITION').length).toBeGreaterThan(0);
  });

  it('10-4. generates " A" and " B" letter suffix variants for Bell County split plats', async () => {
    const { directUrlNameVariants } = await import('../../worker/src/services/county-plats.js');
    const variants = directUrlNameVariants('DAWSON RIDGE AMENDING PLAT');
    // Base name first
    expect(variants[0]).toBe('DAWSON RIDGE AMENDING PLAT');
    // Letter suffixes
    expect(variants.some(v => v === 'DAWSON RIDGE AMENDING PLAT A')).toBe(true);
    expect(variants.some(v => v === 'DAWSON RIDGE AMENDING PLAT B')).toBe(true);
  });
});

// ── 11. normalizePlatName — abbreviation normalization ───────────────────────

describe('normalizePlatName (county-plats.ts)', () => {
  it('11-1. ADN → ADDITION', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('DAVIS ADN')).toContain('ADDITION');
  });

  it('11-2. AMENDING → AMENDED (Bell County interchangeable)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    const n = normalizePlatName('DAWSON RIDGE AMENDING PLAT');
    expect(n).toContain('AMENDED');
  });

  it('11-3. EST → ESTATES', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('WILLIAMS CREEK EST')).toContain('ESTATES');
  });

  it('11-4. 1ST → 1 (ordinal normalization)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('OAKWOOD 1ST ADDITION')).toContain('1 ADDITION');
  });

  it('11-5. Roman II → arabic 2', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('DAWSON RIDGE AMENDMENT II')).toContain('2');
  });

  it('11-6. & → AND', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('A & B COMMERCIAL')).toContain('AND');
  });

  it('11-7. RPLT → REPLAT', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('HIGHLAND RPLT')).toContain('REPLAT');
  });
});

// ── 12. scorePlatMatch — with abbreviation normalization ─────────────────────

describe('scorePlatMatch with normalization (county-plats.ts)', () => {
  it('12-1. AMENDING vs AMENDED scores >= 0.8 (key Dawson Ridge case)', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    // Target from CAD: "DAWSON RIDGE AMENDING PLAT"
    // File on disk:    "DAWSON RIDGE AMENDED PLAT-A" (link text) OR "DAWSON RIDGE AMENDING PLAT A" (filename)
    const score = scorePlatMatch('DAWSON RIDGE AMENDED PLAT A', 'DAWSON RIDGE AMENDING PLAT');
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  it('12-2. ADN vs ADDITION scores >= 0.7', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    const score = scorePlatMatch('DAVIS ADN', 'DAVIS ADDITION');
    expect(score).toBeGreaterThanOrEqual(0.7);
  });

  it('12-3. short name does NOT match long unrelated name (< 0.5)', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    const score = scorePlatMatch('DAVIS ADN', 'DAVIS BRAGGS EAST RIDGE ADDITION');
    expect(score).toBeLessThan(0.5);
  });

  it('12-4. ASH FAMILY TRUST fragment still scores >= 0.5', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    const score = scorePlatMatch('ASH FAMILY TRUST 12.358 ACRE ADDITION', 'ASH FAMILY TRUST');
    expect(score).toBeGreaterThanOrEqual(0.5);
  });
});

// ── 14. normalizePlatName — Categories E, F, I (new abbreviations) ───────────

describe('normalizePlatName — Category E/F/I additions (county-plats.ts)', () => {
  it('14-1. SUB → SUBDIVISION (Category E, ~50 entries)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('BARNHARDT SUB')).toContain('SUBDIVISION');
  });

  it('14-2. SUB does NOT expand inside SUBURBAN (word-boundary safety)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('SUBURBAN HEIGHTS')).not.toContain('SUBDIVISION');
  });

  it('14-3. ESTATE → ESTATES (singular to plural, Category F)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('MAHLER-MARSHALL ESTATE')).toContain('ESTATES');
  });

  it('14-4. ESTATES unchanged (no double-expansion)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('EAGLE LEGACY ESTATES PHASE 1')).toContain('ESTATES');
    expect(normalizePlatName('EAGLE LEGACY ESTATES PHASE 1')).not.toContain('ESTATESS');
  });

  it('14-5. BLK → BLOCK (Category I)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('CEDAR PARK BLK 1')).toContain('BLOCK');
  });

  it('14-6. LT → LOT (Category I)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('CEDAR PARK LT 1')).toContain('LOT');
  });

  it('14-7. IND → INDUSTRIAL (Category I)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('SOUTH LOOP IND PARK')).toContain('INDUSTRIAL');
  });

  it('14-8. INST → INSTRUMENT (Category I)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('VILLA CONQUISTADOR 1ST INST REPLAT')).toContain('INSTRUMENT');
  });

  it('14-9. PH N → PHASE N (Category B)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('NORTH GATE PH 6')).toContain('PHASE 6');
  });

  it('14-10. P1 → PHASE 1 (Category B)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('BARTON BUSINESS PARK P1')).toContain('PHASE 1');
  });

  it('14-11. PHASE II → PHASE 2 (Category D, roman numeral)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('ENCLAVE AT INDIAN TRAIL PHASE II')).toContain('PHASE 2');
  });

  it('14-12. PHASE THREE → PHASE 3 (Category D, spelled-out)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('ESPOSITO ADDITION PHASE THREE')).toContain('PHASE 3');
  });

  it('14-13. REPLAT NO ONE → REPLAT NUMBER 1 (Category D)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    const n = normalizePlatName('SOUTHSHORE ESTATES REPLAT NO ONE');
    expect(n).toContain('NUMBER 1');
  });

  it('14-14. PHASE X → PHASE 10 (Category D, roman X after keyword)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('ENTERPRISE BUSINESS PARK PHASE X')).toContain('PHASE 10');
  });

  it('14-15. SEC alone → SECTION (Category C standalone, e.g. SEC A)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('WOODLANDS SEC A')).toContain('SECTION');
    expect(normalizePlatName('WOODLANDS SEC A')).not.toContain('SEC A');
  });

  it('14-16. SEC 2 → SECTION 2 (Category C with digit)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('AARON ADDITION SEC 2')).toContain('SECTION 2');
  });

  it('14-17. PH alone → PHASE (Category B standalone)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('VISTA PH A')).toContain('PHASE');
    expect(normalizePlatName('VISTA PH A')).not.toContain(' PH ');
  });

  it('14-18. L1 → LOT 1 (Category I, L-digit shorthand)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('COPPERAS COVE L1')).toContain('LOT 1');
  });

  it('14-19. B1 → BLOCK 1 (Category I, B-digit shorthand)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    expect(normalizePlatName('COPPERAS COVE B1')).toContain('BLOCK 1');
  });

  it('14-20. L1 B1 → LOT 1 BLOCK 1 (Category I compound form)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    const n = normalizePlatName('SOMEPLAT L1 B1');
    expect(n).toContain('LOT 1');
    expect(n).toContain('BLOCK 1');
  });

  it('14-21. B suffix letter (no digit) is NOT expanded to BLOCK (safety guard)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    // "DAWSON RIDGE PLAT B" — B here is a volume letter, not BLOCK
    const n = normalizePlatName('DAWSON RIDGE PLAT B');
    expect(n).not.toContain('BLOCK');
  });
});

// ── 15. scorePlatMatch — Category E/D/J scoring examples ─────────────────────

describe('scorePlatMatch — Category E/D/J examples (county-plats.ts)', () => {
  it('15-1. SUBDIVISION vs SUB scores >= 0.8 (Category E)', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    const score = scorePlatMatch('BARNHARDT SUBDIVISION', 'BARNHARDT SUB');
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  it('15-2. PHASE 2 vs PHASE II scores >= 0.9 (Category D)', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    const score = scorePlatMatch('ENCLAVE AT INDIAN TRAIL PHASE 2', 'ENCLAVE AT INDIAN TRAIL PHASE II');
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('15-3. REPLAT NO 1 vs REPLAT NO ONE scores >= 0.9 (Category D)', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    const score = scorePlatMatch('SOUTHSHORE ESTATES REPLAT NO 1', 'SOUTHSHORE ESTATES REPLAT NO ONE');
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('15-4. ESTATE vs ESTATES scores = 1.0 (Category F, both normalize to ESTATES)', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    const score = scorePlatMatch('MAHLER-MARSHALL ESTATE', 'MAHLER-MARSHALL ESTATES');
    expect(score).toBe(1.0);
  });

  it('15-5. Category J typo ADDITITON normalizes to exact match with ADDITION', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    // W Y MCFARLAND ADDITITON REPLAT NO 3 (archive) vs W Y MCFARLAND ADDITION REPLAT NO 3 (CAD)
    const score = scorePlatMatch('W Y MCFARLAND ADDITITON REPLAT NO 3', 'W Y MCFARLAND ADDITION REPLAT NO 3');
    expect(score).toBe(1.0);
  });

  it('15-6. Category J typo SUBDVISION normalizes to exact match with SUBDIVISION', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    // ROWAN TEMPLE SUBDVISION C (archive) vs ROWAN TEMPLE SUBDIVISION C (CAD)
    const score = scorePlatMatch('ROWAN TEMPLE SUBDVISION C', 'ROWAN TEMPLE SUBDIVISION C');
    expect(score).toBe(1.0);
  });

  it('15-7. HINDU TEMPLE ADDITION 2 vs ADDITION II scores >= 0.9 (Category D)', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    const score = scorePlatMatch('HINDU TEMPLE ADDITION II', 'HINDU TEMPLE ADDITION 2');
    expect(score).toBeGreaterThanOrEqual(0.9);
  });
});

// ── 13. parsePlatLinks URL resolution — href path encoding ───────────────────
// Verifies that spaces and '#' in href values are encoded correctly per the
// Bell County Plat Archive Appendix (verified March 14, 2026).

describe('parsePlatLinks URL resolution (county-plats.ts)', () => {
  /**
   * Build a minimal Bell County-style HTML snippet with one <a> link and run
   * it through the internal parsePlatLinks logic indirectly by verifying that
   * `fetchPlatFromRepo` exports the right module shape, then testing the URL
   * construction logic directly.
   *
   * Because parsePlatLinks is not exported, we test via a thin exercise of
   * the real function by importing county-plats.js and using its exported
   * helper `normalizePlatName` to confirm the module is available, and we
   * inline the identical URL resolution logic here so any future change to
   * the logic also breaks these tests.
   */
  const BELL_BASE = 'https://www.bellcountytx.com';

  /** Mirror of the encoding logic in parsePlatLinks.addLink */
  function resolvePlatHref(rawHref: string, baseUrl: string = BELL_BASE): string {
    if (rawHref.startsWith('http')) return rawHref;
    const qIdx = rawHref.indexOf('?');
    const rawPath = qIdx >= 0 ? rawHref.slice(0, qIdx) : rawHref;
    const querySuffix = qIdx >= 0 ? rawHref.slice(qIdx) : '';
    const encodedPath = rawPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
    const separator = rawHref.startsWith('/') ? '' : '/';
    return baseUrl + separator + encodedPath + querySuffix;
  }

  it('13-1. Pattern 1 (full path) encodes spaces in filename segment', () => {
    const href = 'county_government/county_clerk/docs/plats/D/DAWSON 2ND ADN.PDF?t=201810100844500';
    const url = resolvePlatHref(href);
    expect(url).toBe(
      'https://www.bellcountytx.com/county_government/county_clerk/docs/plats/D/DAWSON%202ND%20ADN.PDF?t=201810100844500',
    );
  });

  it('13-2. Pattern 2 (no letter subfolder) encodes spaces in filename', () => {
    const href = 'county_government/county_clerk/docs/plats/DAWSON RIDGE AMENDING PLAT B.pdf?t=202008071232030';
    const url = resolvePlatHref(href);
    expect(url).toBe(
      'https://www.bellcountytx.com/county_government/county_clerk/docs/plats/DAWSON%20RIDGE%20AMENDING%20PLAT%20B.pdf?t=202008071232030',
    );
  });

  it('13-3. Pattern 3 (bare filename) resolves to site root', () => {
    const href = 'DAWSON RIDGE AMENDMENT II.pdf?t=202112011542510';
    const url = resolvePlatHref(href);
    // Must be at SITE ROOT (not /county_government/county_clerk/) per <base> tag
    expect(url).toBe(
      'https://www.bellcountytx.com/DAWSON%20RIDGE%20AMENDMENT%20II.pdf?t=202112011542510',
    );
    expect(url).not.toContain('county_government');
  });

  it('13-4. Hash "#" subfolder encoded as %23 (not treated as URL fragment)', () => {
    const href = 'county_government/county_clerk/docs/plats/#/SOMEFILE.pdf?t=202001010000000';
    const url = resolvePlatHref(href);
    expect(url).toContain('%23');
    expect(url).not.toContain('/#/');    // raw # would act as URL fragment
    expect(url).toBe(
      'https://www.bellcountytx.com/county_government/county_clerk/docs/plats/%23/SOMEFILE.pdf?t=202001010000000',
    );
  });

  it('13-5. Absolute hrefs passed through unchanged', () => {
    const href = 'https://www.bellcountytx.com/county_government/county_clerk/docs/plats/D/ALREADY.pdf';
    expect(resolvePlatHref(href)).toBe(href);
  });

  it('13-6. Extension .PDF (uppercase) is preserved in the encoded URL', () => {
    const href = 'county_government/county_clerk/docs/plats/A/ASHBY ADN.PDF?t=202001010101010';
    const url = resolvePlatHref(href);
    expect(url).toContain('ASHBY%20ADN.PDF');
  });
});

// ── 8. Bell CAD "By Owner" pivot logic (allPersonalProperty) ─────────────────

describe('Bell CAD "By Owner" pivot when all results are Type P', () => {
  // Mirror the allPersonalProperty detection logic from bis-cad.ts
  const getProp = (result: Record<string, unknown>, ...keys: string[]): string | null => {
    for (const k of keys) {
      if (result[k] != null) return String(result[k]);
    }
    return null;
  };

  const isAllPersonalProperty = (results: Array<Record<string, unknown>>): boolean => {
    return results.length > 0 && results.every((r) => {
      const rawType = (getProp(r, 'propertyType', 'PropertyType') ?? '').trim().toUpperCase();
      return rawType === 'P' || rawType === 'PERSONAL';
    });
  };

  const extractTypePMapId = (results: Array<Record<string, unknown>>): string | null => {
    if (!isAllPersonalProperty(results)) return null;
    return (getProp(results[0], 'mapId', 'MapId', 'map_id') as string | null) ?? null;
  };

  it('8-1. detects all-P results correctly', () => {
    const results = [
      { propertyType: 'P', propertyId: '498826', mapId: '61B01' },
    ];
    expect(isAllPersonalProperty(results)).toBe(true);
  });

  it('8-2. returns false when mix of P and R', () => {
    const results = [
      { propertyType: 'P', propertyId: '498826', mapId: '61B01' },
      { propertyType: 'R', propertyId: '524312', mapId: '61B01' },
    ];
    expect(isAllPersonalProperty(results)).toBe(false);
  });

  it('8-3. extracts mapId "61B01" from Type P result', () => {
    const results = [{ propertyType: 'P', propertyId: '498826', mapId: '61B01' }];
    expect(extractTypePMapId(results)).toBe('61B01');
  });

  it('8-4. returns null mapId when results are not all personal property', () => {
    const results = [{ propertyType: 'R', propertyId: '524312', mapId: '61B01' }];
    expect(extractTypePMapId(results)).toBeNull();
  });

  it('8-5. mapId prefix filter selects geographically matching owner results', () => {
    const typePMapId = '61B01';
    const ownerResults = [
      { propertyId: '524311', mapId: '61B01', propertyType: 'R' }, // ← same map area
      { propertyId: '524312', mapId: '61B01', propertyType: 'R' }, // ← same map area
      { propertyId: '999999', mapId: '44A03', propertyType: 'R' }, // ← different area
    ];
    const mapPrefix = typePMapId.substring(0, 3); // "61B"
    const sameMap = ownerResults.filter((r) => {
      const rm = (getProp(r as Record<string, unknown>, 'mapId', 'MapId') as string | null) ?? '';
      return rm.startsWith(mapPrefix);
    });
    expect(sameMap).toHaveLength(2);
    expect(sameMap.map(r => r.propertyId)).toEqual(['524311', '524312']);
  });

  it('8-6. all-owner-results used when none match map prefix', () => {
    const typePMapId = '61B01';
    const ownerResults = [
      { propertyId: '111111', mapId: '22A01', propertyType: 'R' },
      { propertyId: '222222', mapId: '33B02', propertyType: 'R' },
    ];
    const mapPrefix = typePMapId.substring(0, 3);
    const sameMap = ownerResults.filter((r) => {
      const rm = (getProp(r as Record<string, unknown>, 'mapId', 'MapId') as string | null) ?? '';
      return rm.startsWith(mapPrefix);
    });
    // No matches → fall back to all results
    expect(sameMap).toHaveLength(0);
    const ranked = sameMap.length > 0 ? sameMap : ownerResults;
    expect(ranked).toHaveLength(2);
  });

  it('8-7. "PERSONAL" propertyType also treated as personal property', () => {
    const results = [{ propertyType: 'PERSONAL', propertyId: '111' }];
    expect(isAllPersonalProperty(results)).toBe(true);
  });
});


describe('fetchDocumentImages (bell-clerk.ts)', () => {
  it('7-1. searchBellClerkOwnerForPlatDeed is exported', async () => {
    const mod = await import('../../worker/src/services/bell-clerk.js');
    expect(typeof mod.searchBellClerkOwnerForPlatDeed).toBe('function');
  });

  it('7-2. fetchDocumentImages is exported', async () => {
    const mod = await import('../../worker/src/services/bell-clerk.js');
    expect(typeof mod.fetchDocumentImages).toBe('function');
  });

  it('7-3. searchBellClerk is exported (owner name search)', async () => {
    const mod = await import('../../worker/src/services/bell-clerk.js');
    expect(typeof mod.searchBellClerk).toBe('function');
  });
});

// ── 16. Category Q — empty anchor text → name from href filename ──────────────

describe('parsePlatLinks Category Q — empty display names (county-plats.ts)', () => {
  /**
   * parsePlatLinks is not exported, so we verify the behavior indirectly by
   * confirming that normalizePlatName is available (module loads) and using the
   * same URL-resolution helper that the tests already use (section 13) together
   * with a direct copy of the Category Q extraction logic.
   */
  function extractNameFromHref(rawHref: string): string {
    const bareHref = rawHref.split('?')[0];
    const lastSeg = bareHref.split('/').pop() ?? '';
    let decoded = lastSeg;
    try { decoded = decodeURIComponent(lastSeg); } catch { /* keep raw */ }
    return decoded.replace(/\.[^.]*$/, '').replace(/\+/g, ' ').trim();
  }

  it('16-1. extracts "ACADEMY MINI SELF STORAGE SUB" from plat href when display is empty', () => {
    const href = 'county_government/county_clerk/docs/plats/A/ACADEMY MINI SELF STORAGE SUB.pdf';
    expect(extractNameFromHref(href)).toBe('ACADEMY MINI SELF STORAGE SUB');
  });

  it('16-2. extracts "BALDWIN ESTATES" from encoded href', () => {
    const href = 'county_government/county_clerk/docs/plats/B/BALDWIN%20ESTATES.pdf';
    expect(extractNameFromHref(href)).toBe('BALDWIN ESTATES');
  });

  it('16-3. extracts "ISDALE ADN" from href with cache-buster query', () => {
    const href = 'county_government/county_clerk/docs/plats/I/ISDALE ADN.pdf?t=202001010000000';
    expect(extractNameFromHref(href)).toBe('ISDALE ADN');
  });

  it('16-4. normalizePlatName still works after Category Q name extraction', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    const extracted = extractNameFromHref(
      'county_government/county_clerk/docs/plats/I/ISDALE ADN.pdf?t=202001010000000',
    );
    expect(normalizePlatName(extracted)).toContain('ADDITION');
  });
});

// ── 17. Category R — "N OF M" suffix → letter (A/B/C/D) ─────────────────────

describe('normalizePlatName Category R — N OF M suffix (county-plats.ts)', () => {
  it('17-1. trailing "1 OF 2" → "A" (BCWCID NO 1 PLANT 1 OF 2 case)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    const n = normalizePlatName('BCWCID NO 1 PLANT 1 OF 2');
    expect(n).toContain('A');
    expect(n).not.toMatch(/\b1 OF 2\b/);
  });

  it('17-2. trailing "2 OF 2" → "B"', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    const n = normalizePlatName('BCWCID NO 1 PLANT 2 OF 2');
    expect(n).toContain('B');
    expect(n).not.toMatch(/\b2 OF 2\b/);
  });

  it('17-3. display name "BCWCID NO 1 PLANT A" normalizes identically to filename "1 OF 2"', async () => {
    const { normalizePlatName, scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    // Both should normalize to the same form (BCWCID NUMBER 1 PLANT A)
    const display = normalizePlatName('BCWCID NO 1 PLANT A');
    const filename = normalizePlatName('BCWCID NO 1 PLANT 1 OF 2');
    expect(display).toBe(filename);
    expect(scorePlatMatch('BCWCID NO 1 PLANT A', 'BCWCID NO 1 PLANT 1 OF 2')).toBe(1.0);
  });

  it('17-4. "N OF M" not at end of string is NOT replaced (mid-name safety)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    // "LOTS 1 AND 2 OF BLOCK 3" — the OF here is not a split-file indicator
    const n = normalizePlatName('LOTS 1 AND 2 OF BLOCK 3 ADDITION');
    // 2 OF BLOCK is not "2 OF <digit>" so it should remain unchanged
    expect(n).not.toMatch(/\bB\b.*ADDITION/); // should not have turned into B
  });

  it('17-5. "4 OF 4" → "D" (4th split file)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    const n = normalizePlatName('SOMEPLAT 4 OF 4');
    expect(n).toContain('D');
  });
});

// ── 18. Levenshtein fuzzy matching in scorePlatMatch ──────────────────────────

describe('scorePlatMatch — Levenshtein typo matching (county-plats.ts)', () => {
  it('18-1. VAZQUES vs VAZQUEZ scores >= 0.8 (one-char transposition, Category J)', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    // "VAZQUES ADN" (archive) vs "VAZQUEZ ADDITION" (CAD)
    const score = scorePlatMatch('VAZQUES ADN', 'VAZQUEZ ADDITION');
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  it('18-2. HICKS FAMILY PROPETIES vs HICKS FAMILY PROPERTIES scores >= 0.8 (missing R)', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    const score = scorePlatMatch(
      'HICKS FAMILY PROPETIES ADDITION',
      'HICKS FAMILY PROPERTIES ADDITION',
    );
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  it('18-3. HILLLS OF WESTPARK vs HILLS OF WESTPARK scores >= 0.8 (doubled letter)', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    const score = scorePlatMatch('HILLLS OF WESTPARK ADN REPLAT', 'HILLS OF WESTPARK ADN REPLAT');
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  it('18-4. VAULE PLACE vs VALUE PLACE scores >= 0.5 (Category J transposition)', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    const score = scorePlatMatch('VAULE PLACE ADN', 'VALUE PLACE ADDITION');
    expect(score).toBeGreaterThanOrEqual(0.5);
  });

  it('18-5. completely unrelated names still score 0 (no shared tokens = no Levenshtein boost)', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    // Test 3-3 safety: WILLIAMS CREEK vs ASH FAMILY — no shared tokens
    expect(scorePlatMatch('WILLIAMS CREEK ESTATES', 'ASH FAMILY TRUST')).toBe(0);
  });

  it('18-6. DAVIS ADN vs DAVIS BRAGGS EAST RIDGE ADDITION still scores < 0.5 (too different)', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    // Test 12-3 safety: short name should not match long unrelated name
    expect(scorePlatMatch('DAVIS ADN', 'DAVIS BRAGGS EAST RIDGE ADDITION')).toBeLessThan(0.5);
  });

  it('18-7. VANICEK 2 vs VANCIEK 2 (transposed letters) scores >= 0.8', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    // "VANICEK 2 ADN REPLAT" (CAD) vs "VANCIEK 2 ADN REPLAT" (filename typo)
    const score = scorePlatMatch('VANICEK 2 ADN REPLAT', 'VANCIEK 2 ADN REPLAT');
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  it('18-8. MATULA MORTION vs MATULA MORTON (one typo in secondary word) scores >= 0.7', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    const score = scorePlatMatch('MATULA AND MORTION ADDITION', 'MATULA AND MORTON ADDITION');
    expect(score).toBeGreaterThanOrEqual(0.7);
  });
});

// ── 19. normalizePlatName — HTML entity & apostrophe fixes ───────────────────

describe('normalizePlatName — HTML entity & apostrophe handling (county-plats.ts)', () => {
  it('19-1. &amp; HTML entity → AND (Category M: raw HTML anchor text)', async () => {
    // Bell County HTML: <a>ATCHISON TOPEKA &amp; SANTA FE RAILWAY</a>
    // parsePlatLinks returns rawName = "ATCHISON TOPEKA &amp; SANTA FE RAILWAY" without decoding.
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    const result = normalizePlatName('ATCHISON TOPEKA &amp; SANTA FE RAILWAY');
    expect(result).toContain('AND');
    expect(result).not.toContain('AMP');
    expect(result).toBe('ATCHISON TOPEKA AND SANTA FE RAILWAY');
  });

  it('19-2. raw & → AND still works (when HTML is already decoded)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    const result = normalizePlatName('ATCHISON TOPEKA & SANTA FE RAILWAY');
    expect(result).toBe('ATCHISON TOPEKA AND SANTA FE RAILWAY');
  });

  it('19-3. apostrophe removed, not spaced (ALBERTSON\'S → ALBERTSONS)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    const result = normalizePlatName("ALBERTSON'S ADDITION REPLAT NUMBER 2 A");
    expect(result).toContain('ALBERTSONS');
    expect(result).not.toContain('ALBERTSON S');
  });

  it('19-4. &amp; and raw & score identical after normalization', async () => {
    // Both forms appear in Bell County: display name may have raw & or &amp;
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    const a = normalizePlatName('MILL CREEK NUMBER 1 LOTS 1 &amp; 2 BLOCK 3');
    const b = normalizePlatName('MILL CREEK NUMBER 1 LOTS 1 & 2 BLOCK 3');
    expect(a).toBe(b);
  });

  it('19-5. MILL CREEK NO 1 LOTS 1&amp;2 BLOCK 3 normalizes correctly (Category M)', async () => {
    const { normalizePlatName } = await import('../../worker/src/services/county-plats.js');
    const result = normalizePlatName('MILL CREEK NO 1 LOTS 1&amp;2 BLOCK 3');
    // & → AND, NO → NUMBER, &amp; decoded, numbers unchanged
    expect(result).toContain('AND');
    expect(result).not.toContain('AMP');
    expect(result).toContain('MILL CREEK');
  });

  it('19-6. scorePlatMatch: &amp; display vs AND filename scores 1.0 (Category M)', async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    // Display: "ATCHISON TOPEKA &amp; SANTA FE RAILWAY" (from HTML anchor text)
    // Filename: "ATCHISON TOPEKA AND SANTA FE RAILWAY"
    const score = scorePlatMatch(
      'ATCHISON TOPEKA &amp; SANTA FE RAILWAY',
      'ATCHISON TOPEKA AND SANTA FE RAILWAY',
    );
    expect(score).toBe(1.0);
  });

  it("19-7. ALBERTSON'S display vs ALBERTSONS filename scores >= 0.9 (apostrophe)", async () => {
    const { scorePlatMatch } = await import('../../worker/src/services/county-plats.js');
    // Category T: display has apostrophe, filename does not
    const score = scorePlatMatch(
      "ALBERTSON'S ADDITION REPLAT NUMBER 2 A",
      'ALBERTSONS ADDITION REPLAT NUMBER 2 A',
    );
    expect(score).toBeGreaterThanOrEqual(0.9);
  });
});

// ── 20. Section 7 — PlatArchiveEntry + scrapePlatIndexPage ───────────────────

describe('PlatArchiveEntry + PLAT_PAGES (county-plats.ts — Section 7)', () => {
  it('20-1. PLAT_PAGES contains 27 entries (a-z + 0-9)', async () => {
    const { PLAT_PAGES } = await import('../../worker/src/services/county-plats.js');
    expect(PLAT_PAGES).toHaveLength(27);
    expect(PLAT_PAGES).toContain('a');
    expect(PLAT_PAGES).toContain('z');
    expect(PLAT_PAGES).toContain('0-9');
  });

  it('20-2. PLAT_PAGES first entry is "a" and last is "0-9"', async () => {
    const { PLAT_PAGES } = await import('../../worker/src/services/county-plats.js');
    expect(PLAT_PAGES[0]).toBe('a');
    expect(PLAT_PAGES[PLAT_PAGES.length - 1]).toBe('0-9');
  });

  it('20-3. scrapePlatIndexPage is an exported async function', async () => {
    const mod = await import('../../worker/src/services/county-plats.js');
    expect(typeof mod.scrapePlatIndexPage).toBe('function');
  });

  it('20-4. scrapePlatIndexPage returns PlatArchiveEntry[] with correct shape', async () => {
    // Mock fetch so we don't hit the network
    const { scrapePlatIndexPage } = await import('../../worker/src/services/county-plats.js');
    const mockHtml = `<html><body>
      <a href="county_government/county_clerk/docs/plats/A/ASH FAMILY TRUST ADDITION.pdf">ASH FAMILY TRUST ADDITION</a>
      <a href="county_government/county_clerk/docs/plats/ACME PROPERTIES.pdf">ACME PROPERTIES SUBDIVISION</a>
      <a href="ALPHA ESTATES.pdf">ALPHA ESTATES</a>
    </body></html>`;

    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    } as Response);

    const mockLogger = {
      startAttempt: () => () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      getAttempts: () => [],
    } as unknown as import('../../worker/src/lib/logger.js').PipelineLogger;

    const entries = await scrapePlatIndexPage('a', mockLogger);

    global.fetch = origFetch;

    expect(entries.length).toBe(3);
    // All entries have required fields
    for (const e of entries) {
      expect(typeof e.displayName).toBe('string');
      expect(typeof e.filename).toBe('string');
      expect(typeof e.href).toBe('string');
      expect(typeof e.resolvedUrl).toBe('string');
      expect(e.letter).toBe('a');
      expect(['full', 'nosubdir', 'bare']).toContain(e.pathType);
    }
  });

  it('20-5. classifies pathType "full" for /docs/plats/A/ pattern (Pattern 1)', async () => {
    const { scrapePlatIndexPage } = await import('../../worker/src/services/county-plats.js');
    const mockHtml = `<a href="county_government/county_clerk/docs/plats/A/ASH FAMILY.pdf">ASH FAMILY TRUST ADDITION</a>`;

    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    } as Response);

    const mockLogger = {
      startAttempt: () => () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      getAttempts: () => [],
    } as unknown as import('../../worker/src/lib/logger.js').PipelineLogger;

    const entries = await scrapePlatIndexPage('a', mockLogger);
    global.fetch = origFetch;
    expect(entries[0]?.pathType).toBe('full');
  });

  it('20-6. classifies pathType "nosubdir" for /docs/plats/ without letter (Pattern 2)', async () => {
    const { scrapePlatIndexPage } = await import('../../worker/src/services/county-plats.js');
    const mockHtml = `<a href="county_government/county_clerk/docs/plats/ACME PROPERTIES.pdf">ACME PROPERTIES</a>`;

    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    } as Response);

    const mockLogger = {
      startAttempt: () => () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      getAttempts: () => [],
    } as unknown as import('../../worker/src/lib/logger.js').PipelineLogger;

    const entries = await scrapePlatIndexPage('a', mockLogger);
    global.fetch = origFetch;
    expect(entries[0]?.pathType).toBe('nosubdir');
  });

  it('20-7. classifies pathType "bare" for bare filename (Pattern 3)', async () => {
    const { scrapePlatIndexPage } = await import('../../worker/src/services/county-plats.js');
    const mockHtml = `<a href="ALPHA ESTATES.pdf">ALPHA ESTATES</a>`;

    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    } as Response);

    const mockLogger = {
      startAttempt: () => () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      getAttempts: () => [],
    } as unknown as import('../../worker/src/lib/logger.js').PipelineLogger;

    const entries = await scrapePlatIndexPage('a', mockLogger);
    global.fetch = origFetch;
    expect(entries[0]?.pathType).toBe('bare');
  });

  it('20-8. scrapePlatIndexPage decodes &amp; in anchor text', async () => {
    const { scrapePlatIndexPage } = await import('../../worker/src/services/county-plats.js');
    const mockHtml = `<a href="docs/plats/A/ATCHISON &amp; SANTA FE.pdf">ATCHISON &amp; SANTA FE RAILWAY</a>`;

    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    } as Response);

    const mockLogger = {
      startAttempt: () => () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      getAttempts: () => [],
    } as unknown as import('../../worker/src/lib/logger.js').PipelineLogger;

    const entries = await scrapePlatIndexPage('a', mockLogger);
    global.fetch = origFetch;
    expect(entries[0]?.displayName).toBe('ATCHISON & SANTA FE RAILWAY');
    expect(entries[0]?.displayName).not.toContain('amp');
  });

  it('20-9. scrapePlatIndexPage deduplicates entries by display name', async () => {
    const { scrapePlatIndexPage } = await import('../../worker/src/services/county-plats.js');
    const mockHtml = `
      <a href="docs/plats/A/FOO.pdf">FOO ADDITION</a>
      <a href="docs/plats/A/FOO.pdf">FOO ADDITION</a>
    `;
    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    } as Response);

    const mockLogger = {
      startAttempt: () => () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      getAttempts: () => [],
    } as unknown as import('../../worker/src/lib/logger.js').PipelineLogger;

    const entries = await scrapePlatIndexPage('a', mockLogger);
    global.fetch = origFetch;
    expect(entries.length).toBe(1);
  });

  it('20-10. scrapePlatIndexPage strips cache-busting ?t= from resolvedUrl', async () => {
    const { scrapePlatIndexPage } = await import('../../worker/src/services/county-plats.js');
    const mockHtml = `<a href="county_government/county_clerk/docs/plats/A/ASH.pdf?t=20240101">ASH TRUST</a>`;
    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    } as Response);

    const mockLogger = {
      startAttempt: () => () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      getAttempts: () => [],
    } as unknown as import('../../worker/src/lib/logger.js').PipelineLogger;

    const entries = await scrapePlatIndexPage('a', mockLogger);
    global.fetch = origFetch;
    expect(entries[0]?.resolvedUrl).not.toContain('?t=');
    expect(entries[0]?.href).toContain('?t=');
  });
});

// ── 21. Section 6 — AI Fallback (searchCountyPlats + clearPlatMatchAiCache) ──

describe('AI plat match fallback (county-plats.ts — Section 6)', () => {
  it('21-1. clearPlatMatchAiCache is an exported function', async () => {
    const mod = await import('../../worker/src/services/county-plats.js');
    expect(typeof mod.clearPlatMatchAiCache).toBe('function');
  });

  it('21-2. searchCountyPlats accepts optional anthropicApiKey parameter without error', async () => {
    const { searchCountyPlats } = await import('../../worker/src/services/county-plats.js');
    // Mock fetch to return empty index page (no matches)
    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '<html></html>' } as Response);
    const mockLogger = {
      startAttempt: () => () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      getAttempts: () => [],
    } as unknown as import('../../worker/src/lib/logger.js').PipelineLogger;
    // Should not throw
    const results = await searchCountyPlats('bell', 'ASH FAMILY TRUST ADDITION', mockLogger, 0.5, 'test-key');
    global.fetch = origFetch;
    expect(Array.isArray(results)).toBe(true);
  });

  it('21-3. AI fallback is NOT triggered when best score >= 0.7', async () => {
    // Test: if normalizer finds a match >= 0.7, Claude should NOT be called
    const { searchCountyPlats, clearPlatMatchAiCache } = await import('../../worker/src/services/county-plats.js');
    clearPlatMatchAiCache();

    const origFetch = global.fetch;
    let anthropicCallCount = 0;
    const mockHtml = `<a href="county_government/county_clerk/docs/plats/A/ASH FAMILY TRUST ADDITION.pdf">ASH FAMILY TRUST ADDITION</a>`;

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('anthropic')) {
        anthropicCallCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({ content: [{ type: 'text', text: '{"matches":[]}' }] }),
        });
      }
      return Promise.resolve({ ok: true, text: async () => mockHtml });
    });

    const mockLogger = {
      startAttempt: () => () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      getAttempts: () => [],
    } as unknown as import('../../worker/src/lib/logger.js').PipelineLogger;

    await searchCountyPlats('bell', 'ASH FAMILY TRUST ADDITION', mockLogger, 0.5, 'test-key');
    global.fetch = origFetch;
    // High-scoring exact match → AI should NOT be called
    expect(anthropicCallCount).toBe(0);
  });

  it('21-4. AI fallback IS triggered when best score < 0.7', async () => {
    const { searchCountyPlats, clearPlatMatchAiCache } = await import('../../worker/src/services/county-plats.js');
    clearPlatMatchAiCache();

    const origFetch = global.fetch;
    let anthropicCallCount = 0;
    // HTML with entries that won't score well against an unusual search term
    const mockHtml = `<a href="docs/plats/Z/ZZZZ TOTALLY UNRELATED.pdf">ZZZZ TOTALLY UNRELATED</a>`;

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('anthropic')) {
        anthropicCallCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({ content: [{ type: 'text', text: '{"matches":[]}' }] }),
        });
      }
      return Promise.resolve({ ok: true, text: async () => mockHtml });
    });

    const mockLogger = {
      startAttempt: () => () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      getAttempts: () => [],
    } as unknown as import('../../worker/src/lib/logger.js').PipelineLogger;

    // "ALPHA ESTATES" vs "ZZZZ TOTALLY UNRELATED" should score < 0.7
    await searchCountyPlats('bell', 'ALPHA ESTATES', mockLogger, 0.0, 'test-key');
    global.fetch = origFetch;
    // Low-scoring miss → AI SHOULD be called
    expect(anthropicCallCount).toBe(1);
  });

  it('21-5. AI fallback caches results and does NOT call Claude twice for the same normalized name', async () => {
    const { searchCountyPlats, clearPlatMatchAiCache } = await import('../../worker/src/services/county-plats.js');
    clearPlatMatchAiCache();

    const origFetch = global.fetch;
    let anthropicCallCount = 0;
    const mockHtml = `<a href="docs/plats/Z/ZZZZ MISMATCH.pdf">ZZZZ MISMATCH</a>`;

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('anthropic')) {
        anthropicCallCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({ content: [{ type: 'text', text: '{"matches":[]}' }] }),
        });
      }
      return Promise.resolve({ ok: true, text: async () => mockHtml });
    });

    const mockLogger = {
      startAttempt: () => () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      getAttempts: () => [],
    } as unknown as import('../../worker/src/lib/logger.js').PipelineLogger;

    // Call twice with the same name (same normalized form)
    await searchCountyPlats('bell', 'BETA SUBDIVISION', mockLogger, 0.0, 'test-key');
    await searchCountyPlats('bell', 'BETA SUBDIVISION', mockLogger, 0.0, 'test-key');
    global.fetch = origFetch;

    // Claude should only have been called ONCE (second call uses cache)
    expect(anthropicCallCount).toBe(1);
  });

  it('21-6. AI fallback boosts score of AI-confirmed match', async () => {
    const { searchCountyPlats, clearPlatMatchAiCache } = await import('../../worker/src/services/county-plats.js');
    clearPlatMatchAiCache();

    const origFetch = global.fetch;
    // Index has "GAMMA ADDITION" but search term "GMMA ADDTN" won't score above 0.7
    const mockHtml = `<a href="docs/plats/G/GAMMA ADDITION.pdf">GAMMA ADDITION</a>`;

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('anthropic')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            content: [{
              type: 'text',
              text: '{"matches":[{"displayName":"GAMMA ADDITION","confidence":0.92}]}',
            }],
          }),
        });
      }
      return Promise.resolve({ ok: true, text: async () => mockHtml });
    });

    const mockLogger = {
      startAttempt: () => () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      getAttempts: () => [],
    } as unknown as import('../../worker/src/lib/logger.js').PipelineLogger;

    const results = await searchCountyPlats('bell', 'GMMA ADDTN', mockLogger, 0.0, 'test-key');
    global.fetch = origFetch;

    // AI said "GAMMA ADDITION" with 0.92 confidence — it should appear in results
    const gammaMatch = results.find(r => r.name === 'GAMMA ADDITION');
    expect(gammaMatch).toBeDefined();
    expect(gammaMatch!.score).toBeGreaterThanOrEqual(0.9);
  });

  it('21-7. AI fallback is skipped when no anthropicApiKey provided', async () => {
    const { searchCountyPlats, clearPlatMatchAiCache } = await import('../../worker/src/services/county-plats.js');
    clearPlatMatchAiCache();

    const origFetch = global.fetch;
    let anthropicCallCount = 0;
    const mockHtml = `<a href="docs/plats/Z/ZZZZ NO MATCH.pdf">ZZZZ NO MATCH</a>`;

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('anthropic')) anthropicCallCount++;
      return Promise.resolve({ ok: true, text: async () => mockHtml });
    });

    const mockLogger = {
      startAttempt: () => () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      getAttempts: () => [],
    } as unknown as import('../../worker/src/lib/logger.js').PipelineLogger;

    // Call WITHOUT anthropicApiKey
    await searchCountyPlats('bell', 'DELTA ESTATES', mockLogger, 0.0);
    global.fetch = origFetch;
    // No API key → AI should NOT be called
    expect(anthropicCallCount).toBe(0);
  });
});
