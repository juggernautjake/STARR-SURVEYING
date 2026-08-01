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

/**
 * THE ZOOM RANGE IS RELATIVE TO FIT, and the absolute version of it was a real defect.
 *
 * `MAX_SCALE = 8` reads as "eight times", and it is not — it is eight *pixels per world unit*. Every
 * node's world is a fixed 0–100 box, so the scale that fits it in an ordinary frame is already about 6
 * (measured live at 6.06): a DM could magnify their battle map **1.3× and no further** before the
 * control greyed out. On the tactical maps this whole plan exists for, that is very nearly no zoom at
 * all. The same mistake as the level-of-detail tiers below, in the other direction.
 *
 * So the limits are multiples of "the whole map on screen", which is what anyone means by zoom, and
 * they hold on a phone and a desktop alike because fit already accounts for the frame.
 */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 8;

/**
 * Absolute rails, kept only so a degenerate bounds cannot produce a transform that takes the page down.
 * They are deliberately far outside anything reachable by the relative limits above — they are a
 * backstop, not a policy, and the moment they start deciding what a reader can do they are a bug.
 */
export const MIN_SCALE = 0.01;
export const MAX_SCALE = 400;

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

/**
 * The scales this node may be viewed at, in this frame.
 *
 * Derived from fit rather than fixed, so "zoomed all the way in" means the same thing on a phone and a
 * desktop — the alternative is a limit that is generous on a small screen and unreachable on a large one.
 */
export function scaleLimits(bounds: Bounds, frame: FrameSize): { min: number; max: number } {
  const fit = fitScale(bounds, frame);
  return {
    min: clamp(fit * MIN_ZOOM, MIN_SCALE, MAX_SCALE),
    max: clamp(fit * MAX_ZOOM, MIN_SCALE, MAX_SCALE),
  };
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
  /** From `scaleLimits`. Passed in rather than read from the module, because the ceiling depends on the
   *  node's bounds and the reader's frame — a constant here is the defect described at `MIN_ZOOM`. */
  limits: { min: number; max: number } = { min: MIN_SCALE, max: MAX_SCALE },
): Viewport {
  const nextScale = clamp(vp.scale * factor, limits.min, limits.max);
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
 * The `limit` items nearest the centre of the view, out of those actually on screen (M3-4).
 *
 * This is the "likely next level" the prefetch slice is about, and the ordering is the whole argument:
 * **what a reader has centred is what they are about to open.** A pin in the corner of the frame is
 * visible and mostly not where anyone is looking; one they have panned to the middle of the screen is a
 * decision almost made.
 *
 * BOUNDED BY CONSTRUCTION. A city with forty pins would otherwise fire forty full RSC requests the
 * moment it opened, which spends a phone's bandwidth to make one of them fast — the opposite of the
 * point. The caller passes the limit and it is enforced here rather than trusted.
 *
 * Ties break on the ORIGINAL ORDER (a stable sort), so the same view prefetches the same things twice
 * and a re-render does not quietly rotate which pin is warm.
 */
export function visibleNearest<T extends { x: number; y: number }>(
  items: readonly T[],
  vp: Viewport,
  frame: FrameSize,
  limit: number,
  pad = 8,
): T[] {
  if (limit <= 0) return [];
  return items
    .filter((it) => isVisible(vp, frame, { x: it.x, y: it.y, w: 0, h: 0 }, pad))
    .map((it, i) => ({ it, i, d: (it.x - vp.x) ** 2 + (it.y - vp.y) ** 2 }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, limit)
    .map((e) => e.it);
}

/**
 * Level of detail (M3-3).
 *
 * Named tiers rather than a raw number so the renderer's branches read as intent — `lod === 'dots'` says
 * why a label is missing, where a scale comparison does not.
 *
 * ── WHY THIS IS NOT `scale < 0.6`, WHICH IS WHAT IT USED TO BE ─────────────────────────────────────
 *
 * The first version tiered on the raw scale, and **it was dead code.** Every node's world is a fixed
 * 0–100 box, so the scale that fits it in a typical frame is around 6 — measured live at 6.06. Both
 * lower tiers needed a scale under 1.6, i.e. the reader deliberately shrinking the whole map to a
 * quarter of the frame with dead space all around it. Nobody does that, so no pin ever drew as a dot and
 * no label was ever hidden: the feature existed, was styled, was tested, and could not be reached.
 *
 * The mistake was borrowing a threshold from map software where zooming out means *seeing more world*.
 * Here it means *seeing the same world smaller*, and "far out" is simply **the whole map on screen** —
 * whatever number that happens to be in this frame on this device.
 *
 * ── SO THE QUESTION IS NOT HOW FAR OUT, IT IS WHETHER THERE IS ROOM ────────────────────────────────
 *
 * A pin is counter-scaled, so it is the same size on screen at every zoom — a pin never *becomes*
 * small. What actually goes wrong when a reader zooms out is that **labels collide**: forty districts
 * in a city end up 70 screen pixels apart with 110-pixel name pills on them, which is a pile, not
 * information. So the label tier asks the question that matters — *are the two nearest markers on
 * screen further apart than a label is wide?* — and a continent with three far-flung regions keeps its
 * names at the same zoom where a dense city loses them. A rule about the scale could not tell those two
 * maps apart, which is the real reason it was the wrong rule and not merely a mistuned one.
 */
export type Lod = 'dots' | 'labels' | 'full';

/**
 * Screen pixels a label needs beside its dot. Measured from the rendered pill: ~90–120px for a typical
 * place name, plus the dot's own 44px touch target.
 */
export const LABEL_ROOM_PX = 96;
/** Zoomed in this many times past "the whole map fits" is tactical zoom. */
export const FULL_ZOOM = 2;

export interface LodInput {
  scale: number;
  /** What `fitScale` returns for this node in this frame — the "whole map on screen" reference. */
  fitScale: number;
  /**
   * The nearest two markers on screen, in SCREEN pixels. `Infinity` when there are fewer than two, so a
   * lone pin always keeps its name — there is nothing for it to collide with.
   */
  minSpacingPx: number;
}

export function lodFor({ scale, fitScale, minSpacingPx }: LodInput): Lod {
  // A zero/absent fit scale means the bounds are degenerate; treat the current view as the whole map
  // rather than dividing by zero and reporting a tier from `Infinity` or `NaN`.
  const zoom = fitScale > 0 ? scale / fitScale : 1;
  if (zoom >= FULL_ZOOM) return 'full';
  return minSpacingPx < LABEL_ROOM_PX ? 'dots' : 'labels';
}

/**
 * Screen-pixel distance between the two closest of these world points, or `Infinity` for fewer than two.
 *
 * O(n²), and deliberately: it runs on a settled viewport over the pins of one map — tens of points, not
 * thousands — and an approximation here would be a label that flickers on and off as the reader pans,
 * which is worse than the work it saves.
 */
export function minSpacing(points: readonly { x: number; y: number }[], scale: number): number {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) * scale;
      if (d < best) best = d;
    }
  }
  return best;
}
