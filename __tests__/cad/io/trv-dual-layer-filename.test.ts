// __tests__/cad/io/trv-dual-layer-filename.test.ts
//
// cad-trv-dual-layer-filename 2026-06-01 — two related TRV-import
// behaviors the surveyor asked for:
//   1. The synthetic layers are named after the IMPORTED FILE (not a
//      generic "TRV").
//   2. Every point renders on BOTH the dedicated Points layer AND the
//      Drawing layer (alongside the linework), via render-only
//      mirrors that don't double the round-trip point count.

import { describe, it, expect } from 'vitest';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';
import { importTrvFromText, fileBaseName } from '@/lib/cad/io/trv-io';
import { drawingToTrv } from '@/lib/cad/io/drawing-to-trv';
import { dedupeTrvFeaturesAgainstDrawing } from '@/lib/cad/io/dedupe-trv-features';
import type { DrawingDocument, Feature, Layer } from '@/lib/cad/types';

const FIXTURE = [
  '999,begin',
  '101,Sample Project',
  '#,SURVEY',
  '86,Boundaries,3,0',
  '#,POINTS',
  '95,3',
  '0,1', '3,3', '4,5,0,0', '2,100,200,0',
  '0,2', '3,3', '4,5,0,0', '2,150,250,0',
  '0,3', '3,3', '4,5,0,0', '2,200,300,0',
  '#,TRAVERSE',
  '30,bndry',
  '31,0,3,0,0',
  '10,1', '11,1,0,0,3,0',
  '10,2', '11,1,1,0,3,0',
  '10,3', '11,1,2,0,3,0',
  '999,end',
].join('\r\n');

describe('fileBaseName', () => {
  it('strips path + extension', () => {
    expect(fileBaseName('Smith Boundary.TRV')).toBe('Smith Boundary');
    expect(fileBaseName('C:\\jobs\\Smith Boundary.trv')).toBe('Smith Boundary');
    expect(fileBaseName('/home/user/SURVEY_26074.TRV')).toBe('SURVEY_26074');
  });
  it('falls back to "TRV Import" when empty', () => {
    expect(fileBaseName('.TRV')).toBe('TRV Import');
    expect(fileBaseName('')).toBe('TRV Import');
  });
});

describe('Slice 1 — file-named import layers', () => {
  it('trvToDrawing uses an explicit layerPrefix verbatim', () => {
    const { layers } = trvToDrawing(parseTrv(FIXTURE), { layerPrefix: 'Smith Boundary' });
    expect(layers.map((l) => l.name)).toEqual([
      'Smith Boundary — Drawing',
      'Smith Boundary — Points',
    ]);
  });

  it('default (no layerPrefix) keeps the project-name prefix', () => {
    const { layers } = trvToDrawing(parseTrv(FIXTURE));
    expect(layers.map((l) => l.name)).toEqual([
      'TRV: Sample Project — Drawing',
      'TRV: Sample Project — Points',
    ]);
  });

  it('importTrvFromText names the layers after the file', () => {
    const r = importTrvFromText(FIXTURE, { fileName: 'Smith Boundary.TRV' });
    expect(r.mapped.layers.map((l) => l.name)).toEqual([
      'Smith Boundary — Drawing',
      'Smith Boundary — Points',
    ]);
    // The user-facing point count counts canonical points only.
    expect(r.pointCount).toBe(3);
  });
});

describe('Slice 2 — points mirror onto the Drawing layer', () => {
  it('every point appears on BOTH the Points layer and the Drawing layer', () => {
    const { layers, features } = trvToDrawing(parseTrv(FIXTURE), { layerPrefix: 'X' });
    const drawingLayerId = layers[0].id;
    const pointsLayerId = layers[1].id;
    const canonical = features.filter((f) => f.type === 'POINT' && !f.properties.trvPointMirror);
    const mirrors = features.filter((f) => f.type === 'POINT' && f.properties.trvPointMirror);
    expect(canonical).toHaveLength(3);
    expect(mirrors).toHaveLength(3);
    for (const c of canonical) expect(c.layerId).toBe(pointsLayerId);
    for (const m of mirrors) expect(m.layerId).toBe(drawingLayerId);
    // Mirror ids are distinct + derived from the canonical id.
    expect(mirrors.map((m) => m.id).sort()).toEqual(['trv-point:1:draw', 'trv-point:2:draw', 'trv-point:3:draw']);
    // Mirrors keep the canonical trvPointId + descriptive props so
    // labels render identically on either layer.
    for (const m of mirrors) expect(typeof m.properties.trvPointId).toBe('string');
  });

  it('round-trip emits each point ONCE — mirrors are skipped', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE), { layerPrefix: 'X' });
    const doc = makeDoc(features);
    const out = drawingToTrv(doc);
    // The `95,N` count line reflects canonical points only.
    expect(out).toMatch(/(^|\r\n)95,3(\r\n|$)/);
    // Each canonical point id appears exactly once as a `0,<id>` block.
    for (const id of ['1', '2', '3']) {
      const matches = out.split(/\r\n/).filter((l) => l === `0,${id}`);
      expect(matches, `point ${id}`).toHaveLength(1);
    }
  });

  it('the two copies share NO references — moving one does not move the other', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE), { layerPrefix: 'X' });
    const canonical = features.filter((f) => f.type === 'POINT' && !f.properties.trvPointMirror);
    const mirrors = features.filter((f) => f.type === 'POINT' && f.properties.trvPointMirror);
    // Pair each canonical with its mirror by trvPointId.
    const mirrorByTrvId = new Map<string, Feature>();
    for (const m of mirrors) mirrorByTrvId.set(String(m.properties.trvPointId), m);
    for (const c of canonical) {
      const m = mirrorByTrvId.get(String(c.properties.trvPointId))!;
      // Distinct object references at every level the user can edit.
      expect(m).not.toBe(c);
      expect(m.geometry).not.toBe(c.geometry);
      expect(m.geometry.point).not.toBe(c.geometry.point);
      expect(m.style).not.toBe(c.style);
      expect(m.properties).not.toBe(c.properties);
      // Simulate moving the canonical point in place; the mirror's
      // coords must not budge.
      const beforeMx = m.geometry.point!.x;
      const beforeMy = m.geometry.point!.y;
      c.geometry.point!.x += 100;
      c.geometry.point!.y -= 50;
      expect(m.geometry.point!.x).toBe(beforeMx);
      expect(m.geometry.point!.y).toBe(beforeMy);
    }
  });

  it('the import deduper leaves mirrors untouched', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE), { layerPrefix: 'X' });
    // No existing drawing → no real collisions. Mirrors share their
    // twin's trvPointId, so a naive deduper would rename them; the
    // mirror guard prevents that.
    const { features: out, renames } = dedupeTrvFeaturesAgainstDrawing(features, []);
    expect(renames).toHaveLength(0);
    const mirrors = out.filter((f) => f.properties.trvPointMirror);
    expect(mirrors).toHaveLength(3);
    for (const m of mirrors) expect(m.id).toMatch(/:draw$/);
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
