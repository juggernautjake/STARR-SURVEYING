// __tests__/hub/grid-resize-push.test.ts
//
// Slice G3 of grid-editor-placement-resize-overhaul-2026-05-30.md.
// Pure-helper specs for applyResizeWithPush: growing a widget pushes
// overlapping neighbors in the drag direction (horizontal flow wraps
// to the next row; vertical flow pushes straight down), shrinking
// moves nobody, no overlaps, in bounds, deterministic.

import { describe, it, expect } from 'vitest';
import { applyResizeWithPush } from '@/lib/hub/grid-reflow';
import type { WidgetInstance } from '@/lib/hub/types';

function w(id: string, x: number, y: number, ww: number, h: number): WidgetInstance {
  return { id, type: 'fake', x, y, w: ww, h };
}

function rectsOverlap(a: WidgetInstance, b: WidgetInstance): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function noOverlaps(layout: WidgetInstance[]): boolean {
  for (let i = 0; i < layout.length; i++)
    for (let j = i + 1; j < layout.length; j++)
      if (rectsOverlap(layout[i], layout[j])) return false;
  return true;
}
function inBounds(layout: WidgetInstance[], cols: number): boolean {
  return layout.every((x) => x.x >= 0 && x.x + x.w <= cols && x.y >= 0);
}

describe('Slice G3 — applyResizeWithPush: grow horizontally pushes right', () => {
  it('the resized widget takes the new rect exactly', () => {
    const layout = [w('a', 0, 0, 2, 2), w('b', 2, 0, 2, 2)];
    const out = applyResizeWithPush(layout, 'a', { x: 0, y: 0, w: 4, h: 2 }, 8);
    const a = out.find((x) => x.id === 'a')!;
    expect({ x: a.x, y: a.y, w: a.w, h: a.h }).toEqual({ x: 0, y: 0, w: 4, h: 2 });
  });

  it('pushes the adjacent right neighbor further right', () => {
    const layout = [w('a', 0, 0, 2, 2), w('b', 2, 0, 2, 2)];
    // a grows from width 2 to width 4 → collides with b at x=2.
    const out = applyResizeWithPush(layout, 'a', { x: 0, y: 0, w: 4, h: 2 }, 8);
    const b = out.find((x) => x.id === 'b')!;
    expect(b.x).toBeGreaterThanOrEqual(4); // shoved out of a's new footprint
    expect(noOverlaps(out)).toBe(true);
    expect(inBounds(out, 8)).toBe(true);
  });

  it('wraps a pushed neighbor to the next row when it runs out of columns', () => {
    // b sits at the right edge; growing a wide should wrap b down.
    const layout = [w('a', 0, 0, 2, 2), w('b', 6, 0, 2, 2)];
    const out = applyResizeWithPush(layout, 'a', { x: 0, y: 0, w: 7, h: 2 }, 8);
    const b = out.find((x) => x.id === 'b')!;
    // b can't fit at x>=7 with width 2 in an 8-col grid, so it wraps.
    expect(b.x + b.w).toBeLessThanOrEqual(8);
    expect(b.y).toBeGreaterThanOrEqual(2);
    expect(noOverlaps(out)).toBe(true);
    expect(inBounds(out, 8)).toBe(true);
  });
});

describe('Slice G3 — applyResizeWithPush: grow vertically pushes down', () => {
  it('pushes the widget below straight down', () => {
    const layout = [w('a', 0, 0, 2, 2), w('b', 0, 2, 2, 2)];
    // a grows from height 2 to height 4 → collides with b at y=2.
    const out = applyResizeWithPush(layout, 'a', { x: 0, y: 0, w: 2, h: 4 }, 8);
    const b = out.find((x) => x.id === 'b')!;
    expect(b.y).toBeGreaterThanOrEqual(4);
    expect(b.x).toBe(0); // straight down, no horizontal shift
    expect(noOverlaps(out)).toBe(true);
  });

  it('cascades through a vertical stack', () => {
    const layout = [w('a', 0, 0, 2, 1), w('b', 0, 1, 2, 1), w('c', 0, 2, 2, 1)];
    // a grows to height 2 → pushes b down → b pushes c down.
    const out = applyResizeWithPush(layout, 'a', { x: 0, y: 0, w: 2, h: 2 }, 8);
    const a = out.find((x) => x.id === 'a')!;
    const b = out.find((x) => x.id === 'b')!;
    const c = out.find((x) => x.id === 'c')!;
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.h);
    expect(c.y).toBeGreaterThanOrEqual(b.y + b.h);
    expect(noOverlaps(out)).toBe(true);
  });
});

describe('Slice G3 — applyResizeWithPush: shrinking moves nobody', () => {
  it('a smaller rect leaves every neighbor exactly where it was', () => {
    const layout = [w('a', 0, 0, 4, 4), w('b', 4, 0, 2, 2), w('c', 0, 4, 2, 2)];
    const before = JSON.parse(JSON.stringify(layout.filter((x) => x.id !== 'a')));
    const out = applyResizeWithPush(layout, 'a', { x: 0, y: 0, w: 2, h: 2 }, 8);
    const b = out.find((x) => x.id === 'b')!;
    const c = out.find((x) => x.id === 'c')!;
    expect({ x: b.x, y: b.y }).toEqual({ x: before[0].x, y: before[0].y });
    expect({ x: c.x, y: c.y }).toEqual({ x: before[1].x, y: before[1].y });
  });
});

describe('Slice G3 — applyResizeWithPush: robustness', () => {
  it('returns a copy unchanged when the id is not present', () => {
    const layout = [w('a', 0, 0, 2, 2)];
    const out = applyResizeWithPush(layout, 'ghost', { x: 0, y: 0, w: 4, h: 4 }, 8);
    expect(out).toEqual(layout);
  });

  it('clamps an over-wide newRect into the columns', () => {
    const layout = [w('a', 0, 0, 2, 2)];
    const out = applyResizeWithPush(layout, 'a', { x: 6, y: 0, w: 6, h: 2 }, 8);
    const a = out.find((x) => x.id === 'a')!;
    expect(a.x + a.w).toBeLessThanOrEqual(8);
  });

  it('is deterministic for a fixed input', () => {
    const layout = [w('a', 0, 0, 2, 2), w('b', 2, 0, 2, 2), w('c', 4, 0, 2, 2)];
    const r1 = applyResizeWithPush(layout, 'a', { x: 0, y: 0, w: 4, h: 2 }, 8);
    const r2 = applyResizeWithPush(layout, 'a', { x: 0, y: 0, w: 4, h: 2 }, 8);
    expect(r1).toEqual(r2);
  });
});
