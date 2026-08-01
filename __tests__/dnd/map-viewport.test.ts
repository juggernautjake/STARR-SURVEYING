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
  FULL_ZOOM, LABEL_ROOM_PX, MAX_SCALE, MAX_ZOOM, MIN_SCALE, MIN_ZOOM, clampViewport, fitScale,
  fitViewport, isVisible, scaleLimits,
  lodFor, minSpacing, panBy, visibleNearest,
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

  it('clamps to the limits it is GIVEN, not to a module constant', () => {
    // The constant version of this was a live defect: `MAX_SCALE = 8` reads as "eight times" and means
    // eight PIXELS PER WORLD UNIT. Every map's world is a fixed 0-100 box, so fit is already ~6 and a DM
    // could magnify a battle map 1.3x before the button greyed out.
    const limits = scaleLimits(BOUNDS, FRAME); // fit 6 → 3 … 48
    expect(zoomAt(VP, FRAME, 1000, 400, 300, limits).scale).toBe(limits.max);
    expect(zoomAt(VP, FRAME, 0.0001, 400, 300, limits).scale).toBe(limits.min);
  });

  it('DOES NOT PAN once the zoom limit is reached', () => {
    // Without the early return, every further wheel tick at the limit nudges the centre — which reads as
    // the map slowly sliding away for no reason the user can see.
    const limits = scaleLimits(BOUNDS, FRAME);
    const atMax: Viewport = { x: 50, y: 50, scale: limits.max };
    const after = zoomAt(atMax, FRAME, 2, 780, 20, limits);
    expect(after).toEqual(atMax);
  });
});

describe('scaleLimits — how far in and out, relative to the whole map', () => {
  it('lets a reader magnify well past fit, which the absolute cap did not', () => {
    const { min, max } = scaleLimits(BOUNDS, FRAME); // fitScale(BOUNDS, FRAME) === 6
    expect(max).toBe(6 * MAX_ZOOM);
    expect(min).toBe(6 * MIN_ZOOM);
    // The specific number that was wrong: 8 px/unit was the old ceiling, i.e. 1.33x of fit.
    expect(max / 6).toBeGreaterThan(2);
  });

  it('means the same thing on a phone as on a desktop', () => {
    // A fixed ceiling is generous on a small screen and unreachable on a large one; a multiple of fit is
    // the same gesture on both, which is what G5 asks for.
    const phone = { width: 360, height: 240 };
    expect(scaleLimits(BOUNDS, phone).max / fitScale(BOUNDS, phone))
      .toBeCloseTo(scaleLimits(BOUNDS, FRAME).max / fitScale(BOUNDS, FRAME));
  });

  it('stays inside the absolute rails for a degenerate bounds', () => {
    const { min, max } = scaleLimits({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, FRAME);
    expect(min).toBeGreaterThanOrEqual(MIN_SCALE);
    expect(max).toBeLessThanOrEqual(MAX_SCALE);
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

  it('stays inside the absolute rails, which exist only to stop a pathological transform', () => {
    // These are a backstop, not a policy — reachable only by a bounds nobody would author. The moment
    // they decide what a reader can do, they are the bug they replaced.
    expect(fitScale({ minX: 0, minY: 0, maxX: 0.001, maxY: 0.001 }, FRAME)).toBe(MAX_SCALE);
    expect(fitScale({ minX: 0, minY: 0, maxX: 1e9, maxY: 1e9 }, FRAME)).toBe(MIN_SCALE);
  });

  it('does NOT clamp an ordinary map — a 0-100 world in a real frame fits at its true scale', () => {
    // The old rails clipped this: fit for a 100-unit world in an 800px frame is 8, which was exactly the
    // old MAX_SCALE, so "fit" and "fully zoomed in" were the same view.
    expect(fitScale(BOUNDS, { width: 1600, height: 1200 })).toBe(12);
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

describe('lodFor — the tier is about ROOM, not about how far out (M3-3)', () => {
  // The rule this replaced tiered on the raw scale, and it was dead code: every node's world is a fixed
  // 0-100 box, so the scale that fits it in a real frame is around 6 (measured live at 6.06) and both
  // lower tiers needed a scale under 1.6. No pin ever drew as a dot. These cases are written in the terms
  // that are actually reachable — a fit scale, and how close the markers are on screen.
  const FIT = 6.06;

  it('labels a sparse map at the zoom where the whole thing fits', () => {
    // Three regions on a continent, far apart. Nothing collides, so the names stay.
    expect(lodFor({ scale: FIT, fitScale: FIT, minSpacingPx: 400 })).toBe('labels');
  });

  it('drops to dots on a CROWDED map at that same zoom — which the old rule could not express', () => {
    // Forty districts 70 screen pixels apart, with 110-pixel name pills on them. Same scale, same fit,
    // different map: the tier has to be able to tell them apart, and a scale threshold cannot.
    expect(lodFor({ scale: FIT, fitScale: FIT, minSpacingPx: 70 })).toBe('dots');
  });

  it('gives a lone marker its name — there is nothing for it to collide with', () => {
    expect(lodFor({ scale: FIT, fitScale: FIT, minSpacingPx: Infinity })).toBe('labels');
  });

  it('reaches full at tactical zoom regardless of crowding', () => {
    // Zoomed in past 2x the whole-map view, the reader is looking at one place, not choosing between
    // forty — so the extra detail is wanted even though the pins were too dense to label a moment ago.
    expect(lodFor({ scale: FIT * FULL_ZOOM, fitScale: FIT, minSpacingPx: 10 })).toBe('full');
  });

  it('treats the boundary as ROOM ENOUGH, not as too little', () => {
    expect(lodFor({ scale: FIT, fitScale: FIT, minSpacingPx: LABEL_ROOM_PX })).toBe('labels');
    expect(lodFor({ scale: FIT, fitScale: FIT, minSpacingPx: LABEL_ROOM_PX - 0.01 })).toBe('dots');
  });

  it('survives a degenerate fit scale instead of tiering off NaN', () => {
    // An unset `bounds` from the database gives fitScale 0. Dividing by it would make every tier a
    // coin toss on Infinity, and the symptom would be a map that renders correctly and labels nothing.
    expect(lodFor({ scale: 1, fitScale: 0, minSpacingPx: 400 })).toBe('labels');
    expect(lodFor({ scale: 1, fitScale: 0, minSpacingPx: 10 })).toBe('dots');
  });

  it('is monotonic in zoom — zooming in never reduces detail', () => {
    const rank = { dots: 0, labels: 1, full: 2 } as const;
    let last = -1;
    for (let z = 0.5; z <= 6; z += 0.05) {
      const r = rank[lodFor({ scale: FIT * z, fitScale: FIT, minSpacingPx: 70 * z })];
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });
});

describe('minSpacing — how close the two nearest markers are, on screen', () => {
  it('is Infinity for fewer than two, so a single pin is never crowded', () => {
    expect(minSpacing([], 6)).toBe(Infinity);
    expect(minSpacing([{ x: 1, y: 1 }], 6)).toBe(Infinity);
  });

  it('converts world distance to SCREEN pixels — the same map is crowded at one zoom and not another', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    expect(minSpacing(pts, 6)).toBeCloseTo(60);
    expect(minSpacing(pts, 12)).toBeCloseTo(120);
  });

  it('finds the closest PAIR, not the first pair', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 51, y: 0 }];
    expect(minSpacing(pts, 1)).toBeCloseTo(1);
  });
});

describe('visibleNearest — what to warm (M3-4)', () => {
  // A frame 800×600 at scale 8 sees ±50 world units horizontally and ±37.5 vertically around the centre.
  const vp: Viewport = { x: 50, y: 50, scale: 8 };
  const at = (href: string, x: number, y: number) => ({ href, x, y });

  it('takes the ones nearest the CENTRE, not the first ones in the list', () => {
    // The ordering is the whole argument: a pin the reader has panned to the middle of the screen is a
    // decision almost made; one in the corner is visible and mostly not where anyone is looking.
    const got = visibleNearest(
      [at('far', 90, 50), at('near', 52, 50), at('mid', 70, 50)],
      vp, FRAME, 2,
    );
    expect(got.map((p) => p.href)).toEqual(['near', 'mid']);
  });

  it('never returns more than the limit — the cache is bounded here, not trusted to the caller', () => {
    const many = Array.from({ length: 40 }, (_, i) => at(`p${i}`, 50 + i * 0.1, 50));
    expect(visibleNearest(many, vp, FRAME, 3)).toHaveLength(3);
  });

  it('returns nothing for a zero or negative limit rather than everything', () => {
    // The obvious `slice(0, 0)` reading is right; a `limit || Infinity` shortcut would turn "prefetch
    // nothing" into "prefetch the whole map", which is the exact failure the bound exists to stop.
    expect(visibleNearest([at('a', 50, 50)], vp, FRAME, 0)).toEqual([]);
    expect(visibleNearest([at('a', 50, 50)], vp, FRAME, -1)).toEqual([]);
  });

  it('excludes what is off screen even when it is the nearest thing in the list', () => {
    const got = visibleNearest([at('offscreen', 400, 400), at('here', 60, 50)], vp, FRAME, 5);
    expect(got.map((p) => p.href)).toEqual(['here']);
  });

  it('is stable on ties, so the same view warms the same things twice', () => {
    // Equidistant either side of centre. An unstable sort would rotate which one is warm on every
    // re-render, so the cache would fill with pairs and warm neither reliably.
    const items = [at('west', 40, 50), at('east', 60, 50)];
    const a = visibleNearest(items, vp, FRAME, 1);
    const b = visibleNearest(items, vp, FRAME, 1);
    expect(a.map((p) => p.href)).toEqual(['west']);
    expect(b.map((p) => p.href)).toEqual(['west']);
  });

  it('follows the reader — panning changes what is nearest', () => {
    const items = [at('west', 20, 50), at('east', 80, 50)];
    expect(visibleNearest(items, { ...vp, x: 25 }, FRAME, 1)[0].href).toBe('west');
    expect(visibleNearest(items, { ...vp, x: 75 }, FRAME, 1)[0].href).toBe('east');
  });
});
