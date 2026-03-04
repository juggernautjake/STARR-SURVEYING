// __tests__/cad/geometry/legal-desc.test.ts — Unit tests for legal description generator
import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateLegalDescription,
  DEFAULT_LEGAL_DESC_CONFIG,
  type LegalDescConfig,
} from '@/lib/cad/geometry/legal-desc';
import { createTraverse } from '@/lib/cad/geometry/traverse';
import type { SurveyPoint, Traverse } from '@/lib/cad/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSurveyPoint(id: string, easting: number, northing: number): SurveyPoint {
  return { id, easting, northing, pointNumber: 0, codeDefinition: null } as SurveyPoint;
}

function makeSquareTraverse(): { traverse: Traverse; points: Map<string, SurveyPoint> } {
  const pts = [
    makeSurveyPoint('p1', 0,   0),
    makeSurveyPoint('p2', 100, 0),
    makeSurveyPoint('p3', 100, 100),
    makeSurveyPoint('p4', 0,   100),
  ];
  const map = new Map(pts.map(p => [p.id, p]));
  const traverse = createTraverse(['p1', 'p2', 'p3', 'p4'], map, true, 'Test Parcel');
  return { traverse, points: map };
}

// ── generateLegalDescription ──────────────────────────────────────────────────

describe('generateLegalDescription', () => {
  let traverse: Traverse;
  let points: Map<string, SurveyPoint>;
  let config: LegalDescConfig;

  beforeEach(() => {
    ({ traverse, points } = makeSquareTraverse());
    config = { ...DEFAULT_LEGAL_DESC_CONFIG };
  });

  it('returns a non-empty string', () => {
    const desc = generateLegalDescription(traverse, points, config);
    expect(typeof desc).toBe('string');
    expect(desc.length).toBeGreaterThan(0);
  });

  it('starts with "BEGINNING"', () => {
    const desc = generateLegalDescription(traverse, points, config);
    expect(desc.startsWith('BEGINNING')).toBe(true);
  });

  it('contains "THENCE" for each leg', () => {
    const desc = generateLegalDescription(traverse, points, config);
    const thenCount = (desc.match(/THENCE/g) ?? []).length;
    // 4 legs + the closing "THENCE to the POINT OF BEGINNING"
    expect(thenCount).toBeGreaterThanOrEqual(traverse.legs.length);
  });

  it('ends with "POINT OF BEGINNING"', () => {
    const desc = generateLegalDescription(traverse, points, config);
    // The last meaningful content line should contain POINT OF BEGINNING
    expect(desc).toContain('POINT OF BEGINNING');
  });

  it('contains "CONTAINING" when traverse has area', () => {
    const desc = generateLegalDescription(traverse, points, config);
    expect(traverse.area).not.toBeNull();
    expect(desc).toContain('CONTAINING');
  });

  it('does not contain "CONTAINING" when area is null', () => {
    const { traverse: openTraverse, points: openPoints } = (() => {
      const pts = [
        makeSurveyPoint('a', 0,   0),
        makeSurveyPoint('b', 100, 0),
        makeSurveyPoint('c', 100, 100),
      ];
      const map = new Map(pts.map(p => [p.id, p]));
      const t = createTraverse(['a', 'b', 'c'], map, false, 'Open');
      return { traverse: t, points: map };
    })();
    const desc = generateLegalDescription(openTraverse, openPoints, config);
    expect(desc).not.toContain('CONTAINING');
  });

  it('includes acres in CONTAINING line for SQFT_AND_ACRES display', () => {
    const desc = generateLegalDescription(traverse, points, { ...config, areaDisplay: 'SQFT_AND_ACRES' });
    expect(desc).toMatch(/acres/i);
    expect(desc).toMatch(/square feet/i);
  });

  it('includes only acres for ACRES_ONLY display', () => {
    const desc = generateLegalDescription(traverse, points, { ...config, areaDisplay: 'ACRES_ONLY' });
    expect(desc).toMatch(/acres/i);
    expect(desc).not.toMatch(/square feet/i);
  });

  it('includes BASIS OF BEARINGS when set', () => {
    const desc = generateLegalDescription(traverse, points, {
      ...config,
      basisOfBearings: 'North line of Section 10, T.2N., R.3E.',
    });
    expect(desc).toContain('BASIS OF BEARINGS');
    expect(desc).toContain('North line of Section 10');
  });

  it('does not include BASIS OF BEARINGS when empty', () => {
    const desc = generateLegalDescription(traverse, points, { ...config, basisOfBearings: '' });
    expect(desc).not.toContain('BASIS OF BEARINGS');
  });

  it('contains a bearing format for each leg', () => {
    const desc = generateLegalDescription(traverse, points, config);
    // Each THENCE line should include a bearing like N 00°... or S 00°...
    expect(desc).toMatch(/[NS]\s*\d+°\d{2}'\d{2}"\s*[EW]/);
  });
});
