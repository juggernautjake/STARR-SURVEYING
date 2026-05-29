// __tests__/hub/grid-resize.test.ts
//
// Slice 99 — resize-handle math. Covers the pure helpers; the React
// handle itself is exercised by the Playwright suite (pointer events
// don't translate cleanly to vitest's node env).

import { describe, it, expect } from 'vitest';
import {
  computeResize,
  gridSizeToPixels,
  isDifferentSize,
  type CellDimensions,
} from '@/lib/hub/grid-resize';

const CELL: CellDimensions = { cellW: 100, cellH: 50, gap: 10 };

describe('computeResize — snapping', () => {
  it('zero delta returns the current size', () => {
    expect(
      computeResize({ w: 6, h: 2 }, { dx: 0, dy: 0 }, CELL, { w: 1, h: 1 }, { w: 12, h: 4 }),
    ).toEqual({ w: 6, h: 2 });
  });

  it('one cell of pointer travel (cellW + gap) bumps by one column', () => {
    expect(
      computeResize({ w: 6, h: 2 }, { dx: 110, dy: 0 }, CELL, { w: 1, h: 1 }, { w: 12, h: 4 }),
    ).toEqual({ w: 7, h: 2 });
  });

  it('rounds toward the nearest cell boundary at half-cell+', () => {
    // dx = 56 -> 56/110 = 0.51 -> rounds to 1
    expect(
      computeResize({ w: 6, h: 2 }, { dx: 56, dy: 0 }, CELL, { w: 1, h: 1 }, { w: 12, h: 4 }).w,
    ).toBe(7);
  });

  it('stays at the current size below the half-cell threshold', () => {
    expect(
      computeResize({ w: 6, h: 2 }, { dx: 50, dy: 0 }, CELL, { w: 1, h: 1 }, { w: 12, h: 4 }),
    ).toEqual({ w: 6, h: 2 });
  });

  it('negative deltas shrink', () => {
    expect(
      computeResize({ w: 6, h: 2 }, { dx: -220, dy: -60 }, CELL, { w: 1, h: 1 }, { w: 12, h: 4 }),
    ).toEqual({ w: 4, h: 1 });
  });

  it('cannot shrink below minSize', () => {
    expect(
      computeResize({ w: 4, h: 2 }, { dx: -9999, dy: -9999 }, CELL, { w: 3, h: 1 }, { w: 12, h: 4 }),
    ).toEqual({ w: 3, h: 1 });
  });

  it('cannot grow beyond maxSize', () => {
    expect(
      computeResize({ w: 4, h: 2 }, { dx: 9999, dy: 9999 }, CELL, { w: 3, h: 1 }, { w: 12, h: 4 }),
    ).toEqual({ w: 12, h: 4 });
  });

  it('handles cellW or cellH = 0 by not changing that axis', () => {
    expect(
      computeResize(
        { w: 6, h: 2 },
        { dx: 999, dy: 999 },
        { cellW: 0, cellH: 50, gap: 10 },
        { w: 1, h: 1 },
        { w: 12, h: 4 },
      ),
    ).toEqual({ w: 6, h: 4 });
  });

  it('handles a swapped min/max envelope by clamping in canonical order', () => {
    expect(
      computeResize({ w: 4, h: 2 }, { dx: 9999, dy: 0 }, CELL, { w: 12, h: 4 }, { w: 1, h: 1 }).w,
    ).toBeLessThanOrEqual(12);
  });
});

describe('gridSizeToPixels', () => {
  it('1×1 returns one cell of pixels', () => {
    expect(gridSizeToPixels({ w: 1, h: 1 }, CELL)).toEqual({ px: 100, py: 50 });
  });

  it('2×2 includes one internal gap on each axis', () => {
    expect(gridSizeToPixels({ w: 2, h: 2 }, CELL)).toEqual({ px: 210, py: 110 });
  });

  it('larger sizes accumulate gaps correctly', () => {
    expect(gridSizeToPixels({ w: 12, h: 4 }, CELL).px).toBe(12 * 100 + 11 * 10);
  });

  it('0×0 returns 0 with no negative gaps', () => {
    expect(gridSizeToPixels({ w: 0, h: 0 }, CELL)).toEqual({ px: 0, py: 0 });
  });
});

describe('isDifferentSize', () => {
  it('returns false for identical sizes', () => {
    expect(isDifferentSize({ w: 6, h: 2 }, { w: 6, h: 2 })).toBe(false);
  });

  it('returns true when w differs', () => {
    expect(isDifferentSize({ w: 6, h: 2 }, { w: 7, h: 2 })).toBe(true);
  });

  it('returns true when h differs', () => {
    expect(isDifferentSize({ w: 6, h: 2 }, { w: 6, h: 3 })).toBe(true);
  });
});
