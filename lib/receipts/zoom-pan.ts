// lib/receipts/zoom-pan.ts — slice V2 of
// docs/planning/in-progress/RECEIPT_REVIEW_SLIDESHOW_2026-08-14.md
//
// Owner, 2026-08-14: *"make it so that we can zoom in on the receipts to review the information and
// pan around on the image."*
//
// ── WHY THE MATH IS OUT HERE ────────────────────────────────────────────────────────────────────
//
// Zoom-and-pan reads as trivial and has three ways to be subtly wrong, none of which throws:
//
//   1. **Zooming about the centre instead of the cursor.** You point at the total, scroll, and the
//      total slides away. Every zoom becomes zoom-then-hunt. This is the single thing that decides
//      whether the feature feels usable, and it is four lines of algebra nobody can eyeball.
//   2. **Unclamped panning.** Drag hard and the receipt leaves the viewport entirely. There is no
//      error and no way back except a reset button the user has to find.
//   3. **Clamping written for the zoomed-in case only.** When the image is SMALLER than its frame,
//      the correct behaviour is to centre it, not to pin it to a corner — the naive
//      `clamp(-max, x, max)` yields `max < -max` and silently flips the image into a corner.
//
// The existing precedent in this repo (`SourceDocumentViewer.tsx`) has all three problems plus
// mouse-only handlers. This module is the arithmetic, tested; the component is the DOM.

export interface Viewport {
  /** Size of the frame the image is displayed in, in CSS pixels. */
  frameW: number;
  frameH: number;
  /** Natural size of the image. */
  imageW: number;
  imageH: number;
}

export interface Transform {
  /** Multiplier applied to the FIT scale, not to natural size. `1` always means "fits the frame",
   *  whatever the image's own dimensions are — so the zoom controls mean the same thing on a tall
   *  receipt and a wide one. */
  zoom: number;
  /** Translation in CSS pixels, applied after scaling, from the centred position. */
  x: number;
  y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
/** One wheel notch. Multiplicative so each step feels the same at every zoom level — an additive
 *  step is imperceptible at 8× and enormous at 1×. */
export const ZOOM_STEP = 1.25;

export const IDENTITY: Transform = { zoom: 1, x: 0, y: 0 };

/** Scale at which the whole image fits inside the frame. */
export function fitScale(v: Viewport): number {
  if (v.imageW <= 0 || v.imageH <= 0 || v.frameW <= 0 || v.frameH <= 0) return 1;
  return Math.min(v.frameW / v.imageW, v.frameH / v.imageH);
}

/** The displayed size at a given zoom. */
export function displayedSize(v: Viewport, zoom: number): { w: number; h: number } {
  const s = fitScale(v) * zoom;
  return { w: v.imageW * s, h: v.imageH * s };
}

/**
 * How far the image may be moved from centre before its edge crosses the frame's.
 *
 * Zero when the image is smaller than the frame in that axis — which is what keeps a zoomed-out
 * receipt centred instead of pinned to a corner. `Math.max(0, …)` is load-bearing: without it the
 * bound goes negative and `clamp` receives `min > max`.
 */
export function panBounds(v: Viewport, zoom: number): { maxX: number; maxY: number } {
  const { w, h } = displayedSize(v, zoom);
  return {
    maxX: Math.max(0, (w - v.frameW) / 2),
    maxY: Math.max(0, (h - v.frameH) / 2),
  };
}

export function clamp(value: number, min: number, max: number): number {
  // NaN first. `Math.min(max, Math.max(min, NaN))` is NaN — the comparisons silently propagate it,
  // and a NaN that reaches the DOM renders as `translate(NaNpx, NaNpx)`, which invalidates the whole
  // transform: the image snaps to a corner at 1× with no error anywhere. A pinch whose two pointers
  // land on the same coordinate produces exactly that (0/0), so this is reachable, not theoretical.
  if (!Number.isFinite(value)) return Number.isFinite(min) ? min : 0;
  if (max < min) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

/** Bring a transform back inside its bounds. The single gate every zoom and drag passes through, so
 *  no other function has to remember to guard. */
export function clampTransform(v: Viewport, t: Transform): Transform {
  // Zoom falls back to MIN_ZOOM rather than 0: a zoom of 0 collapses the image to nothing, which
  // looks like a failed load rather than a bad number.
  const zoom = Number.isFinite(t.zoom) ? clamp(t.zoom, MIN_ZOOM, MAX_ZOOM) : MIN_ZOOM;
  const { maxX, maxY } = panBounds(v, zoom);
  return {
    zoom,
    x: clamp(t.x, -maxX, maxX),
    y: clamp(t.y, -maxY, maxY),
  };
}

/**
 * Zoom about a point, keeping whatever is under that point exactly where it is.
 *
 * `focus` is in FRAME coordinates with the origin at the frame's centre — i.e. the cursor position
 * minus the frame's centre. Working from the centre rather than the top-left is what makes the
 * algebra one line: the image is centred at `(x, y)`, so the vector from the focus to the image
 * origin scales by exactly the zoom ratio.
 *
 * The identity worth remembering: the point under the cursor must satisfy
 * `(focus - newPos) / newZoom === (focus - oldPos) / oldZoom`.
 */
export function zoomAbout(
  v: Viewport,
  current: Transform,
  nextZoomRaw: number,
  focus: { x: number; y: number },
): Transform {
  const nextZoom = clamp(nextZoomRaw, MIN_ZOOM, MAX_ZOOM);
  if (nextZoom === current.zoom) return current;
  const ratio = nextZoom / current.zoom;
  return clampTransform(v, {
    zoom: nextZoom,
    x: focus.x - (focus.x - current.x) * ratio,
    y: focus.y - (focus.y - current.y) * ratio,
  });
}

/** One wheel notch or button press, about a point. `direction` is +1 to zoom in, −1 to zoom out. */
export function zoomStep(
  v: Viewport,
  current: Transform,
  direction: 1 | -1,
  focus: { x: number; y: number } = { x: 0, y: 0 },
): Transform {
  const next = direction > 0 ? current.zoom * ZOOM_STEP : current.zoom / ZOOM_STEP;
  return zoomAbout(v, current, next, focus);
}

/** Move by a drag delta, clamped. */
export function panBy(v: Viewport, current: Transform, dx: number, dy: number): Transform {
  return clampTransform(v, { ...current, x: current.x + dx, y: current.y + dy });
}

/**
 * What a double-click toggles between.
 *
 * Fit ↔ "actual size", where actual size means one image pixel per CSS pixel. On a phone photo of a
 * receipt that is a big number (a 3024px-wide photo in a 700px frame is ~4.3×), which is exactly
 * what somebody double-clicking to read the small print wants — and it is clamped to MAX_ZOOM so a
 * huge scan cannot jump to 40×.
 *
 * Anything above fit toggles back to fit, so a second double-click always gets the whole receipt
 * back. That is the escape hatch: whatever state the view is in, double-click twice is home.
 */
export function toggleZoom(
  v: Viewport,
  current: Transform,
  focus: { x: number; y: number } = { x: 0, y: 0 },
): Transform {
  if (current.zoom > MIN_ZOOM + 0.01) return IDENTITY;
  const actual = fitScale(v) > 0 ? 1 / fitScale(v) : MAX_ZOOM;
  return zoomAbout(v, current, Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, actual)), focus);
}

/** True when the image is larger than its frame and therefore worth dragging. Drives the grab
 *  cursor — a grab cursor on an image that cannot move is a promise the UI does not keep. */
export function isPannable(v: Viewport, zoom: number): boolean {
  const { maxX, maxY } = panBounds(v, zoom);
  return maxX > 0.5 || maxY > 0.5;
}

/** The CSS transform for a state. Order matters: translate then scale, so `x`/`y` stay in screen
 *  pixels and a drag of 10px moves the image 10px at every zoom level. */
export function toCssTransform(t: Transform): string {
  return `translate(${t.x}px, ${t.y}px) scale(${t.zoom})`;
}

/** Distance between two active pointers — the pinch gesture's only input. */
export function pinchDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Midpoint of two pointers, in the same centre-origin frame coordinates `zoomAbout` expects. */
export function pinchMidpoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
