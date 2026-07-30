// lib/dnd/maps/viewport.ts — the pan/zoom maths (M3-1).
//
// Pure, because every interesting bug in a viewport is arithmetic, not React. "Zoom toward the pointer"
// either keeps the point under the cursor fixed or it does not, and that is a property you can assert with
// numbers in a millisecond — whereas checking it in a browser means dragging a mouse and squinting.
//
// ONE INVARIANT DOES MOST OF THE WORK: **the world point under the pointer does not move while zooming.**
// Every "the map slides away from my cursor" complaint is a violation of it, and it is the reason zoom
// takes a focal point rather than just a scale.
//
// Pointer Events throughout the caller, per the P7-2 note folded in from the superseded battle-map plan:
// mouse, touch and pen through one code path, so a tablet works on day one rather than as a retrofit.

export interface Viewport {
  /** World-space coordinate currently at the centre of the frame. */
  x: number;
  y: number;
  /** Pixels per world unit. */
  scale: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FrameSize {
  width: number;
  height: number;
}

/** The zoom range. Below 1:1 the generated maps turn to mush; above 8× a 100-unit map is unusable. */
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 8;

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The scale at which `bounds` exactly fits `frame`. The basis for "double-tap to fit" and for the initial
 * view — a map that opens at an arbitrary zoom makes the reader do work before they can look at anything.
 */
export function fitScale(bounds: Bounds, frame: FrameSize): number {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  // A degenerate bounds (zero width, or an unset {} from the DB) must not produce Infinity and blank the
  // screen. Fall back to 1:1, which shows *something*.
  if (!(w > 0) || !(h > 0) || !(frame.width > 0) || !(frame.height > 0)) return 1;
  return clamp(Math.min(frame.width / w, frame.height / h), MIN_SCALE, MAX_SCALE);
}

/** The viewport that fits `bounds` in `frame`, centred. */
export function fitViewport(bounds: Bounds, frame: FrameSize): Viewport {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    scale: fitScale(bounds, frame),
  };
}

/** Screen pixel (relative to the frame's top-left) → world coordinate. */
export function screenToWorld(vp: Viewport, frame: FrameSize, sx: number, sy: number): { x: number; y: number } {
  return {
    x: vp.x + (sx - frame.width / 2) / vp.scale,
    y: vp.y + (sy - frame.height / 2) / vp.scale,
  };
}

/** World coordinate → screen pixel. The exact inverse of `screenToWorld`, which is asserted. */
export function worldToScreen(vp: Viewport, frame: FrameSize, wx: number, wy: number): { x: number; y: number } {
  return {
    x: (wx - vp.x) * vp.scale + frame.width / 2,
    y: (wy - vp.y) * vp.scale + frame.height / 2,
  };
}

/**
 * Zoom by `factor`, keeping the world point under (`sx`,`sy`) exactly where it is.
 *
 * THE WHOLE POINT. Zooming about the centre while the user's cursor is in a corner makes the map appear to
 * flee — the thing they were pointing at is the one thing that moves. Solving for the viewport centre that
 * holds the focal world point still is three lines, and skipping it is the single most common viewport bug.
 */
export function zoomAt(
  vp: Viewport,
  frame: FrameSize,
  factor: number,
  sx: number,
  sy: number,
): Viewport {
  const nextScale = clamp(vp.scale * factor, MIN_SCALE, MAX_SCALE);
  // Clamped to the same value → nothing moves. Without this the pan drifts on every wheel tick once the
  // user is already at the zoom limit, which reads as the map slowly sliding away for no reason.
  if (nextScale === vp.scale) return vp;

  const before = screenToWorld(vp, frame, sx, sy);
  const after = screenToWorld({ ...vp, scale: nextScale }, frame, sx, sy);
  return {
    x: vp.x + (before.x - after.x),
    y: vp.y + (before.y - after.y),
    scale: nextScale,
  };
}

/** Pan by a screen-pixel delta (a drag). Divided by scale, so a drag moves the map with the finger at any
 *  zoom rather than accelerating as you zoom in. */
export function panBy(vp: Viewport, dxPx: number, dyPx: number): Viewport {
  return { ...vp, x: vp.x - dxPx / vp.scale, y: vp.y - dyPx / vp.scale };
}

/**
 * Keep the map in view.
 *
 * When the map is SMALLER than the frame it is centred, rather than being allowed to drift into a corner —
 * a zoomed-out map pinned to one edge with dead space beside it looks broken. When it is larger, the centre
 * is clamped so the frame never leaves the map's own extent.
 */
export function clampViewport(vp: Viewport, bounds: Bounds, frame: FrameSize): Viewport {
  const halfW = frame.width / 2 / vp.scale;
  const halfH = frame.height / 2 / vp.scale;
  const worldW = bounds.maxX - bounds.minX;
  const worldH = bounds.maxY - bounds.minY;

  const x = worldW <= halfW * 2
    ? (bounds.minX + bounds.maxX) / 2
    : clamp(vp.x, bounds.minX + halfW, bounds.maxX - halfW);
  const y = worldH <= halfH * 2
    ? (bounds.minY + bounds.maxY) / 2
    : clamp(vp.y, bounds.minY + halfH, bounds.maxY - halfH);

  return { ...vp, x, y };
}

/** The CSS transform for a world-space layer. `transform` only — never `left`/`top`, which would relayout
 *  every child on every frame instead of compositing one. */
export function transformOf(vp: Viewport, frame: FrameSize): string {
  const tx = frame.width / 2 - vp.x * vp.scale;
  const ty = frame.height / 2 - vp.y * vp.scale;
  return `translate(${tx}px, ${ty}px) scale(${vp.scale})`;
}

/**
 * Is this world rectangle visible? M3-3's culling predicate.
 *
 * `pad` is in world units and defaults generously: culling exactly at the edge makes things pop in as they
 * scroll into view, which reads worse than drawing a few extra shapes.
 */
export function isVisible(
  vp: Viewport,
  frame: FrameSize,
  rect: { x: number; y: number; w: number; h: number },
  pad = 8,
): boolean {
  const halfW = frame.width / 2 / vp.scale + pad;
  const halfH = frame.height / 2 / vp.scale + pad;
  return (
    rect.x + rect.w >= vp.x - halfW &&
    rect.x <= vp.x + halfW &&
    rect.y + rect.h >= vp.y - halfH &&
    rect.y <= vp.y + halfH
  );
}

/**
 * Level of detail from the current scale (M3-3).
 *
 * Named tiers rather than a raw number so the renderer's branches read as intent — `lod === 'dots'` says
 * why a label is missing, where `scale < 0.6` does not.
 */
export type Lod = 'dots' | 'labels' | 'full';

export function lodFor(scale: number): Lod {
  if (scale < 0.6) return 'dots';
  if (scale < 1.6) return 'labels';
  return 'full';
}
