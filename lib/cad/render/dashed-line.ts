// lib/cad/render/dashed-line.ts — a dashed line in screen space, because Pixi has no dash pattern.
//
// CAD_AUDIT S19d — the last of `CanvasViewport.tsx`'s top-level helpers.
//
// Pixi's `Graphics` draws solid strokes only, so a dashed guide (the mirror axis, the alignment
// hint) is drawn as a run of short segments. That is a loop with three edge cases in it and it had
// no test, because it sat inside a 15,000-line `'use client'` component:
//
//   * a **degenerate** line — two points at the same place — must draw nothing rather than loop;
//   * the **last dash must be clipped** to the endpoint, not overshoot it, or a dashed axis is
//     visibly longer than the thing it marks;
//   * the dash rhythm must not depend on the line's direction, or a guide drawn right-to-left
//     stipples differently from the same guide drawn left-to-right.
//
// Takes `GraphicsLike` rather than Pixi's `Graphics` — the same contract `curve-render.ts` uses, so
// a test can hand it a recorder instead of a canvas.

import type { GraphicsLike } from '../geometry/curve-render';

/** A point already converted to screen space. */
export interface ScreenPoint {
  sx: number;
  sy: number;
}

/** Dash length and gap, in screen pixels. Exported so a test asserts the rhythm the renderer uses
 *  rather than restating numbers that could drift apart from it. */
export const DASH_PX = 6;
export const GAP_PX = 4;

/** Below this the line is a point, and stippling it would emit a dash at the same coordinate twice. */
const MIN_LENGTH_PX = 0.5;

/**
 * Draw a dashed line between two screen points.
 *
 * `lineStyle` is set here rather than by the caller: every call site wanted the same 1.25 weight,
 * and a dashed guide that inherits whatever stroke was last set is how a hint ends up looking like
 * committed geometry.
 */
export function drawDashedScreenLine(
  g: GraphicsLike,
  a: ScreenPoint,
  b: ScreenPoint,
  color: number,
  alpha: number,
): void {
  const dx = b.sx - a.sx;
  const dy = b.sy - a.sy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < MIN_LENGTH_PX) return;

  const ux = dx / len;
  const uy = dy / len;
  g.lineStyle(1.25, color, alpha);

  let t = 0;
  while (t < len) {
    const t0 = t;
    // Clipped to the end. Without the `min` the final dash overshoots by up to DASH_PX, which on a
    // mirror axis reads as the axis being longer than it is.
    const t1 = Math.min(t + DASH_PX, len);
    g.moveTo(a.sx + ux * t0, a.sy + uy * t0);
    g.lineTo(a.sx + ux * t1, a.sy + uy * t1);
    t += DASH_PX + GAP_PX;
  }
}
