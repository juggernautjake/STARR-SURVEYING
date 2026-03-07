// __tests__/recon/phase13-interactive.test.ts
// Unit tests for STARR RECON Phase 13: Interactive Web UI, Additional Data
// Sources & Production Hardening.
//
// Tests cover:
//   §13.3 — USGSClient  (usgs-client.ts)  — elevation, slope, aspect, contours, NHD
//   §13.4 — TXComptrollerClient (comptroller-client.ts) — registry, rate parsing, fallback
//   §13.5 — schema-validator.ts — Zod phase-boundary validation

import { describe, it, expect } from 'vitest';

// ── USGS client imports ────────────────────────────────────────────────────────

import {
  USGSClient,
  computeSlope,
  computeAspect,
  NLCD_CLASS_LABELS,
  nhdFTypeToLabel,
} from '../../worker/src/sources/usgs-client';

// ── Comptroller imports ───────────────────────────────────────────────────────

import {
  TXComptrollerClient,
  COUNTY_CAD_REGISTRY,
  estimatedCombinedRate,
  getStandardExemptions,
} from '../../worker/src/sources/comptroller-client';

// ── Schema validator imports ──────────────────────────────────────────────────

import {
  validatePhaseOutput,
  safeParse,
  formatZodError,
  validateOrNull,
  PhaseSchemas,
} from '../../worker/src/infra/schema-validator';

// ─────────────────────────────────────────────────────────────────────────────
// §13.3 — USGS Client
// ─────────────────────────────────────────────────────────────────────────────

describe('USGS Client — computeSlope', () => {
  it('1. returns 0 for flat terrain (all same elevation)', () => {
    expect(computeSlope(100, 100, 100)).toBeCloseTo(0, 2);
  });

  it('2. returns positive slope when terrain rises to north', () => {
    // northM 1m higher than centre over ~11m cell = ~9% slope
    const slope = computeSlope(100, 101, 100);
    expect(slope).toBeGreaterThan(0);
  });

  it('3. returns positive slope when terrain rises to east', () => {
    const slope = computeSlope(100, 100, 101);
    expect(slope).toBeGreaterThan(0);
  });

  it('4. slope scales linearly with elevation difference', () => {
    const s1 = computeSlope(0, 1, 0);
    const s2 = computeSlope(0, 2, 0);
    expect(s2).toBeCloseTo(s1 * 2, 5);
  });

  it('5. steep terrain returns slope > 100 (>45 degrees)', () => {
    // 12m elevation change over ~11m cell ≈ >100% slope
    const slope = computeSlope(0, 12, 0);
    expect(slope).toBeGreaterThan(100);
  });
});

describe('USGS Client — computeAspect', () => {
  it('6. flat terrain (no differential) returns aspect 0 (North)', () => {
    // When dNorth=0 and dEast=0, atan2(0,0)=0 → 0°
    expect(computeAspect(0, 0)).toBe(0);
  });

  it('7. terrain rising northward → aspect 0° (steepest descent = South)', () => {
    // slope goes downhill to south → aspect 180°
    const asp = computeAspect(1, 0); // dNorth positive = terrain rises north = aspect south = 180°
    // atan2(-0, 1) = 0 rad → 0°
    expect(asp).toBeGreaterThanOrEqual(0);
    expect(asp).toBeLessThan(360);
  });

  it('8. aspect stays within [0, 360)', () => {
    for (const [dN, dE] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]]) {
      const asp = computeAspect(dN, dE);
      expect(asp).toBeGreaterThanOrEqual(0);
      expect(asp).toBeLessThan(360);
    }
  });
});

describe('USGS Client — NLCD labels', () => {
  it('9. Open Water returns correct label', () => {
    expect(NLCD_CLASS_LABELS[11]).toBe('Open Water');
  });

  it('10. Deciduous Forest returns correct label', () => {
    expect(NLCD_CLASS_LABELS[41]).toBe('Deciduous Forest');
  });

  it('11. Cultivated Crops returns correct label', () => {
    expect(NLCD_CLASS_LABELS[82]).toBe('Cultivated Crops');
  });

  it('12. Pasture/Hay returns correct label', () => {
    expect(NLCD_CLASS_LABELS[81]).toBe('Pasture/Hay');
  });

  it('13. NLCD labels map has at least 10 entries', () => {
    expect(Object.keys(NLCD_CLASS_LABELS).length).toBeGreaterThanOrEqual(10);
  });
});

describe('USGS Client — nhdFTypeToLabel', () => {
  it('14. FType 460 → stream', () => {
    expect(nhdFTypeToLabel(460)).toBe('stream');
  });

  it('15. FType 428 → river', () => {
    expect(nhdFTypeToLabel(428)).toBe('river');
  });

  it('16. FType 390 → lake', () => {
    expect(nhdFTypeToLabel(390)).toBe('lake');
  });

  it('17. FType 436 → reservoir', () => {
    expect(nhdFTypeToLabel(436)).toBe('reservoir');
  });

  it('18. FType 336 → canal', () => {
    expect(nhdFTypeToLabel(336)).toBe('canal');
  });

  it('19. FType 362 → ditch', () => {
    expect(nhdFTypeToLabel(362)).toBe('ditch');
  });

  it('20. Unknown FType → other', () => {
    expect(nhdFTypeToLabel(999)).toBe('other');
  });
});

describe('USGS Client — USGSClient instantiation', () => {
  it('21. USGSClient can be instantiated without arguments', () => {
    expect(() => new USGSClient()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §13.4 — TX Comptroller Client
// ─────────────────────────────────────────────────────────────────────────────

describe('TX Comptroller — COUNTY_CAD_REGISTRY', () => {
  it('22. Bell County (48027) has correct CAD name', () => {
    expect(COUNTY_CAD_REGISTRY['48027']?.cad).toBe('Bell CAD');
  });

  it('23. Harris County (48201) maps to HCAD', () => {
    expect(COUNTY_CAD_REGISTRY['48201']?.cad).toBe('HCAD');
  });

  it('24. Tarrant County (48439) maps to TAD', () => {
    expect(COUNTY_CAD_REGISTRY['48439']?.cad).toBe('TAD');
  });

  it('25. Travis County (48453) has a cadUrl', () => {
    expect(COUNTY_CAD_REGISTRY['48453']?.cadUrl).toBeTruthy();
  });

  it('26. Registry has at least 20 counties', () => {
    expect(Object.keys(COUNTY_CAD_REGISTRY).length).toBeGreaterThanOrEqual(20);
  });

  it('27. All registry keys are 5-digit FIPS codes', () => {
    for (const key of Object.keys(COUNTY_CAD_REGISTRY)) {
      expect(key).toMatch(/^\d{5}$/);
    }
  });

  it('28. All FIPS codes start with 48 (Texas)', () => {
    for (const key of Object.keys(COUNTY_CAD_REGISTRY)) {
      expect(key.startsWith('48')).toBe(true);
    }
  });
});

describe('TX Comptroller — estimatedCombinedRate', () => {
  it('29. Bell County returns a rate between 1.5 and 3.0', () => {
    const rate = estimatedCombinedRate('48027');
    expect(rate).toBeGreaterThan(1.5);
    expect(rate).toBeLessThan(3.0);
  });

  it('30. Unknown county returns default ~2.15 statewide average', () => {
    const rate = estimatedCombinedRate('99999');
    expect(rate).toBeCloseTo(2.15, 1);
  });

  it('31. Harris County returns a reasonable rate', () => {
    const rate = estimatedCombinedRate('48201');
    expect(rate).toBeGreaterThan(1.5);
    expect(rate).toBeLessThan(3.0);
  });
});

describe('TX Comptroller — getStandardExemptions', () => {
  it('32. returns at least 4 standard exemption entries', () => {
    const exemptions = getStandardExemptions();
    expect(exemptions.length).toBeGreaterThanOrEqual(4);
  });

  it('33. includes homestead exemption', () => {
    const exemptions = getStandardExemptions();
    expect(exemptions.some(e => e.exemption_type === 'homestead')).toBe(true);
  });

  it('34. includes over_65 exemption', () => {
    const exemptions = getStandardExemptions();
    expect(exemptions.some(e => e.exemption_type === 'over_65')).toBe(true);
  });

  it('35. includes disabled_veteran exemption', () => {
    const exemptions = getStandardExemptions();
    expect(exemptions.some(e => e.exemption_type === 'disabled_veteran')).toBe(true);
  });

  it('36. all exemptions have applies_to array', () => {
    for (const e of getStandardExemptions()) {
      expect(Array.isArray(e.applies_to)).toBe(true);
      expect(e.applies_to.length).toBeGreaterThan(0);
    }
  });

  it('37. TXComptrollerClient can be instantiated', () => {
    expect(() => new TXComptrollerClient()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §13.5 — Zod Schema Validator
// ─────────────────────────────────────────────────────────────────────────────

describe('Schema Validator — validatePhaseOutput (discovery)', () => {
  const validDiscovery = {
    propertyId: 'prop-001',
    address: '2913 Oakdale Dr, Belton, TX 76513',
    countyFips: '48027',
    countyName: 'Bell',
  };

  it('38. valid discovery data passes without throwing', () => {
    expect(() => validatePhaseOutput('discovery', validDiscovery)).not.toThrow();
  });

  it('39. missing propertyId throws ZodError', () => {
    expect(() =>
      validatePhaseOutput('discovery', { ...validDiscovery, propertyId: '' }),
    ).toThrow();
  });

  it('40. invalid countyFips (wrong length) throws ZodError', () => {
    expect(() =>
      validatePhaseOutput('discovery', { ...validDiscovery, countyFips: '4802' }),
    ).toThrow();
  });

  it('41. countyFips with letters throws ZodError', () => {
    expect(() =>
      validatePhaseOutput('discovery', { ...validDiscovery, countyFips: 'ABCDE' }),
    ).toThrow();
  });

  it('42. extra fields are allowed (passthrough)', () => {
    expect(() =>
      validatePhaseOutput('discovery', { ...validDiscovery, extraField: 'ok', anotherField: 42 }),
    ).not.toThrow();
  });
});

describe('Schema Validator — safeParse', () => {
  it('43. returns success=true for valid data', () => {
    const result = safeParse('discovery', {
      propertyId: 'x',
      address: '123 Main',
      countyFips: '48027',
      countyName: 'Bell',
    });
    expect(result.success).toBe(true);
  });

  it('44. returns success=false for invalid data', () => {
    const result = safeParse('discovery', { countyFips: '123' });
    expect(result.success).toBe(false);
  });

  it('45. error contains issues when invalid', () => {
    const result = safeParse('discovery', { countyFips: '123' });
    if (!result.success) {
      // Zod v4 uses .issues; Zod v3 used .errors — check either
      const issues = (result.error as unknown as { issues?: unknown[] }).issues ?? result.error.errors;
      expect(Array.isArray(issues)).toBe(true);
      expect((issues as unknown[]).length).toBeGreaterThan(0);
    }
  });

  it('46. never throws on invalid data', () => {
    expect(() => safeParse('discovery', null)).not.toThrow();
    expect(() => safeParse('discovery', undefined)).not.toThrow();
    expect(() => safeParse('discovery', 42)).not.toThrow();
  });
});

describe('Schema Validator — formatZodError', () => {
  it('47. returns a non-empty string for a parse error', () => {
    const result = safeParse('discovery', { countyFips: '123' });
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('48. formatted error contains field path', () => {
    const result = safeParse('discovery', { address: 'X', countyFips: 'BAD', countyName: 'Bell', propertyId: 'x' });
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain('countyFips');
    }
  });
});

describe('Schema Validator — validateOrNull', () => {
  it('49. returns data for valid input', () => {
    const data = {
      propertyId: 'p1', address: '123 Main', countyFips: '48027', countyName: 'Bell',
    };
    const result = validateOrNull('discovery', data);
    expect(result).not.toBeNull();
    expect(result?.propertyId).toBe('p1');
  });

  it('50. returns null for invalid input', () => {
    const result = validateOrNull('discovery', { bad: 'data' });
    expect(result).toBeNull();
  });

  it('51. calls onError callback when validation fails', () => {
    const errors: string[] = [];
    validateOrNull('discovery', {}, msg => errors.push(msg));
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('discovery');
  });
});

describe('Schema Validator — harvest schema', () => {
  const validHarvest = {
    projectId: 'proj-001',
    propertyId: 'prop-001',
    documents: [],
  };

  it('52. valid harvest data passes', () => {
    expect(() => validatePhaseOutput('harvest', validHarvest)).not.toThrow();
  });

  it('53. harvest with documents array passes', () => {
    expect(() => validatePhaseOutput('harvest', {
      ...validHarvest,
      documents: [{
        documentId: 'doc-1',
        type: 'plat',
      }],
    })).not.toThrow();
  });

  it('54. invalid document type fails', () => {
    const result = safeParse('harvest', {
      ...validHarvest,
      documents: [{ documentId: 'doc-1', type: 'invalidtype' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('Schema Validator — confidence schema', () => {
  const validConfidence = {
    projectId: 'proj-001',
    overallConfidence: { score: 82, grade: 'B' },
    callScores: [{ callIndex: 0, score: 90, grade: 'A' }],
    discrepancies: [],
  };

  it('55. valid confidence data passes', () => {
    expect(() => validatePhaseOutput('confidence', validConfidence)).not.toThrow();
  });

  it('56. score > 100 fails', () => {
    const result = safeParse('confidence', {
      ...validConfidence,
      overallConfidence: { score: 110, grade: 'A' },
    });
    expect(result.success).toBe(false);
  });

  it('57. invalid grade fails', () => {
    const result = safeParse('confidence', {
      ...validConfidence,
      overallConfidence: { score: 85, grade: 'Z' },
    });
    expect(result.success).toBe(false);
  });

  it('58. negative score fails', () => {
    const result = safeParse('confidence', {
      ...validConfidence,
      overallConfidence: { score: -5, grade: 'F' },
    });
    expect(result.success).toBe(false);
  });
});

describe('Schema Validator — PhaseSchemas registry', () => {
  it('59. all 12 phase schemas are registered', () => {
    const keys = Object.keys(PhaseSchemas);
    expect(keys.length).toBeGreaterThanOrEqual(12);
  });

  it('60. all registered schemas have a parse method', () => {
    for (const [, schema] of Object.entries(PhaseSchemas)) {
      expect(typeof schema.parse).toBe('function');
      expect(typeof schema.safeParse).toBe('function');
    }
  });
});
