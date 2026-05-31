// __tests__/cad/io/drawing-to-trv.test.ts
//
// cad-trv-import-export Slice 3 — pure serializer turning a
// DrawingDocument into TRV text. Tested in two modes: verbatim
// round-trip from a sourceTrv, and fresh-export-from-scratch.

import { describe, it, expect } from 'vitest';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';
import { drawingToTrv } from '@/lib/cad/io/drawing-to-trv';

const FIXTURE = [
  '#,TRAVERSE PC',
  '999,begin',
  '80,26.000',
  '#,SURVEY',
  '83,0',
  '86,Boundaries,3,0',
  '86,Topo,18,0',
  '#,POINTS',
  '95,2',
  '0,1',
  '1,corner SE',
  '3,3',
  '4,5,0,0',
  '2,4994.142075,4999.0675795,700',
  '0,2',
  '1,corner SW',
  '3,3',
  '4,5,0,0',
  '2,4994.142075,4900.0,700.5',
  '#,TRAVERSE',
  '30,perimeter',
  '31,0,2,0,0',
  '10,1',
  '11,1,0,0,3,0',
  '10,2',
  '11,1,1,0,3,0',
  '999,end',
].join('\r\n');

function buildDrawingFromFixture(): DrawingDocument {
  const trv = parseTrv(FIXTURE);
  const mapped = trvToDrawing(trv);
  const layers: Record<string, Layer> = {};
  for (const l of mapped.layers) layers[l.id] = l;
  const features: Record<string, Feature> = {};
  for (const f of mapped.features) features[f.id] = f;
  return {
    id: 'doc-1',
    name: 'test',
    created: '2026-05-31',
    modified: '2026-05-31',
    author: 'tester',
    features,
    layers,
    layerOrder: mapped.layers.map((l) => l.id),
    featureGroups: {},
    layerGroups: {},
    layerGroupOrder: [],
    settings: {} as never,
    customLineTypes: [],
  } as unknown as DrawingDocument;
}

describe('drawingToTrv — verbatim sourceTrv mode', () => {
  it('round-trips the parsed source byte-for-byte when opts.sourceTrv is set', () => {
    const trv = parseTrv(FIXTURE);
    const doc = buildDrawingFromFixture();
    expect(drawingToTrv(doc, { sourceTrv: trv })).toBe(FIXTURE);
  });
});

describe('drawingToTrv — fresh export', () => {
  it('emits the 999/begin and 999/end bookends', () => {
    const doc = buildDrawingFromFixture();
    const text = drawingToTrv(doc);
    expect(text.split('\r\n')[0]).toBe('#,TRAVERSE PC');
    expect(text.split('\r\n').find((l) => l === '999,begin')).toBe('999,begin');
    expect(text.split('\r\n').find((l) => l === '999,end')).toBe('999,end');
  });

  it('emits the version stamp (defaulting to 26.000)', () => {
    const doc = buildDrawingFromFixture();
    const text = drawingToTrv(doc);
    expect(text).toMatch(/^80,26\.000$/m);
  });

  it('emits one 86 record per layer in the doc\'s layerOrder', () => {
    const doc = buildDrawingFromFixture();
    const text = drawingToTrv(doc);
    const sixes = text.split('\r\n').filter((l) => l.startsWith('86,'));
    expect(sixes).toEqual(['86,Boundaries,3,0', '86,Topo,18,0']);
  });

  it('emits one 0/...,1,...,3,...,4,...,2,... block per POINT feature', () => {
    const doc = buildDrawingFromFixture();
    const text = drawingToTrv(doc);
    expect(text).toMatch(/0,1\r\n1,corner SE\r\n3,3\r\n4,5,0,0\r\n2,4994\.142075,4999\.0675795,700/);
    expect(text).toMatch(/0,2\r\n1,corner SW\r\n3,3\r\n4,5,0,0\r\n2,4994\.142075,4900,700\.5/);
  });

  it('emits 95,<pointCount> ahead of the point blocks', () => {
    const doc = buildDrawingFromFixture();
    const text = drawingToTrv(doc);
    expect(text).toMatch(/^95,2$/m);
  });

  it('emits a 30/<name>,31,...,10/11 pair sequence per traverse', () => {
    const doc = buildDrawingFromFixture();
    const text = drawingToTrv(doc);
    expect(text).toContain('30,perimeter');
    expect(text).toContain('10,1');
    expect(text).toContain('11,1,0,0,3,0');
    expect(text).toContain('10,2');
    expect(text).toContain('11,1,1,0,3,0');
  });
});

describe('drawingToTrv — round-trip with parser', () => {
  it('parses cleanly back into the same layer + point + traverse counts', () => {
    const doc = buildDrawingFromFixture();
    const text = drawingToTrv(doc);
    const reparsed = parseTrv(text);
    expect(reparsed.errors).toEqual([]);
    expect(reparsed.layers.length).toBe(2);
    expect(reparsed.points.length).toBe(2);
    expect(reparsed.traverses.length).toBe(1);
  });

  it('coords survive the round-trip via surveyNorth / surveyEast', () => {
    const doc = buildDrawingFromFixture();
    const reparsed = parseTrv(drawingToTrv(doc));
    const p1 = reparsed.points.find((p) => p.id === '1')!;
    expect(p1.north).toBe(4994.142075);
    expect(p1.east).toBe(4999.0675795);
    expect(p1.elevation).toBe(700);
  });
});

describe('drawingToTrv — Pass 1: projection / metadata / GNSS passthrough', () => {
  it('emits 90 sourcePath + 91-94 projection records when opts.projection / metadata are set', () => {
    const doc = buildDrawingFromFixture();
    const text = drawingToTrv(doc, {
      metadata: {
        sourcePath: 'C:\\test\\file.doc',
        projectName: 'MY PROJECT',
        surveyDate: '31-5-2026',
        scale: '1',
        units: '0',
        raw105: '0',
        pointCount: 2,
      },
      projection: {
        raw91: ['-1', '1', '1', '0', '', '0', '', '-1', 'Local.crs', 'None.pgm', '0'],
        raw92: ['6378137.0000', '0.0033528106812', '298.2572221008827', 'GRS 80', '6356752.3141', '0.0066943800229'],
        raw93: ['1.0000000000', '0.0000000000', '0.000', '0', '0'],
        raw94: ['15.00', '10.00', '10.00'],
        crsName: 'Local.crs',
        ellipsoidName: 'GRS 80',
      },
    });
    expect(text).toContain('90,C:\\test\\file.doc');
    expect(text).toContain('91,-1,1,1,0,,0,,-1,Local.crs,None.pgm,0');
    expect(text).toContain('92,6378137.0000,0.0033528106812,298.2572221008827,GRS 80,6356752.3141,0.0066943800229');
    expect(text).toContain('93,1.0000000000,0.0000000000,0.000,0,0');
    expect(text).toContain('94,15.00,10.00,10.00');
    expect(text).toContain('101,MY PROJECT');
    expect(text).toContain('102,31-5-2026');
    expect(text).toContain('106,2');
  });

  it('emits #,GNSS section + 198/199 when opts.gnss is set', () => {
    const doc = buildDrawingFromFixture();
    const text = drawingToTrv(doc, {
      gnss: {
        raw198: ['0.1', '0.1', '5.0', '0.05', '0.05', '0.1'],
        raw199: ['0l', '0', '10000', '@', '@'],
      },
    });
    expect(text).toContain('#,GNSS');
    expect(text).toContain('199,0l,0,10000,@,@');
    expect(text).toContain('198,0.1,0.1,5.0,0.05,0.05,0.1');
  });
});

describe('drawingToTrv — Pass 2: drawing elements + lot segments passthrough', () => {
  it('emits each TrvDrawingElement as 28 header + N 29 props', () => {
    const doc = buildDrawingFromFixture();
    const text = drawingToTrv(doc, {
      drawingElements: [
        {
          header: ['0', '0', 'Drawing1', '0', '10485864', '80.000000'],
          properties: [['0', '1', '243287936'], ['0', '2', 'extra']],
          sourceLine: 0,
        },
      ],
    });
    expect(text).toContain('#,DRAWING');
    expect(text).toContain('28,0,0,Drawing1,0,10485864,80.000000');
    expect(text).toContain('29,0,1,243287936');
    expect(text).toContain('29,0,2,extra');
  });

  it('emits 13 lot segments under #,LOTS', () => {
    const doc = buildDrawingFromFixture();
    const text = drawingToTrv(doc, {
      lotSegments: [
        { fields: ['524288', '0', '0', '0', '0', '5', '3533f'], sourceLine: 0 },
        { fields: ['524288', '0', '0', '0', '0', '10', '3533f'], sourceLine: 0 },
      ],
    });
    expect(text).toContain('#,LOTS');
    expect(text).toContain('13,524288,0,0,0,0,5,3533f');
    expect(text).toContain('13,524288,0,0,0,0,10,3533f');
  });

  it('omits the #,DRAWING + #,LOTS sections when neither opt is supplied', () => {
    const doc = buildDrawingFromFixture();
    const text = drawingToTrv(doc);
    expect(text).not.toContain('#,DRAWING');
    expect(text).not.toContain('#,LOTS');
  });
});

describe('drawingToTrv — fallback paths', () => {
  it('falls back to the inverse screen-y transform when surveyNorth/East are missing', () => {
    const layer: Layer = {
      id: 'trv-layer:3', name: 'L', visible: true, locked: false, frozen: false,
      color: '#000', lineWeight: 0.5, lineTypeId: 'SOLID', opacity: 1,
      groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
      autoAssignCodes: [],
    };
    const f: Feature = {
      id: 'trv-point:42',
      type: 'POINT',
      geometry: { type: 'POINT', point: { x: 100, y: -200 } } as Feature['geometry'],
      layerId: 'trv-layer:3',
      style: {} as never,
      properties: {},
    } as Feature;
    const doc: DrawingDocument = {
      id: 'd', name: '', created: '', modified: '', author: '',
      features: { [f.id]: f },
      layers: { [layer.id]: layer },
      layerOrder: [layer.id],
      featureGroups: {},
      layerGroups: {},
      layerGroupOrder: [],
      settings: {} as never,
      customLineTypes: [],
    } as unknown as DrawingDocument;
    const text = drawingToTrv(doc);
    // x = east = 100; y = -200 ⇒ north = 200.
    expect(text).toMatch(/2,200,100,0/);
  });
});
