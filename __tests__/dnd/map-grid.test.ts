// __tests__/dnd/map-grid.test.ts — the grid a node declares (M4-1).
//
// The judgement under test is G4 — *"the map never hardcodes 30ft or 5ft squares; it asks."* A grid is the
// thing it asks, so these pin the conversions a later slice will build movement and reach on, plus the two
// defects the audit found sitting latent because no node had ever HAD a grid:
//
//   1. the reader and the seed's column comment named the cell size differently, and
//   2. snapping landed on a grid CORNER, which for a centre-drawn token means four squares at once.
import { describe, it, expect } from 'vitest';
import {
  MAX_CELLS, MIN_CELLS, WORLD,
  cellsAcross, feetToWorld, hexAt, hexCentre, hexDistance, readGrid, sanitizeGrid,
  sizeForCells, snapPoint, squareAt, squareCentre, worldToFeet,
} from '@/lib/dnd/maps/grid';

/** A 20-square, 5-ft grid: a 100-foot map, which is the scale a DM adds a grid for. */
const square = readGrid({ size: 5, unitFt: 5 })!;
const hex = readGrid({ kind: 'hex', size: 5, unitFt: 5 })!;

describe('no grid is a normal state, not missing data', () => {
  it('returns null for a node that has none', () => {
    // A space map, a continent and a city have no battle grid. Inventing a one-unit one would snap every
    // pin the DM placed to a lattice that exists nowhere but in the reader.
    for (const raw of [null, undefined, {}, 'x', 42, { kind: 'square' }, { size: 0 }, { size: -3 }, { size: 'abc' }]) {
      expect(readGrid(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe('the two names the cell size has been written under', () => {
  it('reads `size`, the canonical key', () => {
    expect(readGrid({ size: 4 })?.size).toBe(4);
  });

  it('ALSO reads `size_px`, which is what the column comment documents', () => {
    // seeds/465 documents `{ kind, size_px, unit_ft, ... }` while the code read `grid.size`. Neither was
    // wrong until M4-1 became the first writer — at which point one of them would have silently meant
    // "no grid" and every snap would have quietly stopped working.
    expect(readGrid({ size_px: 4 })?.size).toBe(4);
    expect(readGrid({ unit_ft: 10, size: 4 })?.unitFt).toBe(10);
  });

  it('prefers the canonical key when both are present, rather than picking by luck', () => {
    expect(readGrid({ size: 4, size_px: 9 })?.size).toBe(4);
  });

  it('writes ONE shape back, so the aliases never spread', () => {
    const out = sanitizeGrid({ size_px: 4, unit_ft: 10, kind: 'hex' })!;
    expect(Object.keys(out).sort()).toEqual(
      ['colour', 'kind', 'offsetX', 'offsetY', 'opacity', 'size', 'snap', 'unitFt'],
    );
    expect(out.size).toBe(4);
    expect(out.unitFt).toBe(10);
  });

  it('clears to null so a DM can take a grid off a city map', () => {
    expect(sanitizeGrid(null)).toBeNull();
    expect(sanitizeGrid({})).toBeNull();
  });
});

describe('defaults are defaults, never assumptions', () => {
  it('defaults feet per cell to 5 — but reads whatever the node says', () => {
    expect(readGrid({ size: 5 })?.unitFt).toBe(5);
    expect(readGrid({ size: 5, unitFt: 10 })?.unitFt).toBe(10);
    // A hex crawl at a mile a hex is the same field, and G4 exists so nothing rounds it away.
    expect(readGrid({ size: 5, unitFt: 5280 })?.unitFt).toBe(5280);
  });

  it('defaults snapping ON, because a battle grid is FOR saying which square a thing is in', () => {
    expect(readGrid({ size: 5 })?.snap).toBe(true);
    expect(readGrid({ size: 5, snap: false })?.snap).toBe(false);
  });

  it('rejects a colour that is not a colour, since it lands in a style attribute', () => {
    expect(readGrid({ size: 5, colour: 'red; background: url(x)' })?.colour).toMatch(/^#[0-9a-f]{6}$/i);
    expect(readGrid({ size: 5, colour: '#e8c37a' })?.colour).toBe('#e8c37a');
    expect(readGrid({ size: 5, colour: '#abc' })?.colour).toBe('#abc');
  });

  it('clamps opacity into range instead of emitting an invalid one', () => {
    expect(readGrid({ size: 5, opacity: 5 })?.opacity).toBe(1);
    expect(readGrid({ size: 5, opacity: -2 })?.opacity).toBe(0);
  });
});

describe('the cell count is clamped at the input, not truncated at the render (G6)', () => {
  it('refuses a cell so small the overlay would be thousands of lines', () => {
    const g = readGrid({ size: 0.01 })!;
    expect(cellsAcross(g)).toBe(MAX_CELLS);
  });

  it('refuses a cell so large there is no grid left', () => {
    const g = readGrid({ size: WORLD * 10 })!;
    expect(cellsAcross(g)).toBe(MIN_CELLS);
  });

  it('round-trips a count the DM actually sets', () => {
    for (const n of [2, 10, 20, 30, 64, 200]) {
      expect(Math.round(cellsAcross(readGrid({ size: sizeForCells(n) })!))).toBe(n);
    }
  });
});

describe('G4 — feet to world units and back, from the node', () => {
  it('converts a 30 ft speed using the node’s OWN feet-per-square', () => {
    // 30 ft on a 5-ft grid is 6 cells; on a 10-ft grid it is 3. The map hardcoding either is exactly what
    // G4 forbids, and this is the function that makes "it asks" true.
    expect(feetToWorld(30, square)).toBeCloseTo(30, 6);            // 6 cells × 5 units
    expect(feetToWorld(30, readGrid({ size: 5, unitFt: 10 })!)).toBeCloseTo(15, 6);
  });

  it('is a true inverse, so a distance measured on the map reads back as the same feet', () => {
    for (const ft of [5, 30, 45, 120]) {
      expect(worldToFeet(feetToWorld(ft, square), square)).toBeCloseTo(ft, 6);
    }
  });

  it('never divides by zero on a nonsense unit', () => {
    const g = readGrid({ size: 5, unitFt: 0 })!;
    expect(Number.isFinite(feetToWorld(30, g))).toBe(true);
  });
});

describe('snapping lands in a square, not on a corner', () => {
  it('puts a point at the CENTRE of the cell it falls in', () => {
    // THE BUG THIS SLICE FOUND. The old rule rounded to a multiple of the cell size, so (7,12) on a 5-unit
    // grid became (5,10) — a grid intersection. Tokens draw with translate(-50%,-50%), so every snapped
    // token straddled four squares and "which square is the goblin in?" had four answers.
    expect(snapPoint(7, 12, square)).toEqual({ x: 7.5, y: 12.5 });
    expect(snapPoint(0.1, 0.1, square)).toEqual({ x: 2.5, y: 2.5 });
  });

  it('keeps every point in a cell it is actually inside', () => {
    for (let x = 0.5; x < WORLD; x += 3.7) {
      const s = snapPoint(x, x, square);
      expect(Math.abs(s.x - x)).toBeLessThanOrEqual(square.size / 2);
    }
  });

  it('does NOT snap without a grid, or with snapping turned off', () => {
    expect(snapPoint(7.3, 12.8, null)).toEqual({ x: 7.3, y: 12.8 });
    // Snap-off is a real setting: a rug across a doorway and a body in a corner sit BETWEEN squares.
    expect(snapPoint(7.3, 12.8, readGrid({ size: 5, snap: false })!)).toEqual({ x: 7.3, y: 12.8 });
  });

  it('follows the offset nudge, so the drawn line and the snapped square agree', () => {
    // The nudge exists to align the lines to a battle map's printed squares. A nudge that moved the
    // drawing but not the snapping would be worse than no nudge at all.
    const g = readGrid({ size: 5, offsetX: 2, offsetY: 2 })!;
    expect(snapPoint(7, 7, g)).toEqual({ x: 9.5, y: 9.5 });
  });

  it('wraps a nudge into one cell, so the control cannot appear to stop working', () => {
    expect(readGrid({ size: 5, offsetX: 12 })?.offsetX).toBe(2);
    // JS `%` keeps the dividend's sign, so a negative nudge would push the grid the wrong way.
    expect(readGrid({ size: 5, offsetX: -1 })?.offsetX).toBe(4);
  });
});

describe('square cells', () => {
  it('gives every point exactly one cell — floor, not round', () => {
    expect(squareAt(0, 0, square)).toEqual({ col: 0, row: 0 });
    expect(squareAt(4.99, 4.99, square)).toEqual({ col: 0, row: 0 });
    expect(squareAt(5, 5, square)).toEqual({ col: 1, row: 1 });
  });

  it('round-trips centre → cell', () => {
    for (const cell of [{ col: 0, row: 0 }, { col: 3, row: 7 }, { col: 19, row: 19 }]) {
      const c = squareCentre(cell, square);
      expect(squareAt(c.x, c.y, square)).toEqual(cell);
    }
  });
});

describe('hex cells', () => {
  it('round-trips every hex centre back to its own hex', () => {
    // Cube rounding rather than rounding q and r independently — the independent version leaves points
    // near the corners belonging to no hex at all, which shows up as a token that will not snap.
    for (let q = -3; q <= 6; q += 1) {
      for (let r = 0; r <= 8; r += 1) {
        const c = hexCentre(q, r, hex);
        expect(hexAt(c.x, c.y, hex), `hex ${q},${r}`).toEqual({ q, r });
      }
    }
  });

  it('tiles without gaps — every point in the map belongs to a hex whose centre is near it', () => {
    for (let x = 0.3; x < WORLD; x += 2.1) {
      for (let y = 0.7; y < WORLD; y += 3.3) {
        const h = hexAt(x, y, hex);
        const c = hexCentre(h.q, h.r, hex);
        // Inside the circumradius: the furthest a point can be from the centre of the hex containing it.
        expect(Math.hypot(c.x - x, c.y - y)).toBeLessThanOrEqual(hex.size / Math.sqrt(3) + 1e-9);
      }
    }
  });

  it('measures distance in steps between hexes, which is what movement will spend', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    // All six neighbours are one step away — the property that makes hexes worth the maths.
    for (const n of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as const) {
      expect(hexDistance({ q: 0, r: 0 }, { q: n[0], r: n[1] })).toBe(1);
    }
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -1 })).toBe(3);
  });

  it('snaps to a hex centre', () => {
    const c = hexCentre(2, 3, hex);
    const s = snapPoint(c.x + 0.4, c.y - 0.3, hex);
    expect(s.x).toBeCloseTo(c.x, 6);
    expect(s.y).toBeCloseTo(c.y, 6);
  });

  it('gives a hex grid the same cells across as a square one at the same size', () => {
    // What makes the designer's single "cells across" control honest when a DM flips between the shapes.
    expect(cellsAcross(hex)).toBe(cellsAcross(square));
  });
});
