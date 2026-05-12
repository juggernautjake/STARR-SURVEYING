// __tests__/cad/ai/stage-2-assemble.test.ts
//
// Phase 6 Stage-2 Feature Assembly — covers acceptance items in
// `docs/planning/in-progress/STARR_CAD/STARR_CAD_PHASE_6_AI_ENGINE.md`:
//
//   §1879 — B/E suffixes build correct line strings
//   §1880 — Auto-spline codes produce spline features
//   §1881 — A-suffix sequences produce arc features via Kasa fit
//   §1882 — Closed boundary lines detected
//   §1883 — Unclosed boundary within 1.0' flagged as warning
//   §1884 — Only "final" points from groups used for features
//
// Uses real `lookupCode('PL01')` (Boundary Line, LINE connectType) so the
// auto-connect engine routes the points through its B/null/E/C state machine.
// Arc-suffix points use 'PL01' with isArcPoint=true to drive findArcRuns
// without depending on a Stage-1 round-trip.

import { describe, it, expect } from 'vitest';
import { assembleFeatures } from '@/lib/cad/ai-engine/stage-2-assemble';
import { isAutoSplineCode } from '@/lib/cad/codes/auto-connect';
import { lookupCode } from '@/lib/cad/codes/code-lookup';
import type {
  SurveyPoint,
  PointGroup,
  ParsedPointName,
  PointCodeDefinition,
  CodeSuffix,
} from '@/lib/cad/types';
import type { ClassificationResult } from '@/lib/cad/ai-engine/types';

// ── Fixture factories ────────────────────────────────────────────────────────

function makeParsedName(baseNumber: number, suffix = ''): ParsedPointName {
  return {
    baseNumber,
    suffix,
    normalizedSuffix:
      suffix === 'CALC' || suffix === 'SET' || suffix === 'FOUND'
        ? (suffix as ParsedPointName['normalizedSuffix'])
        : 'NONE',
    suffixVariant: suffix,
    suffixConfidence: 1.0,
    isRecalc: false,
    recalcSequence: 0,
  };
}

function makePoint(args: {
  id: string;
  pointNumber: number;
  baseCode: string;          // e.g. 'PL01'
  suffix: CodeSuffix | null; // B / null / E / A / C / BA / EA / CA
  easting: number;
  northing: number;
  nameSuffix?: string;       // for PointGroup distinction
  baseNumber?: number;
}): SurveyPoint {
  const def = lookupCode(args.baseCode);
  const rawCode = args.suffix ? `${args.baseCode}${args.suffix}` : args.baseCode;
  return {
    id: args.id,
    pointNumber: args.pointNumber,
    pointName: String(args.pointNumber) + (args.nameSuffix ?? ''),
    parsedName: makeParsedName(args.baseNumber ?? args.pointNumber, args.nameSuffix ?? ''),
    northing: args.northing,
    easting: args.easting,
    elevation: null,
    rawCode,
    parsedCode: {
      rawCode,
      baseCode: args.baseCode,
      isNumeric: /^\d+$/.test(args.baseCode),
      isAlpha: !/^\d+$/.test(args.baseCode),
      suffix: args.suffix,
      isValid: true,
      isLineCode: def?.connectType === 'LINE',
      isAutoSpline: def?.isAutoSpline ?? false,
    },
    resolvedAlphaCode: def?.alphaCode ?? args.baseCode,
    resolvedNumericCode: def?.numericCode ?? '',
    codeSuffix: args.suffix,
    codeDefinition: def,
    monumentAction: null,
    description: '',
    rawRecord: '',
    importSource: 'test',
    layerId: def?.defaultLayerId ?? '0',
    featureId: '',
    lineStringIds: [],
    validationIssues: [],
    confidence: 1.0,
    isAccepted: true,
  };
}

function classify(p: SurveyPoint, isArcPoint = false): ClassificationResult {
  return {
    point: p,
    resolvedCode: p.codeDefinition,
    monumentAction: p.monumentAction,
    codeSuffix: p.codeSuffix,
    isLineStart: p.codeSuffix === 'B' || p.codeSuffix === 'BA',
    isLineEnd: p.codeSuffix === 'E' || p.codeSuffix === 'EA',
    isArcPoint:
      isArcPoint ||
      p.codeSuffix === 'A' ||
      p.codeSuffix === 'BA' ||
      p.codeSuffix === 'EA' ||
      p.codeSuffix === 'CA',
    isAutoSplinePoint: isAutoSplineCode(p.parsedCode.baseCode),
    flags: [],
    flagMessages: [],
  };
}

/** No grouping: each point is its own group with finalPoint=itself. */
function noGroups(): Map<number, PointGroup> {
  return new Map();
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 6 Stage 2 — Feature Assembly helpers', () => {
  // §1880 — see existing isAutoSplineCode tests; kept here for the
  // 7-code coverage cohort.
  it('§1880 — isAutoSplineCode recognises the hard-coded set', () => {
    expect(isAutoSplineCode('TP06')).toBe(true);
    expect(isAutoSplineCode('TP07')).toBe(true);
    expect(isAutoSplineCode('VG07')).toBe(true);
    expect(isAutoSplineCode('FN11')).toBe(true);
    expect(isAutoSplineCode('630')).toBe(true);
    expect(isAutoSplineCode('632')).toBe(true);
    expect(isAutoSplineCode('357')).toBe(true);
  });

  it('§1880 — isAutoSplineCode is case-insensitive', () => {
    expect(isAutoSplineCode('tp06')).toBe(true);
    expect(isAutoSplineCode('vg07')).toBe(true);
  });

  it('§1880 — isAutoSplineCode returns false for non-spline codes', () => {
    expect(isAutoSplineCode('BC02')).toBe(false);
    expect(isAutoSplineCode('IRF')).toBe(false);
    expect(isAutoSplineCode('UNKNOWN')).toBe(false);
    expect(isAutoSplineCode('')).toBe(false);
  });

  // §1879 — B / null / E suffix sequence → one POLYLINE with the right
  // vertex order and segment-type chain.
  it('§1879 — B → null → null → E builds a POLYLINE with 4 vertices and 3 STRAIGHT segments', () => {
    const pts = [
      makePoint({ id: 'a', pointNumber: 1, baseCode: 'PL01', suffix: 'B', easting: 0,   northing: 0   }),
      makePoint({ id: 'b', pointNumber: 2, baseCode: 'PL01', suffix: null, easting: 100, northing: 0   }),
      makePoint({ id: 'c', pointNumber: 3, baseCode: 'PL01', suffix: null, easting: 100, northing: 50  }),
      makePoint({ id: 'd', pointNumber: 4, baseCode: 'PL01', suffix: 'E',  easting: 0,   northing: 50  }),
    ];
    const result = assembleFeatures(pts.map((p) => classify(p)), noGroups());
    expect(result.lineStrings).toHaveLength(1);
    const ls = result.lineStrings[0];
    expect(ls.pointIds).toEqual(['a', 'b', 'c', 'd']);
    expect(ls.isClosed).toBe(false);
    expect(ls.segments).toEqual(['STRAIGHT', 'STRAIGHT', 'STRAIGHT']);
    expect(result.stats.lineStringsBuilt).toBe(1);
    expect(result.stats.closedPolygonsDetected).toBe(0);
  });

  // §1881 — A-suffix run on a LINE feature → ARC feature via Kasa fit.
  // Points sit on a circle of radius 100 centered at (0,0).
  it('§1881 — A-suffix sequence on circle samples produces an ARC feature via Kasa fit', () => {
    // Quarter-circle samples at 0°, 30°, 60°, 90° around (0,0), r=100.
    const deg = (d: number) => (d * Math.PI) / 180;
    const pts = [
      makePoint({ id: 'a', pointNumber: 1, baseCode: 'PL01', suffix: 'B',
        easting: 100 * Math.cos(deg(0)),  northing: 100 * Math.sin(deg(0)) }),
      makePoint({ id: 'b', pointNumber: 2, baseCode: 'PL01', suffix: 'A',
        easting: 100 * Math.cos(deg(30)), northing: 100 * Math.sin(deg(30)) }),
      makePoint({ id: 'c', pointNumber: 3, baseCode: 'PL01', suffix: 'A',
        easting: 100 * Math.cos(deg(60)), northing: 100 * Math.sin(deg(60)) }),
      makePoint({ id: 'd', pointNumber: 4, baseCode: 'PL01', suffix: 'EA',
        easting: 100 * Math.cos(deg(90)), northing: 100 * Math.sin(deg(90)) }),
    ];
    const result = assembleFeatures(pts.map((p) => classify(p)), noGroups());
    expect(result.curveFeatures.length).toBeGreaterThanOrEqual(1);
    const arc = result.curveFeatures[0];
    expect(arc.type).toBe('ARC');
    // Kasa is algebraic so accept ~1ft tolerance on the radius
    const fittedRadius = (arc.geometry as { type: 'ARC'; arc: { radius: number } }).arc.radius;
    expect(fittedRadius).toBeGreaterThan(99);
    expect(fittedRadius).toBeLessThan(101);
    expect(result.stats.arcsFound).toBeGreaterThanOrEqual(1);
  });

  // §1882 — B → null → C produces a closed polygon (PL01 = boundary code).
  it('§1882 — B → null → C builds a closed POLYGON, not an unclosed POLYLINE', () => {
    const pts = [
      makePoint({ id: 'a', pointNumber: 1, baseCode: 'PL01', suffix: 'B', easting: 0,   northing: 0   }),
      makePoint({ id: 'b', pointNumber: 2, baseCode: 'PL01', suffix: null, easting: 100, northing: 0   }),
      makePoint({ id: 'c', pointNumber: 3, baseCode: 'PL01', suffix: null, easting: 100, northing: 50  }),
      makePoint({ id: 'd', pointNumber: 4, baseCode: 'PL01', suffix: 'C',  easting: 0,   northing: 50  }),
    ];
    const result = assembleFeatures(pts.map((p) => classify(p)), noGroups());
    expect(result.lineStrings).toHaveLength(0); // closed → routed to closedPolygons
    expect(result.closedPolygons).toHaveLength(1);
    expect(result.closedPolygons[0].type).toBe('POLYGON');
    expect(result.stats.closedPolygonsDetected).toBe(1);
  });

  // §1883 — boundary line string with first/last points 0.5' apart →
  // UNCLOSED_BOUNDARY warning. 1.5' apart → no warning.
  it('§1883 — boundary line string with gap < 1.0\' flags UNCLOSED_BOUNDARY', () => {
    const pts = [
      makePoint({ id: 'a', pointNumber: 1, baseCode: 'PL01', suffix: 'B', easting: 0,    northing: 0   }),
      makePoint({ id: 'b', pointNumber: 2, baseCode: 'PL01', suffix: null, easting: 100, northing: 0   }),
      makePoint({ id: 'c', pointNumber: 3, baseCode: 'PL01', suffix: null, easting: 100, northing: 50  }),
      // Last point lands 0.5' from the first → gap=0.5', under the 1.0' threshold
      makePoint({ id: 'd', pointNumber: 4, baseCode: 'PL01', suffix: 'E',  easting: 0.5,  northing: 0   }),
    ];
    const result = assembleFeatures(pts.map((p) => classify(p)), noGroups());
    const warning = result.warnings.find((w) => w.type === 'UNCLOSED_BOUNDARY');
    expect(warning).toBeDefined();
    expect(warning!.pointIds).toEqual(['a', 'b', 'c', 'd']);
    expect(warning!.severity).toBe('WARNING');
  });

  it('§1883 — boundary line string with gap > 1.0\' does NOT flag UNCLOSED_BOUNDARY', () => {
    const pts = [
      makePoint({ id: 'a', pointNumber: 1, baseCode: 'PL01', suffix: 'B', easting: 0,    northing: 0   }),
      makePoint({ id: 'b', pointNumber: 2, baseCode: 'PL01', suffix: null, easting: 100, northing: 0   }),
      makePoint({ id: 'c', pointNumber: 3, baseCode: 'PL01', suffix: 'E',  easting: 0,    northing: 50  }),
    ];
    const result = assembleFeatures(pts.map((p) => classify(p)), noGroups());
    const warning = result.warnings.find((w) => w.type === 'UNCLOSED_BOUNDARY');
    expect(warning).toBeUndefined();
  });

  // §1884 — When a PointGroup has a SET point alongside CALC points, only
  // the SET point ("final") feeds into feature assembly; the CALC points
  // are filtered out by selectFinalPoints.
  it('§1884 — selectFinalPoints filters out non-final group members', () => {
    // BC01 = "3/8" Iron Rod Found", connectType: 'POINT'.
    const setPoint = makePoint({
      id: 'set', pointNumber: 1, baseCode: 'BC01', suffix: null,
      easting: 100, northing: 100, baseNumber: 1, nameSuffix: 'set',
    });
    const calcPoint = makePoint({
      id: 'calc', pointNumber: 2, baseCode: 'BC01', suffix: null,
      easting: 99, northing: 101, baseNumber: 1, nameSuffix: 'calc',
    });
    const group: PointGroup = {
      baseNumber: 1,
      allPoints: [calcPoint, setPoint],
      calculated: [calcPoint],
      found: null,
      set: setPoint,
      none: [],
      finalPoint: setPoint,
      finalSource: 'SET',
      calcSetDelta: 1.41,
      calcFoundDelta: null,
      hasBothCalcAndField: true,
      deltaWarning: false,
    };
    const groups = new Map<number, PointGroup>([[1, group]]);
    const result = assembleFeatures(
      [classify(calcPoint), classify(setPoint)],
      groups,
    );
    // Only one POINT feature should be emitted (the SET point); the CALC
    // counterpart is dropped because it's not the group's final point.
    expect(result.pointFeatures).toHaveLength(1);
    expect(result.pointFeatures[0].properties.aiPointIds).toBe('set');
    expect(result.stats.pointFeaturesCreated).toBe(1);
  });
});
