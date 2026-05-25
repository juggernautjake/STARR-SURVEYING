// __tests__/cad/delivery/landxml-writer.test.ts
import { describe, it, expect } from 'vitest';
import { exportToLandXML } from '@/lib/cad/delivery/landxml-writer';
import type { DrawingDocument } from '@/lib/cad/types';

function makeDoc(overrides: Partial<DrawingDocument> = {}): DrawingDocument {
  return {
    id: 'doc-1',
    name: 'Test',
    created: '2026-01-01T00:00:00Z',
    modified: '2026-01-01T00:00:00Z',
    author: 'Tester',
    features: {},
    layers: {
      'layer-1': {
        id: 'layer-1', name: 'BOUNDARY', visible: true, locked: false,
        frozen: false, color: '#000', lineWeight: 0.25, lineTypeId: 'SOLID',
        opacity: 1, groupId: null, sortOrder: 0, isDefault: false,
        isProtected: false, autoAssignCodes: [],
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
      displayPreferences: { originNorthing: 0, originEasting: 0 },
    } as DrawingDocument['settings'],
    ...overrides,
  } as DrawingDocument;
}

const STYLE = {
  color: null, lineWeight: null, opacity: 1, lineTypeId: null, symbolId: null,
  symbolSize: null, symbolRotation: 0, labelVisible: null, labelFormat: null,
  labelOffset: { x: 0, y: 0 }, isOverride: false,
} as const;

describe('exportToLandXML', () => {
  it('emits a CgPoint with northing-easting-elevation order and code/desc', () => {
    const doc = makeDoc({
      features: {
        f1: {
          id: 'f1', type: 'POINT',
          geometry: { type: 'POINT', point: { x: 100, y: 200 } },
          layerId: 'layer-1', style: STYLE,
          properties: { pointNo: 1, code: 'IP', description: 'Iron Pin', elevation: 350 },
        },
      },
    });
    const xml = exportToLandXML(doc);
    expect(xml).toContain('<LandXML');
    expect(xml).toContain('epsgCode="2277"');
    expect(xml).toContain(
      '<CgPoint name="1" code="IP" desc="Iron Pin">200.0000 100.0000 350.0000</CgPoint>'
    );
  });

  it('emits a LINE as a Line plan feature', () => {
    const doc = makeDoc({
      features: {
        f1: {
          id: 'f1', type: 'LINE',
          geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 10, y: 20 } },
          layerId: 'layer-1', style: STYLE, properties: {},
        },
      },
    });
    const xml = exportToLandXML(doc);
    expect(xml).toContain('<PlanFeatures>');
    expect(xml).toContain('<Line><Start>0.0000 0.0000</Start><End>20.0000 10.0000</End></Line>');
  });

  it('emits an ARC as a true Curve with radius + rotation, not chords', () => {
    const doc = makeDoc({
      features: {
        f1: {
          id: 'f1', type: 'ARC',
          geometry: {
            type: 'ARC',
            arc: { center: { x: 0, y: 0 }, radius: 50, startAngle: 0, endAngle: Math.PI / 2, anticlockwise: true },
          },
          layerId: 'layer-1', style: STYLE, properties: {},
        },
      },
    });
    const xml = exportToLandXML(doc);
    expect(xml).toContain('<Curve rot="ccw" radius="50.0000">');
    // start at angle 0 → (E=50, N=0); end at 90° → (E=0, N=50)
    expect(xml).toContain('<Start>0.0000 50.0000</Start>');
    expect(xml).toContain('<Center>0.0000 0.0000</Center>');
    expect(xml).toContain('<End>50.0000 0.0000</End>');
  });

  it('applies the display origin offset to coordinates', () => {
    const doc = makeDoc({
      features: {
        f1: {
          id: 'f1', type: 'POINT',
          geometry: { type: 'POINT', point: { x: 50, y: 75 } },
          layerId: 'layer-1', style: STYLE, properties: { pointNo: 2 },
        },
      },
    });
    doc.settings.displayPreferences.originNorthing = 10000;
    doc.settings.displayPreferences.originEasting = 5000;
    const xml = exportToLandXML(doc);
    expect(xml).toContain('>10075.0000 5050.0000 0.0000</CgPoint>');
  });

  it('escapes XML-special characters in attributes', () => {
    const doc = makeDoc({
      features: {
        f1: {
          id: 'f1', type: 'POINT',
          geometry: { type: 'POINT', point: { x: 0, y: 0 } },
          layerId: 'layer-1', style: STYLE,
          properties: { pointNo: 3, description: 'Fence <corner> & post' },
        },
      },
    });
    const xml = exportToLandXML(doc);
    expect(xml).toContain('desc="Fence &lt;corner&gt; &amp; post"');
  });
});
