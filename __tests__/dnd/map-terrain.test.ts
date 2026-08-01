// __tests__/dnd/map-terrain.test.ts — difficult ground and blockers (M5-2's other half).
//
// M5-2 shipped the reader and wrote down that it must not stay alone: *"Building the reader without the
// writer would be the same defect this slice just found twice."* These are the rules that make a placed
// object into a cost, and the failures they guard against are the ones a table would notice mid-fight —
// walking through a wall, or paying quadruple for one square of mud.
import { describe, it, expect } from 'vitest';
import {
  TERRAIN_COST, hexTerrainCost, patchesFrom, readTerrain, terrainCost, type TerrainPatch,
} from '@/lib/dnd/maps/terrain';
import { MAP_BOUNDS, reachableSquares } from '@/lib/dnd/maps/movement';
import { squareAt, type MapGrid } from '@/lib/dnd/maps/grid';

const grid: MapGrid = {
  kind: 'square', size: 5, unitFt: 5, offsetX: 0, offsetY: 0, opacity: 0.3, colour: '#fff', snap: true,
} as MapGrid;

const patch = (over: Partial<TerrainPatch>): TerrainPatch =>
  ({ x: 12.5, y: 12.5, w: 5, h: 5, kind: 'difficult', ...over });

describe('reading the marker', () => {
  it('accepts the two kinds and nothing else', () => {
    expect(readTerrain({ terrain: 'difficult' })).toBe('difficult');
    expect(readTerrain({ terrain: 'blocked' })).toBe('blocked');
  });

  it('an unrecognised value is NULL, not a default', () => {
    // A DM who typed `terrain: "swamp"` has said something this map does not understand. Guessing
    // "difficult" would silently double the cost of a region for a reason nobody could find.
    expect(readTerrain({ terrain: 'swamp' })).toBeNull();
    expect(readTerrain({ terrain: true })).toBeNull();
    expect(readTerrain({})).toBeNull();
    expect(readTerrain(null)).toBeNull();
    expect(readTerrain('difficult')).toBeNull();
  });
});

describe('cost', () => {
  it('difficult doubles; blocked is impassable', () => {
    expect(TERRAIN_COST.difficult).toBe(2);
    // `null`, not a very large number. A blocker is an ABSENCE — the search must route around it rather
    // than find it expensive, which is the case that makes Dijkstra necessary rather than a flood.
    expect(TERRAIN_COST.blocked).toBeNull();
  });

  it('costs 1 where no patch covers the cell', () => {
    const cost = terrainCost([patch({})], grid)!;
    expect(cost(squareAt(62.5, 62.5, grid))).toBe(1);
  });

  it('applies to the cell whose CENTRE it covers', () => {
    const cost = terrainCost([patch({ x: 12.5, y: 12.5 })], grid)!;
    expect(cost(squareAt(12.5, 12.5, grid))).toBe(2);
    expect(cost(squareAt(17.5, 12.5, grid))).toBe(1);
  });

  it('a BLOCKER under difficult ground is still a wall', () => {
    // The strictest patch wins, rather than the last one placed. Layer order decides what is drawn on
    // top; it must not decide whether a wall is a wall.
    const cost = terrainCost([patch({ kind: 'difficult' }), patch({ kind: 'blocked' })], grid)!;
    expect(cost(squareAt(12.5, 12.5, grid))).toBeNull();
    // And in the other order, which is the one that would break under a naive "last write wins".
    const reversed = terrainCost([patch({ kind: 'blocked' }), patch({ kind: 'difficult' })], grid)!;
    expect(reversed(squareAt(12.5, 12.5, grid))).toBeNull();
  });

  it('overlapping difficult ground does NOT compound', () => {
    // Two mud patches on one square is a mapping accident, not quadruple cost — and a DM would have no
    // way to see why that one square cost 20 feet.
    const cost = terrainCost([patch({}), patch({})], grid)!;
    expect(cost(squareAt(12.5, 12.5, grid))).toBe(2);
  });

  it('is UNDEFINED when there are no patches, so `terrainApplied` stays false', () => {
    // Not "a function that always answers 1". `terrainApplied` is derived from whether a cost was passed
    // at all, and a map with no terrain must keep saying "not counted" rather than claiming it counted
    // terrain and found none — two different statements.
    expect(terrainCost([], grid)).toBeUndefined();
    expect(hexTerrainCost([], grid)).toBeUndefined();
  });

  it('uses a half-open interval, so a 1-cell patch covers one cell', () => {
    // The closed-interval version of this is the bug M5-3's cube template already hit: counting both
    // ends of a span makes a 3-cell patch cover 4 cells' worth of centres.
    const cost = terrainCost([patch({ x: 12.5, y: 12.5, w: 5, h: 5 })], grid)!;
    const covered = [0, 5, 10, 15, 20].filter((x) => cost(squareAt(x + 2.5, 12.5, grid)) === 2);
    expect(covered).toEqual([10]);
  });
});

describe('the search actually routes around it', () => {
  // BOUNDED, because that is how `loadReach` calls it — and it is the difference between a wall and a
  // detour. Unbounded, a token in the corner simply walks off the map and back on behind the wall, which
  // is exactly the defect the bounds parameter was added for (found while writing this test).
  const walk = (cost?: (c: { col: number; row: number }) => number | null) =>
    reachableSquares({ col: 0, row: 0 }, { budgetFt: 30, grid, diagonals: 'free', cost, bounds: MAP_BOUNDS });

  it('a blocker removes cells from the reachable set', () => {
    const open = walk().cells.length;
    // A wall down the column beside the origin.
    const wall = Array.from({ length: 8 }, (_, i) => patch({ kind: 'blocked', x: 7.5, y: i * 5 + 2.5 }));
    const blocked = walk(terrainCost(wall, grid)).cells.length;
    expect(blocked).toBeLessThan(open);
    // And the cells behind it are genuinely gone, not merely expensive.
    expect(walk(terrainCost(wall, grid)).cells.some((c) => c.cell.col === 1)).toBe(false);
  });

  it('difficult ground costs more without making a cell unreachable', () => {
    const mud = [patch({ kind: 'difficult', x: 7.5, y: 2.5 })];
    const withMud = walk(terrainCost(mud, grid));
    const cell = withMud.cells.find((c) => c.cell.col === 1 && c.cell.row === 0);
    expect(cell).toBeDefined();
    expect(cell!.costFt).toBe(10);
  });

  it('reports that terrain was consulted', () => {
    expect(walk().terrainApplied).toBe(false);
    expect(walk(terrainCost([patch({})], grid)).terrainApplied).toBe(true);
  });
});

describe('patchesFrom', () => {
  it('keeps only the objects that carry terrain, and coerces the numerics', () => {
    // Postgres numerics arrive as STRINGS through PostgREST, which is why this coerces rather than
    // trusting the shape — a string x would make every `covers` comparison lexicographic and quietly
    // wrong.
    const got = patchesFrom([
      { x: '10', y: '20', w: '5', h: null, data: { terrain: 'blocked' } },
      { x: 1, y: 1, w: 1, h: 1, data: {} },
      { x: 2, y: 2, w: null, h: null, data: { terrain: 'difficult' } },
    ]);
    expect(got).toEqual([
      { x: 10, y: 20, w: 5, h: null, kind: 'blocked' },
      { x: 2, y: 2, w: null, h: null, kind: 'difficult' },
    ]);
  });
});

describe('the edge of the map is a wall the search must respect', () => {
  // Found while writing the blocker test above: nothing bounded the flood, so a token in a corner was
  // offered squares OUTSIDE the 0-100 box every node draws itself into — where the viewport's own pan
  // clamp means the reader can never even scroll to look. Worse on a map with a wall along the edge:
  // the route went round the wall by leaving the map.
  const corner = { col: 0, row: 0 };

  it('offers nothing outside the map', () => {
    const r = reachableSquares(corner, { budgetFt: 30, grid, diagonals: 'free', bounds: MAP_BOUNDS });
    expect(r.cells.every((c) => c.cell.col >= 0 && c.cell.row >= 0)).toBe(true);
    expect(r.cells.every((c) => c.cell.col < 20 && c.cell.row < 20)).toBe(true);
  });

  it('is a PARAMETER — omitting it leaves an unbounded plane', () => {
    // Deliberate: this module's own header argues that the search takes what it needs as an argument
    // rather than inventing a lookup, and a default 0-100 box would make its geometry untestable on its
    // own terms. The caller that knows what a map is supplies it.
    const unbounded = reachableSquares(corner, { budgetFt: 30, grid, diagonals: 'free' });
    expect(unbounded.cells.some((c) => c.cell.col < 0 || c.cell.row < 0)).toBe(true);
  });
});
