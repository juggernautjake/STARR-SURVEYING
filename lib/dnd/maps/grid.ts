// lib/dnd/maps/grid.ts — the grid a node declares, and the ONE place that reads it (M4-1).
//
// The plan: *"Square or hex, size in pixels, feet per square, offset nudge, colour and opacity, snap
// on/off. Feeds G4: the grid is what converts a sheet's speed in feet into squares."*
//
// ── WHY THIS MODULE EXISTS RATHER THAN A FEW FIELDS READ WHEREVER THEY ARE NEEDED ────────────────────
//
// A grid answers four different questions for four different callers: what to DRAW (the overlay), which
// square a click LANDS in (the place route), how big a token IS (the renderer), and how far a speed in
// feet REACHES (M5-2). Four readers of one jsonb blob is four chances to disagree about where a square
// begins — and a map where the drawn line and the snapped position differ by half a cell is a map a DM
// cannot aim on. So the blob is parsed exactly once, here, into a shape with no optional fields.
//
// ── THE AUDIT FOUND THE DISAGREEMENT ALREADY IN PLACE, BEFORE ANY GRID EXISTED TO EXPOSE IT ──────────
//
// `seeds/465_dnd_map_nodes.sql` documents the column as `{ kind, size_px, unit_ft, offset, opacity,
// colour }`. `lib/dnd/maps/tokens.ts` read `grid.size`. **Neither was wrong yet, because nothing had ever
// written a grid** — M4-1 is the first writer, and the moment it wrote the documented key every snap and
// every footprint would have silently gone back to "no grid" and kept working, wrongly. That is this
// codebase's signature defect with the halves swapped: not storage nobody reads, but a reader and a
// writer that never met.
//
// Settled here, in this order:
//
//   1. **`size` is the canonical key, and it is in WORLD UNITS — not pixels.** The seed comment says
//      `size_px`, and the plan says "size in pixels", and for this renderer that is meaningless: a node's
//      picture is a 0–100 world box drawn through a pan/zoom transform, so a cell measured in screen
//      pixels would be a different fraction of the map at every zoom level. A grid must be a property of
//      the MAP, not of the reader's window.
//   2. **The seed's snake_case names are accepted as aliases on read** (`size_px`, `unit_ft`), so a grid
//      hand-written against the column comment still works. New writes are camelCase, matching every
//      other jsonb blob in this app (`characterId` on a token, not `character_id`).
//
// ── AND THE SECOND BUG, WHICH ONLY A GRID MAKES VISIBLE ──────────────────────────────────────────────
//
// The old snap rounded to a MULTIPLE of the cell size: `snapToGrid(7, 12, { size: 5 })` gave `(5, 10)`.
// That is a grid CORNER. Tokens render with `translate(-50%, -50%)`, so every snapped token would have
// straddled the intersection of four squares — on a battle map, the one question a grid exists to answer
// ("which square is the goblin in?") would have had four answers. Snapping now lands on the cell CENTRE.
//
// Pure and total: no I/O, no clock, no randomness.

/** Every node draws its picture into a 0–100 box. Pins, tokens and this grid all live in those units. */
export const WORLD = 100;

export type GridKind = 'square' | 'hex';

/**
 * A node's grid, fully resolved — every field present, so no caller writes `?? 5` and picks a different
 * default from the caller next to it.
 */
export interface MapGrid {
  kind: GridKind;
  /** Cell size in WORLD units: the side of a square, or the width (flat-to-flat) of a pointy-top hex. */
  size: number;
  /** Feet per cell. This is the whole of G4's conversion — the map never hardcodes 5, it reads this. */
  unitFt: number;
  /** Nudge, in world units, for aligning the lines to the squares already drawn on a battle-map image. */
  offsetX: number;
  offsetY: number;
  colour: string;
  opacity: number;
  /** Snap off lets a DM place something between squares — a rug, a body, a door in a wall. */
  snap: boolean;
}

/**
 * How many cells fit across the map, clamped.
 *
 * The clamp is a G6 decision (*"nothing silently truncates"*) applied at the INPUT instead of the render:
 * a DM who could ask for a 0.05-unit cell would get 2,000 lines each way, and the honest answer is to
 * refuse the setting rather than to draw a fraction of it and say nothing. 2 is the smallest grid that is
 * a grid at all; 200 cells at 5 ft is a 1,000-foot map, past any battle and well into "use a coarser node".
 */
export const MIN_CELLS = 2;
export const MAX_CELLS = 200;

const DEFAULT_COLOUR = '#7fdbd4';
/** 5 ft is 5e's and IG's square and PF2's, so it is the default — but it is a DEFAULT, never an assumption:
 *  a ship deck at 10 ft or a city block at 100 ft is one field away, and G4 exists so that field is read. */
const DEFAULT_UNIT_FT = 5;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** `#abc` / `#a1b2c3` only. This string ends up in a `style` attribute, and an unvalidated colour is a
 *  place to write something that is not a colour. */
const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/**
 * Read a node's `grid` blob, or **null when the node has no grid**.
 *
 * Null rather than a default grid, and the distinction is load-bearing: a space map, a continent and a
 * city have no battle grid, and inventing a one-unit one would snap every pin the DM has placed to a
 * lattice that exists nowhere but in this function. "No grid" is a normal, common, correct state.
 */
export function readGrid(raw: unknown): MapGrid | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;

  // `size` first, then the column comment's `size_px`. A grid with no usable size is not a grid — that is
  // the "no grid" state above, not a grid with a broken size.
  const rawSize = num(g.size) ?? num(g.size_px);
  if (rawSize === null || rawSize <= 0) return null;
  // Expressed as a cell COUNT so the clamp is stated in the units a DM thinks in, then converted back.
  const size = WORLD / clamp(WORLD / rawSize, MIN_CELLS, MAX_CELLS);

  const kind: GridKind = g.kind === 'hex' ? 'hex' : 'square';
  const unitFt = Math.max(0.1, num(g.unitFt) ?? num(g.unit_ft) ?? DEFAULT_UNIT_FT);
  const colour = typeof g.colour === 'string' && HEX_COLOUR.test(g.colour.trim())
    ? g.colour.trim()
    : DEFAULT_COLOUR;

  return {
    kind,
    size,
    unitFt,
    // Wrapped into one cell: an offset of 1.5 cells and an offset of 0.5 draw the identical grid, and
    // letting the number grow without bound makes "nudge" a control that appears to stop working.
    offsetX: mod(num(g.offsetX) ?? num(g.offset_x) ?? 0, size),
    offsetY: mod(num(g.offsetY) ?? num(g.offset_y) ?? 0, size),
    colour,
    opacity: clamp(num(g.opacity) ?? 0.35, 0, 1),
    // Snap defaults ON. A battle grid whose whole purpose is to say which square a thing is in should not
    // have to be switched on after being drawn.
    snap: g.snap !== false,
  };
}

/** True modulo — JS `%` keeps the sign of the dividend, so `-1 % 5` is `-1` and a negative nudge would
 *  push the grid the wrong way. */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * Validate a grid coming off the wire, for storage. Returns the canonical blob, or **null to clear**.
 *
 * Separate from `readGrid` on purpose: reading is forgiving (accept every shape that has ever been
 * written), writing is strict (emit exactly one shape). A single function doing both is how the aliases
 * above become permanent.
 */
export function sanitizeGrid(raw: unknown): Record<string, unknown> | null {
  const g = readGrid(raw);
  if (!g) return null;
  return {
    kind: g.kind,
    size: round4(g.size),
    unitFt: round4(g.unitFt),
    offsetX: round4(g.offsetX),
    offsetY: round4(g.offsetY),
    colour: g.colour,
    opacity: round4(g.opacity),
    snap: g.snap,
  };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Cells across the map. The number a DM actually sets; `size` is derived from it. */
export function cellsAcross(grid: MapGrid): number {
  return WORLD / grid.size;
}

/** The world-unit size of a cell count expressed the way a DM sets it. Inverse of `cellsAcross`. */
export function sizeForCells(cells: number): number {
  return WORLD / clamp(cells, MIN_CELLS, MAX_CELLS);
}

// ── G4: feet ↔ world units ───────────────────────────────────────────────────────────────────────────
//
// The two functions the map is forbidden from inlining. A speed of 30 ft is not "6 squares" and not "30
// units" — it is `30 / unitFt` cells of `size` world units each, and `unitFt` is whatever this node says.

/** Feet, as a distance in world units on this node. */
export function feetToWorld(feet: number, grid: MapGrid): number {
  return (feet / grid.unitFt) * grid.size;
}

/** A world-unit distance, in feet on this node. */
export function worldToFeet(distance: number, grid: MapGrid): number {
  return (distance / grid.size) * grid.unitFt;
}

// ── Square cells ─────────────────────────────────────────────────────────────────────────────────────

export interface Cell {
  col: number;
  row: number;
}

/** Which square a point is in. Floor, not round — a cell owns `[n, n+1)`, so every point has exactly one. */
export function squareAt(x: number, y: number, grid: MapGrid): Cell {
  return {
    col: Math.floor((x - grid.offsetX) / grid.size),
    row: Math.floor((y - grid.offsetY) / grid.size),
  };
}

/** The CENTRE of a square — where a token stands, since tokens are drawn centred on their position. */
export function squareCentre(cell: Cell, grid: MapGrid): { x: number; y: number } {
  return {
    x: (cell.col + 0.5) * grid.size + grid.offsetX,
    y: (cell.row + 0.5) * grid.size + grid.offsetY,
  };
}

// ── Hex cells (pointy-top, axial coordinates) ────────────────────────────────────────────────────────
//
// Pointy-top rather than flat-top because these maps are wider than they are tall (16:9), and pointy-top
// hexes tile a wide box with fewer rows of half-offset stubs at the edges.
//
// `size` is the flat-to-flat WIDTH, so a hex grid and a square grid set to the same size have the same
// number of cells across — which is what makes the designer's one "cells across" control honest when the
// DM flips between them.

/** Circumradius (centre to corner) from the flat-to-flat width. */
const hexRadius = (size: number) => size / Math.sqrt(3);

/** The centre of hex `(q, r)` in world units. */
export function hexCentre(q: number, r: number, grid: MapGrid): { x: number; y: number } {
  const R = hexRadius(grid.size);
  return {
    x: grid.size * (q + r / 2) + grid.offsetX,
    y: R * 1.5 * r + grid.offsetY,
  };
}

/** Which hex a point is in, by cube rounding — the only version that does not produce gaps at the seams. */
export function hexAt(x: number, y: number, grid: MapGrid): { q: number; r: number } {
  const R = hexRadius(grid.size);
  const px = x - grid.offsetX;
  const py = y - grid.offsetY;
  const q = (Math.sqrt(3) / 3) * (px / R) - (1 / 3) * (py / R);
  const r = (2 / 3) * (py / R);
  return cubeRound(q, r);
}

/**
 * Round fractional axial coordinates to a real hex.
 *
 * Rounding q and r independently is the classic wrong answer: it produces points that belong to no hex
 * near the corners. Converting to cube coordinates (which sum to zero), rounding all three, and repairing
 * whichever moved most is the version that tiles without gaps.
 */
function cubeRound(q: number, r: number): { q: number; r: number } {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  // `Math.round(-0.2)` is `-0`, and `-0` is a coordinate that PRINTS as 0, compares equal to 0 with `===`,
  // and fails a deep-equality check. Left alone it would be a hex that looks identical to its neighbour in
  // every log and every debugger while being a different value to any code that compares cells. Normalised
  // here rather than at each caller, since the caller has no reason to suspect it. (`-0 + 0` is `+0`.)
  return { q: rq + 0, r: rr + 0 };
}

/** Distance in hexes — the cube distance, which is the number of steps between two hexes. */
export function hexDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// ── Snapping ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Put a point on the grid: the centre of the cell it falls in.
 *
 * Returns the point UNTOUCHED when there is no grid, or when the DM has turned snapping off. Both are
 * ordinary states — a world map has no battle grid, and snap-off is how a rug gets laid across a doorway.
 */
export function snapPoint(x: number, y: number, grid: MapGrid | null): { x: number; y: number } {
  if (!grid || !grid.snap) return { x, y };
  if (grid.kind === 'hex') {
    const h = hexAt(x, y, grid);
    return hexCentre(h.q, h.r, grid);
  }
  return squareCentre(squareAt(x, y, grid), grid);
}
