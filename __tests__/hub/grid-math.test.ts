// __tests__/hub/grid-math.test.ts
//
// Coverage for the pure grid math: breakpointForWidth, collapseLayout
// (12 / 6 / 1-col cases), layoutBounds. Re-flow correctness is the
// tricky part — verify widgets don't overlap after collapse and
// relative order is preserved.

import { describe, it, expect } from 'vitest';
import {
  breakpointForWidth,
  collapseLayout,
  compactLayout,
  layoutBounds,
  type GridBreakpoint,
} from '@/lib/hub/grid-math';
import type { WidgetInstance } from '@/lib/hub/types';

function w(id: string, x: number, y: number, ww: number, h: number): WidgetInstance {
  return { id, type: 'test', x, y, w: ww, h };
}

describe('breakpointForWidth', () => {
  it('returns 12 at >= 1280px', () => {
    expect(breakpointForWidth(1280)).toBe(12);
    expect(breakpointForWidth(1920)).toBe(12);
  });

  it('returns 6 in 768-1279', () => {
    expect(breakpointForWidth(768)).toBe(6);
    expect(breakpointForWidth(1279)).toBe(6);
  });

  it('returns 1 below 768', () => {
    expect(breakpointForWidth(767)).toBe(1);
    expect(breakpointForWidth(320)).toBe(1);
  });
});

describe('collapseLayout — 12-col passthrough', () => {
  it('returns input unchanged at breakpoint=12', () => {
    const input = [w('a', 0, 0, 6, 2), w('b', 6, 0, 6, 2)];
    expect(collapseLayout(input, 12)).toEqual(input);
  });
});

describe('collapseLayout — 1-col mobile flow', () => {
  it('stacks widgets in saved order, full-width', () => {
    const input = [w('a', 0, 0, 6, 2), w('b', 6, 0, 6, 3)];
    const out = collapseLayout(input, 1);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ id: 'a', type: 'test', x: 0, y: 0, w: 1, h: 2 });
    expect(out[1]).toEqual({ id: 'b', type: 'test', x: 0, y: 2, w: 1, h: 3 });
  });

  it('preserves saved order across widgets that were on the same row', () => {
    const input = [w('a', 0, 0, 6, 2), w('b', 6, 0, 6, 2), w('c', 0, 2, 12, 2)];
    const out = collapseLayout(input, 1);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(out.map((x) => x.y)).toEqual([0, 2, 4]);
  });
});

describe('collapseLayout — 6-col halving', () => {
  it('halves widths (12 → 6, 8 → 4, 6 → 3, 4 → 2)', () => {
    const out = collapseLayout([
      w('a', 0, 0, 12, 2),
      w('b', 0, 2, 8, 2),
      w('c', 0, 4, 6, 1),
      w('d', 0, 5, 4, 1),
    ], 6);
    const byId = new Map(out.map((x) => [x.id, x]));
    expect(byId.get('a')?.w).toBe(6);
    expect(byId.get('b')?.w).toBe(4);
    expect(byId.get('c')?.w).toBe(3);
    expect(byId.get('d')?.w).toBe(2);
  });

  it('re-flows widgets that would overlap after halving', () => {
    // Two widgets side-by-side at 12-col (6+6) → both become 3 cols
    // but at the same y; reflow should keep them non-overlapping.
    const out = collapseLayout([
      w('a', 0, 0, 6, 2),
      w('b', 6, 0, 6, 2),
    ], 6);
    expect(noOverlaps(out)).toBe(true);
  });

  it('does not let any widget overflow the 6-col grid', () => {
    const out = collapseLayout([w('a', 0, 0, 12, 2), w('b', 8, 4, 4, 2)], 6);
    for (const wi of out) {
      expect(wi.x + wi.w, `${wi.id} fits within 6 cols`).toBeLessThanOrEqual(6);
    }
  });
});

describe('layoutBounds', () => {
  it('computes the bottom-most row used', () => {
    const out = layoutBounds([
      w('a', 0, 0, 6, 2),
      w('b', 6, 2, 6, 3),
    ], 12 as GridBreakpoint);
    expect(out.rows).toBe(5); // b ends at row 5 (y=2 + h=3)
  });

  it('returns the breakpoint as the col count', () => {
    expect(layoutBounds([w('a', 0, 0, 1, 1)], 12).cols).toBe(12);
    expect(layoutBounds([w('a', 0, 0, 1, 1)], 6).cols).toBe(6);
    expect(layoutBounds([w('a', 0, 0, 1, 1)], 1).cols).toBe(1);
  });

  it('returns at least 1 row even for an empty layout', () => {
    expect(layoutBounds([], 12).rows).toBe(1);
  });
});

describe('compactLayout — drag-end reflow', () => {
  it('packs widgets in array order starting at (0, 0)', () => {
    const out = compactLayout([
      w('a', 999, 999, 6, 2),
      w('b', 999, 999, 6, 2),
      w('c', 999, 999, 12, 2),
    ], 12);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(out[0]).toMatchObject({ id: 'a', x: 0, y: 0, w: 6, h: 2 });
    expect(out[1]).toMatchObject({ id: 'b', x: 6, y: 0, w: 6, h: 2 });
    expect(out[2]).toMatchObject({ id: 'c', x: 0, y: 2, w: 12, h: 2 });
  });

  it('preserves array order even when sizes vary', () => {
    const out = compactLayout([
      w('big', 0, 0, 12, 2),
      w('small1', 0, 0, 3, 2),
      w('small2', 0, 0, 3, 2),
      w('small3', 0, 0, 3, 2),
      w('small4', 0, 0, 3, 2),
    ], 12);
    expect(out.map((x) => x.id)).toEqual(['big', 'small1', 'small2', 'small3', 'small4']);
  });

  it('produces no overlaps regardless of input', () => {
    const out = compactLayout([
      w('a', 0, 0, 12, 2),
      w('b', 0, 0, 8, 3),
      w('c', 0, 0, 5, 2),
      w('d', 0, 0, 4, 1),
      w('e', 0, 0, 3, 2),
    ], 12);
    expect(noOverlaps(out)).toBe(true);
  });

  it('clamps widths wider than the grid to the grid width', () => {
    const out = compactLayout([w('a', 0, 0, 99, 2)], 12);
    expect(out[0].w).toBe(12);
  });

  it('clamps non-positive widths/heights to 1', () => {
    const out = compactLayout([w('a', 0, 0, 0, 0)], 12);
    expect(out[0].w).toBe(1);
    expect(out[0].h).toBe(1);
  });

  it('an empty array returns empty', () => {
    expect(compactLayout([], 12)).toEqual([]);
  });

  it('does not mutate the input', () => {
    const input = [w('a', 5, 7, 6, 2)];
    const before = JSON.stringify(input);
    compactLayout(input, 12);
    expect(JSON.stringify(input)).toBe(before);
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────

function noOverlaps(widgets: WidgetInstance[]): boolean {
  for (let i = 0; i < widgets.length; i++) {
    for (let j = i + 1; j < widgets.length; j++) {
      const a = widgets[i];
      const b = widgets[j];
      const overlap =
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y;
      if (overlap) return false;
    }
  }
  return true;
}
