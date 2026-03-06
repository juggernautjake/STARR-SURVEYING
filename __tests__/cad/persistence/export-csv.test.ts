// __tests__/cad/persistence/export-csv.test.ts — Unit tests for CSV export
import { describe, it, expect } from 'vitest';
import { buildCsvRows, rowsToCsv } from '@/lib/cad/persistence/export-csv';
import type { DrawingDocument } from '@/lib/cad/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMinimalDoc(overrides: Partial<DrawingDocument> = {}): DrawingDocument {
  return {
    id: 'doc-1',
    name: 'Test Drawing',
    created: '2026-01-01T00:00:00Z',
    modified: '2026-01-01T00:00:00Z',
    author: 'Tester',
    features: {},
    layers: {
      'layer-1': {
        id: 'layer-1',
        name: 'Layer 0',
        visible: true,
        locked: false,
        frozen: false,
        color: '#000',
        lineWeight: 0.25,
        lineTypeId: 'SOLID',
        opacity: 1,
        groupId: null,
        sortOrder: 0,
        isDefault: false,
        isProtected: false,
        autoAssignCodes: [],
      },
    },
    layerOrder: ['layer-1'],
    layerGroups: {},
    layerGroupOrder: [],
    customSymbols: [],
    customLineTypes: [],
    codeStyleOverrides: {},
    globalStyleConfig: {} as DrawingDocument['globalStyleConfig'],
    settings: {
      units: 'FEET',
      gridVisible: true,
      gridMajorSpacing: 100,
      gridMinorDivisions: 10,
      gridStyle: 'LINES',
      snapEnabled: true,
      snapTypes: [],
      snapRadius: 15,
      backgroundColor: '#ffffff',
      selectionColor: '#0088ff',
      hoverColor: '#66aaff',
      gridMajorColor: '#c8c8c8',
      gridMinorColor: '#e8e8e8',
      groupSelectMode: 'GROUP_FIRST',
      boxSelectMode: 'CROSSING_EXPAND_GROUPS',
      paperSize: 'TABLOID',
      paperOrientation: 'LANDSCAPE',
      drawingScale: 50,
      codeDisplayMode: 'ALPHA',
      zoomSpeed: 1,
      zoomTowardCursor: true,
      invertScrollZoom: false,
      panSpeed: 1,
      dragThreshold: 5,
      gripSize: 6,
      gripColor: '#0088ff',
      gripFillColor: '#ffffff',
      hoverGlowEnabled: true,
      hoverGlowIntensity: 1,
      selectionLineWidth: 1.5,
      showPointLabels: true,
      showLineLabels: true,
      showDimensions: true,
      cursorCrosshairSize: 24,
      showCursorCoordinates: false,
      autoSaveEnabled: true,
      autoSaveIntervalSec: 120,
      displayPreferences: {
        linearUnit: 'FT',
        linearFormat: 'DECIMAL',
        linearDecimalPlaces: 3,
        areaUnit: 'SQ_FT',
        angleFormat: 'DMS',
        bearingFormat: 'QUADRANT',
        coordMode: 'NE',
        originNorthing: 0,
        originEasting: 0,
      },
    },
    ...overrides,
  } as DrawingDocument;
}

const BASE_STYLE = {
  color: null,
  lineWeight: null,
  opacity: 1,
  lineTypeId: null,
  symbolId: null,
  symbolSize: null,
  symbolRotation: 0,
  labelVisible: null,
  labelFormat: null,
  labelOffset: { x: 0, y: 0 },
  isOverride: false,
} as const;

// ── buildCsvRows ─────────────────────────────────────────────────────────────

describe('buildCsvRows', () => {
  it('returns empty array for document with no features', () => {
    const doc = makeMinimalDoc();
    expect(buildCsvRows(doc)).toHaveLength(0);
  });

  it('extracts a POINT feature into a row', () => {
    const doc = makeMinimalDoc({
      features: {
        'f1': {
          id: 'f1',
          type: 'POINT',
          geometry: { type: 'POINT', point: { x: 100, y: 200 } },
          layerId: 'layer-1',
          style: BASE_STYLE,
          properties: { pointNo: 1, code: 'IP', description: 'Iron Pin', elevation: 350 },
        },
      },
    });
    const rows = buildCsvRows(doc);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      pointNo: 1,
      northing: 200,
      easting: 100,
      elevation: 350,
      code: 'IP',
      description: 'Iron Pin',
      layer: 'Layer 0',
    });
  });

  it('applies origin offset to coordinates', () => {
    const doc = makeMinimalDoc({
      features: {
        'f1': {
          id: 'f1',
          type: 'POINT',
          geometry: { type: 'POINT', point: { x: 50, y: 75 } },
          layerId: 'layer-1',
          style: BASE_STYLE,
          properties: {},
        },
      },
    });
    doc.settings.displayPreferences.originNorthing = 10000;
    doc.settings.displayPreferences.originEasting = 5000;
    const rows = buildCsvRows(doc);
    expect(rows[0].northing).toBeCloseTo(10075);
    expect(rows[0].easting).toBeCloseTo(5050);
  });

  it('sorts rows by pointNo in ascending order', () => {
    const doc = makeMinimalDoc({
      features: {
        'f3': { id: 'f3', type: 'POINT', geometry: { type: 'POINT', point: { x: 0, y: 3 } }, layerId: 'layer-1', style: BASE_STYLE, properties: { pointNo: 3 } },
        'f1': { id: 'f1', type: 'POINT', geometry: { type: 'POINT', point: { x: 0, y: 1 } }, layerId: 'layer-1', style: BASE_STYLE, properties: { pointNo: 1 } },
        'f2': { id: 'f2', type: 'POINT', geometry: { type: 'POINT', point: { x: 0, y: 2 } }, layerId: 'layer-1', style: BASE_STYLE, properties: { pointNo: 2 } },
      },
    });
    const rows = buildCsvRows(doc);
    expect(rows.map((r) => r.pointNo)).toEqual([1, 2, 3]);
  });

  it('skips hidden features', () => {
    const doc = makeMinimalDoc({
      features: {
        'f1': {
          id: 'f1',
          type: 'POINT',
          hidden: true,
          geometry: { type: 'POINT', point: { x: 0, y: 0 } },
          layerId: 'layer-1',
          style: BASE_STYLE,
          properties: {},
        },
      },
    });
    expect(buildCsvRows(doc)).toHaveLength(0);
  });

  it('ignores non-POINT features (LINE, POLYLINE, etc.)', () => {
    const doc = makeMinimalDoc({
      features: {
        'f1': {
          id: 'f1',
          type: 'LINE',
          geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
          layerId: 'layer-1',
          style: BASE_STYLE,
          properties: {},
        },
      },
    });
    expect(buildCsvRows(doc)).toHaveLength(0);
  });
});

// ── rowsToCsv ────────────────────────────────────────────────────────────────

describe('rowsToCsv', () => {
  it('produces a header row and correct data rows', () => {
    const rows = [
      { pointNo: 1, northing: 1000.1234, easting: 2000.5678, elevation: 300.0, code: 'IP', description: 'Iron Pin', layer: 'Layer 0' },
    ];
    const csv = rowsToCsv(rows);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Point No,Northing,Easting,Elevation,Code,Description,Layer');
    expect(lines[1]).toBe('1,1000.1234,2000.5678,300.0000,IP,Iron Pin,Layer 0');
  });

  it('wraps fields containing commas in double quotes', () => {
    const rows = [
      { pointNo: 1, northing: 0, easting: 0, elevation: 0, code: 'IP', description: 'Corner, post', layer: 'Layer 0' },
    ];
    const csv = rowsToCsv(rows);
    expect(csv).toContain('"Corner, post"');
  });

  it('escapes double-quotes inside a field', () => {
    const rows = [
      { pointNo: 1, northing: 0, easting: 0, elevation: 0, code: 'IP', description: 'He said "hello"', layer: 'Layer 0' },
    ];
    const csv = rowsToCsv(rows);
    expect(csv).toContain('"He said ""hello"""');
  });

  it('returns only the header when given no rows', () => {
    const csv = rowsToCsv([]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Point No/);
  });
});
