// lib/dnd/maps/regions.ts — which regions a token just walked into (M6-4's missing events).
//
// M6-4 shipped an engine and an executor and named what was still missing: *"nothing emits
// `token_enters` / `door_opened` automatically — the events exist and the route accepts them, but only a
// DM's button and an explicit event POST reach them today."* A trap that only springs when the DM presses
// a button is a trap the DM has to remember, which is the thing a trigger exists to stop.
//
// ── ENTERED, NOT "IS INSIDE" ───────────────────────────────────────────────────────────────────────
//
// The event is `token_enters`, and the difference matters: a token that moves one square WITHIN a room
// has not entered it again. Firing on "is inside" would set a pit trap off on every step across it, which
// at a table reads as the map being broken rather than as the puzzle being clever. So this takes the
// position BEFORE and AFTER and returns only the regions that gained the token.
//
// The same function answers `token_leaves` by swapping its arguments, which is why it is one function.
//
// Pure and total: no I/O.

/** A region on the map — any `area` object. Rectangles centred on their own point, like everything else. */
export interface Region {
  id: string;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
}

/** World units. An area with no size is still somewhere — one grid cell is the smallest sensible guess. */
const DEFAULT_SIDE = 5;

export function contains(r: Region, x: number, y: number): boolean {
  const w = Number(r.w) > 0 ? Number(r.w) : DEFAULT_SIDE;
  const h = Number(r.h) > 0 ? Number(r.h) : w;
  // Half-open on the far edge, the same interval rule the terrain patches and the cube template use — a
  // closed interval counts both ends of a span and makes adjacent regions overlap along their shared
  // boundary, which would fire two triggers for one step.
  return x >= r.x - w / 2 && x < r.x + w / 2 && y >= r.y - h / 2 && y < r.y + h / 2;
}

/**
 * The regions the token was NOT in at `from` and IS in at `to`.
 *
 * Order is preserved from `regions`, so a map with nested rooms fires its triggers in the order the DM
 * authored them rather than in whatever order the database returned.
 */
export function entered(
  regions: readonly Region[],
  from: { x: number; y: number },
  to: { x: number; y: number },
): Region[] {
  return regions.filter((r) => !contains(r, from.x, from.y) && contains(r, to.x, to.y));
}

/** The mirror. Same rule, arguments swapped — a token that left is one that was in and now is not. */
export function left(
  regions: readonly Region[],
  from: { x: number; y: number },
  to: { x: number; y: number },
): Region[] {
  return entered(regions, to, from);
}
