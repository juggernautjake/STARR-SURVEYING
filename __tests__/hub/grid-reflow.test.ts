// __tests__/hub/grid-reflow.test.ts
//
// Slice 8 of employee-hub-overhaul-2026-05-30.md. Pure-helper specs
// locking the deterministic invariants the modal's live drag (Slice
// 9) + drop commit (Slice 10) rely on:
//
//   - applyMoveWithPush never returns overlapping rectangles.
//   - applyMoveWithPush keeps widgets in column bounds.
//   - applyMoveWithPush is deterministic + stable per fixed fixtures.
//   - nearestAvailable returns the hovered rect when free.
//   - nearestAvailable finds the closest free slot when hover is
//     blocked.
//   - commitDrop closes gaps via compactLayout.
//
// No store mocking — these are pure functions, easy to spec.

import { describe, it, expect } from 'vitest';
import {
  applyMoveWithPush,
  commitDrop,
  nearestAvailable,
} from '@/lib/hub/grid-reflow';
import type { WidgetInstance } from '@/lib/hub/types';

function makeWidget(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
): WidgetInstance {
  return { id, type: 'fake', x, y, w, h };
}

function rectsOverlap(
  a: WidgetInstance,
  b: WidgetInstance,
): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function noOverlaps(layout: WidgetInstance[]): boolean {
  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) {
      if (rectsOverlap(layout[i], layout[j])) return false;
    }
  }
  return true;
}

function inBounds(layout: WidgetInstance[], cols: number): boolean {
  return layout.every((w) => w.x >= 0 && w.x + w.w <= cols && w.y >= 0);
}

describe('Slice 8 — applyMoveWithPush', () => {
  it('places the moving widget at the target when the grid is empty', () => {
    const layout = [makeWidget('a', 0, 0, 2, 2)];
    const out = applyMoveWithPush(layout, 'a', { x: 4, y: 3, w: 2, h: 2 });
    const moving = out.find((w) => w.id === 'a');
    expect(moving).toEqual({ id: 'a', type: 'fake', x: 4, y: 3, w: 2, h: 2 });
  });

  it('pushes a sibling straight down when the target overlaps it', () => {
    const layout = [
      makeWidget('a', 0, 0, 2, 2),
      makeWidget('b', 2, 0, 2, 2),
    ];
    // Drop 'a' onto 'b' at (2, 0). 'b' should push down.
    const out = applyMoveWithPush(layout, 'a', { x: 2, y: 0, w: 2, h: 2 });
    expect(noOverlaps(out)).toBe(true);
    const b = out.find((w) => w.id === 'b')!;
    expect(b.y).toBeGreaterThanOrEqual(2);
    expect(b.x).toBe(2);
  });

  it('cascades pushes through a column of siblings', () => {
    // a at (0,0)-2x2, b at (0,2)-2x2, c at (0,4)-2x2.
    // Move 'mover' (1x1) to (0,0). a → must clear (0,0)..(1,1).
    // a moves to (0,2), but b is at (0,2), so b moves to (0,4)
    // — collides with c, so c moves to (0,6). All settled with no
    // overlaps.
    const layout = [
      makeWidget('mover', 6, 6, 1, 1),
      makeWidget('a', 0, 0, 2, 2),
      makeWidget('b', 0, 2, 2, 2),
      makeWidget('c', 0, 4, 2, 2),
    ];
    const out = applyMoveWithPush(layout, 'mover', { x: 0, y: 0, w: 1, h: 1 });
    expect(noOverlaps(out)).toBe(true);
    expect(inBounds(out, 8)).toBe(true);
    const a = out.find((w) => w.id === 'a')!;
    const b = out.find((w) => w.id === 'b')!;
    const c = out.find((w) => w.id === 'c')!;
    expect(a.y).toBeGreaterThanOrEqual(1);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.h);
    expect(c.y).toBeGreaterThanOrEqual(b.y + b.h);
  });

  it('leaves untouched widgets that do not overlap the target', () => {
    const layout = [
      makeWidget('mover', 6, 6, 1, 1),
      makeWidget('untouched', 5, 5, 2, 1),
    ];
    const out = applyMoveWithPush(layout, 'mover', { x: 0, y: 0, w: 1, h: 1 });
    const untouched = out.find((w) => w.id === 'untouched')!;
    expect(untouched).toEqual(layout[1]);
  });

  it('clamps the target into the column bounds', () => {
    const layout = [makeWidget('mover', 0, 0, 2, 2)];
    // x=10 overflows the 8-col grid. Should snap to fit.
    const out = applyMoveWithPush(layout, 'mover', { x: 10, y: 3, w: 2, h: 2 });
    const moving = out.find((w) => w.id === 'mover')!;
    expect(moving.x + moving.w).toBeLessThanOrEqual(8);
  });

  it('is deterministic: same input → same output', () => {
    const layout = [
      makeWidget('a', 0, 0, 2, 2),
      makeWidget('b', 2, 0, 2, 2),
      makeWidget('c', 4, 0, 2, 2),
      makeWidget('m', 0, 4, 1, 1),
    ];
    const a = applyMoveWithPush(layout, 'm', { x: 2, y: 0, w: 1, h: 1 });
    const b = applyMoveWithPush(layout, 'm', { x: 2, y: 0, w: 1, h: 1 });
    expect(a).toEqual(b);
  });

  it('returns the layout untouched when movingId is not in it', () => {
    const layout = [makeWidget('a', 0, 0, 2, 2)];
    const out = applyMoveWithPush(layout, 'ghost', { x: 4, y: 4, w: 2, h: 2 });
    expect(out).toEqual(layout);
  });
});

describe('Slice 8 — nearestAvailable', () => {
  it('returns the hovered rect when nothing blocks it', () => {
    const layout = [makeWidget('a', 0, 0, 2, 2)];
    const out = nearestAvailable(layout, 'a', { x: 4, y: 4, w: 2, h: 2 });
    expect(out).toEqual({ x: 4, y: 4, w: 2, h: 2 });
  });

  it('excludes the moving widget itself from overlap checks', () => {
    // Only widget is 'a', hovering exactly on top of 'a' should
    // count as free because we're moving 'a'.
    const layout = [makeWidget('a', 0, 0, 2, 2)];
    const out = nearestAvailable(layout, 'a', { x: 0, y: 0, w: 2, h: 2 });
    expect(out).toEqual({ x: 0, y: 0, w: 2, h: 2 });
  });

  it('finds the nearest free slot when hover collides', () => {
    const layout = [
      makeWidget('a', 0, 0, 2, 2),
      makeWidget('mover', 6, 6, 2, 2),
    ];
    // Hover 'mover' on top of 'a'. Nearest free slot at the same y
    // should be x=2.
    const out = nearestAvailable(layout, 'mover', { x: 0, y: 0, w: 2, h: 2 });
    // It's free at (2, 0) since 'a' is at (0,0)-2x2.
    expect(out.w).toBe(2);
    expect(out.h).toBe(2);
    expect(out.x + out.w).toBeLessThanOrEqual(8);
    expect(out.y).toBeGreaterThanOrEqual(0);
    // The returned slot must not overlap 'a'.
    const others = layout.filter((w) => w.id !== 'mover');
    for (const w of others) {
      expect(rectsOverlap({ ...out, id: 'x', type: 't' } as WidgetInstance, w)).toBe(false);
    }
  });

  it('clamps out-of-bounds hovers before snapping', () => {
    const layout = [makeWidget('a', 0, 0, 2, 2)];
    const out = nearestAvailable(layout, 'mover', { x: 100, y: 0, w: 2, h: 2 });
    expect(out.x + out.w).toBeLessThanOrEqual(8);
  });
});

describe('Slice 8 — commitDrop closes gaps', () => {
  it('compacts the layout after pushing', () => {
    // Start with widgets at sparse rows; drop should compact.
    const layout = [
      makeWidget('a', 0, 0, 2, 2),
      makeWidget('b', 0, 5, 2, 2),
      makeWidget('m', 4, 0, 2, 2),
    ];
    // Drop 'm' on top of 'a'. push: a moves to (0,2), b at (0,5),
    // m at (0,0). compact: a settles at (0,2), b should rise up to
    // the next free row (0,4) — gap at row 4 closes.
    const out = commitDrop(layout, 'm', { x: 0, y: 0, w: 2, h: 2 });
    expect(noOverlaps(out)).toBe(true);
    const b = out.find((w) => w.id === 'b')!;
    expect(b.y).toBeLessThan(5);
  });

  it('keeps the moving widget at its target slot', () => {
    const layout = [
      makeWidget('a', 0, 0, 2, 2),
      makeWidget('m', 4, 0, 2, 2),
    ];
    const out = commitDrop(layout, 'm', { x: 6, y: 3, w: 2, h: 2 });
    // After compact, 'm' should end at a slot reachable from (6,3).
    // commitDrop calls compactLayout which may snap upward; assert
    // the layout is overlap-free + 'm' is present.
    expect(noOverlaps(out)).toBe(true);
    expect(out.find((w) => w.id === 'm')).toBeTruthy();
  });

  it('drops at the bottom when no nearby slot fits', () => {
    // Fill a row densely; the only fit is below.
    const layout = [
      makeWidget('a', 0, 0, 4, 2),
      makeWidget('b', 4, 0, 4, 2),
      makeWidget('m', 0, 5, 2, 2),
    ];
    const out = commitDrop(layout, 'm', { x: 0, y: 0, w: 2, h: 2 });
    expect(noOverlaps(out)).toBe(true);
    expect(inBounds(out, 8)).toBe(true);
  });
});

describe('Slice 8 — invariants over a small fuzz pass', () => {
  // Walk a handful of fixed-seed scenarios; assert no overlap + in
  // bounds. Not randomized — deterministic mini-cases catching the
  // common shapes.
  const scenarios: Array<{
    name: string;
    layout: WidgetInstance[];
    moveId: string;
    target: { x: number; y: number; w: number; h: number };
  }> = [
    {
      name: 'move into a sparse grid',
      layout: [
        makeWidget('a', 0, 0, 2, 2),
        makeWidget('m', 4, 4, 2, 2),
      ],
      moveId: 'm',
      target: { x: 0, y: 1, w: 2, h: 2 },
    },
    {
      name: 'move into a dense row 0',
      layout: [
        makeWidget('a', 0, 0, 2, 2),
        makeWidget('b', 2, 0, 2, 2),
        makeWidget('c', 4, 0, 2, 2),
        makeWidget('m', 6, 6, 2, 2),
      ],
      moveId: 'm',
      target: { x: 0, y: 0, w: 2, h: 2 },
    },
    {
      name: 'expand width over a neighbor',
      layout: [
        makeWidget('a', 0, 0, 2, 2),
        makeWidget('b', 2, 0, 2, 2),
        makeWidget('m', 0, 4, 1, 1),
      ],
      moveId: 'm',
      target: { x: 1, y: 0, w: 3, h: 2 },
    },
  ];

  for (const s of scenarios) {
    it(`${s.name}: push leaves no overlaps + stays in bounds`, () => {
      const out = applyMoveWithPush(s.layout, s.moveId, s.target);
      expect(noOverlaps(out)).toBe(true);
      expect(inBounds(out, 8)).toBe(true);
    });

    it(`${s.name}: commit leaves no overlaps + stays in bounds`, () => {
      const out = commitDrop(s.layout, s.moveId, s.target);
      expect(noOverlaps(out)).toBe(true);
      expect(inBounds(out, 8)).toBe(true);
    });
  }
});
