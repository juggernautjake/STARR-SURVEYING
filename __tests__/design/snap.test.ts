// __tests__/design/snap.test.ts — where a dragged element lands.
//
// The owner's description of this was precise, and each sentence is a test below: a grid you can
// turn on or off, a grid size you can change, free placement when snapping is off, and "nodes" on
// each element that decide what meets the grid line.

import { describe, it, expect } from 'vitest';
import {
  anchorPoint, snapValue, snapRectToGrid, alignToNeighbours, placeRect, clampToArtboard, spacingTo,
  type Rect, type SnapSettings,
} from '@/lib/design/snap';

const ON: SnapSettings = { enabled: true, size: 8, strength: 6, guides: true };
const OFF: SnapSettings = { ...ON, enabled: false, guides: false };
const artboard = { width: 1440, height: 900 };

describe('anchors — the "nodes" that meet the grid', () => {
  const rect: Rect = { x: 100, y: 200, w: 80, h: 40 };

  it('puts the nine box anchors where they belong', () => {
    expect(anchorPoint(rect, 'top-left')).toEqual({ x: 100, y: 200 });
    expect(anchorPoint(rect, 'center')).toEqual({ x: 140, y: 220 });
    expect(anchorPoint(rect, 'bottom-right')).toEqual({ x: 180, y: 240 });
    expect(anchorPoint(rect, 'top-center')).toEqual({ x: 140, y: 200 });
    expect(anchorPoint(rect, 'middle-left')).toEqual({ x: 100, y: 220 });
  });

  it('puts the baseline above the bottom edge, because text sits on it', () => {
    const baseline = anchorPoint(rect, 'baseline');
    expect(baseline.y).toBeLessThan(rect.y + rect.h);
    expect(baseline.y).toBeGreaterThan(rect.y);
  });
});

describe('the grid', () => {
  it('rounds to the nearest line', () => {
    expect(snapValue(11, 8)).toBe(8);
    expect(snapValue(13, 8)).toBe(16);
    expect(snapValue(-3, 8)).toBe(-0);
  });

  it('respects a changed grid size — the owner asked for this explicitly', () => {
    expect(snapValue(13, 4)).toBe(12);
    expect(snapValue(13, 16)).toBe(16);
    expect(snapValue(13, 24)).toBe(24);
  });

  it('is a no-op at size 0 rather than dividing by it', () => {
    expect(snapValue(13, 0)).toBe(13);
  });

  it('snaps the ANCHOR to the line, not always the top-left corner', () => {
    // A 30-wide box whose centre is at 43 should move so the CENTRE lands on 40.
    const rect: Rect = { x: 28, y: 100, w: 30, h: 20 };
    const snapped = snapRectToGrid(rect, 'center', ON);
    expect(anchorPoint(snapped, 'center').x).toBe(40);
    // Dragged by its top-left instead, the top-left is what lands — 28 is nearer 32 than 24.
    const byCorner = snapRectToGrid(rect, 'top-left', ON);
    expect(byCorner.x).toBe(32);
  });

  it('never resizes — snapping is about placement', () => {
    const rect: Rect = { x: 13, y: 27, w: 137, h: 41 };
    const snapped = snapRectToGrid(rect, 'top-left', ON);
    expect(snapped.w).toBe(137);
    expect(snapped.h).toBe(41);
  });

  it('does not pull from beyond its strength, so a fine grid is not glue', () => {
    const weak: SnapSettings = { ...ON, size: 100, strength: 4 };
    const rect: Rect = { x: 50, y: 50, w: 20, h: 20 };   // 50 is 50px from every line of a 100 grid
    expect(snapRectToGrid(rect, 'top-left', weak)).toEqual(rect);
  });

  it('leaves the element exactly where the pointer put it when snapping is off', () => {
    const rect: Rect = { x: 13, y: 27, w: 100, h: 40 };
    expect(snapRectToGrid(rect, 'top-left', OFF)).toEqual(rect);
    expect(placeRect(rect, 'top-left', [], artboard, OFF).rect).toEqual(rect);
  });
});

describe('smart guides — aligning to other elements, which no grid size can do', () => {
  const neighbour = { id: 'card', rect: { x: 200, y: 100, w: 400, h: 200 } };

  it('lines up a left edge', () => {
    const moving: Rect = { x: 203, y: 400, w: 100, h: 40 };
    const { rect, guides } = alignToNeighbours(moving, [neighbour], artboard, ON);
    expect(rect.x).toBe(200);
    expect(guides.some((g) => g.axis === 'x' && g.matched.includes('card'))).toBe(true);
  });

  it('lines up centres', () => {
    const moving: Rect = { x: 350, y: 400, w: 100, h: 40 };   // centre 400, neighbour centre 400
    const { rect } = alignToNeighbours(moving, [neighbour], artboard, ON);
    expect(rect.x + rect.w / 2).toBe(400);
  });

  it('lines up with the artboard centre', () => {
    const moving: Rect = { x: 668, y: 400, w: 100, h: 40 };   // centre 718, artboard centre 720
    const { rect, guides } = alignToNeighbours(moving, [], artboard, ON);
    expect(rect.x + rect.w / 2).toBe(720);
    expect(guides[0].kind).toBe('artboard-center');
  });

  it('takes only the nearest line per axis — two competing guides read as a jitter bug', () => {
    const a = { id: 'a', rect: { x: 200, y: 0, w: 10, h: 10 } };
    const b = { id: 'b', rect: { x: 204, y: 0, w: 10, h: 10 } };
    const moving: Rect = { x: 203, y: 400, w: 50, h: 20 };
    const { guides } = alignToNeighbours(moving, [a, b], artboard, ON);
    expect(guides.filter((g) => g.axis === 'x')).toHaveLength(1);
  });

  it('does nothing when guides are switched off', () => {
    const moving: Rect = { x: 203, y: 400, w: 100, h: 40 };
    const { rect, guides } = alignToNeighbours(moving, [neighbour], artboard, { ...ON, guides: false });
    expect(rect).toEqual(moving);
    expect(guides).toHaveLength(0);
  });
});

describe('placeRect — guides win, then the grid fills in', () => {
  it('keeps a neighbour alignment instead of dragging it half a cell to the grid', () => {
    // Neighbour edge at 201 is NOT on the 8px grid. Aligning to it must survive.
    const neighbour = { id: 'n', rect: { x: 201, y: 100, w: 100, h: 50 } };
    const moving: Rect = { x: 203, y: 403, w: 60, h: 20 };
    const { rect } = placeRect(moving, 'top-left', [neighbour], artboard, ON);
    expect(rect.x).toBe(201);
  });

  it('snaps the axis no guide claimed', () => {
    const neighbour = { id: 'n', rect: { x: 201, y: 999, w: 100, h: 50 } };
    const moving: Rect = { x: 203, y: 403, w: 60, h: 20 };
    const { rect } = placeRect(moving, 'top-left', [neighbour], artboard, ON);
    expect(rect.x).toBe(201);     // guide
    expect(rect.y).toBe(400);     // grid: 403 is nearer 400 than 408
  });
});

describe('clamping', () => {
  it('keeps a sliver on screen horizontally rather than losing the element', () => {
    expect(clampToArtboard({ x: -500, y: 10, w: 100, h: 20 }, artboard).x).toBe(-76);
    expect(clampToArtboard({ x: 5000, y: 10, w: 100, h: 20 }, artboard).x).toBe(1416);
  });

  it('does not clamp the bottom, because the artboard grows — a page is as long as it needs to be', () => {
    expect(clampToArtboard({ x: 10, y: 9999, w: 100, h: 20 }, artboard).y).toBe(9999);
  });
});

describe('spacing badges', () => {
  it('reports the nearest gap on each side', () => {
    const rect: Rect = { x: 200, y: 200, w: 100, h: 50 };
    const others = [
      { id: 'left', rect: { x: 100, y: 200, w: 80, h: 50 } },    // gap 20
      { id: 'right', rect: { x: 330, y: 210, w: 80, h: 50 } },   // gap 30
      { id: 'above', rect: { x: 210, y: 120, w: 40, h: 40 } },   // gap 40
    ];
    expect(spacingTo(rect, others)).toEqual({ left: 20, right: 30, above: 40 });
  });

  it('ignores things that do not sit beside it', () => {
    const rect: Rect = { x: 200, y: 200, w: 100, h: 50 };
    const far = [{ id: 'x', rect: { x: 0, y: 900, w: 40, h: 40 } }];
    expect(spacingTo(rect, far)).toEqual({});
  });
});
