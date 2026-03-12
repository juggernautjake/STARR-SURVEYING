// __tests__/recon/bell-county-research.test.ts
// Unit tests for Bell County property research — classifier + cascade orchestrator.
//
// Covers (pure-logic, zero network calls):
//   Module A — BellPropertyClassifier (bell-county-classifier.ts)
//   Module B — BellCountyKnownIdentifiers state management (bell-county-research.ts)
//   Module C — selectPrimaryProperty ranking
//   Module D — parseDeedReferences integration
//   Module E — Address helpers (rural address detection, normalization)
//
// All tests are self-contained.  No live network calls are made.

import { describe, it, expect, vi } from 'vitest';

// ══════════════════════════════════════════════════════════════════════════════
// MODULE A — BellPropertyClassifier
// ══════════════════════════════════════════════════════════════════════════════

describe('BellPropertyClassifier (bell-county-classifier.ts)', () => {

  // ── A-1: detectPropertyTypeCode ──────────────────────────────────────────

  it('A-1. detectPropertyTypeCode returns R for blank code and standard legal', async () => {
    const { detectPropertyTypeCode } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(detectPropertyTypeCode(null, 'SUNRIDGE ESTATES, BLOCK A, LOT 3', null)).toBe('R');
  });

  it('A-2. detectPropertyTypeCode respects explicit type code', async () => {
    const { detectPropertyTypeCode } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(detectPropertyTypeCode('AG', 'SOME RANCH DESCRIPTION', null)).toBe('AG');
    expect(detectPropertyTypeCode('MH', null, null)).toBe('MH');
    expect(detectPropertyTypeCode('M', 'MINERAL INT HARTRICK SVY', null)).toBe('M');
  });

  it('A-3. detectPropertyTypeCode infers BP from legal description', async () => {
    const { detectPropertyTypeCode } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(detectPropertyTypeCode(null, 'BUSINESS PERSONAL PROPERTY - ABC CORP', null)).toBe('BP');
    expect(detectPropertyTypeCode('', 'personal property / starr surveying', null)).toBe('BP');
  });

  it('A-4. detectPropertyTypeCode infers MH from legal description', async () => {
    const { detectPropertyTypeCode } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(detectPropertyTypeCode(null, 'MOBILE HOME SITE LEASE LOT 4', null)).toBe('MH');
  });

  it('A-5. detectPropertyTypeCode infers M from mineral description', async () => {
    const { detectPropertyTypeCode } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(detectPropertyTypeCode(null, 'MINERAL INTEREST HARTRICK SVY A-488', null)).toBe('M');
  });

  it('A-6. detectPropertyTypeCode infers U from pipeline description', async () => {
    const { detectPropertyTypeCode } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(detectPropertyTypeCode(null, 'PIPELINE ROW 2.35 AC HARTRICK SVY', null)).toBe('U');
  });

  // ── A-7: classifyLegalDescription ────────────────────────────────────────

  it('A-7. classifyLegalDescription — named_addition', async () => {
    const { classifyLegalDescription } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(classifyLegalDescription('ASH FAMILY TRUST 12.358 ACRE ADDITION, BLOCK 001, LOT 0002'))
      .toBe('named_addition');
  });

  it('A-8. classifyLegalDescription — platted_subdivision', async () => {
    const { classifyLegalDescription } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(classifyLegalDescription('SUNRIDGE ESTATES PHASE 2, BLOCK A, LOT 3'))
      .toBe('platted_subdivision');
    expect(classifyLegalDescription('LOT 3, BLOCK A, SUNRIDGE ESTATES'))
      .toBe('platted_subdivision');
  });

  it('A-9. classifyLegalDescription — abstract_survey', async () => {
    const { classifyLegalDescription } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(classifyLegalDescription('WILLIAM HARTRICK SURVEY A-488'))
      .toBe('abstract_survey');
  });

  it('A-10. classifyLegalDescription — rural_acreage', async () => {
    const { classifyLegalDescription } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(classifyLegalDescription('12.358 AC OUT OF WH SURVEY A-488'))
      .toBe('rural_acreage');
    expect(classifyLegalDescription('4.375 ACRES OUT OF ABS 512'))
      .toBe('rural_acreage');
  });

  it('A-11. classifyLegalDescription — personal_property', async () => {
    const { classifyLegalDescription } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(classifyLegalDescription('BUSINESS PERSONAL PROPERTY / STARR SURVEYING'))
      .toBe('personal_property');
  });

  it('A-12. classifyLegalDescription — mobile_home_site', async () => {
    const { classifyLegalDescription } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(classifyLegalDescription('MH SITE LEASE LOT 4'))
      .toBe('mobile_home_site');
  });

  it('A-13. classifyLegalDescription — mineral_interest', async () => {
    const { classifyLegalDescription } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(classifyLegalDescription('MINERAL INT HARTRICK SURVEY A-488'))
      .toBe('mineral_interest');
  });

  it('A-14. classifyLegalDescription — utility_line', async () => {
    const { classifyLegalDescription } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(classifyLegalDescription('PIPELINE ROW 2.35 AC'))
      .toBe('utility_line');
  });

  it('A-15. classifyLegalDescription — unknown for null', async () => {
    const { classifyLegalDescription } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(classifyLegalDescription(null)).toBe('unknown');
    expect(classifyLegalDescription('')).toBe('unknown');
  });

  // ── A-16: extractSubdivisionNameFromLegal ────────────────────────────────

  it('A-16. extractSubdivisionNameFromLegal — named addition', async () => {
    const { extractSubdivisionNameFromLegal } = await import('../../worker/src/services/bell-county-classifier.js');
    const result = extractSubdivisionNameFromLegal(
      'ASH FAMILY TRUST 12.358 ACRE ADDITION, BLOCK 001, LOT 0002',
    );
    expect(result).toBe('ASH FAMILY TRUST 12.358 ACRE ADDITION');
  });

  it('A-17. extractSubdivisionNameFromLegal — standard subdivision', async () => {
    const { extractSubdivisionNameFromLegal } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(extractSubdivisionNameFromLegal('SUNRIDGE ESTATES PHASE 2, BLOCK A, LOT 3'))
      .toBe('SUNRIDGE ESTATES PHASE 2');
  });

  it('A-18. extractSubdivisionNameFromLegal — reversed LOT/BLOCK format', async () => {
    const { extractSubdivisionNameFromLegal } = await import('../../worker/src/services/bell-county-classifier.js');
    const result = extractSubdivisionNameFromLegal('LOT 3, BLOCK A, SUNRIDGE ESTATES');
    expect(result).toBe('SUNRIDGE ESTATES');
  });

  it('A-19. extractSubdivisionNameFromLegal — returns null for abstract survey', async () => {
    const { extractSubdivisionNameFromLegal } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(extractSubdivisionNameFromLegal('WILLIAM HARTRICK SURVEY A-488')).toBeNull();
  });

  it('A-20. extractSubdivisionNameFromLegal — returns null for null', async () => {
    const { extractSubdivisionNameFromLegal } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(extractSubdivisionNameFromLegal(null)).toBeNull();
  });

  // ── A-21: extractAbstractSurveyName ──────────────────────────────────────

  it('A-21. extractAbstractSurveyName — full survey name', async () => {
    const { extractAbstractSurveyName } = await import('../../worker/src/services/bell-county-classifier.js');
    const result = extractAbstractSurveyName('WILLIAM HARTRICK SURVEY A-488');
    expect(result).toContain('SURVEY A-488');
  });

  it('A-22. extractAbstractSurveyName — abstract number only', async () => {
    const { extractAbstractSurveyName } = await import('../../worker/src/services/bell-county-classifier.js');
    const result = extractAbstractSurveyName('12.358 AC OUT OF ABS 488');
    expect(result).toBe('ABSTRACT 488');
  });

  it('A-23. extractAbstractSurveyName — returns null for platted description', async () => {
    const { extractAbstractSurveyName } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(extractAbstractSurveyName('SUNRIDGE ESTATES, BLOCK A, LOT 3')).toBeNull();
  });

  // ── A-24: extractDescribedAcreage ─────────────────────────────────────────

  it('A-24. extractDescribedAcreage — "12.358 ACRE ADDITION"', async () => {
    const { extractDescribedAcreage } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(extractDescribedAcreage('ASH FAMILY TRUST 12.358 ACRE ADDITION, BLOCK 001'))
      .toBe(12.358);
  });

  it('A-25. extractDescribedAcreage — "4.375 AC OUT OF"', async () => {
    const { extractDescribedAcreage } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(extractDescribedAcreage('4.375 AC OUT OF WH SURVEY A-488')).toBe(4.375);
  });

  it('A-26. extractDescribedAcreage — returns null when no acreage', async () => {
    const { extractDescribedAcreage } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(extractDescribedAcreage('SUNRIDGE ESTATES, BLOCK A, LOT 3')).toBeNull();
    expect(extractDescribedAcreage(null)).toBeNull();
  });

  it('A-27. extractDescribedAcreage — returns most precise value', async () => {
    const { extractDescribedAcreage } = await import('../../worker/src/services/bell-county-classifier.js');
    // Should return 12.358 (3 decimals) not 12 (0 decimals)
    expect(extractDescribedAcreage('APPROX 12 ACRES, MORE PRECISELY 12.358 ACRES'))
      .toBe(12.358);
  });

  // ── A-28: extractLotBlock ─────────────────────────────────────────────────

  it('A-28. extractLotBlock — BLOCK then LOT', async () => {
    const { extractLotBlock } = await import('../../worker/src/services/bell-county-classifier.js');
    const { lot, block } = extractLotBlock('BLOCK A, LOT 3');
    expect(block).toBe('A');
    expect(lot).toBe('3');
  });

  it('A-29. extractLotBlock — LOT then BLOCK', async () => {
    const { extractLotBlock } = await import('../../worker/src/services/bell-county-classifier.js');
    const { lot, block } = extractLotBlock('LOT 3, BLOCK A');
    expect(lot).toBe('3');
    expect(block).toBe('A');
  });

  it('A-30. extractLotBlock — Bell CAD zero-padded format', async () => {
    const { extractLotBlock } = await import('../../worker/src/services/bell-county-classifier.js');
    const { lot, block } = extractLotBlock('BLOCK 001, LOT 0002');
    expect(block).toBe('001');
    expect(lot).toBe('0002');
  });

  it('A-31. extractLotBlock — null for abstract survey', async () => {
    const { extractLotBlock } = await import('../../worker/src/services/bell-county-classifier.js');
    const { lot, block } = extractLotBlock('WILLIAM HARTRICK SURVEY A-488');
    expect(lot).toBeNull();
    expect(block).toBeNull();
  });

  // ── A-32: classifyBellProperty (full classification) ─────────────────────

  it('A-32. classifyBellProperty — platted subdivision', async () => {
    const { classifyBellProperty } = await import('../../worker/src/services/bell-county-classifier.js');
    const c = classifyBellProperty('R', 'SUNRIDGE ESTATES PHASE 2, BLOCK A, LOT 3', 'JOHN SMITH');
    expect(c.typeCode).toBe('R');
    expect(c.isPlatted).toBe(true);
    expect(c.isPersonalProperty).toBe(false);
    expect(c.strategy.searchPlatArchive).toBe(true);
    expect(c.strategy.expectedDocTypes).toContain('plat');
  });

  it('A-33. classifyBellProperty — personal property pivots to land', async () => {
    const { classifyBellProperty } = await import('../../worker/src/services/bell-county-classifier.js');
    const c = classifyBellProperty('BP', 'BUSINESS PERSONAL PROPERTY / STARR SURVEYING', 'STARR SURVEYING INC');
    expect(c.isPersonalProperty).toBe(true);
    expect(c.strategy.pivotToLandAccount).toBe(true);
    expect(c.strategy.searchByAddress).toBe(false);
  });

  it('A-34. classifyBellProperty — agricultural rural acreage', async () => {
    const { classifyBellProperty } = await import('../../worker/src/services/bell-county-classifier.js');
    const c = classifyBellProperty('AG', '125.00 AC OUT OF HARTRICK SURVEY A-488', 'JONES RANCH LLC');
    expect(c.typeCode).toBe('AG');
    expect(c.isRuralAcreage).toBe(true);
    expect(c.strategy.deedChainSearch).toBe(true);
    expect(c.strategy.searchByInstruments).toBe(true);
  });

  it('A-35. classifyBellProperty — mineral interest', async () => {
    const { classifyBellProperty } = await import('../../worker/src/services/bell-county-classifier.js');
    const c = classifyBellProperty('M', 'MINERAL INT HARTRICK SVY A-488', null);
    expect(c.typeCode).toBe('M');
    expect(c.hasMineralInterest).toBe(true);
    expect(c.strategy.lookupSurfaceTract).toBe(true);
  });

  it('A-36. classifyBellProperty — mobile home', async () => {
    const { classifyBellProperty } = await import('../../worker/src/services/bell-county-classifier.js');
    const c = classifyBellProperty('MH', 'MH SITE LEASE LOT 4', null);
    expect(c.isMobileHome).toBe(true);
    expect(c.strategy.searchRelatedParcels).toBe(true);
  });

  it('A-37. classifyBellProperty — named addition strategy', async () => {
    const { classifyBellProperty } = await import('../../worker/src/services/bell-county-classifier.js');
    const c = classifyBellProperty(
      'R',
      'ASH FAMILY TRUST 12.358 ACRE ADDITION, BLOCK 001, LOT 0002',
      'ASH FAMILY TRUST',
    );
    expect(c.isPlatted).toBe(true);
    expect(c.subdivisionName).toBe('ASH FAMILY TRUST 12.358 ACRE ADDITION');
    expect(c.strategy.searchPlatArchive).toBe(true);
    expect(c.describedAcreage).toBe(12.358);
  });

  it('A-38. classifyBellProperty — strategy rationale is a non-empty string', async () => {
    const { classifyBellProperty } = await import('../../worker/src/services/bell-county-classifier.js');
    const c = classifyBellProperty('R', 'SUNRIDGE ESTATES, BLOCK A, LOT 3', 'JOHN SMITH');
    expect(typeof c.strategyRationale).toBe('string');
    expect(c.strategyRationale.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// MODULE B — BellCountyKnownIdentifiers state management
// ══════════════════════════════════════════════════════════════════════════════

describe('BellCountyKnownIdentifiers state management (bell-county-research.ts)', () => {

  it('B-1. createSearchState seeds address and variants', async () => {
    const { createSearchState } = await import('../../worker/src/services/bell-county-research.js');
    const state = createSearchState({ address: '3779 FM 436, Belton, TX 76513' });
    expect(state.rawAddress).toBe('3779 FM 436, Belton, TX 76513');
    expect(state.addresses.length).toBeGreaterThan(0);
    expect(state.isRuralAddress).toBe(true);
    expect(state.ruralRouteNumber).toBe('436');
  });

  it('B-2. createSearchState seeds propertyId', async () => {
    const { createSearchState } = await import('../../worker/src/services/bell-county-research.js');
    const state = createSearchState({ propertyId: '498826' });
    expect(state.propertyIds).toContain('498826');
    expect(state.isRuralAddress).toBe(false);
  });

  it('B-3. createSearchState seeds ownerName as uppercase', async () => {
    const { createSearchState } = await import('../../worker/src/services/bell-county-research.js');
    const state = createSearchState({ ownerName: 'Ash Family Trust' });
    expect(state.ownerNames).toContain('ASH FAMILY TRUST');
  });

  it('B-4. createSearchState seeds instrument numbers', async () => {
    const { createSearchState } = await import('../../worker/src/services/bell-county-research.js');
    const state = createSearchState({ instrumentNumbers: ['2010043440', '2023032044'] });
    expect(state.instrumentNumbers).toContain('2010043440');
    expect(state.instrumentNumbers).toContain('2023032044');
  });

  it('B-5. createSearchState deduplicates instrument numbers', async () => {
    const { createSearchState } = await import('../../worker/src/services/bell-county-research.js');
    const state = createSearchState({ instrumentNumbers: ['2010043440', '2010043440'] });
    expect(state.instrumentNumbers.filter((n) => n === '2010043440').length).toBe(1);
  });

  it('B-6. ingestCADResult adds propertyId and ownerName', async () => {
    const { createSearchState, ingestCADResult } = await import('../../worker/src/services/bell-county-research.js');
    const { PipelineLogger } = await import('../../worker/src/lib/logger.js');
    const logger = new PipelineLogger('test-b6');
    const state = createSearchState({});
    ingestCADResult(state, {
      propertyId: '524311',
      geoId: '61B01',
      ownerName: 'ASH FAMILY TRUST',
      legalDescription: 'ASH FAMILY TRUST 12.358 ACRE ADDITION, BLOCK 001, LOT 0002',
      acreage: 12.358,
      propertyType: 'R',
      situsAddress: '3779 FM 436 BELTON TX 76513',
      source: 'Bell CAD',
      layer: 'test',
      matchConfidence: 1.0,
      validationNotes: [],
    }, logger);

    expect(state.propertyIds).toContain('524311');
    expect(state.ownerNames).toContain('ASH FAMILY TRUST');
    expect(state.legalDescriptions.length).toBe(1);
    expect(state.hasRealProperty).toBe(true);
    expect(state.hasPersonalProperty).toBe(false);
  });

  it('B-7. ingestCADResult extracts subdivision name', async () => {
    const { createSearchState, ingestCADResult } = await import('../../worker/src/services/bell-county-research.js');
    const { PipelineLogger } = await import('../../worker/src/lib/logger.js');
    const logger = new PipelineLogger('test-b7');
    const state = createSearchState({});
    ingestCADResult(state, {
      propertyId: '524311',
      geoId: null,
      ownerName: 'ASH FAMILY TRUST',
      legalDescription: 'ASH FAMILY TRUST 12.358 ACRE ADDITION, BLOCK 001, LOT 0002',
      acreage: 12.358,
      propertyType: 'R',
      situsAddress: null,
      source: 'Bell CAD',
      layer: 'test',
      matchConfidence: 1.0,
      validationNotes: [],
    }, logger);
    expect(state.subdivisionNames).toContain('ASH FAMILY TRUST 12.358 ACRE ADDITION');
  });

  it('B-8. ingestCADResult extracts instruments from deed history', async () => {
    const { createSearchState, ingestCADResult } = await import('../../worker/src/services/bell-county-research.js');
    const { PipelineLogger } = await import('../../worker/src/lib/logger.js');
    const logger = new PipelineLogger('test-b8');
    const state = createSearchState({});
    ingestCADResult(state, {
      propertyId: '524311',
      geoId: null,
      ownerName: 'ASH FAMILY TRUST',
      legalDescription: 'TEST LEGAL DESC',
      acreage: null,
      propertyType: 'R',
      situsAddress: null,
      source: 'Bell CAD',
      layer: 'test',
      matchConfidence: 1.0,
      validationNotes: [],
      deedHistory: [
        { instrumentNumber: '2010043440', deedDate: '01/01/2010' },
        { instrumentNumber: '2023032044', deedDate: '01/01/2023' },
      ],
    }, logger);
    expect(state.instrumentNumbers).toContain('2010043440');
    expect(state.instrumentNumbers).toContain('2023032044');
  });

  it('B-9. ingestCADResult deduplicates owner names', async () => {
    const { createSearchState, ingestCADResult } = await import('../../worker/src/services/bell-county-research.js');
    const { PipelineLogger } = await import('../../worker/src/lib/logger.js');
    const logger = new PipelineLogger('test-b9');
    const state = createSearchState({ ownerName: 'ASH FAMILY TRUST' });
    ingestCADResult(state, {
      propertyId: '524311',
      geoId: null,
      ownerName: 'Ash Family Trust',  // different case
      legalDescription: null,
      acreage: null,
      propertyType: 'R',
      situsAddress: null,
      source: 'Bell CAD',
      layer: 'test',
      matchConfidence: 1.0,
      validationNotes: [],
    }, logger);
    // Should not have duplicates
    expect(state.ownerNames.filter((n) => n === 'ASH FAMILY TRUST').length).toBe(1);
  });

  it('B-10. ingestCADResult sets hasPersonalProperty for BP type', async () => {
    const { createSearchState, ingestCADResult } = await import('../../worker/src/services/bell-county-research.js');
    const { PipelineLogger } = await import('../../worker/src/lib/logger.js');
    const logger = new PipelineLogger('test-b10');
    const state = createSearchState({});
    ingestCADResult(state, {
      propertyId: '498826',
      geoId: null,
      ownerName: 'STARR SURVEYING',
      legalDescription: 'BUSINESS PERSONAL PROPERTY',
      acreage: null,
      propertyType: 'BP',
      situsAddress: null,
      source: 'Bell CAD',
      layer: 'test',
      matchConfidence: 1.0,
      validationNotes: [],
    }, logger);
    expect(state.hasPersonalProperty).toBe(true);
    expect(state.hasRealProperty).toBe(false);
  });

  it('B-11. ingestDeedHistory adds new instrument numbers', async () => {
    const { createSearchState, ingestDeedHistory } = await import('../../worker/src/services/bell-county-research.js');
    const { PipelineLogger } = await import('../../worker/src/lib/logger.js');
    const logger = new PipelineLogger('test-b11');
    const state = createSearchState({ instrumentNumbers: ['2010043440'] });
    ingestDeedHistory(state, [
      { instrumentNumber: '2023032044', deedDate: '01/01/2023' },
      { instrumentNumber: '2010043440' }, // duplicate
      { instrumentNumber: '2015067890', volume: '1234', page: '567' },
    ], logger);
    expect(state.instrumentNumbers.length).toBe(3);
    expect(state.instrumentNumbers).toContain('2023032044');
    expect(state.instrumentNumbers).toContain('2015067890');
    expect(state.volumePages).toContainEqual({ volume: '1234', page: '567' });
  });

  it('B-12. summarizeSearchState produces non-empty string', async () => {
    const { createSearchState, summarizeSearchState, ingestCADResult } = await import('../../worker/src/services/bell-county-research.js');
    const { PipelineLogger } = await import('../../worker/src/lib/logger.js');
    const logger = new PipelineLogger('test-b12');
    const state = createSearchState({ propertyId: '524311', ownerName: 'ASH FAMILY TRUST' });
    ingestCADResult(state, {
      propertyId: '524311',
      geoId: null,
      ownerName: 'ASH FAMILY TRUST',
      legalDescription: 'ASH FAMILY TRUST 12.358 ACRE ADDITION, BLOCK 001, LOT 0002',
      acreage: 12.358,
      propertyType: 'R',
      situsAddress: null,
      source: 'Bell CAD',
      layer: 'test',
      matchConfidence: 1.0,
      validationNotes: [],
    }, logger);
    const summary = summarizeSearchState(state);
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain('524311');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// MODULE C — selectPrimaryProperty ranking
// ══════════════════════════════════════════════════════════════════════════════

describe('selectPrimaryProperty ranking (bell-county-research.ts)', () => {

  it('C-1. returns null for empty array', async () => {
    const { selectPrimaryProperty } = await import('../../worker/src/services/bell-county-research.js');
    expect(selectPrimaryProperty([])).toBeNull();
  });

  it('C-2. returns sole element from single-element array', async () => {
    const { selectPrimaryProperty } = await import('../../worker/src/services/bell-county-research.js');
    const p = {
      propertyId: '1', geoId: null, ownerName: 'A', legalDescription: 'X',
      acreage: 1, propertyType: 'R', situsAddress: null,
      source: '', layer: '', matchConfidence: 0.9, validationNotes: [],
    };
    expect(selectPrimaryProperty([p])).toBe(p);
  });

  it('C-3. prefers real property over personal property', async () => {
    const { selectPrimaryProperty } = await import('../../worker/src/services/bell-county-research.js');
    const bp = {
      propertyId: 'BP1', geoId: null, ownerName: 'X', legalDescription: 'BPP',
      acreage: null, propertyType: 'BP', situsAddress: null,
      source: '', layer: '', matchConfidence: 0.95, validationNotes: [],
    };
    const real = {
      propertyId: 'R1', geoId: null, ownerName: 'X', legalDescription: 'LOT 3, BLOCK A, ESTATES',
      acreage: 1.0, propertyType: 'R', situsAddress: null,
      source: '', layer: '', matchConfidence: 0.90, validationNotes: [],
    };
    const result = selectPrimaryProperty([bp, real]);
    expect(result?.propertyId).toBe('R1');
  });

  it('C-4. prefers higher match confidence within same type', async () => {
    const { selectPrimaryProperty } = await import('../../worker/src/services/bell-county-research.js');
    const low = {
      propertyId: 'L1', geoId: null, ownerName: 'X', legalDescription: 'DESC',
      acreage: 1, propertyType: 'R', situsAddress: null,
      source: '', layer: '', matchConfidence: 0.7, validationNotes: [],
    };
    const high = {
      propertyId: 'H1', geoId: null, ownerName: 'X', legalDescription: 'DESC',
      acreage: 1, propertyType: 'R', situsAddress: null,
      source: '', layer: '', matchConfidence: 0.95, validationNotes: [],
    };
    expect(selectPrimaryProperty([low, high])?.propertyId).toBe('H1');
  });

  it('C-5. prefers more complete data (all 3 fields) over partial', async () => {
    const { selectPrimaryProperty } = await import('../../worker/src/services/bell-county-research.js');
    const partial = {
      propertyId: 'P1', geoId: null, ownerName: null, legalDescription: null,
      acreage: null, propertyType: 'R', situsAddress: null,
      source: '', layer: '', matchConfidence: 0.8, validationNotes: [],
    };
    const complete = {
      propertyId: 'C1', geoId: null, ownerName: 'OWNER', legalDescription: 'LEGAL',
      acreage: 5.0, propertyType: 'R', situsAddress: null,
      source: '', layer: '', matchConfidence: 0.8, validationNotes: [],
    };
    expect(selectPrimaryProperty([partial, complete])?.propertyId).toBe('C1');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// MODULE D — parseDeedReferences integration
// ══════════════════════════════════════════════════════════════════════════════

describe('parseDeedReferences (pipeline.ts)', () => {

  it('D-1. parses Inst prefix', async () => {
    const { parseDeedReferences } = await import('../../worker/src/services/pipeline.js');
    const r = parseDeedReferences('Inst 2010043440');
    expect(r.instrumentNumbers).toContain('2010043440');
  });

  it('D-2. parses bare 10-digit instrument number', async () => {
    const { parseDeedReferences } = await import('../../worker/src/services/pipeline.js');
    const r = parseDeedReferences('See 2010043440 for prior deed');
    expect(r.instrumentNumbers).toContain('2010043440');
  });

  it('D-3. parses Vol/Page references', async () => {
    const { parseDeedReferences } = await import('../../worker/src/services/pipeline.js');
    const r = parseDeedReferences('Vol 7687 Pg 112');
    expect(r.volumePages).toContainEqual({ volume: '7687', page: '112' });
  });

  it('D-4. parses OPR format', async () => {
    const { parseDeedReferences } = await import('../../worker/src/services/pipeline.js');
    const r = parseDeedReferences('OPR/7687/112');
    expect(r.volumePages).toContainEqual({ volume: '7687', page: '112' });
  });

  it('D-5. parses cabinet/slide plat refs', async () => {
    const { parseDeedReferences } = await import('../../worker/src/services/pipeline.js');
    const r = parseDeedReferences('Cabinet A Slide 5');
    expect(r.platRefs).toContainEqual({ cabinet: 'A', slide: '5' });
  });

  it('D-6. returns empty arrays for plain text', async () => {
    const { parseDeedReferences } = await import('../../worker/src/services/pipeline.js');
    const r = parseDeedReferences('SUNRIDGE ESTATES PHASE 2, BLOCK A, LOT 3');
    expect(r.instrumentNumbers).toHaveLength(0);
    expect(r.volumePages).toHaveLength(0);
    expect(r.platRefs).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// MODULE E — Bell County address helpers
// ══════════════════════════════════════════════════════════════════════════════

describe('Bell County address helpers (bell-county-classifier.ts)', () => {

  it('E-1. isBellCountyRuralAddress — FM road', async () => {
    const { isBellCountyRuralAddress } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(isBellCountyRuralAddress('3779 FM 436, Belton, TX 76513')).toBe(true);
  });

  it('E-2. isBellCountyRuralAddress — County Road', async () => {
    const { isBellCountyRuralAddress } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(isBellCountyRuralAddress('1234 CR 352, Temple, TX')).toBe(true);
  });

  it('E-3. isBellCountyRuralAddress — State Highway', async () => {
    const { isBellCountyRuralAddress } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(isBellCountyRuralAddress('5678 SH 317, Belton, TX')).toBe(true);
  });

  it('E-4. isBellCountyRuralAddress — city street returns false', async () => {
    const { isBellCountyRuralAddress } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(isBellCountyRuralAddress('100 Main St, Belton, TX 76513')).toBe(false);
  });

  it('E-5. extractBellCountyRouteNumber — FM 436', async () => {
    const { extractBellCountyRouteNumber } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(extractBellCountyRouteNumber('3779 FM 436, Belton, TX')).toBe('436');
  });

  it('E-6. extractBellCountyRouteNumber — CR 352', async () => {
    const { extractBellCountyRouteNumber } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(extractBellCountyRouteNumber('1234 CR 352, Temple, TX')).toBe('352');
  });

  it('E-7. extractBellCountyRouteNumber — returns null for city address', async () => {
    const { extractBellCountyRouteNumber } = await import('../../worker/src/services/bell-county-classifier.js');
    expect(extractBellCountyRouteNumber('100 Main St, Belton, TX')).toBeNull();
  });

  it('E-8. normalizeBellCountyAddress — strips FM prefix', async () => {
    const { normalizeBellCountyAddress } = await import('../../worker/src/services/bell-county-classifier.js');
    const variants = normalizeBellCountyAddress('3779 FM 436, Belton, TX');
    expect(variants.length).toBeGreaterThan(1);
    // One variant should not have "FM" in the road reference
    const hasStrippedVariant = variants.some((v) => v.includes('436') && !v.match(/FM\s+436/i));
    expect(hasStrippedVariant).toBe(true);
  });

  it('E-9. normalizeBellCountyAddress — city address returns single variant', async () => {
    const { normalizeBellCountyAddress } = await import('../../worker/src/services/bell-county-classifier.js');
    const variants = normalizeBellCountyAddress('100 Main St, Belton, TX');
    expect(variants.length).toBeGreaterThanOrEqual(1);
    expect(variants[0]).toBe('100 Main St, Belton, TX');
  });

  it('E-10. normalizeBellCountyAddress — deduplicates identical variants', async () => {
    const { normalizeBellCountyAddress } = await import('../../worker/src/services/bell-county-classifier.js');
    const variants = normalizeBellCountyAddress('3779 FM 436, Belton, TX');
    const unique = [...new Set(variants)];
    expect(unique.length).toBe(variants.length);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// MODULE F — BellCountyResearch integration: createSearchState + ingest round-trip
// ══════════════════════════════════════════════════════════════════════════════

describe('BellCountyResearch — full state round-trip (bell-county-research.ts)', () => {

  it('F-1. round-trip: address → seed → ingest CAD → state has all identifiers', async () => {
    const { createSearchState, ingestCADResult, summarizeSearchState } = await import(
      '../../worker/src/services/bell-county-research.js'
    );
    const { PipelineLogger } = await import('../../worker/src/lib/logger.js');
    const logger = new PipelineLogger('test-f1');

    const state = createSearchState({ address: '3779 FM 436, Belton, TX 76513' });
    expect(state.isRuralAddress).toBe(true);
    expect(state.ruralRouteNumber).toBe('436');

    // Simulate CAD returning a result
    ingestCADResult(state, {
      propertyId: '524311',
      geoId: '61B0100001',
      ownerName: 'ASH FAMILY TRUST',
      legalDescription: 'ASH FAMILY TRUST 12.358 ACRE ADDITION, BLOCK 001, LOT 0002',
      acreage: 12.358,
      propertyType: 'R',
      situsAddress: '3779 FM 436 BELTON TX',
      source: 'Bell CAD',
      layer: 'test',
      matchConfidence: 1.0,
      validationNotes: [],
      mapId: '61B01',
      deedHistory: [
        { instrumentNumber: '2010043440', deedDate: '06/15/2010' },
        { instrumentNumber: '2023032044', deedDate: '03/20/2023' },
      ],
    }, logger);

    // All identifier types should be populated
    expect(state.propertyIds).toContain('524311');
    expect(state.geoIds).toContain('61B0100001');
    expect(state.mapIds).toContain('61B01');
    expect(state.ownerNames).toContain('ASH FAMILY TRUST');
    expect(state.legalDescriptions.length).toBe(1);
    expect(state.instrumentNumbers).toContain('2010043440');
    expect(state.instrumentNumbers).toContain('2023032044');
    expect(state.subdivisionNames).toContain('ASH FAMILY TRUST 12.358 ACRE ADDITION');
    expect(state.acreageValues).toContain(12.358);
    expect(state.situsAddresses.length).toBe(1);
    expect(state.hasRealProperty).toBe(true);
    expect(state.hasPersonalProperty).toBe(false);

    // Summary should include key identifiers
    const summary = summarizeSearchState(state);
    expect(summary).toContain('524311');
  });

  it('F-2. round-trip: BP account → ingest → flags set correctly', async () => {
    const { createSearchState, ingestCADResult } = await import(
      '../../worker/src/services/bell-county-research.js'
    );
    const { PipelineLogger } = await import('../../worker/src/lib/logger.js');
    const logger = new PipelineLogger('test-f2');

    const state = createSearchState({ address: '3779 FM 436, Belton, TX 76513' });
    ingestCADResult(state, {
      propertyId: '498826',
      geoId: null,
      ownerName: 'STARR SURVEYING',
      legalDescription: 'BUSINESS PERSONAL PROPERTY / STARR SURVEYING',
      acreage: null,
      propertyType: 'BP',
      situsAddress: '3779 FM 436 BELTON TX',
      source: 'Bell CAD',
      layer: 'test',
      matchConfidence: 0.9,
      validationNotes: [],
      mapId: '61B01',
    }, logger);

    expect(state.hasPersonalProperty).toBe(true);
    expect(state.hasRealProperty).toBe(false);

    // Classification should recommend pivot
    const classification = state.classifications[0];
    expect(classification.isPersonalProperty).toBe(true);
    expect(classification.strategy.pivotToLandAccount).toBe(true);
  });

  it('F-3. multiple CAD results — state accumulates across all', async () => {
    const { createSearchState, ingestCADResult } = await import(
      '../../worker/src/services/bell-county-research.js'
    );
    const { PipelineLogger } = await import('../../worker/src/lib/logger.js');
    const logger = new PipelineLogger('test-f3');

    const state = createSearchState({});
    const base = {
      geoId: null, acreage: null, propertyType: 'R',
      situsAddress: null, source: '', layer: '', matchConfidence: 0.9,
      validationNotes: [],
    };
    ingestCADResult(state, { ...base, propertyId: '111', ownerName: 'SMITH, JOHN', legalDescription: 'LOT 1, BLOCK A, SMITH ADD, BLOCK A' }, logger);
    ingestCADResult(state, { ...base, propertyId: '222', ownerName: 'SMITH, JOHN', legalDescription: 'LOT 2, BLOCK A, SMITH ADD, BLOCK A' }, logger);
    ingestCADResult(state, { ...base, propertyId: '333', ownerName: 'SMITH, JOHN', legalDescription: 'LOT 3, BLOCK A, SMITH ADD, BLOCK A' }, logger);

    expect(state.propertyIds).toHaveLength(3);
    // Owner name should be deduped
    expect(state.ownerNames.filter((n) => n === 'SMITH, JOHN').length).toBe(1);
    expect(state.legalDescriptions).toHaveLength(3);
    expect(state.hasRealProperty).toBe(true);
  });
});
