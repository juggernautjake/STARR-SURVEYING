// __tests__/cad/geometry/paper-fit.test.ts
import { describe, it, expect } from 'vitest';
import {
  fitPaperToBounds,
  boundsOfPoints,
  ENGINEERING_SCALES,
} from '@/lib/cad/geometry/paper-fit';

describe('boundsOfPoints', () => {
  it('returns null for an empty list', () => {
    expect(boundsOfPoints([])).toBeNull();
  });
  it('computes the bbox', () => {
    expect(
      boundsOfPoints([
        { easting: 100, northing: 200 },
        { easting: 300, northing: 50 },
      ]),
    ).toEqual({ minX: 100, minY: 50, maxX: 300, maxY: 200 });
  });
});

describe('fitPaperToBounds', () => {
  it('centers the paper on the bounds center', () => {
    const bounds = { minX: 1000, minY: 2000, maxX: 1100, maxY: 2100 };
    const { paperOrigin, drawingScale } = fitPaperToBounds(
      bounds,
      'TABLOID',
      'LANDSCAPE',
    );
    // Paper W/H in world feet from the chosen scale (landscape: 17x11 in).
    const paperW = 17 * drawingScale;
    const paperH = 11 * drawingScale;
    const cx = paperOrigin.x + paperW / 2;
    const cy = paperOrigin.y + paperH / 2;
    expect(cx).toBeCloseTo(1050, 6); // bbox center x
    expect(cy).toBeCloseTo(2050, 6); // bbox center y
  });

  it('picks a scale that fits the content within the usable area', () => {
    // 700 ft wide on an 11x17 TABLOID portrait (usable ~7.7 x 11.9 in @15%).
    const bounds = { minX: 0, minY: 0, maxX: 700, maxY: 700 };
    const { drawingScale } = fitPaperToBounds(bounds, 'TABLOID', 'PORTRAIT');
    const usableW = 11 * 0.7; // 7.7 in
    // The content must fit: 700 / scale <= usableW  ⇒ scale >= ~90.9
    expect(700 / drawingScale).toBeLessThanOrEqual(usableW + 1e-9);
    // And it should be the smallest engineering scale that does so.
    expect(ENGINEERING_SCALES).toContain(drawingScale);
  });

  it('uses the smallest scale for a single point (zero-size bounds)', () => {
    const bounds = { minX: 500, minY: 500, maxX: 500, maxY: 500 };
    const { drawingScale, paperOrigin } = fitPaperToBounds(
      bounds,
      'TABLOID',
      'PORTRAIT',
    );
    expect(drawingScale).toBe(ENGINEERING_SCALES[0]);
    // Centered on the point.
    expect(paperOrigin.x + (11 * drawingScale) / 2).toBeCloseTo(500, 6);
    expect(paperOrigin.y + (17 * drawingScale) / 2).toBeCloseTo(500, 6);
  });

  it('handles huge surveys beyond the table by rounding up', () => {
    const bounds = { minX: 0, minY: 0, maxX: 5_000_000, maxY: 10 };
    const { drawingScale } = fitPaperToBounds(bounds, 'LETTER', 'PORTRAIT');
    expect(drawingScale).toBeGreaterThan(0);
    expect(5_000_000 / drawingScale).toBeLessThanOrEqual(8.5 * 0.7 + 1e-6);
  });
});
