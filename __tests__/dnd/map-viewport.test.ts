// __tests__/dnd/map-viewport.test.ts — the pan/zoom maths (M3-1).
//
// Every interesting viewport bug is arithmetic, not React. "Zoom toward the pointer" either keeps the point
// under the cursor fixed or it does not, and that is a property assertable with numbers in a millisecond —
// where checking it in a browser means dragging a mouse and squinting at whether the map crept.
//
// The invariant that earns most of these tests: **the world point under the pointer does not move while
// zooming.** Every "the map slides away from my cursor" complaint is a violation of it.
import { describe, it, expect } from 'vitest';
import {
  MAX_SCALE, MIN_SCALE, clampViewport, fitScale, fitViewport, isVisible, lodFor, panBy,
  screenToWorld, transformOf, worldToScreen, zoomAt, type Bounds, type Viewport,
} from '@/lib/dnd/maps/viewport';

const FRAME = { width: 800, height: 600 };
const BOUNDS: Bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
const VP: Viewport = { x: 50, y: 50, scale: 4 };

const near = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('screenToWorld / worldToScreen', () => {
  it('are exact inverses', () => {
    for (const [sx, sy] of [[0, 0], [400, 300], [799, 599], [123, 456]]) {
      const w = screenToWorld(VP, FRAME, sx, sy);
      const s = worldToScreen(VP, FRAME, w.x, w.y);
      near(s.x, sx);
      near(s.y, sy);
    }
  });

  it('put the viewport centre at the middle of the frame', () => {
    const s = worldToScreen(VP, FRAME, VP.x, VP.y);
    near(s.x, FRAME.width / 2);
    near(s.y, FRAME.height / 2);
  });
});

describe('zoomAt — the invariant', () => {
  it('KEEPS THE POINT UNDER THE CURSOR FIXED when zooming in', () => {
    const focal = { sx: 700, sy: 120 }; // deliberately far from centre, where the bug shows
    const before = screenToWorld(VP, FRAME, focal.sx, focal.sy);
    const next = zoomAt(VP, FRAME, 1.25, focal.sx, focal.sy);
    const after = screenToWorld(next, FRAME, focal.sx, focal.sy);
    near(after.x, before.x, 1e-9);
    near(after.y, before.y, 1e-9);
  });

  it('and when zooming out', () => {
    const focal = { sx: 60, sy: 540 };
    const before = screenToWorld(VP, FRAME, focal.sx, focal.sy);
    const next = zoomAt(VP, FRAME, 1 / 1.25, focal.sx, focal.sy);
    const after = screenToWorld(next, FRAME, focal.sx, focal.sy);
    near(after.x, before.x, 1e-9);
    near(after.y, before.y, 1e-9);
  });

  it('holds across a long run of wheel ticks — drift is cumulative or it is nothing', () => {
    const focal = { sx: 640, sy: 200 };
    const start = screenToWorld(VP, FRAME, focal.sx, focal.sy);
    let vp = VP;
    for (let i = 0; i < 30; i++) vp = zoomAt(vp, FRAME, 1.1, focal.sx, focal.sy);
    for (let i = 0; i < 30; i++) vp = zoomAt(vp, FRAME, 1 / 1.1, focal.sx, focal.sy);
    const end = screenToWorld(vp, FRAME, focal.sx, focal.sy);
    near(end.x, start.x, 1e-6);
    near(end.y, start.y, 1e-6);
  });

  it('clamps to the scale range', () => {
    expect(zoomAt(VP, FRAME, 1000, 400, 300).scale).toBe(MAX_SCALE);
    expect(zoomAt(VP, FRAME, 0.0001, 400, 300).scale).toBe(MIN_SCALE);
  });

  it('DOES NOT PAN once the zoom limit is reached', () => {
    // Without the early return, every further wheel tick at the limit nudges the centre — which reads as
    // the map slowly sliding away for no reason the user can see.
    const atMax: Viewport = { x: 50, y: 50, scale: MAX_SCALE };
    const after = zoomAt(atMax, FRAME, 2, 780, 20);
    expect(after).toEqual(atMax);
  });
});

describe('panBy', () => {
  it('moves the map with the pointer, one world unit per pixel at scale 1', () => {
    const vp = panBy({ x: 50, y: 50, scale: 1 }, 10, -5);
    near(vp.x, 40);
    near(vp.y, 55);
  });

  it('moves the SAME screen distance at any zoom', () => {
    // Divided by scale, so dragging 100px moves the map 100px on screen whether zoomed in or out. Without
    // it, a drag accelerates as you zoom in and the map feels slippery.
    const a = panBy({ x: 50, y: 50, scale: 1 }, 100, 0);
    const b = panBy({ x: 50, y: 50, scale: 4 }, 100, 0);
    const moveA = (50 - a.x) * 1;
    const moveB = (50 - b.x) * 4;
    near(moveA, moveB);
  });
});

describe('fitScale / fitViewport', () => {
  it('fits the tighter axis', () => {
    // 800/100 = 8 wide, 600/100 = 6 tall → 6, so the whole map fits rather than overflowing vertically.
    expect(fitScale(BOUNDS, FRAME)).toBe(6);
  });

  it('centres on the bounds', () => {
    const vp = fitViewport({ minX: 10, minY: 20, maxX: 30, maxY: 60 }, FRAME);
    expect(vp.x).toBe(20);
    expect(vp.y).toBe(40);
  });

  it('respects the scale limits', () => {
    expect(fitScale({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, FRAME)).toBe(MAX_SCALE);
    expect(fitScale({ minX: 0, minY: 0, maxX: 100000, maxY: 100000 }, FRAME)).toBe(MIN_SCALE);
  });

  it('SURVIVES DEGENERATE BOUNDS instead of blanking the screen', () => {
    // `bounds` defaults to `{}` in the schema, so a node authored before anyone set it arrives as zeros.
    // Infinity here would render nothing at all, which looks exactly like a broken map.
    for (const b of [
      { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      { minX: 5, minY: 5, maxX: 5, maxY: 5 },
      { minX: 0, minY: 0, maxX: 100, maxY: 0 },
    ]) {
      const s = fitScale(b, FRAME);
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThan(0);
    }
  });

  it('survives a zero-size frame — the first render before layout has run', () => {
    expect(Number.isFinite(fitScale(BOUNDS, { width: 0, height: 0 }))).toBe(true);
  });
});

describe('clampViewport', () => {
  it('centres a map smaller than the frame rather than letting it drift into a corner', () => {
    // Zoomed out far enough that the whole 100×100 map fits: it must sit in the middle, not wherever the
    // user last dragged it with dead space beside it.
    const vp = clampViewport({ x: 999, y: -999, scale: 1 }, BOUNDS, FRAME);
    expect(vp.x).toBe(50);
    expect(vp.y).toBe(50);
  });

  it('keeps the frame inside the map when zoomed in', () => {
    const vp = clampViewport({ x: -500, y: 500, scale: 20 }, BOUNDS, FRAME);
    expect(vp.x).toBeGreaterThanOrEqual(BOUNDS.minX);
    expect(vp.x).toBeLessThanOrEqual(BOUNDS.maxX);
    expect(vp.y).toBeGreaterThanOrEqual(BOUNDS.minY);
    expect(vp.y).toBeLessThanOrEqual(BOUNDS.maxY);
  });

  it('leaves an already-legal viewport alone', () => {
    const legal: Viewport = { x: 50, y: 50, scale: 20 };
    expect(clampViewport(legal, BOUNDS, FRAME)).toEqual(legal);
  });
});

describe('transformOf', () => {
  it('is transform-only, never left/top', () => {
    // A layout-affecting property would relayout every child each frame instead of compositing one.
    const t = transformOf(VP, FRAME);
    expect(t).toMatch(/^translate\(.+\) scale\(4\)$/);
  });

  it('places the viewport centre at the frame centre', () => {
    const t = transformOf({ x: 0, y: 0, scale: 1 }, FRAME);
    expect(t).toBe('translate(400px, 300px) scale(1)');
  });
});

describe('isVisible — the culling predicate (M3-3)', () => {
  const vp: Viewport = { x: 50, y: 50, scale: 8 }; // 800/8 = 100px wide → ±50 world units… /2 = ±50

  it('keeps what is on screen', () => {
    expect(isVisible(vp, FRAME, { x: 48, y: 48, w: 4, h: 4 })).toBe(true);
  });

  it('drops what is far away', () => {
    expect(isVisible(vp, FRAME, { x: 900, y: 900, w: 4, h: 4 })).toBe(false);
  });

  it('keeps a rect that STRADDLES the edge — culling by centre clips things in half', () => {
    const halfW = FRAME.width / 2 / vp.scale; // 50
    expect(isVisible(vp, FRAME, { x: vp.x + halfW - 1, y: 50, w: 10, h: 10 })).toBe(true);
  });

  it('pads, so shapes do not pop in exactly at the boundary', () => {
    const halfW = FRAME.width / 2 / vp.scale;
    const justOutside = { x: vp.x + halfW + 4, y: 50, w: 1, h: 1 };
    expect(isVisible(vp, FRAME, justOutside, 8)).toBe(true);
    expect(isVisible(vp, FRAME, justOutside, 0)).toBe(false);
  });
});

describe('lodFor', () => {
  it('names the tiers so a renderer branch reads as intent', () => {
    expect(lodFor(0.3)).toBe('dots');
    expect(lodFor(1.0)).toBe('labels');
    expect(lodFor(4.0)).toBe('full');
  });

  it('is monotonic — zooming in never reduces detail', () => {
    const rank = { dots: 0, labels: 1, full: 2 } as const;
    let last = -1;
    for (let s = MIN_SCALE; s <= MAX_SCALE; s += 0.05) {
      const r = rank[lodFor(s)];
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });
});
