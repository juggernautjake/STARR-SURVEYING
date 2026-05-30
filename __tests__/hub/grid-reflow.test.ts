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
//   - commitDrop is free-placement (Slice G1): the moving widget
//     lands exactly where dropped, neighbors get pushed, only a
//     fully-empty top band trims, interior gaps survive.
//
// No store mocking — these are pure functions, easy to spec.

import { describe, it, expect } from 'vitest';
import {
  applyMoveWithPush,
  commitDrop,
  nearestAvailable,
  trimLeadingRows,
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

describe('Slice G1 — commitDrop is free-placement (no compaction)', () => {
  it('lands the moving widget EXACTLY at its dropped target', () => {
    const layout = [
      makeWidget('a', 0, 0, 2, 2),
      makeWidget('m', 4, 0, 2, 2),
    ];
    const out = commitDrop(layout, 'm', { x: 6, y: 3, w: 2, h: 2 });
    const m = out.find((w) => w.id === 'm')!;
    expect({ x: m.x, y: m.y }).toEqual({ x: 6, y: 3 });
    expect(noOverlaps(out)).toBe(true);
  });

  it('preserves interior gaps — a drop at row 5 with a gap above keeps the gap', () => {
    // 'a' at row 0, drop 'm' down at row 5. Rows 2..4 between them are
    // a deliberate gap and must survive (free placement). The top
    // isn't empty (a is at row 0), so trimLeadingRows is a no-op.
    const layout = [
      makeWidget('a', 0, 0, 2, 2),
      makeWidget('m', 4, 0, 2, 2),
    ];
    const out = commitDrop(layout, 'm', { x: 0, y: 5, w: 2, h: 2 });
    const a = out.find((w) => w.id === 'a')!;
    const m = out.find((w) => w.id === 'm')!;
    expect(a.y).toBe(0);
    expect(m.y).toBe(5); // gap at rows 2-4 preserved
    expect(noOverlaps(out)).toBe(true);
  });

  it('trims ONLY a fully-empty top band (everything slides up by min y)', () => {
    // Both widgets sit at rows >= 3 with the whole top empty. Trim
    // slides the layout up so the topmost widget lands on row 0, but
    // the gap BETWEEN them is preserved.
    const layout = [
      makeWidget('a', 0, 3, 2, 2),
      makeWidget('m', 4, 0, 2, 2),
    ];
    // Drop m at (4, 6); a stays at (0,3). min y across the result is 3.
    const out = commitDrop(layout, 'm', { x: 4, y: 6, w: 2, h: 2 });
    const a = out.find((w) => w.id === 'a')!;
    const m = out.find((w) => w.id === 'm')!;
    expect(a.y).toBe(0); // 3 - 3
    expect(m.y).toBe(3); // 6 - 3, gap preserved
    expect(noOverlaps(out)).toBe(true);
  });

  it('pushes an overlapped neighbor down out of the dropped target', () => {
    const layout = [
      makeWidget('a', 0, 0, 2, 2),
      makeWidget('m', 4, 0, 2, 2),
    ];
    // Drop m onto a at (0,0). a must move down; m keeps (0,0).
    const out = commitDrop(layout, 'm', { x: 0, y: 0, w: 2, h: 2 });
    const a = out.find((w) => w.id === 'a')!;
    const m = out.find((w) => w.id === 'm')!;
    expect({ x: m.x, y: m.y }).toEqual({ x: 0, y: 0 });
    expect(a.y).toBeGreaterThanOrEqual(2);
    expect(noOverlaps(out)).toBe(true);
  });
});

describe('Slice G1 — trimLeadingRows', () => {
  it('returns [] for an empty layout', () => {
    expect(trimLeadingRows([])).toEqual([]);
  });

  it('is a no-op when some widget already sits on row 0', () => {
    const layout = [makeWidget('a', 0, 0, 2, 2), makeWidget('b', 2, 4, 2, 2)];
    const out = trimLeadingRows(layout);
    expect(out.map((w) => w.y)).toEqual([0, 4]);
  });

  it('slides everything up by the minimum y when the top is empty', () => {
    const layout = [makeWidget('a', 0, 2, 2, 2), makeWidget('b', 2, 5, 2, 2)];
    const out = trimLeadingRows(layout);
    expect(out.find((w) => w.id === 'a')!.y).toBe(0);
    expect(out.find((w) => w.id === 'b')!.y).toBe(3); // gap preserved
  });

  it('preserves x + w + h (only y shifts)', () => {
    const layout = [makeWidget('a', 3, 4, 2, 1)];
    const out = trimLeadingRows(layout);
    expect(out[0]).toMatchObject({ id: 'a', x: 3, y: 0, w: 2, h: 1 });
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
