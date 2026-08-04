// __tests__/cad/dashed-line.test.ts
//
// CAD_AUDIT S19d — the dashed guide lines (mirror axis, alignment hints).
//
// Pixi draws solid strokes only, so a dash is a run of short segments. That loop has three edge
// cases and had no test, because it lived inside `CanvasViewport.tsx`.

import { describe, it, expect } from 'vitest';
import { drawDashedScreenLine, DASH_PX, GAP_PX } from '@/lib/cad/render/dashed-line';
import type { GraphicsLike } from '@/lib/cad/geometry/curve-render';

function recorder() {
  const segments: Array<{ from: [number, number]; to: [number, number] }> = [];
  let pending: [number, number] | null = null;
  let styled = 0;
  const g: GraphicsLike = {
    lineStyle: () => { styled += 1; },
    beginFill: () => {}, endFill: () => {},
    moveTo: (x, y) => { pending = [x, y]; },
    lineTo: (x, y) => { if (pending) segments.push({ from: pending, to: [x, y] }); pending = null; },
    arc: () => {}, bezierCurveTo: () => {}, quadraticCurveTo: () => {}, closePath: () => {},
    drawCircle: () => {}, drawEllipse: () => {}, drawRect: () => {}, clear: () => {},
  };
  return { g, segments, styled: () => styled };
}

const length = (s: { from: [number, number]; to: [number, number] }) =>
  Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);

describe('it draws a dashed run', () => {
  it('emits several segments across a long line', () => {
    const { g, segments } = recorder();
    drawDashedScreenLine(g, { sx: 0, sy: 0 }, { sx: 100, sy: 0 }, 0xff0000, 1);
    // 100px at 6 on / 4 off = 10 dashes.
    expect(segments.length).toBe(10);
    expect(segments[0].from).toEqual([0, 0]);
  });

  it('uses the published dash rhythm', () => {
    // Asserted against the exported constants rather than restated numbers, so a change to the
    // rhythm updates the test's expectation with it instead of failing as though it were a bug.
    const { g, segments } = recorder();
    drawDashedScreenLine(g, { sx: 0, sy: 0 }, { sx: 100, sy: 0 }, 0, 1);
    expect(length(segments[0])).toBeCloseTo(DASH_PX);
    expect(segments[1].from[0] - segments[0].from[0]).toBeCloseTo(DASH_PX + GAP_PX);
  });

  it('sets its own stroke, once', () => {
    // A dashed hint that inherits whatever stroke was last set looks like committed geometry.
    const { g, styled } = recorder();
    drawDashedScreenLine(g, { sx: 0, sy: 0 }, { sx: 50, sy: 0 }, 0, 1);
    expect(styled()).toBe(1);
  });
});

describe('the edge cases the loop actually has', () => {
  it('draws NOTHING for a degenerate line', () => {
    // Two points at the same place. Without the guard this emits a zero-length dash at the same
    // coordinate — and on a mirror axis a stray dot reads as a snap point that is not there.
    const { g, segments, styled } = recorder();
    drawDashedScreenLine(g, { sx: 10, sy: 10 }, { sx: 10, sy: 10 }, 0, 1);
    expect(segments).toEqual([]);
    expect(styled(), 'it should not even set a stroke').toBe(0);
  });

  it('clips the last dash to the endpoint instead of overshooting', () => {
    // The visible bug: without the clip, a dashed axis is drawn up to DASH_PX longer than the thing
    // it marks, which on a short mirror axis is a quarter of its length.
    const { g, segments } = recorder();
    drawDashedScreenLine(g, { sx: 0, sy: 0 }, { sx: 13, sy: 0 }, 0, 1);
    const last = segments[segments.length - 1];
    expect(last.to[0]).toBeLessThanOrEqual(13);
    expect(length(last)).toBeLessThan(DASH_PX);
  });

  it('never draws past either end, in any direction', () => {
    // Right-to-left and diagonal, because the loop walks a unit vector: a sign error would show up
    // only when the line runs the other way.
    for (const [ax, ay, bx, by] of [[0, 0, 100, 0], [100, 0, 0, 0], [0, 0, 60, 80], [60, 80, 0, 0]]) {
      const { g, segments } = recorder();
      drawDashedScreenLine(g, { sx: ax, sy: ay }, { sx: bx, sy: by }, 0, 1);
      const total = Math.hypot(bx - ax, by - ay);
      for (const s of segments) {
        const dFrom = Math.hypot(s.from[0] - ax, s.from[1] - ay);
        const dTo = Math.hypot(s.to[0] - ax, s.to[1] - ay);
        expect(dTo, `a dash ran past the end on ${ax},${ay}→${bx},${by}`).toBeLessThanOrEqual(total + 1e-6);
        expect(dFrom).toBeLessThanOrEqual(total + 1e-6);
      }
    }
  });

  it('stipples the same whichever way the line is drawn', () => {
    // The same guide drawn A→B and B→A must look identical. It does not have to place dashes at the
    // same coordinates — it has to produce the same NUMBER of them and the same rhythm, or a mirror
    // axis flickers as the surveyor drags across the midpoint and the direction flips.
    const fwd = recorder();
    drawDashedScreenLine(fwd.g, { sx: 0, sy: 0 }, { sx: 100, sy: 0 }, 0, 1);
    const rev = recorder();
    drawDashedScreenLine(rev.g, { sx: 100, sy: 0 }, { sx: 0, sy: 0 }, 0, 1);
    expect(rev.segments.length).toBe(fwd.segments.length);
    expect(length(rev.segments[0])).toBeCloseTo(length(fwd.segments[0]));
  });

  it('a line shorter than one dash still draws one', () => {
    // Otherwise a short axis is invisible, which reads as the tool not having picked one.
    const { g, segments } = recorder();
    drawDashedScreenLine(g, { sx: 0, sy: 0 }, { sx: 3, sy: 0 }, 0, 1);
    expect(segments.length).toBe(1);
    expect(length(segments[0])).toBeCloseTo(3);
  });
});
