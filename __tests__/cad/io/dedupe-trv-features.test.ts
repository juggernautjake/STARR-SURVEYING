// __tests__/cad/io/dedupe-trv-features.test.ts
//
// cad-duplicate-point-handling Slice 4 — merge-time dedupe for
// TRV POINT features whose `trvPointId` already exists in the
// current drawing (cross-file collisions).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { dedupeTrvFeaturesAgainstDrawing } from '@/lib/cad/io/dedupe-trv-features';
import type { Feature } from '@/lib/cad/types';

function mkPoint(trvId: string, layerId = 'L1'): Feature {
  return {
    id: `trv-point:${trvId}`,
    type: 'POINT',
    geometry: { type: 'POINT', point: { x: 0, y: 0 } } as Feature['geometry'],
    layerId,
    style: {} as never,
    properties: { trvPointId: trvId, surveyNorth: 100, surveyEast: 200 },
  } as Feature;
}

describe('dedupeTrvFeaturesAgainstDrawing — Slice 4', () => {
  it('a fresh import into an empty drawing leaves the features untouched', () => {
    const incoming = [mkPoint('23'), mkPoint('24')];
    const r = dedupeTrvFeaturesAgainstDrawing(incoming, []);
    expect(r.renames).toEqual([]);
    expect(r.features.map((f) => f.properties.trvPointId)).toEqual(['23', '24']);
  });

  it('renames a colliding new POINT to <id>:1 when the drawing already has <id>', () => {
    const existing = [mkPoint('23', 'Topo')];
    const incoming = [mkPoint('23', 'Boundaries')];
    const r = dedupeTrvFeaturesAgainstDrawing(incoming, existing);
    expect(r.renames).toHaveLength(1);
    expect(r.renames[0]).toMatchObject({
      fromName: '23',
      toName: '23:1',
      baseLayerId: 'Topo',
      thisLayerId: 'Boundaries',
      kind: 'CROSS_LAYER',
    });
    expect(r.features[0].properties.trvPointId).toBe('23:1');
    expect(r.features[0].id).toBe('trv-point:23:1');
  });

  it('SAME_LAYER tag fires when the drawing already has <id> on the same layer', () => {
    const existing = [mkPoint('23', 'Topo')];
    const incoming = [mkPoint('23', 'Topo')];
    const r = dedupeTrvFeaturesAgainstDrawing(incoming, existing);
    expect(r.renames[0].kind).toBe('SAME_LAYER');
  });

  it('skips suffixes already in use (drawing has 23 + 23:1 → new dup gets 23:2)', () => {
    const existing = [mkPoint('23'), mkPoint('23:1')];
    const incoming = [mkPoint('23')];
    const r = dedupeTrvFeaturesAgainstDrawing(incoming, existing);
    expect(r.features[0].properties.trvPointId).toBe('23:2');
  });

  it('intra-import duplicates also resolve against the same usedIds set', () => {
    // Drawing has nothing; the incoming batch itself contains two
    // points with id "23". Without intra-batch tracking the second
    // one would also land as "23" and collide once the first is
    // committed. With tracking, the second steps to "23:1".
    const incoming = [mkPoint('23'), mkPoint('23')];
    const r = dedupeTrvFeaturesAgainstDrawing(incoming, []);
    expect(r.features.map((f) => f.properties.trvPointId)).toEqual(['23', '23:1']);
    expect(r.renames).toHaveLength(1);
  });

  it('non-POINT features pass through untouched (polylines / polygons / arcs / splines)', () => {
    const existing = [mkPoint('23')];
    const polyline: Feature = {
      id: 'trv-traverse:7', type: 'POLYLINE',
      geometry: { type: 'POLYLINE', vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } as Feature['geometry'],
      layerId: 'L1', style: {} as never,
      properties: { trvSourceLine: 7 },
    } as Feature;
    const incoming = [polyline, mkPoint('23')];
    const r = dedupeTrvFeaturesAgainstDrawing(incoming, existing);
    expect(r.features[0]).toBe(polyline); // identity preserved
    expect(r.features[1].properties.trvPointId).toBe('23:1');
    expect(r.renames).toHaveLength(1); // only the point renamed
  });

  it('records originalTrvPointId on the renamed feature so the UI can show lineage', () => {
    const existing = [mkPoint('23')];
    const incoming = [mkPoint('23')];
    const r = dedupeTrvFeaturesAgainstDrawing(incoming, existing);
    expect(r.features[0].properties.originalTrvPointId).toBe('23');
    expect(r.features[0].properties.trvPointId).toBe('23:1');
  });

  it('a POINT with no trvPointId in properties passes through untouched', () => {
    const odd: Feature = {
      id: 'odd', type: 'POINT',
      geometry: { type: 'POINT', point: { x: 0, y: 0 } } as Feature['geometry'],
      layerId: 'L', style: {} as never, properties: {},
    } as Feature;
    const r = dedupeTrvFeaturesAgainstDrawing([odd], [mkPoint('23')]);
    expect(r.features[0]).toBe(odd);
    expect(r.renames).toEqual([]);
  });
});

describe('MenuBar — Slice 4 wires Slice-4 helper into both TRV branches', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
    'utf8',
  );

  it('imports dedupeTrvFeaturesAgainstDrawing', () => {
    expect(SRC).toMatch(/import \{ dedupeTrvFeaturesAgainstDrawing \} from '@\/lib\/cad\/io\/dedupe-trv-features';/);
  });

  it('the helper runs against the EXISTING drawing features before addFeatures', () => {
    const calls = SRC.match(/dedupeTrvFeaturesAgainstDrawing\(\s*report\.mapped\.features,/g) ?? [];
    expect(calls.length).toBe(2);
  });

  it('addFeatures receives the deduped output, not the raw mapped features', () => {
    // P6h widened — MenuBar's `drawingStore.addFeatures(...)` callback
    // now goes through `useDrawingStore.getState().addFeatures(...)`.
    const dedupedAdds = SRC.match(/(drawingStore|useDrawingStore\.getState\(\))\.addFeatures\(deduped(?:Open|Import)\.features\)/g) ?? [];
    expect(dedupedAdds.length).toBe(2);
  });
});
