// __tests__/cad/io/trv-placeholder-skip.test.ts
//
// cad-trv-import-display Slice 1 — Traverse PC's `2,0,0,0` records
// are placeholder "reserve this id" entries; they used to render
// as features piled at the canvas origin (which the user
// reported as "nothing on the page" since the real survey lives
// at northing ~10M / easting ~3M). The mapper now skips them
// and traverse refs to such ids are dropped as well.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { trvToDrawing } from '@/lib/cad/io/trv-to-drawing';

describe('trvToDrawing — placeholder (2,0,0,0) point skip', () => {
  const fixture = [
    '999,begin',
    '#,POINTS',
    '95,4',
    '0,1', '3,0', '4,6,0,0', '2,0,0,0',
    '0,2', '3,0', '4,6,0,0', '2,0,0,0',
    '0,real', '1,real point', '3,0', '4,5,0,0',
    '2,10385166.492,3245972.976,661.841',
    '0,3', '3,0', '4,6,0,0', '2,0,0,0',
    '#,TRAVERSE',
    '30,bndry',
    '31,0,3,0,0',
    '10,1', '11,1,0,0,3,0',
    '10,real', '11,1,1,0,3,0',
    '10,3', '11,1,2,0,3,0',
    '999,end',
  ].join('\r\n');

  it('the (0,0,0) placeholder points do NOT produce features', () => {
    const out = trvToDrawing(parseTrv(fixture));
    // cad-trv-dual-layer-filename Slice 2 — count canonical points
    // only (each also mirrors onto the Drawing layer).
    const points = out.features.filter((f) => f.type === 'POINT' && !f.properties.trvPointMirror);
    expect(points.length).toBe(1);
    expect(points[0].properties.trvPointId).toBe('real');
  });

  it('emits a mapper note for each skipped placeholder so the import dialog reports it', () => {
    const out = trvToDrawing(parseTrv(fixture));
    const placeholderNotes = out.notes.filter((n) => n.includes('placeholder'));
    expect(placeholderNotes.length).toBe(3);
  });

  it('traverse refs to placeholder ids are dropped — the polyline only includes real coords', () => {
    const out = trvToDrawing(parseTrv(fixture));
    const polylines = out.features.filter((f) => f.type === 'POLYLINE' || f.type === 'POLYGON');
    // Only 1 resolvable point left → polyline is skipped (need ≥ 2).
    // Asserting on the mapper note + zero polyline features locks the
    // behavior end-to-end: no polyline yanked through origin.
    expect(polylines.length).toBe(0);
    expect(out.notes.some((n) => n.includes('bndry') && n.includes('fewer than 2'))).toBe(true);
  });

  it('skips elevation-only placeholder (north=east=0, elevation=null) too', () => {
    const f = [
      '999,begin',
      '#,POINTS',
      '95,1',
      '0,1', '3,0',
      // No `2,...` line at all — elevation defaults to null in the parser.
      '999,end',
    ].join('\r\n');
    const out = trvToDrawing(parseTrv(f));
    expect(out.features.filter((x) => x.type === 'POINT').length).toBe(0);
  });
});

describe('trvToDrawing — Garland sample produces a non-degenerate bbox', () => {
  const sample = '/root/.claude/uploads/586362d4-da1f-4c40-b1d9-3487a6982d53/07a3cb8a-GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026_1.TRV';
  const exists = fs.existsSync(sample);

  it.skipIf(!exists)('placeholder skip removes (0,0) outliers from the point bbox', () => {
    const text = fs.readFileSync(sample, 'latin1');
    const { features, notes } = trvToDrawing(parseTrv(text));
    const points = features.filter((f) => f.type === 'POINT');
    expect(points.length).toBeGreaterThan(0);
    // No surviving point should be at (0, 0).
    const atOrigin = points.filter((p) => p.geometry.point?.x === 0 && p.geometry.point?.y === 0);
    expect(atOrigin.length).toBe(0);
    // The bbox is now contained in the real survey extent — x must be
    // in the millions (state-plane easting), y in the negative millions.
    const xs = points.map((p) => p.geometry.point?.x ?? 0);
    expect(Math.min(...xs)).toBeGreaterThan(1_000_000);
    // Mapper notes record the placeholder skips so the user sees them.
    expect(notes.filter((n) => n.includes('placeholder')).length).toBeGreaterThan(0);
  });
});

describe('MenuBar — Slice 1: auto-zoom after TRV import', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
    'utf8',
  );

  it('both TRV branches auto-zoom after import (cad:zoomToPaper, not the strict cad:zoomExtents)', () => {
    // cad-trv-element-coverage Slice 1 — the TRV branches now
    // fire cad:zoomToPaper so the camera lands on the auto-sized
    // paper sheet (sized to the robust bbox) instead of the
    // strict feature bbox (which can include stray-GPS outliers).
    const toPaper = SRC.match(/cad:zoomToPaper/g) ?? [];
    expect(toPaper.length).toBeGreaterThanOrEqual(2);
  });
});
