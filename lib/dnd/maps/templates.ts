// lib/dnd/maps/templates.ts — spell areas, read from the sheet's own text. M5-3 (rules layer).
//
// The plan: *"Attack reach from the weapon; spell areas as the system defines them … Placed by drag from
// the sheet's own attack/spell entries, **so the map and the sheet cannot disagree about a spell's
// size**."*
//
// That last clause is the whole design. The catalogues already state the area, in prose, in the field a
// player reads:
//
//     5e   `range: 'Self (15-foot cone)'`   `range: 'Self (60-foot line)'`
//     PF2  `area: '20-foot burst'`          `area: '15-foot cone (1 action) or 30-foot cone (2 actions)'`
//
// A second, structured copy of that number would be a number that goes stale — the same rule that keeps a
// portrait off a token and HP off a token. So this PARSES what is already written rather than asking
// anyone to restate it.
//
// ── WHAT IS A MODELLING CHOICE AND WHAT IS A RULE ──────────────────────────────────────────────────
//
// Two things here are genuinely system rules and are set per system rather than picked once:
//
//   · **Cone angle.** A 5e cone's width at any point equals its distance from the origin, which is a
//     total angle of 2·atan(0.5) ≈ **53.13°**. A PF2 cone is described on the grid as a quarter circle —
//     **90°**. Using one number for both draws a visibly wrong template for whichever system loses.
//   · **Emanation vs burst.** An emanation radiates from the creature and its own square is part of the
//     area; a burst is centred on a point and the origin square is just another square. Treating them as
//     the same circle is wrong at exactly the square the caster is standing in.
//
// One thing here is a TABLE RULING and is therefore a parameter, not a constant: **whether a square counts
// as covered when the template only clips its corner.** `centre` (the square's midpoint is inside) is the
// common virtual-tabletop convention and the default; `any` (any overlap at all) is the more generous
// reading. Rather than assert one book's wording I cannot quote, the policy is named, switchable, and its
// effect is visible in the tests.
//
// Pure and total: no I/O, no clock, no randomness.

import { squareCentre, type Cell, type MapGrid } from './grid';

export type TemplateShape = 'radius' | 'sphere' | 'dome' | 'emanation' | 'burst' | 'cone' | 'line' | 'cube';

export interface ParsedArea {
  shape: TemplateShape;
  sizeFt: number;
  /** The words this was read from, kept so a surprising template can be traced to its own text. */
  source: string;
}

const SHAPES: TemplateShape[] = ['radius', 'sphere', 'dome', 'emanation', 'burst', 'cone', 'line', 'cube'];

/**
 * Every area stated in a piece of rules text, in the order written.
 *
 * Returns an ARRAY because PF2 genuinely states two in one field —
 * `'15-foot cone (1 action) or 30-foot cone (2 actions)'` — and picking the first silently would make a
 * two-action Burning Hands cover half the ground it should.
 *
 * Miles are ignored on purpose: `'Self (5-mile radius)'` is a divination's sensing range, not something
 * anyone puts on a battle map, and converting it would offer a 26,400-foot template.
 */
export function parseAreas(text: string | null | undefined): ParsedArea[] {
  if (!text) return [];
  const out: ParsedArea[] = [];
  // `15-foot cone`, `20-foot burst`, `10-foot-radius sphere` (2014 writes the hyphenated variant).
  const re = /(\d+(?:\.\d+)?)[-\s]?(?:foot|feet|ft)[-\s]?(?:(radius|sphere|dome|emanation|burst|cone|line|cube)\b)?[-\s]*(radius|sphere|dome|emanation|burst|cone|line|cube)?/gi;
  for (const m of text.matchAll(re)) {
    const shape = (m[2] ?? m[3])?.toLowerCase() as TemplateShape | undefined;
    if (!shape || !SHAPES.includes(shape)) continue;
    const sizeFt = Number(m[1]);
    if (!Number.isFinite(sizeFt) || sizeFt <= 0) continue;
    out.push({ shape, sizeFt, source: m[0].trim() });
  }
  return out;
}

/** The first area, which is what a single-option spell has and what a picker defaults to. */
export function parseArea(text: string | null | undefined): ParsedArea | null {
  return parseAreas(text)[0] ?? null;
}

/** Whether a square counts as covered. A TABLE RULING — see the header. */
export type Inclusion = 'centre' | 'any';

/** 5e: width equals distance, so the half-angle is atan(0.5). PF2: a quarter circle on the grid. */
export const CONE_ANGLE_5E = 2 * Math.atan(0.5) * (180 / Math.PI); // 53.13°
export const CONE_ANGLE_PF2 = 90;

export function coneAngleFor(system: string | null | undefined): number {
  return system === 'pathfinder2e' ? CONE_ANGLE_PF2 : CONE_ANGLE_5E;
}

export interface TemplateOptions {
  shape: TemplateShape;
  sizeFt: number;
  /** Origin in WORLD units. For an emanation this is the caster's own position. */
  x: number;
  y: number;
  grid: MapGrid;
  /** Degrees clockwise from east. Only cones, lines and cubes have a facing. */
  directionDeg?: number;
  inclusion?: Inclusion;
  coneAngleDeg?: number;
  /** Bound on cells examined, for the same reason `movement.ts` has one. */
  maxCells?: number;
}

export interface TemplateResult {
  cells: Cell[];
  truncated: boolean;
  /** True when the origin square is part of the area — emanations only. */
  includesOrigin: boolean;
}

const DEFAULT_MAX = 4000;
const RAD = Math.PI / 180;

/** The corners of a square cell, in world units. */
function corners(cell: Cell, grid: MapGrid): Array<[number, number]> {
  const c = squareCentre(cell, grid);
  const h = grid.size / 2;
  return [[c.x - h, c.y - h], [c.x + h, c.y - h], [c.x - h, c.y + h], [c.x + h, c.y + h]];
}

/** Does a cell count, under the chosen policy, given a predicate over world points? */
function covered(cell: Cell, grid: MapGrid, inclusion: Inclusion, inside: (x: number, y: number) => boolean): boolean {
  const c = squareCentre(cell, grid);
  if (inclusion === 'centre') return inside(c.x, c.y);
  // `any`: the centre OR any corner. Not a true polygon intersection — a template can in principle cross
  // a square without containing centre or corner — but at these sizes relative to a 5ft cell that case
  // does not arise, and a corner test is one a reader can check by eye against the drawing.
  return inside(c.x, c.y) || corners(cell, grid).some(([x, y]) => inside(x, y));
}

/**
 * Which squares a template covers.
 *
 * Scans the bounding box of the shape rather than flood-filling: a template is a fixed geometric figure,
 * not a path, so there is nothing to search — every square in reach either satisfies the predicate or
 * does not.
 */
export function templateCells(opts: TemplateOptions): TemplateResult {
  const {
    shape, sizeFt, x, y, grid, directionDeg = 0,
    inclusion = 'centre', coneAngleDeg = CONE_ANGLE_5E, maxCells = DEFAULT_MAX,
  } = opts;

  if (!Number.isFinite(sizeFt) || sizeFt <= 0 || grid.unitFt <= 0 || grid.size <= 0) {
    return { cells: [], truncated: false, includesOrigin: false };
  }

  const reachWorld = (sizeFt / grid.unitFt) * grid.size;
  // A cube/line is measured along its own axis, so its bounding box is the length in both directions.
  const halfBox = reachWorld + grid.size;
  const c0 = { col: Math.floor((x - grid.offsetX) / grid.size), row: Math.floor((y - grid.offsetY) / grid.size) };
  const span = Math.ceil(halfBox / grid.size);

  const dir = directionDeg * RAD;
  const half = (coneAngleDeg / 2) * RAD;

  const inside = (px: number, py: number): boolean => {
    const dx = px - x;
    const dy = py - y;
    const dist = Math.hypot(dx, dy);
    switch (shape) {
      case 'radius':
      case 'sphere':
      case 'dome':
      case 'burst':
      case 'emanation':
        return dist <= reachWorld + 1e-9;
      case 'cone': {
        if (dist > reachWorld + 1e-9) return false;
        if (dist < 1e-9) return true;
        // Smallest absolute angle between the point and the facing, wrapped to ±180°.
        let a = Math.atan2(dy, dx) - dir;
        while (a > Math.PI) a -= 2 * Math.PI;
        while (a < -Math.PI) a += 2 * Math.PI;
        return Math.abs(a) <= half + 1e-9;
      }
      // ── HALF-OPEN ALONG THE AXIS, AND THIS IS THE DETAIL THAT DECIDES THE COUNT ──────────────────
      //
      // A 15ft cube must be 3×3, not 3×4. Measuring `0 ≤ along ≤ 15` from a cell centre admits the
      // centres at 0, 5, 10 AND 15 — four columns for a three-square shape, because a closed interval
      // counts both ends of a span that only has room for three cells. `[0, 15)` gives 3, and a 60ft line
      // gives 12 squares rather than 13.
      //
      // The convention this fixes: the template is measured from its origin POINT, and a template placed
      // on a cell centre therefore includes that cell as its first increment. A DM who wants it to begin
      // at the square's edge places it on the edge — which the grid offset already allows.
      case 'line': {
        // A 5ft-wide line: within half a cell of the axis, and between the origin and the length.
        const along = dx * Math.cos(dir) + dy * Math.sin(dir);
        const across = Math.abs(-dx * Math.sin(dir) + dy * Math.cos(dir));
        return along >= -1e-9 && along < reachWorld - 1e-9 && across <= grid.size / 2 + 1e-9;
      }
      case 'cube': {
        // An axis-aligned cube whose near face is at the origin, extending along the facing.
        const along = dx * Math.cos(dir) + dy * Math.sin(dir);
        const across = Math.abs(-dx * Math.sin(dir) + dy * Math.cos(dir));
        return along >= -1e-9 && along < reachWorld - 1e-9 && across < reachWorld / 2 - 1e-9;
      }
    }
  };

  const cells: Cell[] = [];
  let truncated = false;
  for (let dr = -span; dr <= span && !truncated; dr += 1) {
    for (let dc = -span; dc <= span; dc += 1) {
      const cell = { col: c0.col + dc, row: c0.row + dr };
      if (!covered(cell, grid, inclusion, inside)) continue;
      cells.push(cell);
      if (cells.length > maxCells) { truncated = true; break; }
    }
  }

  const originIsIn = cells.some((c) => c.col === c0.col && c.row === c0.row);
  // A BURST is centred on a point and its origin square is just another square; an EMANATION radiates
  // from the creature and its own square is part of the area. Same circle, different rule at exactly the
  // square the caster is standing in.
  if (shape === 'burst' && originIsIn) {
    return {
      cells: cells.filter((c) => !(c.col === c0.col && c.row === c0.row)),
      truncated,
      includesOrigin: false,
    };
  }

  return { cells, truncated, includesOrigin: originIsIn };
}

/** A short label for the UI, e.g. "15 ft cone". */
export function describeArea(area: ParsedArea): string {
  return `${area.sizeFt} ft ${area.shape}`;
}
