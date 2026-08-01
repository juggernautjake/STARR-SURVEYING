// lib/dnd/maps/terrain.ts — the writer `movement.ts` has been waiting for (M5-2).
//
// M5-2 shipped the reader and said so plainly: *"Difficult terrain and blockers are not counted — nothing
// on this map authors them yet."* `reachableSquares` already takes terrain as a PARAMETER
// (`cost: (cell) => number | null`), so nothing in the search changes when a writer appears. This is that
// writer's half: how a placed object becomes a cost, and what the costs mean.
//
// ── TERRAIN IS A MAP OBJECT, NOT A NEW TABLE ───────────────────────────────────────────────────────
//
// An `area` object with `data.terrain` set. That is not a shortcut — it is the same argument M1-3 makes
// for one object table: a patch of mud needs to be placed, moved, resized, rotated, layered, hidden from
// players, deleted and UNDONE, and every one of those already works for an `area`. A `dnd_map_terrain`
// table would be a second set of all nine, and the first bug fixed in one would not be fixed in the other.
//
// ── DIFFICULT IS A MULTIPLIER; BLOCKED IS AN ABSENCE ───────────────────────────────────────────────
//
// `2` and `null` are not two flavours of the same thing. Difficult ground costs double to enter and the
// search routes around it when that is cheaper; a blocker cannot be entered at all, so the search must go
// AROUND it — which is the case that makes Dijkstra necessary rather than a flood, and the case where a
// wrong answer is most visible at a table ("I can see that the wall is there and the map says I can walk
// through it").

import { hexCentre, squareCentre, type Cell, type MapGrid } from './grid';
import type { HexCell } from './movement';

export type TerrainKind = 'difficult' | 'blocked';

/** How much a cell of each kind costs to enter. `null` means it cannot be entered at all. */
export const TERRAIN_COST: Record<TerrainKind, number | null> = {
  difficult: 2,
  blocked: null,
};

export const TERRAIN_LABEL: Record<TerrainKind, string> = {
  difficult: 'Difficult ground',
  blocked: 'Blocker',
};

/** An `area` object that carries terrain. Only the geometry and the kind matter here. */
export interface TerrainPatch {
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  kind: TerrainKind;
}

/**
 * Read the terrain marker off an object's `data`, or null if it carries none.
 *
 * An unrecognised value is null rather than a default. A DM who types `data.terrain = "swamp"` has said
 * something this map does not understand, and guessing "difficult" would silently double the cost of a
 * region for a reason nobody could find.
 */
export function readTerrain(data: unknown): TerrainKind | null {
  if (!data || typeof data !== 'object') return null;
  const raw = (data as Record<string, unknown>).terrain;
  return raw === 'difficult' || raw === 'blocked' ? raw : null;
}

/** Default patch size in world units when the object has none. One cell, so a click paints one square. */
const DEFAULT_SIDE = 5;

/** Is this world point inside the patch? Patches are axis-aligned and centred on their own point. */
function covers(p: TerrainPatch, x: number, y: number): boolean {
  const w = Number(p.w) > 0 ? Number(p.w) : DEFAULT_SIDE;
  const h = Number(p.h) > 0 ? Number(p.h) : w;
  // Half-open on the far edge, the same interval rule M5-3's cube template needed: a closed interval
  // counts both ends of a span and makes a 3-cell patch cover 4 cells' worth of centres.
  return x >= p.x - w / 2 && x < p.x + w / 2 && y >= p.y - h / 2 && y < p.y + h / 2;
}

/**
 * The cost function `reachableSquares` / `reachableHexes` take.
 *
 * Returns `null` (impassable) as soon as any blocker covers the cell, so a blocker under a mud patch is
 * still a wall — **the strictest patch wins**, rather than the last one placed. Layer order decides what
 * is drawn on top; it must not decide whether a wall is a wall.
 *
 * The empty case returns `undefined` rather than a function that always answers 1, because
 * `terrainApplied` is derived from whether a `cost` was passed at all — and a map with no terrain must
 * keep saying so out loud instead of claiming it counted terrain and found none.
 */
export function terrainCost(
  patches: readonly TerrainPatch[],
  grid: MapGrid,
): ((cell: Cell) => number | null) | undefined {
  if (!patches.length) return undefined;
  return (cell) => costAt(patches, squareCentre(cell, grid));
}

export function hexTerrainCost(
  patches: readonly TerrainPatch[],
  grid: MapGrid,
): ((cell: HexCell) => number | null) | undefined {
  if (!patches.length) return undefined;
  return (cell) => costAt(patches, hexCentre(cell.q, cell.r, grid));
}

function costAt(patches: readonly TerrainPatch[], at: { x: number; y: number }): number | null {
  let multiplier = 1;
  for (const p of patches) {
    if (!covers(p, at.x, at.y)) continue;
    const cost = TERRAIN_COST[p.kind];
    // A blocker ends the question. Nothing stacked on top of it can make it passable again.
    if (cost === null) return null;
    // Overlapping difficult ground does NOT compound. Two mud patches on one square is a mapping
    // accident, not quadruple cost — and a DM would have no way to see why one square cost 8 feet.
    multiplier = Math.max(multiplier, cost);
  }
  return multiplier;
}

/** Turn map objects into patches, dropping the ones that carry no terrain. */
export function patchesFrom(
  objects: readonly { x: number | string; y: number | string; w: number | string | null; h: number | string | null; data: unknown }[],
): TerrainPatch[] {
  const out: TerrainPatch[] = [];
  for (const o of objects) {
    const kind = readTerrain(o.data);
    if (!kind) continue;
    out.push({
      x: Number(o.x), y: Number(o.y),
      w: o.w == null ? null : Number(o.w),
      h: o.h == null ? null : Number(o.h),
      kind,
    });
  }
  return out;
}
