// __tests__/dnd/map-movement.test.ts — the reachable-squares overlay. M5-2.
//
// The overlay is a picture of a rule. Every case here is one where a plausible implementation draws a
// confident, wrong shape — which on a battle map is worse than drawing nothing, because a DM will aim on it.
import { describe, it, expect } from 'vitest';
import {
  cellDistanceFt, diagonalRuleFor, hexDistanceFt, moveWarning, reachableHexes, reachableSquares,
  type HexCell,
} from '@/lib/dnd/maps/movement';
import type { Cell, MapGrid } from '@/lib/dnd/maps/grid';

const grid = (over: Partial<MapGrid> = {}): MapGrid => ({
  kind: 'square', size: 5, unitFt: 5, offsetX: 0, offsetY: 0, opacity: 0.3, colour: '#fff', snap: true,
  ...over,
} as MapGrid);

const O: Cell = { col: 0, row: 0 };
const has = (r: { cells: Array<{ cell: Cell }> }, col: number, row: number) =>
  r.cells.some((c) => c.cell.col === col && c.cell.row === row);
const costOf = (r: { cells: Array<{ cell: Cell; costFt: number }> }, col: number, row: number) =>
  r.cells.find((c) => c.cell.col === col && c.cell.row === row)?.costFt;

describe('the shape of reach depends on the diagonal rule, and the systems disagree', () => {
  it('5e default: a diagonal is free, so 30ft reaches a 6-square SQUARE', () => {
    const r = reachableSquares(O, { budgetFt: 30, grid: grid(), diagonals: 'free' });
    // Chebyshev: the far corner is as reachable as the far edge.
    expect(has(r, 6, 6)).toBe(true);
    expect(has(r, 6, 0)).toBe(true);
    expect(has(r, 7, 0)).toBe(false);
    // 13×13 minus the origin.
    expect(r.cells).toHaveLength(13 * 13 - 1);
  });

  it('alternating: the same budget reaches an OCTAGON, not a square', () => {
    // PF2 core, and 5e's DMG variant. Drawing a square here would offer moves the rules forbid.
    const r = reachableSquares(O, { budgetFt: 30, grid: grid(), diagonals: 'alternating' });
    expect(has(r, 6, 0)).toBe(true);   // straight: 6 steps
    expect(has(r, 6, 6)).toBe(false);  // pure diagonal 6 costs 5+10+5+10+5+10 = 45ft
    expect(has(r, 4, 4)).toBe(true);   // 4 diagonals = 5+10+5+10 = 30ft exactly
    expect(has(r, 5, 5)).toBe(false);
  });

  it('orthogonal: a DIAMOND — no diagonal movement at all', () => {
    const r = reachableSquares(O, { budgetFt: 15, grid: grid(), diagonals: 'orthogonal' });
    expect(has(r, 3, 0)).toBe(true);
    expect(has(r, 1, 1)).toBe(true);   // 2 steps
    expect(has(r, 2, 2)).toBe(false);  // 4 steps = 20ft
    expect(has(r, 1, 2)).toBe(true);   // 3 steps
  });

  it('alternating prices the SECOND diagonal, not every diagonal', () => {
    // The plausible shortcut is to charge 7.5ft per diagonal, or to charge double every time. Both give
    // the wrong answer at exactly two steps, which is where a real token usually is.
    const r = reachableSquares(O, { budgetFt: 100, grid: grid(), diagonals: 'alternating' });
    expect(costOf(r, 1, 1)).toBeCloseTo(5, 6);   // 1st diagonal: 5
    expect(costOf(r, 2, 2)).toBeCloseTo(15, 6);  // + 2nd: 10
    expect(costOf(r, 3, 3)).toBeCloseTo(20, 6);  // + 3rd: 5
    expect(costOf(r, 4, 4)).toBeCloseTo(30, 6);  // + 4th: 10
  });

  it('picks the rule per system rather than assuming one', () => {
    expect(diagonalRuleFor('pathfinder2e')).toBe('alternating');
    expect(diagonalRuleFor('dnd5e-2024')).toBe('free');
    expect(diagonalRuleFor('intuitive-games')).toBe('free');
    expect(diagonalRuleFor(null)).toBe('free');
  });
});

describe('the grid decides what a foot is — never a hardcoded 5', () => {
  it('reads unitFt off the node', () => {
    // A 10ft-per-square node halves the squares a 30ft speed buys. Hardcoding 5 draws twice the reach.
    const r = reachableSquares(O, { budgetFt: 30, grid: grid({ unitFt: 10 }), diagonals: 'free' });
    expect(has(r, 3, 0)).toBe(true);
    expect(has(r, 4, 0)).toBe(false);
  });

  it('a 1ft grid still terminates, and says it truncated rather than lying', () => {
    // 90ft on a 1ft grid is 32,000 squares. The overlay must stop; what it must NOT do is quietly return
    // a partial set that looks complete.
    const r = reachableSquares(O, { budgetFt: 90, grid: grid({ unitFt: 1 }), diagonals: 'free', maxCells: 500 });
    expect(r.truncated).toBe(true);
    expect(r.cells.length).toBeGreaterThan(0);
  });

  it('a complete search reports truncated: false', () => {
    expect(reachableSquares(O, { budgetFt: 15, grid: grid() }).truncated).toBe(false);
  });
});

describe('terrain is a parameter, and its absence is REPORTED', () => {
  it('says terrain was not applied when the caller supplied none', () => {
    // Nothing authors difficult terrain yet. The overlay has to be able to say so on screen rather than
    // implying it consulted a map layer that does not exist.
    expect(reachableSquares(O, { budgetFt: 30, grid: grid() }).terrainApplied).toBe(false);
  });

  it('difficult terrain halves what a budget buys', () => {
    const cost = (c: Cell) => (c.col >= 1 && c.col <= 3 ? 2 : 1);
    const r = reachableSquares(O, { budgetFt: 30, grid: grid(), diagonals: 'orthogonal', cost });
    expect(r.terrainApplied).toBe(true);
    // Entering cols 1-3 costs 10 each: col 3 costs 30 and is the last affordable square on that line.
    expect(costOf(r, 3, 0)).toBeCloseTo(30, 6);
    expect(has(r, 4, 0)).toBe(false);
  });

  it('routes AROUND difficult terrain when that is cheaper — a flood fill would not', () => {
    // The reason this is Dijkstra and not a breadth-first flood: the cheapest path is not always the one
    // with fewest steps, so a flood marks cells at whatever the first arrival cost, which is just wrong.
    //
    // The mud is at (1,0) and the target is BEYOND it at (2,0). Measuring the mud cell itself would prove
    // nothing — cost is charged on ENTERING a cell, so (1,0) costs 25 by every route.
    const cost = (c: Cell) => (c.col === 1 && c.row === 0 ? 5 : 1);
    const r = reachableSquares(O, { budgetFt: 30, grid: grid(), diagonals: 'orthogonal', cost });
    expect(costOf(r, 1, 0)).toBeCloseTo(25, 6);           // through the mud: 5 × 5ft
    // Straight on to (2,0) would be 25 + 5 = 30; around via (0,1)→(1,1)→(2,1)→(2,0) is four clean steps.
    expect(costOf(r, 2, 0)).toBeCloseTo(20, 6);
  });

  it('impassable is null, and it is not merely expensive', () => {
    // A wall must not become passable when the budget is large enough.
    const cost = (c: Cell) => (c.col === 1 ? null : 1);
    const r = reachableSquares(O, { budgetFt: 500, grid: grid(), diagonals: 'orthogonal', cost });
    expect(has(r, 1, 0)).toBe(false);
    expect(has(r, 2, 0)).toBe(false);
    expect(has(r, 0, 5)).toBe(true);
  });
});

describe('edge cases that should return nothing rather than misbehave', () => {
  it('no budget reaches nothing', () => {
    for (const budgetFt of [0, -5, NaN, Infinity]) {
      expect(reachableSquares(O, { budgetFt, grid: grid() }).cells).toEqual([]);
    }
  });

  it('never includes the origin — the token is already standing there', () => {
    const r = reachableSquares(O, { budgetFt: 30, grid: grid() });
    expect(has(r, 0, 0)).toBe(false);
  });

  it('works from a negative-coordinate origin', () => {
    // Grid coordinates go negative left of / above the offset; a search that assumed non-negative indices
    // would silently clip half the reach on the top-left of every map.
    const r = reachableSquares({ col: -4, row: -3 }, { budgetFt: 10, grid: grid(), diagonals: 'free' });
    expect(r.cells.some((c) => c.cell.col === -6 && c.cell.row === -5)).toBe(true);
  });

  it('a zero unitFt grid returns nothing instead of dividing by it', () => {
    expect(reachableSquares(O, { budgetFt: 30, grid: grid({ unitFt: 0 }) }).cells).toEqual([]);
  });
});

describe('hexes — no diagonal question, which is most of why they exist', () => {
  const H: HexCell = { q: 0, r: 0 };
  const hexGrid = grid({ kind: 'hex' });

  it('reaches every hex within the step count', () => {
    const r = reachableHexes(H, { budgetFt: 10, grid: hexGrid });
    // Two rings: 6 + 12 = 18 hexes, origin excluded.
    expect(r.cells).toHaveLength(18);
  });

  it('costs every neighbour the same', () => {
    const r = reachableHexes(H, { budgetFt: 5, grid: hexGrid });
    expect(r.cells).toHaveLength(6);
    expect(r.cells.every((c) => Math.abs(c.costFt - 5) < 1e-9)).toBe(true);
  });

  it('respects impassable hexes', () => {
    const cost = (c: HexCell) => (c.q === 1 && c.r === 0 ? null : 1);
    const r = reachableHexes(H, { budgetFt: 5, grid: hexGrid, cost });
    expect(r.cells).toHaveLength(5);
  });
});

describe('distance is a different question from cost', () => {
  it('measures geometrically, ignoring terrain', () => {
    // "How far apart are these" must match the ruler. Folding terrain in makes a dragged token report a
    // distance the ruler contradicts.
    expect(cellDistanceFt(O, { col: 3, row: 0 }, grid())).toBe(15);
    expect(cellDistanceFt(O, { col: 3, row: 3 }, grid(), 'free')).toBe(15);
    expect(cellDistanceFt(O, { col: 3, row: 3 }, grid(), 'orthogonal')).toBe(30);
  });

  it('alternating distance matches what the search charges', () => {
    // The readout and the overlay must agree, or one of them is lying about the same move.
    for (const n of [1, 2, 3, 4, 5]) {
      const r = reachableSquares(O, { budgetFt: 200, grid: grid(), diagonals: 'alternating' });
      expect(cellDistanceFt(O, { col: n, row: n }, grid(), 'alternating')).toBeCloseTo(costOf(r, n, n)!, 6);
    }
  });

  it('hex distance uses the node’s feet too', () => {
    expect(hexDistanceFt({ q: 0, r: 0 }, { q: 2, r: 0 }, grid({ unitFt: 10 }))).toBe(20);
  });
});

describe('over-budget WARNS, it does not forbid — G7', () => {
  it('reports the overage so the UI can name it', () => {
    // "12 ft over" is a sentence a DM can act on. A bare refusal is one they fight.
    expect(moveWarning(42, 30)).toEqual({ over: true, overageFt: 12 });
  });

  it('is silent within the allowance, including exactly on it', () => {
    expect(moveWarning(30, 30).over).toBe(false);
    expect(moveWarning(10, 30).over).toBe(false);
  });
});
