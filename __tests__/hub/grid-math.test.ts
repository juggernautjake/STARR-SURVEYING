// __tests__/hub/grid-math.test.ts
//
// Coverage for the pure grid math: breakpointForWidth, collapseLayout
// (8 / 4 / 1-col cases — Slice 209 rebalanced from the old 12/6/1),
// layoutBounds. Re-flow correctness is the tricky part — verify
// widgets don't overlap after collapse and relative order is
// preserved.

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
  it('returns 8 at >= 1024px', () => {
    expect(breakpointForWidth(1024)).toBe(8);
    expect(breakpointForWidth(1920)).toBe(8);
  });

  it('returns 4 in 640-1023', () => {
    expect(breakpointForWidth(640)).toBe(4);
    expect(breakpointForWidth(1023)).toBe(4);
  });

  it('returns 1 below 640', () => {
    expect(breakpointForWidth(639)).toBe(1);
    expect(breakpointForWidth(320)).toBe(1);
  });
});

describe('collapseLayout — 8-col passthrough', () => {
  it('returns input unchanged at breakpoint=8', () => {
    const input = [w('a', 0, 0, 4, 2), w('b', 4, 0, 4, 2)];
    expect(collapseLayout(input, 8)).toEqual(input);
  });
});

describe('collapseLayout — 1-col mobile flow', () => {
  it('stacks widgets in saved order, full-width', () => {
    const input = [w('a', 0, 0, 4, 2), w('b', 4, 0, 4, 3)];
    const out = collapseLayout(input, 1);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ id: 'a', type: 'test', x: 0, y: 0, w: 1, h: 2 });
    expect(out[1]).toEqual({ id: 'b', type: 'test', x: 0, y: 2, w: 1, h: 3 });
  });

  it('preserves saved order across widgets that were on the same row', () => {
    const input = [w('a', 0, 0, 4, 2), w('b', 4, 0, 4, 2), w('c', 0, 2, 8, 2)];
    const out = collapseLayout(input, 1);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(out.map((x) => x.y)).toEqual([0, 2, 4]);
  });
});

describe('collapseLayout — 4-col halving', () => {
  it('halves widths (8 → 4, 6 → 3, 4 → 2, 3 → 2)', () => {
    const out = collapseLayout([
      w('a', 0, 0, 8, 2),
      w('b', 0, 2, 6, 2),
      w('c', 0, 4, 4, 1),
      w('d', 0, 5, 3, 1),
    ], 4);
    const byId = new Map(out.map((x) => [x.id, x]));
    expect(byId.get('a')?.w).toBe(4);
    expect(byId.get('b')?.w).toBe(3);
    expect(byId.get('c')?.w).toBe(2);
    expect(byId.get('d')?.w).toBe(2);
  });

  it('re-flows widgets that would overlap after halving', () => {
    const out = collapseLayout([
      w('a', 0, 0, 4, 2),
      w('b', 4, 0, 4, 2),
    ], 4);
    expect(noOverlaps(out)).toBe(true);
  });

  it('does not let any widget overflow the 4-col grid', () => {
    const out = collapseLayout([w('a', 0, 0, 8, 2), w('b', 6, 4, 4, 2)], 4);
    for (const wi of out) {
      expect(wi.x + wi.w, `${wi.id} fits within 4 cols`).toBeLessThanOrEqual(4);
    }
  });
});

describe('layoutBounds', () => {
  it('computes the bottom-most row used', () => {
    const out = layoutBounds([
      w('a', 0, 0, 4, 2),
      w('b', 4, 2, 4, 3),
    ], 8 as GridBreakpoint);
    expect(out.rows).toBe(5);
  });

  it('returns the breakpoint as the col count', () => {
    expect(layoutBounds([w('a', 0, 0, 1, 1)], 8).cols).toBe(8);
    expect(layoutBounds([w('a', 0, 0, 1, 1)], 4).cols).toBe(4);
    expect(layoutBounds([w('a', 0, 0, 1, 1)], 1).cols).toBe(1);
  });

  it('returns at least 1 row even for an empty layout', () => {
    expect(layoutBounds([], 8).rows).toBe(1);
  });
});

describe('compactLayout — drag-end reflow', () => {
  it('packs widgets in array order starting at (0, 0)', () => {
    const out = compactLayout([
      w('a', 999, 999, 4, 2),
      w('b', 999, 999, 4, 2),
      w('c', 999, 999, 8, 2),
    ], 8);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(out[0]).toMatchObject({ id: 'a', x: 0, y: 0, w: 4, h: 2 });
    expect(out[1]).toMatchObject({ id: 'b', x: 4, y: 0, w: 4, h: 2 });
    expect(out[2]).toMatchObject({ id: 'c', x: 0, y: 2, w: 8, h: 2 });
  });

  it('preserves array order even when sizes vary', () => {
    const out = compactLayout([
      w('big', 0, 0, 8, 2),
      w('small1', 0, 0, 2, 2),
      w('small2', 0, 0, 2, 2),
      w('small3', 0, 0, 2, 2),
      w('small4', 0, 0, 2, 2),
    ], 8);
    expect(out.map((x) => x.id)).toEqual(['big', 'small1', 'small2', 'small3', 'small4']);
  });

  it('produces no overlaps regardless of input', () => {
    const out = compactLayout([
      w('a', 0, 0, 8, 2),
      w('b', 0, 0, 6, 3),
      w('c', 0, 0, 4, 2),
      w('d', 0, 0, 3, 1),
      w('e', 0, 0, 2, 2),
    ], 8);
    expect(noOverlaps(out)).toBe(true);
  });

  it('clamps widths wider than the grid to the grid width', () => {
    const out = compactLayout([w('a', 0, 0, 99, 2)], 8);
    expect(out[0].w).toBe(8);
  });

  it('clamps non-positive widths/heights to 1', () => {
    const out = compactLayout([w('a', 0, 0, 0, 0)], 8);
    expect(out[0].w).toBe(1);
    expect(out[0].h).toBe(1);
  });

  it('an empty array returns empty', () => {
    expect(compactLayout([], 8)).toEqual([]);
  });

  it('does not mutate the input', () => {
    const input = [w('a', 5, 7, 4, 2)];
    const before = JSON.stringify(input);
    compactLayout(input, 8);
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
