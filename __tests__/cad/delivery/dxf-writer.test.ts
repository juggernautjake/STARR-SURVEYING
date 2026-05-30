// __tests__/cad/delivery/dxf-writer.test.ts
import { describe, it, expect } from 'vitest';
import { exportToDxf } from '@/lib/cad/delivery/dxf-writer';
import { scopeDocument } from '@/lib/cad/delivery/scope-document';
import type { DrawingDocument, Feature } from '@/lib/cad/types';

const STYLE = {
  color: null, lineWeight: null, opacity: 1, lineTypeId: null, symbolId: null,
  symbolSize: null, symbolRotation: 0, labelVisible: null, labelFormat: null,
  labelOffset: { x: 0, y: 0 }, isOverride: false,
} as const;

function layer(id: string, over: Record<string, unknown> = {}) {
  return {
    id, name: id, visible: true, locked: false, frozen: false,
    color: '#FF0000', lineWeight: 0.5, lineTypeId: 'SOLID', opacity: 1,
    groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
    autoAssignCodes: [], ...over,
  };
}

function makeDoc(features: Record<string, Feature>, layers: Record<string, unknown>): DrawingDocument {
  return {
    id: 'doc-1', name: 'Test', created: '', modified: '', author: '',
    features,
    layers: layers as DrawingDocument['layers'],
    layerOrder: Object.keys(layers),
    layerGroups: {}, layerGroupOrder: [],
    customSymbols: [], customLineTypes: [],
    codeStyleOverrides: {}, globalStyleConfig: {} as DrawingDocument['globalStyleConfig'],
    settings: { drawingScale: 50, displayPreferences: { originNorthing: 0, originEasting: 0 } } as DrawingDocument['settings'],
  } as unknown as DrawingDocument;
}

describe('exportToDxf — style fidelity', () => {
  it('emits an LTYPE table entry with a dash pattern for a dashed layer', () => {
    const doc = makeDoc(
      { f1: { id: 'f1', type: 'LINE', geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }, layerId: 'EASEMENT', style: STYLE, properties: {} } },
      { EASEMENT: layer('EASEMENT', { lineTypeId: 'DASHED' }) }
    );
    const dxf = exportToDxf(doc);
    expect(dxf).toContain('LTYPE');
    // DASHED pattern is [10,6] → dash +10, gap -6
    expect(dxf).toContain('\r\nDASHED\r\n');
    expect(dxf).toMatch(/\r\n49\r\n10(\.0+)?\r\n/);  // dash element
    expect(dxf).toMatch(/\r\n49\r\n-6(\.0+)?\r\n/);  // gap element
  });

  it('writes the layer linetype reference (code 6)', () => {
    const doc = makeDoc(
      { f1: { id: 'f1', type: 'LINE', geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }, layerId: 'EASEMENT', style: STYLE, properties: {} } },
      { EASEMENT: layer('EASEMENT', { lineTypeId: 'DASHED', lineWeight: 0.5 }) }
    );
    const dxf = exportToDxf(doc);
    // layer references the DASHED linetype
    expect(dxf).toContain('\r\nDASHED\r\n');
  });

  it('targets R12 (AC1009) and omits R13+ lineweight/true-color codes', () => {
    const doc = makeDoc(
      { f1: { id: 'f1', type: 'LINE', geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }, layerId: 'L', style: STYLE, properties: {} } },
      { L: layer('L') }
    );
    const dxf = exportToDxf(doc);
    expect(dxf).toContain('\r\nAC1009\r\n');
    expect(dxf).toContain('\r\nVPORT\r\n');
    // R13+ constructs must not appear — they crash older readers.
    expect(dxf).not.toContain('BLOCK_RECORD');
    expect(dxf).not.toMatch(/\r\n370\r\n/); // lineweight
    expect(dxf).not.toMatch(/\r\n420\r\n/); // true color
  });

  it('emits polylines as R12 POLYLINE/VERTEX/SEQEND (no LWPOLYLINE)', () => {
    const doc = makeDoc(
      { f1: { id: 'f1', type: 'POLYLINE', geometry: { type: 'POLYLINE', vertices: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }, layerId: 'L', style: STYLE, properties: {} } },
      { L: layer('L') }
    );
    const dxf = exportToDxf(doc);
    expect(dxf).not.toContain('LWPOLYLINE');
    expect(dxf).toContain('\r\nPOLYLINE\r\n');
    expect(dxf).toContain('\r\nVERTEX\r\n');
    expect(dxf).toContain('\r\nSEQEND\r\n');
  });

  it('always emits a STYLE table with STANDARD', () => {
    const doc = makeDoc(
      { f1: { id: 'f1', type: 'POINT', geometry: { type: 'POINT', point: { x: 0, y: 0 } }, layerId: 'L', style: STYLE, properties: {} } },
      { L: layer('L') }
    );
    const dxf = exportToDxf(doc);
    expect(dxf).toContain('STYLE');
    expect(dxf).toContain('\r\nSTANDARD\r\n');
  });

  it('emits entity-level ACI color override (code 62)', () => {
    const doc = makeDoc(
      { f1: { id: 'f1', type: 'LINE', geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }, layerId: 'L', style: { ...STYLE, color: '#00FF00' }, properties: {} } },
      { L: layer('L') }
    );
    const dxf = exportToDxf(doc);
    expect(dxf).toMatch(/\r\n62\r\n3\r\n/); // 0x00FF00 → ACI 3 (green)
  });

  it('emits a true ARC entity preserving radius', () => {
    const doc = makeDoc(
      { f1: { id: 'f1', type: 'ARC', geometry: { type: 'ARC', arc: { center: { x: 0, y: 0 }, radius: 25, startAngle: 0, endAngle: Math.PI / 2, anticlockwise: true } }, layerId: 'L', style: STYLE, properties: {} } },
      { L: layer('L') }
    );
    const dxf = exportToDxf(doc);
    expect(dxf).toContain('\r\nARC\r\n');
    expect(dxf).toMatch(/\r\n40\r\n25\.0+\r\n/); // radius 25
  });

  it('exports a feature point label as TEXT', () => {
    const doc = makeDoc(
      {
        f1: {
          id: 'f1', type: 'POINT',
          geometry: { type: 'POINT', point: { x: 100, y: 200 } },
          layerId: 'L', style: STYLE, properties: {},
          textLabels: [
            {
              id: 'lbl1', featureId: 'f1', kind: 'POINT_NAME', text: 'PT-1',
              offset: { x: 0, y: 0 }, rotation: null,
              style: { fontFamily: 'Arial', fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', color: null, backgroundColor: null, borderColor: null, borderWidth: null, padding: 2 },
              visible: true, scale: 1, userPositioned: true,
            },
          ],
        },
      },
      { L: layer('L') }
    );
    const dxf = exportToDxf(doc);
    expect(dxf).toContain('\r\nTEXT\r\n');
    expect(dxf).toContain('\r\nPT-1\r\n');
  });
});

describe('exportToDxf — derived (created) points', () => {
  it('emits a POINT + name TEXT for a cross-layer :N vertex with no POINT feature', () => {
    const A = { x: 10, y: 20 }, B = { x: 110, y: 20 };
    const doc = makeDoc(
      {
        a: { id: 'a', type: 'POINT', geometry: { type: 'POINT', point: A }, layerId: 'BOUNDARY', style: STYLE, properties: { pointName: '255' } },
        b: { id: 'b', type: 'POINT', geometry: { type: 'POINT', point: B }, layerId: 'BOUNDARY', style: STYLE, properties: { pointName: '256' } },
        L: { id: 'L', type: 'LINE', geometry: { type: 'LINE', start: A, end: B }, layerId: 'FENCE', style: STYLE, properties: { pointRefs: JSON.stringify(['255:1', '256:1']) } },
      },
      { BOUNDARY: layer('BOUNDARY'), FENCE: layer('FENCE') }
    );
    const dxf = exportToDxf(doc);
    // The derived names appear as TEXT entities…
    expect(dxf).toContain('\r\n255:1\r\n');
    expect(dxf).toContain('\r\n256:1\r\n');
    // …and the derived POINT sits at its raw world coord on the FENCE layer.
    expect(dxf).toMatch(/\r\nPOINT\r\n8\r\nFENCE\r\n10\r\n10\.0+\r\n20\r\n20\.0+\r\n/);
  });

  it('carries derived points through a by-layer scoped export', () => {
    const A = { x: 10, y: 20 }, B = { x: 110, y: 20 };
    const full = makeDoc(
      {
        a: { id: 'a', type: 'POINT', geometry: { type: 'POINT', point: A }, layerId: 'BOUNDARY', style: STYLE, properties: { pointName: '255' } },
        b: { id: 'b', type: 'POINT', geometry: { type: 'POINT', point: B }, layerId: 'BOUNDARY', style: STYLE, properties: { pointName: '256' } },
        L: { id: 'L', type: 'LINE', geometry: { type: 'LINE', start: A, end: B }, layerId: 'FENCE', style: STYLE, properties: { pointRefs: JSON.stringify(['255:1', '256:1']) } },
      },
      { BOUNDARY: layer('BOUNDARY'), FENCE: layer('FENCE') }
    );
    const scoped = scopeDocument(full, { kind: 'LAYERS', layerIds: ['FENCE'] });
    const dxf = exportToDxf(scoped);
    // The FENCE line's created vertices export even though the BOUNDARY
    // anchor points were scoped out.
    expect(dxf).toContain('\r\n255:1\r\n');
    expect(dxf).toContain('\r\n256:1\r\n');
  });

  it('does not duplicate a vertex that already has a POINT feature', () => {
    const A = { x: 0, y: 0 };
    const doc = makeDoc(
      {
        a: { id: 'a', type: 'POINT', geometry: { type: 'POINT', point: A }, layerId: 'BOUNDARY', style: STYLE, properties: { pointName: '255' } },
        L: { id: 'L', type: 'LINE', geometry: { type: 'LINE', start: A, end: { x: 50, y: 0 } }, layerId: 'BOUNDARY', style: STYLE, properties: { pointRefs: JSON.stringify(['255', '300']) } },
      },
      { BOUNDARY: layer('BOUNDARY') }
    );
    const dxf = exportToDxf(doc);
    // 300 is a created vertex with no POINT feature → emitted as TEXT.
    expect(dxf).toContain('\r\n300\r\n');
    // 255 already exists as a POINT feature → it must NOT appear as a
    // derived-name TEXT (no duplicate row).
    expect(dxf).not.toContain('\r\n255\r\n');
  });
});
