// __tests__/cad/io/trv-import-visibility.test.ts
//
// cad-trv-element-coverage Slice 3a — confirm that every feature
// the TRV mapper produces lands on a VISIBLE layer with VISIBLE
// style defaults (opacity 1, non-null color, finite line weight)
// and that closed polygons are OUTLINE-ONLY (no opaque fill that
// would hide the features behind them).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';

describe('trvToDrawing — every imported feature is fully visible', () => {
  const FIXTURE = [
    '999,begin',
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
    '10,1', '11,1,3,0,3,0',
    '999,end',
  ].join('\r\n');

  it('every mapped layer is visible: true', () => {
    const { layers } = trvToDrawing(parseTrv(FIXTURE));
    for (const layer of layers) expect(layer.visible).toBe(true);
  });

  it('every POINT feature has opacity 1 + a non-null color', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE));
    const points = features.filter((f) => f.type === 'POINT');
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.style.opacity).toBe(1);
      expect(p.style.color).toBe('#000000');
      expect(p.style.lineWeight).toBeGreaterThan(0);
    }
  });

  it('every closed POLYGON is OUTLINE-ONLY (no opaque fill blocks underlying features)', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE));
    const polygons = features.filter((f) => f.type === 'POLYGON');
    expect(polygons.length).toBeGreaterThan(0);
    for (const poly of polygons) {
      // fillColor explicitly null + fillPattern NONE → render path
      // draws stroke only, no opaque area covering whatever's
      // underneath.
      const s = poly.style as { fillColor?: string | null; fillPattern?: string };
      expect(s.fillColor).toBeNull();
      expect(s.fillPattern).toBe('NONE');
      expect(poly.style.opacity).toBe(1);
    }
  });

  it('every POLYLINE has visible stroke styling (no hidden / zero-weight)', () => {
    const { features } = trvToDrawing(parseTrv(FIXTURE));
    const lines = features.filter((f) => f.type === 'POLYLINE');
    for (const l of lines) {
      expect(l.style.opacity).toBe(1);
      expect(l.style.color).toBe('#000000');
      expect(l.style.lineWeight).toBeGreaterThan(0);
    }
  });
});

describe('trvToDrawing — Garland sample: every feature visible end-to-end', () => {
  const sample = '/root/.claude/uploads/586362d4-da1f-4c40-b1d9-3487a6982d53/07a3cb8a-GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026_1.TRV';
  it.skipIf(!fs.existsSync(sample))('no imported feature has opacity 0 / null color / zero line weight', () => {
    const { layers, features } = trvToDrawing(parseTrv(fs.readFileSync(sample, 'latin1')));
    for (const l of layers) expect(l.visible).toBe(true);
    for (const f of features) {
      expect(f.style.opacity).toBeGreaterThan(0);
      expect(f.style.color).not.toBeNull();
      if (typeof f.style.lineWeight === 'number') expect(f.style.lineWeight).toBeGreaterThan(0);
    }
    // Sanity-check: at least 1 POLYGON survives + is OUTLINE-only.
    const polygons = features.filter((f) => f.type === 'POLYGON');
    expect(polygons.length).toBeGreaterThan(0);
    for (const poly of polygons) {
      const s = poly.style as { fillColor?: string | null; fillPattern?: string };
      expect(s.fillColor).toBeNull();
      expect(s.fillPattern).toBe('NONE');
    }
  });
});
