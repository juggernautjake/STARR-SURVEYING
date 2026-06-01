// __tests__/cad/io/zoom-to-paper.test.ts
//
// cad-trv-element-coverage-and-immediate-view Slice 1 — the new
// `cad:zoomToPaper` event + the pure paperRectWorld helper that
// computes the world-space rectangle the camera should fit so
// the entire paper sheet is visible immediately after a TRV
// import.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { paperRectWorld, PAPER_SIZES_IN } from '@/lib/cad/io/trv-paper-fit';

describe('paperRectWorld — pure paper → viewport bounds', () => {
  it('LETTER landscape @ 1" = 50\' with origin (0, 0) → 550 × 425 ft rect', () => {
    const r = paperRectWorld({ paperSize: 'LETTER', paperOrientation: 'LANDSCAPE', drawingScale: 50, paperOrigin: { x: 0, y: 0 } });
    expect(r).toEqual({ minX: 0, minY: 0, maxX: 11 * 50, maxY: 8.5 * 50 });
  });

  it('LETTER portrait @ 1" = 50\' → 425 × 550 ft rect', () => {
    const r = paperRectWorld({ paperSize: 'LETTER', paperOrientation: 'PORTRAIT', drawingScale: 50, paperOrigin: { x: 0, y: 0 } });
    expect(r).toEqual({ minX: 0, minY: 0, maxX: 8.5 * 50, maxY: 11 * 50 });
  });

  it('respects a non-zero paperOrigin (sheet positioned over the survey)', () => {
    const r = paperRectWorld({ paperSize: 'TABLOID', paperOrientation: 'LANDSCAPE', drawingScale: 100, paperOrigin: { x: 1000, y: 2000 } });
    const [pw, ph] = [Math.max(...PAPER_SIZES_IN.TABLOID), Math.min(...PAPER_SIZES_IN.TABLOID)];
    expect(r).toEqual({ minX: 1000, minY: 2000, maxX: 1000 + pw * 100, maxY: 2000 + ph * 100 });
  });

  it('defaults: paperSize=TABLOID, orientation=PORTRAIT, drawingScale=50, origin=(0,0)', () => {
    const r = paperRectWorld({});
    // TABLOID portrait = 11 × 17, scale 50.
    expect(r).toEqual({ minX: 0, minY: 0, maxX: 11 * 50, maxY: 17 * 50 });
  });

  it('handles state-plane origin (millions of feet) without precision loss', () => {
    // Garland-style: origin around (3,245,000, -10,385,000).
    const r = paperRectWorld({
      paperSize: 'LETTER',
      paperOrientation: 'LANDSCAPE',
      drawingScale: 50,
      paperOrigin: { x: 3245557, y: -10385479 },
    });
    expect(r.maxX - r.minX).toBe(11 * 50);
    expect(r.maxY - r.minY).toBe(8.5 * 50);
    expect(r.minX).toBe(3245557);
    expect(r.minY).toBe(-10385479);
  });
});

describe('CanvasViewport — Slice 1 wires the cad:zoomToPaper handler', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
    'utf8',
  );

  it('declares an onZoomToPaper handler that reads paper settings + calls zoomToExtents', () => {
    expect(SRC).toMatch(/const onZoomToPaper = \(\) =>/);
    expect(SRC).toMatch(/paperOrigin\?\.x \?\? 0/);
    expect(SRC).toMatch(/vpStore\.zoomToExtents\(\{ minX: ox, minY: oy, maxX: ox \+ paperW, maxY: oy \+ paperH \}/);
  });

  it('registers the handler on cad:zoomToPaper + cleans it up', () => {
    expect(SRC).toMatch(/window\.addEventListener\('cad:zoomToPaper', onZoomToPaper\)/);
    expect(SRC).toMatch(/window\.removeEventListener\('cad:zoomToPaper', onZoomToPaper\)/);
  });
});

describe('MenuBar — Slice 1 dispatches cad:zoomToPaper after TRV import', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
    'utf8',
  );

  it('BOTH TRV branches dispatch cad:zoomToPaper after paper-fit', () => {
    const zoomToPaperDispatches = SRC.match(/dispatchEvent\(new CustomEvent\('cad:zoomToPaper'\)\)/g) ?? [];
    expect(zoomToPaperDispatches.length).toBe(2);
  });

  it('cad:zoomExtents is NO LONGER dispatched by the TRV branches (only by the .starr open + zoom toolbar paths)', () => {
    // .starr Open dialog still uses cad:zoomExtents (it has no
    // paper-fit step), plus the zoom-extents toolbar button — so
    // ≥ 1 dispatch remains, but the TRV branches don't fire it.
    // The two TRV branches sit between cad-trv-import-display
    // Slice 1 comments — assert that neither comment block is
    // followed by a cad:zoomExtents dispatch.
    const trvBranchExtents = SRC.match(/cad-trv-import-display Slice 1[\s\S]{0,400}cad:zoomExtents/g) ?? [];
    expect(trvBranchExtents.length).toBe(0);
  });
});
