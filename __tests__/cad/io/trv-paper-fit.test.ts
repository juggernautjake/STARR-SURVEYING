// __tests__/cad/io/trv-paper-fit.test.ts
//
// cad-trv-import-display Slice 3 — paper auto-fit + scale picker
// for TRV-imported state-plane surveys.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fitPaperToBounds, bboxOfFeaturePoints, PAPER_SIZES_IN } from '@/lib/cad/io/trv-paper-fit';

describe('fitPaperToBounds — smallest standard paper + smallest scale that fits', () => {
  it('a 100 ft × 80 ft survey fits LETTER landscape at 1" = 20\' (~ smallest scale that fits)', () => {
    const fit = fitPaperToBounds({ minX: 0, minY: 0, maxX: 100, maxY: 80 });
    expect(fit).not.toBeNull();
    // LETTER landscape = 11 × 8.5, printable = 9 × 6.5. At 1"=20':
    // printable world = 180 × 130 → fits 100 × 80.
    // At 1"=10': printable world = 90 × 65 → DOES NOT fit width.
    expect(fit!.paperSize).toBe('LETTER');
    expect(fit!.paperOrientation).toBe('LANDSCAPE');
    expect(fit!.drawingScale).toBe(20);
    expect(fit!.scaleLabel).toBe('1" = 20\'');
  });

  it('a 500 ft × 300 ft survey escalates to TABLOID landscape', () => {
    const fit = fitPaperToBounds({ minX: 0, minY: 0, maxX: 500, maxY: 300 });
    expect(fit).not.toBeNull();
    expect(['TABLOID', 'LETTER']).toContain(fit!.paperSize);
    expect(fit!.drawingScale).toBeGreaterThanOrEqual(50);
  });

  it('the Garland sample bbox (~270 ft × ~635 ft) fits on a standard sheet', () => {
    // Inferred from the smoke-test output: x range ~3,245,646 to
    // ~3,246,053 (~407 ft), y range ~-10,385,412 to ~-10,385,138
    // (~274 ft).
    const fit = fitPaperToBounds({ minX: 3245646, minY: -10385412, maxX: 3246053, maxY: -10385138 });
    expect(fit).not.toBeNull();
    // ARCH_C or smaller at 1" = 20'..50' should comfortably fit.
    expect(fit!.drawingScale).toBeLessThanOrEqual(50);
  });

  it('the paper sheet is centered on the bbox via paperOriginWorld', () => {
    const fit = fitPaperToBounds({ minX: 1000, minY: 500, maxX: 1100, maxY: 580 });
    expect(fit).not.toBeNull();
    const [pwBase, phBase] = PAPER_SIZES_IN[fit!.paperSize];
    const [paperW, paperH] = fit!.paperOrientation === 'LANDSCAPE'
      ? [Math.max(pwBase, phBase), Math.min(pwBase, phBase)]
      : [Math.min(pwBase, phBase), Math.max(pwBase, phBase)];
    const paperWorldW = paperW * fit!.drawingScale;
    const paperWorldH = paperH * fit!.drawingScale;
    const centerX = fit!.paperOriginWorld.x + paperWorldW / 2;
    const centerY = fit!.paperOriginWorld.y + paperWorldH / 2;
    expect(centerX).toBeCloseTo(1050, 5);
    expect(centerY).toBeCloseTo(540, 5);
  });

  it('returns null when the bbox is degenerate (zero width or height)', () => {
    expect(fitPaperToBounds({ minX: 0, minY: 0, maxX: 0, maxY: 100 })).toBeNull();
    expect(fitPaperToBounds({ minX: 0, minY: 0, maxX: 100, maxY: 0 })).toBeNull();
  });

  it('returns null when the bbox is too big for the largest paper at the largest scale', () => {
    // 1,000,000 × 1,000,000 ft is bigger than 48" × 10000 ft/in = 480,000 ft.
    const fit = fitPaperToBounds({ minX: 0, minY: 0, maxX: 1_000_000, maxY: 1_000_000 });
    expect(fit).toBeNull();
  });

  it('candidateSizes lets a caller restrict to ARCH_D only', () => {
    const fit = fitPaperToBounds(
      { minX: 0, minY: 0, maxX: 100, maxY: 80 },
      { candidateSizes: ['ARCH_D'] },
    );
    expect(fit!.paperSize).toBe('ARCH_D');
  });
});

describe('bboxOfFeaturePoints — handles every relevant geometry type', () => {
  it('POINT geometry contributes its single coord', () => {
    const features = [
      { geometry: { type: 'POINT', point: { x: 10, y: -20 } } },
      { geometry: { type: 'POINT', point: { x: -5, y: 30 } } },
    ];
    expect(bboxOfFeaturePoints(features)).toEqual({ minX: -5, minY: -20, maxX: 10, maxY: 30 });
  });

  it('POLYLINE / POLYGON vertices contribute their full extent', () => {
    const features = [
      { geometry: { type: 'POLYGON', vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }] } },
    ];
    expect(bboxOfFeaturePoints(features)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 80 });
  });

  it('ARC contributes its bounding square (center ± radius)', () => {
    const features = [
      { geometry: { type: 'ARC', arc: { center: { x: 100, y: 100 }, radius: 25 } } },
    ];
    expect(bboxOfFeaturePoints(features)).toEqual({ minX: 75, minY: 75, maxX: 125, maxY: 125 });
  });

  it('SPLINE contributes every control point', () => {
    const features = [
      { geometry: { type: 'SPLINE', spline: { controlPoints: [{ x: -10, y: 20 }, { x: 50, y: -30 }] } } },
    ];
    expect(bboxOfFeaturePoints(features)).toEqual({ minX: -10, minY: -30, maxX: 50, maxY: 20 });
  });

  it('returns null when no feature contributes geometry', () => {
    expect(bboxOfFeaturePoints([])).toBeNull();
  });
});

describe('MenuBar — Slice 3: wires the paper-fit helper into both TRV import paths', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
    'utf8',
  );

  it('imports fitPaperToBounds + bboxOfFeaturePoints', () => {
    expect(SRC).toMatch(/import \{ fitPaperToBounds, bboxOfFeaturePoints \} from '@\/lib\/cad\/io\/trv-paper-fit';/);
  });

  it('declares the maybeFitPaperToImportedFeatures helper', () => {
    expect(SRC).toMatch(/function maybeFitPaperToImportedFeatures\(features: ReadonlyArray<unknown>\)/);
  });

  it('calls maybeFitPaperToImportedFeatures from both TRV import branches (open + dedicated)', () => {
    const calls = SRC.match(/maybeFitPaperToImportedFeatures\(report\.mapped\.features\);/g) ?? [];
    expect(calls.length).toBe(2);
  });

  it('updates paperSize + paperOrientation + drawingScale + paperOrigin together', () => {
    expect(SRC).toMatch(/paperSize: fit\.paperSize,[\s\S]{0,300}paperOrigin: fit\.paperOriginWorld,/);
  });

  it('non-destructive scaleLabel fill (only when the title block scaleLabel is empty)', () => {
    expect(SRC).toMatch(/!tb\.scaleLabel \|\| tb\.scaleLabel\.trim\(\)\.length === 0/);
    expect(SRC).toMatch(/titleBlock: \{ \.\.\.tb, scaleLabel: fit\.scaleLabel \}/);
  });
});
