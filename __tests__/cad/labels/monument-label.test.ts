// __tests__/cad/labels/monument-label.test.ts — Unit tests for monument labels
import { describe, it, expect } from 'vitest';
import {
  getMonumentText,
  createMonumentLabel,
  computeMonumentLabelPosition,
  pickBestOffsetAngle,
  DEFAULT_MONUMENT_LABEL_CONFIG,
} from '@/lib/cad/labels/monument-label';
import type { SurveyPoint } from '@/lib/cad/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mkPoint(overrides: Partial<SurveyPoint> = {}): SurveyPoint {
  return {
    id: 'pt-1',
    pointNumber: 1,
    pointName: 'PT1',
    parsedName: { baseNumber: 1, suffix: '', normalizedSuffix: 'NONE', suffixVariant: '', suffixConfidence: 1, isRecalc: false, recalcSequence: 0 },
    northing: 1000,
    easting: 2000,
    elevation: null,
    rawCode: 'BC02',
    parsedCode: { rawCode: 'BC02', baseCode: 'BC', isNumeric: false, isAlpha: true, suffix: null, isValid: true, isLineCode: false, isAutoSpline: false },
    resolvedAlphaCode: 'BC',
    resolvedNumericCode: '2',
    codeSuffix: null,
    codeDefinition: {
      alphaCode: 'BC',
      numericCode: '2',
      description: '1/2" Iron Rod',
      category: 'BOUNDARY_CONTROL',
      subcategory: 'IRON_ROD',
      connectType: 'POINT',
      isAutoSpline: false,
      defaultSymbolId: 'IRF',
      defaultLineTypeId: 'SOLID',
      defaultColor: '#000000',
      defaultLineWeight: 0.25,
      defaultLayerId: 'BOUNDARY-MON',
      defaultLabelFormat: '{name}',
      simplifiedCode: 'BC02',
      simplifiedDescription: '1/2" IRF',
      collapses: false,
      monumentAction: null,
      monumentSize: '1/2"',
      monumentType: 'IRF',
      isBuiltIn: true,
      isNew: false,
      notes: '',
    },
    monumentAction: 'FOUND',
    description: '',
    rawRecord: '',
    importSource: 'test',
    layerId: 'BOUNDARY-MON',
    featureId: 'feat-1',
    lineStringIds: [],
    validationIssues: [],
    confidence: 1,
    isAccepted: true,
    ...overrides,
  };
}

// ── getMonumentText ───────────────────────────────────────────────────────────

describe('getMonumentText', () => {
  it('BC02 + FOUND → full text "1/2\" Iron Rod Found"', () => {
    const pt = mkPoint({ monumentAction: 'FOUND', resolvedNumericCode: '2' });
    const { full, abbreviated } = getMonumentText(pt);
    expect(full).toBe('1/2" Iron Rod Found');
    // Abbreviated keeps the conventional surveyor shorthand.
    expect(abbreviated).toBe('1/2" IRF');
  });

  it('BC07 + SET → full text "5/8\" Iron Rod Set w/Cap"', () => {
    const pt = mkPoint({ monumentAction: 'SET', resolvedNumericCode: '7' });
    const { full, abbreviated } = getMonumentText(pt);
    expect(full).toBe('5/8" Iron Rod Set w/Cap');
    expect(abbreviated).toBe('5/8" IRS');
  });

  it('BC02 + SET → abbreviated is "1/2\" IRS"', () => {
    const pt = mkPoint({ monumentAction: 'SET', resolvedNumericCode: '2' });
    const { abbreviated } = getMonumentText(pt);
    expect(abbreviated).toContain('1/2"');
    expect(abbreviated).toContain('IRS');
  });

  it('CALCULATED action adds "(Calc)" suffix', () => {
    const pt = mkPoint({ monumentAction: 'CALCULATED' });
    const { full } = getMonumentText(pt);
    expect(full).toContain('Calc');
  });

  it('non-boundary-control point uses description as text', () => {
    const pt = mkPoint({
      codeDefinition: {
        ...(mkPoint().codeDefinition!),
        category: 'STRUCTURES' as const,
        description: 'Fence Post',
      },
    });
    const { full } = getMonumentText(pt);
    expect(full).toContain('Fence Post');
  });

  it('null codeDefinition falls back to rawCode', () => {
    const pt = mkPoint({ codeDefinition: null });
    const { full } = getMonumentText(pt);
    expect(full.length).toBeGreaterThan(0);
  });
});

// ── createMonumentLabel ───────────────────────────────────────────────────────

describe('createMonumentLabel', () => {
  it('has type MONUMENT_LABEL', () => {
    const label = createMonumentLabel(mkPoint(), DEFAULT_MONUMENT_LABEL_CONFIG);
    expect(label.type).toBe('MONUMENT_LABEL');
  });

  it('has priority 2', () => {
    const label = createMonumentLabel(mkPoint(), DEFAULT_MONUMENT_LABEL_CONFIG);
    expect(label.priority).toBe(2);
  });

  it('position matches point northing/easting', () => {
    const pt = mkPoint({ northing: 5000, easting: 6000 });
    const label = createMonumentLabel(pt, DEFAULT_MONUMENT_LABEL_CONFIG);
    expect(label.position).toEqual({ x: 6000, y: 5000 });
  });

  it('pointId matches point.id', () => {
    const label = createMonumentLabel(mkPoint(), DEFAULT_MONUMENT_LABEL_CONFIG);
    expect(label.pointId).toBe('pt-1');
  });

  it('hasLeader is true by default', () => {
    const label = createMonumentLabel(mkPoint(), DEFAULT_MONUMENT_LABEL_CONFIG);
    expect(label.hasLeader).toBe(true);
  });

  it('text is non-empty', () => {
    const label = createMonumentLabel(mkPoint(), DEFAULT_MONUMENT_LABEL_CONFIG);
    expect(label.text.length).toBeGreaterThan(0);
  });
});

// ── computeMonumentLabelPosition ──────────────────────────────────────────────

describe('computeMonumentLabelPosition', () => {
  it('offsetAngle=0 moves label to the East of the point', () => {
    const pos = computeMonumentLabelPosition({ x: 0, y: 0 }, 0, 0.15, 50);
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.y).toBeCloseTo(0, 3);
  });

  it('offsetAngle=90 moves label to the North (y+) of the point', () => {
    const pos = computeMonumentLabelPosition({ x: 0, y: 0 }, 90, 0.15, 50);
    expect(pos.x).toBeCloseTo(0, 3);
    expect(pos.y).toBeGreaterThan(0);
  });

  it('distance scales with drawingScale', () => {
    const pos50 = computeMonumentLabelPosition({ x: 0, y: 0 }, 0, 0.15, 50);
    const pos100 = computeMonumentLabelPosition({ x: 0, y: 0 }, 0, 0.15, 100);
    expect(pos100.x).toBeCloseTo(pos50.x * 2, 3);
  });
});

// ── pickBestOffsetAngle ───────────────────────────────────────────────────────

describe('pickBestOffsetAngle', () => {
  it('returns one of the 8 candidate angles when no nearby segments', () => {
    const angle = pickBestOffsetAngle({ x: 0, y: 0 }, []);
    expect([0, 45, 90, 135, 180, 225, 270, 315]).toContain(angle);
  });

  it('returns one of the 8 candidate angles', () => {
    const angle = pickBestOffsetAngle({ x: 0, y: 0 }, [
      { from: { x: -100, y: 0 }, to: { x: 100, y: 0 } }, // horizontal line
    ]);
    expect([0, 45, 90, 135, 180, 225, 270, 315]).toContain(angle);
  });

  it('avoids angles aligned with a horizontal line', () => {
    // A horizontal segment runs East-West (angle=0 rad); candidates near 0/180 are aligned.
    // The function should prefer angles most perpendicular to the line direction.
    const angle = pickBestOffsetAngle({ x: 50, y: 50 }, [
      { from: { x: 0, y: 50 }, to: { x: 100, y: 50 } }, // horizontal line to east
    ]);
    // Should NOT pick 0° (directly along the line) — should pick something orthogonal
    expect(angle).not.toBe(0);
    expect([0, 45, 90, 135, 180, 225, 270, 315]).toContain(angle);
  });
});
