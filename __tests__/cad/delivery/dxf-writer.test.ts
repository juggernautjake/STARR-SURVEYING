// __tests__/cad/delivery/dxf-writer.test.ts
import { describe, it, expect } from 'vitest';
import { exportToDxf } from '@/lib/cad/delivery/dxf-writer';
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
    // DASHED pattern is [6,3] → dash +6, gap -3
    expect(dxf).toContain('\r\nDASHED\r\n');
    expect(dxf).toMatch(/\r\n49\r\n6(\.0+)?\r\n/);   // dash element
    expect(dxf).toMatch(/\r\n49\r\n-3(\.0+)?\r\n/);  // gap element
  });

  it('writes layer linetype (code 6) and lineweight (code 370)', () => {
    const doc = makeDoc(
      { f1: { id: 'f1', type: 'LINE', geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }, layerId: 'EASEMENT', style: STYLE, properties: {} } },
      { EASEMENT: layer('EASEMENT', { lineTypeId: 'DASHED', lineWeight: 0.5 }) }
    );
    const dxf = exportToDxf(doc);
    // layer references the DASHED linetype
    expect(dxf).toContain('\r\nDASHED\r\n');
    // 0.5mm → 50 (1/100 mm) lineweight
    expect(dxf).toMatch(/\r\n370\r\n50\r\n/);
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

  it('emits entity-level color override (codes 62 + 420)', () => {
    const doc = makeDoc(
      { f1: { id: 'f1', type: 'LINE', geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }, layerId: 'L', style: { ...STYLE, color: '#00FF00' }, properties: {} } },
      { L: layer('L') }
    );
    const dxf = exportToDxf(doc);
    expect(dxf).toMatch(/\r\n420\r\n65280\r\n/); // 0x00FF00 = 65280 true color
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
              style: { fontFamily: 'Arial', fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', color: null, backgroundColor: null, borderColor: null, padding: 2 },
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
