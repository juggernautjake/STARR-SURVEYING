// __tests__/cad/io/trv-two-layer-restructure.test.ts
//
// cad-trv-import-polish Slice 3 — TRV imports now land on TWO
// synthetic Starr layers (Drawing + Points) instead of N source
// TRV layers, so the surveyor can manage the import as a single
// unit + toggle point labels independently of the line styling.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';

const FIXTURE = [
  '999,begin',
  '101,Sample Project',
  '#,SURVEY',
  '86,Boundaries,3,0',
  '86,Topo,18,0',
  '#,POINTS',
  '95,3',
  '0,1', '3,3', '4,5,0,0', '2,100,200,0',
  '0,2', '3,18', '4,5,0,0', '2,150,250,0',
  '0,3', '3,18', '4,5,0,0', '2,200,300,0',
  '#,TRAVERSE',
  '30,bndry',
  '31,0,3,0,0',
  '10,1', '11,1,0,0,3,0',
  '10,2', '11,1,1,0,3,0',
  '10,3', '11,1,2,0,3,0',
  '999,end',
].join('\r\n');

describe('TRV → 2-layer restructure', () => {
  it('emits exactly Drawing + Points layers, named with the project prefix', () => {
    const { layers } = trvToDrawing(parseTrv(FIXTURE));
    expect(layers.map((l) => l.name)).toEqual([
      'TRV: Sample Project — Drawing',
      'TRV: Sample Project — Points',
    ]);
  });

  it('canonical POINT features land on the Points layer; mirrors land on Drawing', () => {
    // cad-trv-dual-layer-filename Slice 2 — the surveyor wants points
    // on BOTH layers: the dedicated Points layer keeps just the
    // points (for label control), and a render-only mirror of each
    // point also sits on the Drawing layer alongside the linework.
    const { features } = trvToDrawing(parseTrv(FIXTURE));
    const canonical = features.filter((f) => f.type === 'POINT' && !f.properties.trvPointMirror);
    const mirrors = features.filter((f) => f.type === 'POINT' && f.properties.trvPointMirror);
    expect(canonical.length).toBeGreaterThan(0);
    expect(mirrors.length).toBe(canonical.length);
    for (const p of canonical) expect(p.layerId).toBe('trv-points:trv-sample-project');
    for (const m of mirrors) expect(m.layerId).toBe('trv-drawing:trv-sample-project');
  });

  it('every POLYLINE / POLYGON / ARC feature lands on the Drawing layer', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE));
    const drawing = features.filter((f) => f.type === 'POLYLINE' || f.type === 'POLYGON' || f.type === 'ARC');
    expect(drawing.length).toBeGreaterThan(0);
    for (const f of drawing) expect(f.layerId).toBe('trv-drawing:trv-sample-project');
  });

  it('stamps the original TRV layer NAME on every feature for filter / audit', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE));
    const p1 = features.find((f) => f.properties.trvPointId === '1')!;
    const p2 = features.find((f) => f.properties.trvPointId === '2')!;
    expect(p1.properties.trvOriginalLayer).toBe('Boundaries');
    expect(p2.properties.trvOriginalLayer).toBe('Topo');
  });

  it('falls back to "TRV Import" prefix when no projectName metadata', () => {
    const noNameFixture = FIXTURE.replace('101,Sample Project\r\n', '');
    const { layers } = trvToDrawing(parseTrv(noNameFixture));
    expect(layers.map((l) => l.name)).toEqual(['TRV Import — Drawing', 'TRV Import — Points']);
  });
});

describe('TRV 2-layer restructure — Garland sample', () => {
  const sample = '/root/.claude/uploads/586362d4-da1f-4c40-b1d9-3487a6982d53/07a3cb8a-GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026_1.TRV';
  it.skipIf(!fs.existsSync(sample))('Garland lands on exactly 2 layers (Drawing + Points)', () => {
    const out = trvToDrawing(parseTrv(fs.readFileSync(sample, 'latin1')));
    expect(out.layers.length).toBe(2);
    // cad-trv-dual-layer-filename Slice 2 — canonical points on the
    // Points layer; mirrors + linework on the Drawing layer.
    const points = out.features.filter((f) => f.type === 'POINT' && !f.properties.trvPointMirror);
    const drawing = out.features.filter((f) => f.type !== 'POINT' || f.properties.trvPointMirror);
    for (const p of points) expect(p.layerId).toBe(out.layers[1].id);
    for (const d of drawing) expect(d.layerId).toBe(out.layers[0].id);
    // Stamping preserved — at least 1 feature carries each
    // original TRV layer name we expect to see.
    const originalLayers = new Set<string>();
    for (const f of out.features) {
      const o = f.properties.trvOriginalLayer;
      if (typeof o === 'string') originalLayers.add(o);
    }
    expect(originalLayers.size).toBeGreaterThan(1);
  });
});
