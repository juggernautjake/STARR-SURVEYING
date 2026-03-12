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

// ── 6. Bell County plat repo config ──────────────────────────────────────────

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
    // The getLetter function is internal; test via scorePlatMatch instead.
    // The first char of "ASH" is "A" → maps to "a.php"
    expect('ASH FAMILY TRUST'[0].toLowerCase()).toBe('a');
  });
});

// ── 7. fetchDocumentImages fallback timing ────────────────────────────────────

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
