// __tests__/receipts/zoom-pan.test.ts — slice V2 of
// docs/planning/in-progress/RECEIPT_REVIEW_SLIDESHOW_2026-08-14.md
//
// Zoom-and-pan looks trivial and fails in three ways that never throw:
//
//   1. zooming about the CENTRE instead of the cursor — you point at the total, scroll, and the
//      total slides away, so every zoom becomes zoom-then-hunt;
//   2. unclamped panning — the receipt can be flung out of the viewport with no way back;
//   3. clamping written only for the zoomed-IN case — when the image is smaller than its frame the
//      naive bound goes negative, `min > max`, and the image silently pins into a corner.
//
// All three are arithmetic, so all three are testable without a browser.

import { describe, it, expect } from 'vitest';
import {
  fitScale, displayedSize, panBounds, clamp, clampTransform, zoomAbout, zoomStep, panBy,
  toggleZoom, isPannable, toCssTransform, pinchDistance, pinchMidpoint,
  IDENTITY, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP, type Viewport,
} from '@/lib/receipts/zoom-pan';

/** A tall phone photo of a receipt in a landscape frame — the ordinary case. */
const TALL: Viewport = { frameW: 700, frameH: 800, imageW: 3024, imageH: 4032 };
/** An image already smaller than its frame — the case that flips into a corner when clamped wrong. */
const SMALL: Viewport = { frameW: 700, frameH: 800, imageW: 300, imageH: 200 };

describe('fitting the image to the frame', () => {
  it('picks the axis that constrains', () => {
    // 700/3024 = 0.2315…, 800/4032 = 0.1984… → height constrains.
    expect(fitScale(TALL)).toBeCloseTo(800 / 4032, 6);
  });

  it('at zoom 1 the image fits entirely inside the frame', () => {
    const { w, h } = displayedSize(TALL, 1);
    expect(w).toBeLessThanOrEqual(TALL.frameW + 0.001);
    expect(h).toBeLessThanOrEqual(TALL.frameH + 0.001);
  });

  it('survives a viewport that has not been measured yet', () => {
    // Frames are 0×0 on the first render, before layout. A NaN or Infinity here propagates into a
    // CSS transform and the image vanishes.
    for (const v of [
      { frameW: 0, frameH: 0, imageW: 0, imageH: 0 },
      { frameW: 700, frameH: 800, imageW: 0, imageH: 0 },
      { frameW: 0, frameH: 0, imageW: 100, imageH: 100 },
    ]) {
      expect(Number.isFinite(fitScale(v)), JSON.stringify(v)).toBe(true);
    }
  });
});

describe('how far the image may be panned', () => {
  it('is zero at fit, because there is nothing hidden to pan to', () => {
    const b = panBounds(TALL, 1);
    // Height is the constraining axis, so vertically it is exactly flush.
    expect(b.maxY).toBeCloseTo(0, 6);
    expect(b.maxX).toBeCloseTo(0, 6);
  });

  it('grows with zoom', () => {
    expect(panBounds(TALL, 4).maxY).toBeGreaterThan(panBounds(TALL, 2).maxY);
  });

  it('is never negative for an image smaller than its frame', () => {
    // THE bug this function exists to prevent: a negative bound makes clamp() receive min > max.
    const b = panBounds(SMALL, 1);
    expect(b.maxX).toBeGreaterThanOrEqual(0);
    expect(b.maxY).toBeGreaterThanOrEqual(0);
  });
});

describe('clamp', () => {
  it('bounds a value', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });

  it('centres rather than flipping when the bounds cross', () => {
    // A crossed range means "there is no room" — the honest answer is the midpoint, not a corner.
    expect(clamp(99, 10, -10)).toBe(0);
  });
});

describe('zooming about the cursor', () => {
  it('keeps the point under the cursor exactly where it was', () => {
    // The property that makes zoom usable. Focus is in centre-origin frame coordinates: 200px
    // right and 150px above the middle of the frame.
    const focus = { x: 200, y: -150 };
    const before = { zoom: 1, x: 0, y: 0 };
    const after = zoomAbout(TALL, before, 2, focus);

    // The image-space point under the focus must be identical before and after.
    const imagePointBefore = { x: (focus.x - before.x) / before.zoom, y: (focus.y - before.y) / before.zoom };
    const imagePointAfter = { x: (focus.x - after.x) / after.zoom, y: (focus.y - after.y) / after.zoom };
    expect(imagePointAfter.x).toBeCloseTo(imagePointBefore.x, 6);
    expect(imagePointAfter.y).toBeCloseTo(imagePointBefore.y, 6);
  });

  it('is NOT the same as zooming about the centre', () => {
    // Guards against a "simplification" back to `{zoom: n, x, y}` — which is the version that
    // makes every zoom slide the thing you were looking at off screen.
    const focus = { x: 250, y: 200 };
    const aboutCursor = zoomAbout(TALL, IDENTITY, 3, focus);
    const aboutCentre = zoomAbout(TALL, IDENTITY, 3, { x: 0, y: 0 });
    expect(aboutCursor.x).not.toBeCloseTo(aboutCentre.x, 3);
  });

  it('zooming about the centre leaves the image centred', () => {
    const t = zoomAbout(TALL, IDENTITY, 3, { x: 0, y: 0 });
    expect(t.x).toBeCloseTo(0, 6);
    expect(t.y).toBeCloseTo(0, 6);
  });

  it('never exceeds the zoom limits', () => {
    expect(zoomAbout(TALL, IDENTITY, 9999, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
    expect(zoomAbout(TALL, { zoom: 4, x: 0, y: 0 }, 0.01, { x: 0, y: 0 }).zoom).toBe(MIN_ZOOM);
  });

  it('returns the same object when the zoom does not change', () => {
    const t = { zoom: MAX_ZOOM, x: 10, y: 10 };
    expect(zoomAbout(TALL, t, MAX_ZOOM * 2, { x: 5, y: 5 })).toBe(t);
  });

  it('leaves the result inside the pan bounds', () => {
    // Zooming near an edge can push the image past its own boundary; the result must be clamped or
    // the receipt shows a band of empty frame along one side.
    const t = zoomAbout(TALL, IDENTITY, 6, { x: 340, y: 390 });
    const b = panBounds(TALL, t.zoom);
    expect(Math.abs(t.x)).toBeLessThanOrEqual(b.maxX + 0.001);
    expect(Math.abs(t.y)).toBeLessThanOrEqual(b.maxY + 0.001);
  });
});

describe('a wheel notch', () => {
  it('is multiplicative, so it feels the same at every zoom level', () => {
    const a = zoomStep(TALL, IDENTITY, 1);
    expect(a.zoom).toBeCloseTo(ZOOM_STEP, 6);
    const b = zoomStep(TALL, a, 1);
    expect(b.zoom).toBeCloseTo(ZOOM_STEP * ZOOM_STEP, 6);
  });

  it('reverses exactly', () => {
    const inThenOut = zoomStep(TALL, zoomStep(TALL, IDENTITY, 1), -1);
    expect(inThenOut.zoom).toBeCloseTo(1, 6);
  });

  it('bottoms out at fit rather than going smaller', () => {
    let t = IDENTITY;
    for (let i = 0; i < 20; i++) t = zoomStep(TALL, t, -1);
    expect(t.zoom).toBe(MIN_ZOOM);
  });
});

describe('panning', () => {
  it('moves the image', () => {
    const zoomed = zoomAbout(TALL, IDENTITY, 4, { x: 0, y: 0 });
    const moved = panBy(TALL, zoomed, 50, 30);
    expect(moved.x).toBeCloseTo(50, 6);
    expect(moved.y).toBeCloseTo(30, 6);
  });

  it('cannot fling the image out of the viewport', () => {
    const zoomed = zoomAbout(TALL, IDENTITY, 2, { x: 0, y: 0 });
    const flung = panBy(TALL, zoomed, 99999, 99999);
    const b = panBounds(TALL, flung.zoom);
    expect(flung.x).toBeCloseTo(b.maxX, 6);
    expect(flung.y).toBeCloseTo(b.maxY, 6);
  });

  it('keeps a fitted image centred no matter how hard it is dragged', () => {
    // At fit there is nothing hidden, so dragging must do nothing at all — not drift.
    const dragged = panBy(TALL, IDENTITY, 400, -400);
    expect(dragged.x).toBeCloseTo(0, 6);
    expect(dragged.y).toBeCloseTo(0, 6);
  });

  it('keeps an image smaller than its frame centred', () => {
    const dragged = panBy(SMALL, IDENTITY, 300, 300);
    expect(dragged.x).toBe(0);
    expect(dragged.y).toBe(0);
  });
});

describe('double-click to toggle', () => {
  it('goes from fit to one image pixel per screen pixel', () => {
    const t = toggleZoom(TALL, IDENTITY, { x: 0, y: 0 });
    // fitScale ≈ 0.198, so actual size is ≈ 5.04× — clamped to MAX_ZOOM if it exceeded it.
    expect(t.zoom).toBeGreaterThan(1);
    const { w } = displayedSize(TALL, t.zoom);
    expect(w).toBeCloseTo(TALL.imageW, 0);
  });

  it('always returns to fit from anywhere above it', () => {
    // The escape hatch: whatever state the view is in, double-click twice is home.
    for (const zoom of [1.5, 3, MAX_ZOOM]) {
      expect(toggleZoom(TALL, { zoom, x: 120, y: -40 }).zoom).toBe(MIN_ZOOM);
    }
  });

  it('does not exceed MAX_ZOOM on an enormous scan', () => {
    const huge: Viewport = { frameW: 400, frameH: 400, imageW: 12000, imageH: 12000 };
    expect(toggleZoom(huge, IDENTITY, { x: 0, y: 0 }).zoom).toBeLessThanOrEqual(MAX_ZOOM);
  });
});

describe('whether dragging does anything', () => {
  it('is false at fit — so the grab cursor is not a promise the UI breaks', () => {
    expect(isPannable(TALL, 1)).toBe(false);
    expect(isPannable(SMALL, 1)).toBe(false);
  });

  it('is true once zoomed in', () => {
    expect(isPannable(TALL, 2)).toBe(true);
  });
});

describe('the CSS transform', () => {
  it('translates before scaling, so a 10px drag moves 10px at any zoom', () => {
    // If scale came first, the translation would be multiplied by the zoom and a drag would
    // accelerate as you zoom in — which feels like the image is slipping.
    expect(toCssTransform({ zoom: 3, x: 10, y: -5 })).toBe('translate(10px, -5px) scale(3)');
  });
});

describe('pinch', () => {
  it('measures the distance between two pointers', () => {
    expect(pinchDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('zooms about the midpoint of the two fingers', () => {
    const mid = pinchMidpoint({ x: 0, y: 0 }, { x: 100, y: 50 });
    expect(mid).toEqual({ x: 50, y: 25 });
  });

  it('a pinch that does not move does not zoom', () => {
    const a = { x: 10, y: 10 };
    const b = { x: 110, y: 10 };
    const start = pinchDistance(a, b);
    const ratio = pinchDistance(a, b) / start;
    expect(zoomAbout(TALL, IDENTITY, 1 * ratio, pinchMidpoint(a, b))).toBe(IDENTITY);
  });
});

describe('clampTransform as the single gate', () => {
  it('brings any state back inside its bounds', () => {
    const wild = clampTransform(TALL, { zoom: 99, x: 1e6, y: -1e6 });
    expect(wild.zoom).toBe(MAX_ZOOM);
    const b = panBounds(TALL, MAX_ZOOM);
    expect(wild.x).toBeCloseTo(b.maxX, 6);
    expect(wild.y).toBeCloseTo(-b.maxY, 6);
  });

  it('never produces NaN, whatever it is given', () => {
    // A NaN reaches the DOM as `translate(NaNpx, NaNpx)`, which drops the whole transform and the
    // image jumps to a corner at 1× with no error anywhere.
    const out = clampTransform({ frameW: 0, frameH: 0, imageW: 0, imageH: 0 }, { zoom: NaN, x: NaN, y: NaN });
    expect(Number.isFinite(out.zoom)).toBe(true);
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.y)).toBe(true);
  });
});
