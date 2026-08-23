// __tests__/design/drawing.test.ts — the sketch layer's geometry and its fill bucket.
//
// The fill is the part with a real bug surface: it is the one operation that can turn an entire
// drawing a single colour, and the one that people will click on an almost-closed shape and expect
// to work anyway. Most of this file is about that.

import { describe, it, expect } from 'vitest';
import {
  dragRect, constrainLine, simplify, floodFill, parseFillColour, withinTolerance,
  isBoxTool, alwaysConstrained, isRounded, LINE_WIDTHS, DEFAULT_DRAW_STYLE,
} from '@/lib/design/drawing';

/** A blank white canvas buffer. */
function canvas(w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
  }
  return data;
}

function setPixel(data: Uint8ClampedArray, w: number, x: number, y: number, rgb: [number, number, number]) {
  const i = (y * w + x) * 4;
  data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
}

function pixel(data: Uint8ClampedArray, w: number, x: number, y: number) {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

/** A black box outline from (x1,y1) to (x2,y2). */
function drawBox(data: Uint8ClampedArray, w: number, x1: number, y1: number, x2: number, y2: number) {
  for (let x = x1; x <= x2; x += 1) { setPixel(data, w, x, y1, [0, 0, 0]); setPixel(data, w, x, y2, [0, 0, 0]); }
  for (let y = y1; y <= y2; y += 1) { setPixel(data, w, x1, y, [0, 0, 0]); setPixel(data, w, x2, y, [0, 0, 0]); }
}

const RED = { r: 255, g: 0, b: 0, a: 255 };

describe('dragging out a shape', () => {
  it('gives the rectangle between the two corners, whichever way you drag', () => {
    expect(dragRect({ x: 10, y: 10 }, { x: 40, y: 30 }, false)).toEqual({ x: 10, y: 10, w: 30, h: 20 });
    // Dragging up and left must produce the same box, not a negative one.
    expect(dragRect({ x: 40, y: 30 }, { x: 10, y: 10 }, false)).toEqual({ x: 10, y: 10, w: 30, h: 20 });
  });

  it('makes a square when constrained, anchored where you started', () => {
    const r = dragRect({ x: 10, y: 10 }, { x: 50, y: 25 }, true);
    expect(r.w).toBe(r.h);
    expect(r.w).toBe(40);
    expect(r).toMatchObject({ x: 10, y: 10 });
  });

  it('constrains up-and-left drags too, without flipping the anchor', () => {
    const r = dragRect({ x: 100, y: 100 }, { x: 60, y: 90 }, true);
    expect(r.w).toBe(r.h);
    // The square grows back toward the cursor: from 100 leftward and upward by 40.
    expect(r).toMatchObject({ x: 60, y: 60, w: 40, h: 40 });
  });
});

describe('straight lines', () => {
  it('leaves an unconstrained line exactly where the cursor is', () => {
    expect(constrainLine({ x: 0, y: 0 }, { x: 37, y: 11 }, false)).toEqual({ x: 37, y: 11 });
  });

  it('snaps to horizontal when nearly horizontal', () => {
    const p = constrainLine({ x: 0, y: 0 }, { x: 100, y: 6 }, true);
    expect(Math.round(p.y)).toBe(0);
    expect(Math.round(p.x)).toBe(100);
  });

  it('snaps to 45° when nearly diagonal, keeping the length', () => {
    const p = constrainLine({ x: 0, y: 0 }, { x: 100, y: 92 }, true);
    expect(Math.round(p.x)).toBe(Math.round(p.y));
  });
});

describe('simplifying a freehand stroke', () => {
  it('collapses a straight run of points to its endpoints', () => {
    const line = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 0 }));
    expect(simplify(line, 1)).toEqual([{ x: 0, y: 0 }, { x: 39, y: 0 }]);
  });

  it('keeps the corner of an L, because that is the shape', () => {
    const l = [
      ...Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0 })),
      ...Array.from({ length: 20 }, (_, i) => ({ x: 19, y: i })),
    ];
    const out = simplify(l, 1);
    expect(out.length).toBeGreaterThan(2);
    expect(out.some((p) => p.x === 19 && p.y === 0)).toBe(true);
  });

  it('leaves a two-point stroke alone', () => {
    const two = [{ x: 0, y: 0 }, { x: 5, y: 5 }];
    expect(simplify(two)).toEqual(two);
  });
});

describe('colours', () => {
  it('reads #rgb, #rrggbb, rgb() and rgba()', () => {
    expect(parseFillColour('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(parseFillColour('#1D3095')).toEqual({ r: 29, g: 48, b: 149, a: 255 });
    expect(parseFillColour('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 255 });
    expect(parseFillColour('rgba(1, 2, 3, 0.5)').a).toBe(128);
  });

  it('treats near-identical pixels as the same region, and distant ones as different', () => {
    expect(withinTolerance({ r: 250, g: 250, b: 250, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }, 32)).toBe(true);
    expect(withinTolerance({ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }, 32)).toBe(false);
  });
});

describe('the fill bucket', () => {
  it('fills a closed box and does NOT escape it', () => {
    const w = 60, h = 60;
    const data = canvas(w, h);
    drawBox(data, w, 10, 10, 40, 40);

    const changed = floodFill(data, w, h, 25, 25, RED, 32);

    expect(changed).toBeGreaterThan(0);
    expect(pixel(data, w, 25, 25)).toEqual([255, 0, 0]);   // inside: filled
    expect(pixel(data, w, 5, 5)).toEqual([255, 255, 255]);  // outside: untouched
    expect(pixel(data, w, 10, 25)).toEqual([0, 0, 0]);      // the outline itself: untouched
  });

  it('leaks out of a box with a GAP in it — which is the honest behaviour', () => {
    // A bucket that magically closed gaps would be guessing at intent. It leaks, the person sees
    // it leak, and they close the gap or undo. What matters is that undo works, not that the tool
    // pretends the drawing was closed.
    const w = 60, h = 60;
    const data = canvas(w, h);
    drawBox(data, w, 10, 10, 40, 40);
    setPixel(data, w, 25, 10, [255, 255, 255]);   // punch a hole in the top edge

    floodFill(data, w, h, 25, 25, RED, 32);
    expect(pixel(data, w, 5, 5)).toEqual([255, 0, 0]);
  });

  it('does nothing when you click a pixel that is already the fill colour', () => {
    const w = 20, h = 20;
    const data = canvas(w, h);
    setPixel(data, w, 5, 5, [255, 0, 0]);
    expect(floodFill(data, w, h, 5, 5, RED, 32)).toBe(0);
  });

  it('does nothing when you click outside the canvas', () => {
    const data = canvas(20, 20);
    expect(floodFill(data, 20, 20, -3, 5, RED, 32)).toBe(0);
    expect(floodFill(data, 20, 20, 40, 5, RED, 32)).toBe(0);
  });

  it('crosses a soft anti-aliased edge only when tolerance allows it', () => {
    // The classic "why did my whole picture turn blue": a hand-drawn line's edge pixels are a
    // gradient, and a zero-tolerance fill walks straight through them.
    const w = 40, h = 40;
    const soft = canvas(w, h);
    for (let y = 0; y < h; y += 1) setPixel(soft, w, 20, y, [200, 200, 200]);   // a faint divider

    const tight = soft.slice();
    floodFill(tight, w, h, 5, 5, RED, 8);
    expect(pixel(tight, w, 30, 5)).toEqual([255, 255, 255]);   // stopped at the faint line

    const loose = soft.slice();
    floodFill(loose, w, h, 5, 5, RED, 80);
    expect(pixel(loose, w, 30, 5)).toEqual([255, 0, 0]);       // tolerance let it through
  });

  it('fills a large region without exhausting the stack', () => {
    // The recursive four-way version dies here. Scanline pushes one entry per RUN.
    const w = 400, h = 400;
    const data = canvas(w, h);
    const changed = floodFill(data, w, h, 200, 200, RED, 32);
    expect(changed).toBe(w * h);
  });
});

describe('the tool table', () => {
  it('knows which tools drag out a box', () => {
    expect(isBoxTool('rect')).toBe(true);
    expect(isBoxTool('circle')).toBe(true);
    expect(isBoxTool('freehand')).toBe(false);
    expect(isBoxTool('fill')).toBe(false);
  });

  it('knows which are square by nature, so Shift is not required for them', () => {
    expect(alwaysConstrained('square')).toBe(true);
    expect(alwaysConstrained('circle')).toBe(true);
    expect(alwaysConstrained('rect')).toBe(false);
    expect(alwaysConstrained('ellipse')).toBe(false);
  });

  it('knows which take a corner radius', () => {
    expect(isRounded('rounded-rect')).toBe(true);
    expect(isRounded('rounded-square')).toBe(true);
    expect(isRounded('rect')).toBe(false);
  });

  it('offers line widths that are all visible and none absurd', () => {
    expect(LINE_WIDTHS[0]).toBeGreaterThanOrEqual(1);
    expect(Math.max(...LINE_WIDTHS)).toBeLessThanOrEqual(32);
    expect(LINE_WIDTHS).toContain(DEFAULT_DRAW_STYLE.width);
  });
});
