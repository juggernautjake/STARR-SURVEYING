// __tests__/cad/labels/auto-annotate.test.ts — Unit tests for auto-annotation engine
import { describe, it, expect } from 'vitest';
import { autoAnnotate, DEFAULT_AUTO_ANNOTATE_CONFIG } from '@/lib/cad/labels/auto-annotate';
import type { AutoAnnotateConfig } from '@/lib/cad/labels/auto-annotate';
import type { Feature, SurveyPoint, Traverse } from '@/lib/cad/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mkLineFeature(id: string, layerId: string, x1: number, y1: number, x2: number, y2: number): Feature {
  return {
    id,
    type: 'LINE',
    geometry: { type: 'LINE', start: { x: x1, y: y1 }, end: { x: x2, y: y2 } },
    layerId,
    style: { color: null, lineWeight: null, opacity: 1, lineTypeId: null, symbolId: null, symbolSize: null, symbolRotation: 0, labelVisible: null, labelFormat: null, labelOffset: { x: 0, y: 0 }, isOverride: false },
    properties: {},
  };
}

function mkPolygonFeature(id: string, layerId: string, verts: { x: number; y: number }[]): Feature {
  return {
    id,
    type: 'POLYGON',
    geometry: { type: 'POLYGON', vertices: verts },
    layerId,
    style: { color: null, lineWeight: null, opacity: 1, lineTypeId: null, symbolId: null, symbolSize: null, symbolRotation: 0, labelVisible: null, labelFormat: null, labelOffset: { x: 0, y: 0 }, isOverride: false },
    properties: {},
  };
}

function mkBoundaryControlPoint(id: string): SurveyPoint {
  return {
    id,
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
      alphaCode: 'BC', numericCode: '2', description: '1/2" IRF', category: 'BOUNDARY_CONTROL',
      subcategory: 'IRON_ROD', connectType: 'POINT', isAutoSpline: false,
      defaultSymbolId: 'IRF', defaultLineTypeId: 'SOLID', defaultColor: '#000000',
      defaultLineWeight: 0.25, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: '{name}',
      simplifiedCode: 'BC02', simplifiedDescription: '1/2" IRF', collapses: false,
      monumentAction: null, monumentSize: '1/2"', monumentType: 'IRF',
      isBuiltIn: true, isNew: false, notes: '',
    },
    monumentAction: 'FOUND',
    description: '', rawRecord: '', importSource: 'test',
    layerId: 'BOUNDARY-MON',
    featureId: 'feat-1',
    lineStringIds: [],
    validationIssues: [],
    confidence: 1,
    isAccepted: true,
  };
}

function mkClosedTraverse(id: string, pointIds: string[]): Traverse {
  return {
    id,
    name: 'Test Traverse',
    pointIds,
    isClosed: true,
    legs: [],
    closure: { linearError: 0, errorNorth: 0, errorEast: 0, errorBearing: 0, angularError: 0, precisionRatio: '1:50000', precisionDenominator: 50000, totalDistance: 400 },
    adjustedPoints: null,
    adjustmentMethod: null,
    area: { squareFeet: 10000, acres: 0.2296, method: 'COORDINATE' },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('autoAnnotate — bearing/distance dims', () => {
  const cfg: AutoAnnotateConfig = {
    ...DEFAULT_AUTO_ANNOTATE_CONFIG,
    boundaryLayerIds: ['BOUNDARY'],
    generateCurveData: false,
    generateMonumentLabels: false,
    generateAreaLabels: false,
  };

  it('generates 1 B/D dim for a single LINE on the boundary layer', () => {
    const features = [mkLineFeature('f1', 'BOUNDARY', 0, 0, 100, 0)];
    const result = autoAnnotate(features, [], [], cfg);
    expect(result.filter(a => a.type === 'BEARING_DISTANCE')).toHaveLength(1);
  });

  it('generates 0 dims for a line on a non-boundary layer', () => {
    const features = [mkLineFeature('f1', 'TOPO', 0, 0, 100, 0)];
    const result = autoAnnotate(features, [], [], cfg);
    expect(result).toHaveLength(0);
  });

  it('generates 3 dims for a POLYLINE with 4 vertices on boundary layer', () => {
    const polyline: Feature = {
      id: 'p1',
      type: 'POLYLINE',
      geometry: {
        type: 'POLYLINE',
        vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      },
      layerId: 'BOUNDARY',
      style: { color: null, lineWeight: null, opacity: 1, lineTypeId: null, symbolId: null, symbolSize: null, symbolRotation: 0, labelVisible: null, labelFormat: null, labelOffset: { x: 0, y: 0 }, isOverride: false },
      properties: {},
    };
    const result = autoAnnotate([polyline], [], [], cfg);
    expect(result.filter(a => a.type === 'BEARING_DISTANCE')).toHaveLength(3); // 3 segments
  });

  it('generates 4 dims for a closed POLYGON with 4 vertices (includes closing leg)', () => {
    const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const features = [mkPolygonFeature('poly1', 'BOUNDARY', square)];
    const result = autoAnnotate(features, [], [], cfg);
    expect(result.filter(a => a.type === 'BEARING_DISTANCE')).toHaveLength(4); // 4 sides including closing
  });

  it('all B/D dims link back to their feature', () => {
    const features = [mkLineFeature('feat-abc', 'BOUNDARY', 0, 0, 50, 50)];
    const result = autoAnnotate(features, [], [], cfg);
    expect(result[0].linkedFeatureId).toBe('feat-abc');
  });

  it('generates 0 dims when generateBearingDims=false', () => {
    const noBD: AutoAnnotateConfig = { ...cfg, generateBearingDims: false };
    const features = [mkLineFeature('f1', 'BOUNDARY', 0, 0, 100, 0)];
    const result = autoAnnotate(features, [], [], noBD);
    expect(result).toHaveLength(0);
  });
});

describe('autoAnnotate — monument labels', () => {
  const cfg: AutoAnnotateConfig = {
    ...DEFAULT_AUTO_ANNOTATE_CONFIG,
    generateBearingDims: false,
    generateCurveData: false,
    generateAreaLabels: false,
  };

  it('generates 1 monument label for 1 boundary-control point', () => {
    const points = [mkBoundaryControlPoint('pt-1')];
    const result = autoAnnotate([], points, [], cfg);
    expect(result.filter(a => a.type === 'MONUMENT_LABEL')).toHaveLength(1);
  });

  it('generates 0 monument labels for a non-boundary-control point', () => {
    const points = [{ ...mkBoundaryControlPoint('pt-1'), codeDefinition: { ...mkBoundaryControlPoint('pt-1').codeDefinition!, category: 'TOPOGRAPHY' as const } }];
    const result = autoAnnotate([], points, [], cfg);
    expect(result.filter(a => a.type === 'MONUMENT_LABEL')).toHaveLength(0);
  });

  it('generates 0 monument labels when generateMonumentLabels=false', () => {
    const noMon: AutoAnnotateConfig = { ...cfg, generateMonumentLabels: false };
    const points = [mkBoundaryControlPoint('pt-1')];
    const result = autoAnnotate([], points, [], noMon);
    expect(result).toHaveLength(0);
  });
});

describe('autoAnnotate — area labels', () => {
  const cfg: AutoAnnotateConfig = {
    ...DEFAULT_AUTO_ANNOTATE_CONFIG,
    generateBearingDims: false,
    generateCurveData: false,
    generateMonumentLabels: false,
  };

  it('generates 1 area label for a closed traverse with area', () => {
    const points = [
      { ...mkBoundaryControlPoint('p1'), easting: 0, northing: 0 },
      { ...mkBoundaryControlPoint('p2'), id: 'p2', easting: 100, northing: 0 },
      { ...mkBoundaryControlPoint('p3'), id: 'p3', easting: 100, northing: 100 },
      { ...mkBoundaryControlPoint('p4'), id: 'p4', easting: 0, northing: 100 },
    ];
    const traverses = [mkClosedTraverse('trav-1', ['p1', 'p2', 'p3', 'p4'])];
    const result = autoAnnotate([], points, traverses, cfg);
    expect(result.filter(a => a.type === 'AREA_LABEL')).toHaveLength(1);
  });

  it('generates 0 area labels for an open traverse', () => {
    const traverses = [{ ...mkClosedTraverse('t1', ['p1', 'p2']), isClosed: false, area: null }];
    const result = autoAnnotate([], [], traverses, cfg);
    expect(result).toHaveLength(0);
  });

  it('generates 0 area labels when generateAreaLabels=false', () => {
    const noArea: AutoAnnotateConfig = { ...cfg, generateAreaLabels: false };
    const points = [
      { ...mkBoundaryControlPoint('p1'), easting: 0, northing: 0 },
      { ...mkBoundaryControlPoint('p2'), id: 'p2', easting: 100, northing: 0 },
      { ...mkBoundaryControlPoint('p3'), id: 'p3', easting: 100, northing: 100 },
    ];
    const traverses = [mkClosedTraverse('t1', ['p1', 'p2', 'p3'])];
    const result = autoAnnotate([], points, traverses, noArea);
    expect(result).toHaveLength(0);
  });
});
