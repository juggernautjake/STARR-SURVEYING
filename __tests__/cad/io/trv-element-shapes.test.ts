// __tests__/cad/io/trv-element-shapes.test.ts
//
// cad-trv-drawing-element-rendering Slice 2 — `28,30` polylines +
// `28,4` line segments render as derived geometry on the Drawing
// layer, in (E,N)→(x,y) world space, round-trip safe.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';
import { drawingToTrv } from '@/lib/cad/io/drawing-to-trv';
import { extractElementShapes } from '@/lib/cad/io/trv-drawing-elements';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';

const OPEN_POLY = '28,30,3,200,100,250,150,300,180';        // 3 distinct verts, open
const CLOSED_POLY = '28,30,4,200,100,250,100,250,150,200,100'; // last == first → closed (drop dup)
const PAD_POLY = '28,30,3,200,100,250,150,250,150';          // trailing dup pair → collapses to 2
const LINE_EL = '28,4,400,500,450,560,0.000000';

const FIXTURE = [
  '999,begin', '101,Shapes', '#,POINTS', '95,1',
  '0,1', '3,0', '4,5,0,0', '2,100,200,0',
  '#,DRAWING',
  OPEN_POLY, CLOSED_POLY, PAD_POLY, LINE_EL,
  '999,end',
].join('\r\n');

describe('extractElementShapes', () => {
  const shapes = extractElementShapes(parseTrv(FIXTURE).drawingElements);

  it('maps 28,4 to a 2-vertex LINE in (E,N)→(x,y) order', () => {
    const line = shapes.find((s) => s.kind === 'LINE')!;
    expect(line.vertices).toEqual([{ x: 400, y: 500 }, { x: 450, y: 560 }]);
    expect(line.closed).toBe(false);
  });

  it('maps an open 28,30 to a POLYLINE with first→x second→y', () => {
    const poly = shapes.find((s) => s.kind === 'POLYLINE' && !s.closed && s.vertices.length === 3)!;
    expect(poly.vertices).toEqual([{ x: 200, y: 100 }, { x: 250, y: 150 }, { x: 300, y: 180 }]);
  });

  it('detects closure (first==last) + drops the closing duplicate', () => {
    const closed = shapes.filter((s) => s.closed);
    expect(closed).toHaveLength(1);
    expect(closed[0].vertices).toEqual([{ x: 200, y: 100 }, { x: 250, y: 100 }, { x: 250, y: 150 }]);
  });

  it('collapses a trailing duplicate pair', () => {
    const pad = shapes.filter((s) => s.kind === 'POLYLINE' && !s.closed && s.vertices.length === 2);
    expect(pad).toHaveLength(1);
    expect(pad[0].vertices).toEqual([{ x: 200, y: 100 }, { x: 250, y: 150 }]);
  });
});

describe('trvToDrawing — element shapes on the Drawing layer', () => {
  const { layers, features } = trvToDrawing(parseTrv(FIXTURE), { layerPrefix: 'X' });
  const drawingLayerId = layers[0].id;

  it('emits LINE / POLYLINE / POLYGON features, all derived + on the Drawing layer', () => {
    const shapes = features.filter((f) => f.properties.trvElementKind === 'ELEMENT_LINE' || f.properties.trvElementKind === 'ELEMENT_POLYLINE');
    expect(shapes.length).toBe(4);
    for (const f of shapes) {
      expect(f.properties.trvDerived).toBe(true);
      expect(f.layerId).toBe(drawingLayerId);
    }
    expect(features.some((f) => f.type === 'POLYGON' && f.properties.trvDerived)).toBe(true);
    expect(features.some((f) => f.type === 'LINE' && f.properties.trvElementKind === 'ELEMENT_LINE')).toBe(true);
  });
});

describe('round-trip — derived shapes do not emit as traverses', () => {
  it('drawingToTrv writes no 30/31 traverse for derived polylines', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE), { layerPrefix: 'X' });
    const doc = makeDoc(features);
    const out = drawingToTrv(doc);
    // The only point is canonical "1"; no traverse section should be
    // synthesized from the derived polylines.
    expect(out).toMatch(/(^|\r\n)95,1(\r\n|$)/);
    // Exact section-header line (the file header `#,TRAVERSE PC` is a
    // different line + must not be confused for the section).
    expect(out.split(/\r\n/).includes('#,TRAVERSE')).toBe(false);
  });
});

describe('Hillsboro sample integration', () => {
  const sample = path.join(__dirname, '..', '..', 'fixtures', 'trv', 'hillsboro-nazarene.trv');
  it.skipIf(!fs.existsSync(sample))('renders all 11 polylines + 7 lines from 28,30 / 28,4', () => {
    const { features } = trvToDrawing(parseTrv(fs.readFileSync(sample, 'latin1')));
    const polys = features.filter((f) => f.properties.trvElementKind === 'ELEMENT_POLYLINE');
    const lines = features.filter((f) => f.properties.trvElementKind === 'ELEMENT_LINE');
    expect(polys).toHaveLength(11);
    expect(lines).toHaveLength(7);
    for (const f of [...polys, ...lines]) {
      expect(f.properties.trvDerived).toBe(true);
      expect(['POLYLINE', 'POLYGON', 'LINE']).toContain(f.type);
    }
  });
});

function makeDoc(features: Feature[]): DrawingDocument {
  const featureMap: Record<string, Feature> = {};
  for (const f of features) featureMap[f.id] = f;
  return {
    id: 'd', name: '', created: '', modified: '', author: '',
    features: featureMap, layers: {} as Record<string, Layer>, layerOrder: [],
    featureGroups: {}, layerGroups: {}, layerGroupOrder: [],
  } as unknown as DrawingDocument;
}
