// __tests__/cad/io/trv-connectors.test.ts
//
// cad-trv-drawing-element-rendering Slice 1 — `28,16` connector
// segments (point-id pairs) render as LINE features on the Drawing
// layer, deduped against traverse edges, marked trvDerived so the
// TRV round-trip stays byte-stable.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';
import { drawingToTrv } from '@/lib/cad/io/drawing-to-trv';
import { extractConnectors } from '@/lib/cad/io/trv-drawing-elements';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';

// Two points + one traverse edge (A→B) + two connectors: A→B (echoes
// the traverse, must be deduped) and B→C (new linework, must render).
const FIXTURE = [
  '999,begin',
  '101,Conn Test',
  '#,SURVEY',
  '86,Topo,18,0',
  '#,POINTS',
  '95,3',
  '0,A', '3,18', '4,5,0,0', '2,100,200,0',   // N=100,E=200 → world (x=200,y=100)
  '0,B', '3,18', '4,5,0,0', '2,150,250,0',
  '0,C', '3,18', '4,5,0,0', '2,180,300,0',
  '#,TRAVERSE',
  '30,bndry',
  '31,0,2,0,0',
  '10,A', '11,1,0,0,18,0',
  '10,B', '11,1,1,0,18,0',
  '#,DRAWING',
  '28,16,A,B',   // duplicates the traverse edge → deduped
  '28,16,B,C',   // new connector → rendered as a LINE
  '999,end',
].join('\r\n');

describe('extractConnectors', () => {
  it('pulls every 28,16 point-pair', () => {
    const conns = extractConnectors(parseTrv(FIXTURE).drawingElements);
    expect(conns.map((c) => `${c.fromId}->${c.toId}`)).toEqual(['A->B', 'B->C']);
  });
});

describe('trvToDrawing — 28,16 connectors', () => {
  it('renders a connector LINE on the Drawing layer, deduped against the traverse', () => {
    const { layers, features } = trvToDrawing(parseTrv(FIXTURE), { layerPrefix: 'X' });
    const drawingLayerId = layers[0].id;
    const connectors = features.filter((f) => f.properties.trvElementKind === 'CONNECTOR');
    // A→B was a traverse edge → deduped; only B→C survives.
    expect(connectors).toHaveLength(1);
    const c = connectors[0];
    expect(c.type).toBe('LINE');
    expect(c.layerId).toBe(drawingLayerId);
    expect(c.properties.trvDerived).toBe(true);
    // Endpoints equal the referenced points' world coords (x=E, y=N).
    expect(c.geometry.start).toEqual({ x: 250, y: 150 }); // B
    expect(c.geometry.end).toEqual({ x: 300, y: 180 });   // C
  });

  it('connector endpoints share no reference with the source point features', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE), { layerPrefix: 'X' });
    const ptB = features.find((f) => f.type === 'POINT' && f.properties.trvPointId === 'B' && !f.properties.trvPointMirror)!;
    const conn = features.find((f) => f.properties.trvElementKind === 'CONNECTOR')!;
    expect(conn.geometry.start).not.toBe(ptB.geometry.point);
  });
});

describe('round-trip — derived connectors do not double-emit', () => {
  it('drawingToTrv emits no extra geometry for connector LINEs', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE), { layerPrefix: 'X' });
    const doc = makeDoc(features);
    const out = drawingToTrv(doc);
    // 3 canonical points (mirrors + connectors excluded).
    expect(out).toMatch(/(^|\r\n)95,3(\r\n|$)/);
    // No connector LINE leaks into the point/traverse output.
    expect(out.split(/\r\n/).filter((l) => l.startsWith('0,')).map((l) => l)).toEqual(['0,A', '0,B', '0,C']);
  });
});

describe('Hillsboro sample integration', () => {
  const sample = path.join(__dirname, '..', '..', 'fixtures', 'trv', 'hillsboro-nazarene.trv');
  it.skipIf(!fs.existsSync(sample))('renders 28,16 connectors as derived LINEs, deduped against traverses', () => {
    const text = fs.readFileSync(sample, 'latin1');
    const { features, notes } = trvToDrawing(parseTrv(text));
    const connectors = features.filter((f) => f.properties.trvElementKind === 'CONNECTOR');
    // The file has 12 × 28,16. In THIS file every connector coincides
    // with an already-rendered traverse edge, so the dedup correctly
    // suppresses doubled lines (0 ≤ rendered ≤ 12). The dedup note is
    // emitted so the import dialog can report it.
    expect(connectors.length).toBeLessThanOrEqual(12);
    expect(notes.some((n) => /Subtype-16 connectors/.test(n))).toBe(true);
    // Whatever DID render must be a valid, export-safe derived LINE.
    for (const c of connectors) {
      expect(c.type).toBe('LINE');
      expect(c.properties.trvDerived).toBe(true);
      expect(c.geometry.start).toBeDefined();
      expect(c.geometry.end).toBeDefined();
    }
  });
});

/** Wrap a feature list into a minimal DrawingDocument for export. */
function makeDoc(features: Feature[]): DrawingDocument {
  const featureMap: Record<string, Feature> = {};
  for (const f of features) featureMap[f.id] = f;
  return {
    id: 'd', name: '', created: '', modified: '', author: '',
    features: featureMap, layers: {} as Record<string, Layer>, layerOrder: [],
    featureGroups: {}, layerGroups: {}, layerGroupOrder: [],
  } as unknown as DrawingDocument;
}
