// lib/dnd/maps/movement.ts — how far can this token actually go? M5-2.
//
// The plan: *"Select a token → its remaining movement shows as a reachable-squares overlay computed from
// the character's **actual speed** through the per-system derivation … Difficult terrain and blockers
// reduce it. Dragging beyond the allowance warns rather than forbids — the DM is in charge (G7)."*
//
// ── TERRAIN IS A PARAMETER, AND THAT IS WHY IT COST NOTHING TO ARRIVE ──────────────────────────────
//
// This header used to say nothing authored difficult terrain or blockers, and that the honest shape was
// to take terrain as a **parameter** (`cost`) rather than a lookup this module invents — so that when
// the writer landed, nothing in here would change.
//
// `lib/dnd/maps/terrain.ts` landed on 2026-08-01 and nothing in here changed. The same argument now
// covers `bounds`, added at the same time for the same reason: the search takes what it needs as an
// argument, and the caller — which knows what a map is — supplies it.
//
// The defaults are still an unbounded plane of open ground, because a default that quietly assumed a
// 0–100 box would make this file's geometry untestable on its own terms.
//
// ── THE DIAGONAL IS A RULES DECISION, NOT AN IMPLEMENTATION DETAIL ─────────────────────────────────
//
// On a square grid, "how far is diagonally adjacent" is the single question that most changes the shape
// of this overlay, and the systems genuinely disagree:
//
//   · **5e (PHB default)** — a diagonal costs the same as a straight step. Reach is a SQUARE.
//   · **5e (DMG optional) and Pathfinder 2e** — diagonals alternate 5 / 10 ft. Reach is a rough octagon.
//   · **Orthogonal only** — no diagonal movement at all. Reach is a diamond.
//
// Picking one silently would draw a confidently wrong overlay for two systems out of three. So it is an
// explicit policy, defaulted per system by the caller, and the alternating rule is implemented properly:
// its cost depends on **how many diagonals the path has already used**, which is why the search carries
// that parity in its state rather than pricing each step in isolation. Pricing alternation per-step is
// the plausible-looking shortcut that gets the second diagonal wrong on every path.
//
// Pure and total: no I/O, no clock, no randomness.

import { WORLD, hexCentre, hexDistance, squareCentre, type Cell, type MapGrid } from './grid';

/** Cell centre as a tuple, so the bounds check reads as one line at each call site. */
const centreOf = (c: Cell, g: MapGrid): [number, number] => { const p = squareCentre(c, g); return [p.x, p.y]; };
const hexCentreOf = (c: { q: number; r: number }, g: MapGrid): [number, number] => { const p = hexCentre(c.q, c.r, g); return [p.x, p.y]; };

/**
 * THE EDGE OF THE MAP IS A PARAMETER, for the same reason terrain is.
 *
 * Found while writing M5-2's terrain tests: nothing bounded the flood, so a token standing near an edge
 * got reachable squares drawn OUTSIDE the picture — off the 0–100 box every node draws itself into, where
 * the viewport's own pan clamp means the reader can never even scroll to look. A DM reads that as "I can
 * walk out there", and on a map with a wall along the edge it is worse: the route goes round the wall by
 * leaving the map.
 *
 * The fix could have been a hardcoded `0 <= x <= WORLD`, and this module's own header argues against it
 * in the paragraph about terrain: the search takes what it needs as an argument rather than inventing a
 * lookup. So the caller says where the map ends, `loadReach` passes the node's own box, and the geometry
 * here stays geometry — which also keeps every existing test's unbounded plane meaningful.
 */
export const MAP_BOUNDS: MapBounds = { minX: 0, minY: 0, maxX: WORLD, maxY: WORLD };

export interface MapBounds { minX: number; minY: number; maxX: number; maxY: number }

const inside = (b: MapBounds | undefined, x: number, y: number): boolean =>
  !b || (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY);

/** How a square grid prices a diagonal step. */
export type DiagonalRule = 'free' | 'alternating' | 'orthogonal';

/**
 * The default for a system.
 *
 * 5e's *default* is `free` — the PHB's "you can move diagonally" costs one square. `alternating` is the
 * DMG variant. PF2 alternates by the core rules, so it is not a variant there.
 */
export function diagonalRuleFor(system: string | null | undefined): DiagonalRule {
  if (system === 'pathfinder2e') return 'alternating';
  return 'free';
}

export interface HexCell { q: number; r: number }

/** A cell the token can reach, and what it costs to stand there. */
export interface Reachable<C> {
  cell: C;
  /** Feet spent getting here by the cheapest path found. */
  costFt: number;
}

export interface ReachOptions<C> {
  /** Feet of movement available. `0` or less reaches nothing but the origin. */
  budgetFt: number;
  grid: MapGrid;
  /**
   * Terrain, as a MULTIPLIER on the cost of entering a cell — `2` is difficult terrain, `1` is open
   * ground, `null` is impassable. Defaults to open ground everywhere, because nothing authors terrain
   * yet (see the header).
   */
  cost?: (cell: C) => number | null;
  /**
   * Where the map ends. Omitted means an unbounded plane, which is the right default for a pure geometry
   * test and the WRONG one for a real map — `loadReach` passes the node's own box, so a token in a
   * corner is not offered squares outside the picture.
   */
  bounds?: MapBounds;
  /** Square grids only. Ignored for hexes, which have no diagonals. */
  diagonals?: DiagonalRule;
  /**
   * Hard cap on cells examined. A 300ft fly speed on a 1ft grid is 90,000 cells and would hang the UI;
   * a budget that large is a mistake or a joke, and either way the overlay should stop rather than the
   * browser. Reaching the cap is reported, never silently truncated.
   */
  maxCells?: number;
}

export interface ReachResult<C> {
  cells: Array<Reachable<C>>;
  /** True when `maxCells` stopped the search — the overlay is INCOMPLETE and must say so. */
  truncated: boolean;
  /** What terrain was consulted. `false` whenever the caller passed no `cost`. */
  terrainApplied: boolean;
}

const DEFAULT_MAX_CELLS = 4000;

const SQUARE_STEPS: Array<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** The six neighbours of a pointy-top axial hex. */
const HEX_STEPS: Array<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
];

/**
 * Reachable squares.
 *
 * Dijkstra rather than a breadth-first flood, because with difficult terrain the cheapest path to a cell
 * is not always the one with the fewest steps — a flood would mark a cell at the cost of whichever route
 * happened to arrive first, which on a map with a mud patch is simply a wrong number.
 *
 * The state is `(cell, diagonalsUsedParity)`: under `alternating`, arriving at the same cell having spent
 * an odd rather than an even number of diagonals is a genuinely different position to continue from.
 */
export function reachableSquares(origin: Cell, opts: ReachOptions<Cell>): ReachResult<Cell> {
  const { budgetFt, grid, cost, bounds, diagonals = 'free', maxCells = DEFAULT_MAX_CELLS } = opts;
  const step = grid.unitFt;
  const best = new Map<string, number>();      // "col,row" → cheapest cost to stand there
  const seen = new Map<string, number>();      // "col,row,parity" → cheapest cost in that state
  const key = (c: Cell) => `${c.col},${c.row}`;

  if (!Number.isFinite(budgetFt) || budgetFt <= 0 || step <= 0) {
    return { cells: [], truncated: false, terrainApplied: Boolean(cost) };
  }

  // A tiny binary-heap-free priority queue: the frontier stays small for realistic budgets, and an array
  // scan is both faster and much easier to be sure of than a hand-rolled heap.
  const frontier: Array<{ cell: Cell; parity: 0 | 1; spent: number }> = [
    { cell: origin, parity: 0, spent: 0 },
  ];
  seen.set(`${key(origin)},0`, 0);
  let truncated = false;

  while (frontier.length) {
    let bestIdx = 0;
    for (let i = 1; i < frontier.length; i += 1) if (frontier[i].spent < frontier[bestIdx].spent) bestIdx = i;
    const cur = frontier.splice(bestIdx, 1)[0];

    for (const [dc, dr] of SQUARE_STEPS) {
      const isDiagonal = dc !== 0 && dr !== 0;
      if (isDiagonal && diagonals === 'orthogonal') continue;

      const next: Cell = { col: cur.cell.col + dc, row: cur.cell.row + dr };
      // A cell whose CENTRE lies off the map is not on the map. Centre rather than any-overlap, so the
      // rule matches how every other part of this system decides which cell a point is in.
      if (!inside(bounds, ...centreOf(next, grid))) continue;
      const multiplier = cost ? cost(next) : 1;
      if (multiplier === null) continue; // impassable

      // The alternating rule, priced against the path rather than the step: the 1st, 3rd, 5th … diagonal
      // costs one step; the 2nd, 4th … costs two.
      const base = isDiagonal && diagonals === 'alternating' && cur.parity === 1 ? step * 2 : step;
      const spent = cur.spent + base * multiplier;
      if (spent > budgetFt + 1e-9) continue;

      const nextParity: 0 | 1 = isDiagonal && diagonals === 'alternating'
        ? (cur.parity === 0 ? 1 : 0)
        : cur.parity;

      const stateKey = `${key(next)},${nextParity}`;
      const prior = seen.get(stateKey);
      if (prior !== undefined && prior <= spent + 1e-9) continue;
      seen.set(stateKey, spent);

      const cellKey = key(next);
      const priorCell = best.get(cellKey);
      if (priorCell === undefined || spent < priorCell) best.set(cellKey, spent);

      if (best.size > maxCells) { truncated = true; break; }
      frontier.push({ cell: next, parity: nextParity, spent });
    }
    if (truncated) break;
  }

  // The origin is where the token already stands; it is not somewhere it can "move to".
  best.delete(key(origin));

  const cells = [...best.entries()].map(([k, costFt]) => {
    const [col, row] = k.split(',').map(Number);
    return { cell: { col, row }, costFt };
  });
  return { cells, truncated, terrainApplied: Boolean(cost) };
}

/**
 * Reachable hexes.
 *
 * Simpler than squares by construction: every hex neighbour is one step, so there is no diagonal question
 * to get wrong — which is most of the reason hex grids exist.
 */
export function reachableHexes(origin: HexCell, opts: ReachOptions<HexCell>): ReachResult<HexCell> {
  const { budgetFt, grid, cost, bounds, maxCells = DEFAULT_MAX_CELLS } = opts;
  const step = grid.unitFt;
  const key = (c: HexCell) => `${c.q},${c.r}`;

  if (!Number.isFinite(budgetFt) || budgetFt <= 0 || step <= 0) {
    return { cells: [], truncated: false, terrainApplied: Boolean(cost) };
  }

  const best = new Map<string, number>([[key(origin), 0]]);
  const frontier: Array<{ cell: HexCell; spent: number }> = [{ cell: origin, spent: 0 }];
  let truncated = false;

  while (frontier.length) {
    let bestIdx = 0;
    for (let i = 1; i < frontier.length; i += 1) if (frontier[i].spent < frontier[bestIdx].spent) bestIdx = i;
    const cur = frontier.splice(bestIdx, 1)[0];

    for (const [dq, dr] of HEX_STEPS) {
      const next: HexCell = { q: cur.cell.q + dq, r: cur.cell.r + dr };
      if (!inside(bounds, ...hexCentreOf(next, grid))) continue;
      const multiplier = cost ? cost(next) : 1;
      if (multiplier === null) continue;

      const spent = cur.spent + step * multiplier;
      if (spent > budgetFt + 1e-9) continue;

      const k = key(next);
      const prior = best.get(k);
      if (prior !== undefined && prior <= spent + 1e-9) continue;
      best.set(k, spent);

      if (best.size > maxCells) { truncated = true; break; }
      frontier.push({ cell: next, spent });
    }
    if (truncated) break;
  }

  best.delete(key(origin));
  const cells = [...best.entries()].map(([k, costFt]) => {
    const [q, r] = k.split(',').map(Number);
    return { cell: { q, r }, costFt };
  });
  return { cells, truncated, terrainApplied: Boolean(cost) };
}

/**
 * How far, in feet, between two cells on this grid — the number the "you moved N ft" readout uses.
 *
 * Deliberately geometric and terrain-free: this answers *"how far apart are these"*, which is a different
 * question from *"what did the trip cost"*. Conflating them is how a token dragged across a mud patch
 * reports a distance that does not match the ruler.
 */
export function cellDistanceFt(a: Cell, b: Cell, grid: MapGrid, diagonals: DiagonalRule = 'free'): number {
  const dx = Math.abs(a.col - b.col);
  const dy = Math.abs(a.row - b.row);
  if (diagonals === 'orthogonal') return (dx + dy) * grid.unitFt;
  if (diagonals === 'free') return Math.max(dx, dy) * grid.unitFt;
  // Alternating: the diagonals cost 1, 2, 1, 2 … so `min` diagonal steps cost `floor(min*1.5)` steps.
  const diag = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diag;
  return (straight + diag + Math.floor(diag / 2)) * grid.unitFt;
}

export function hexDistanceFt(a: HexCell, b: HexCell, grid: MapGrid): number {
  return hexDistance(a, b) * grid.unitFt;
}

/**
 * Is this move within the allowance? **Advisory, never a veto** — G7 says the DM is in charge.
 *
 * Returns the overage so the UI can say "12 ft over" rather than a bare refusal. A map tool that blocks a
 * move is a map tool the DM fights; one that mentions it is one they trust.
 */
export function moveWarning(spentFt: number, budgetFt: number): { over: boolean; overageFt: number } {
  const overageFt = Math.max(0, spentFt - budgetFt);
  return { over: overageFt > 1e-9, overageFt };
}
