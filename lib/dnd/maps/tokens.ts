// lib/dnd/maps/tokens.ts — a creature standing on a map (M5-1).
//
// Owner, 2026-07-30: *"Make sure we can actually run sessions with it."* A map you cannot put a token on
// is a picture, and `dnd_map_objects` has carried a `token` kind since M1-3 with nothing ever writing one.
//
// ── THE SHEET OWNS THE NUMBERS (G4) ──────────────────────────────────────────────────────────────────
//
// A token stores **who it is and where it stands**, and nothing else. Not its HP, not its speed, not its
// conditions. Those live on the character sheet, are asked for when needed, and are never copied here —
// the same rule the rollers follow by never recomputing a total.
//
// The reason is not tidiness. A copied number is a number that goes stale: a token carrying `hp: 42` is
// wrong the moment the player takes damage on their sheet, and nothing tells either surface they now
// disagree. The map cannot drift from the rules because it does not hold a copy of them.
//
// So `data` holds a `characterId` (a bound token) **or** a `creatureId`/`creatureVariantId` (a monster
// pulled from the bestiary), plus the size category — which is a property of the token's FOOTPRINT on the
// grid rather than of the creature's current state, and is therefore genuinely the map's business.

/** Grid footprint, in squares. The words are shared across all four systems, which is why this is one map. */
export const TOKEN_SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
export type TokenSize = (typeof TOKEN_SIZES)[number];

/**
 * How many squares a size occupies on a side.
 *
 * Tiny and Small both occupy one square — that is the published rule in every system here, and the
 * difference between them is how many can share a square, not how much room one takes. Storing tiny as 0.5
 * would make a token half a square wide on screen, which is not what any of these games mean.
 */
export const SIZE_SQUARES: Record<TokenSize, number> = {
  tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4,
};

/** What a token is bound to. Exactly one, and the union is what makes "exactly one" checkable. */
export type TokenSubject =
  | { characterId: string }
  | { creatureId: string }
  | { creatureVariantId: string };

export interface TokenData {
  subject: TokenSubject;
  size: TokenSize;
  /** A DM's own name for this instance — "Goblin B" — when three of the same creature are on the map. */
  nickname?: string;
}

const isId = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * Read a token's `data` blob defensively, or `null` when it is not a usable token.
 *
 * NULL RATHER THAN A DEFAULT. A token with no subject is not a medium-sized unbound token — it is a row
 * that should not be drawn, because a marker on the map that points at nothing is worse than a gap: a DM
 * would move it, target it, and find it does nothing. Same reasoning as `normalizeStatblock` dropping an
 * unparseable AC instead of clamping it to 10.
 */
export function readToken(data: unknown): TokenData | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const raw = (d.subject && typeof d.subject === 'object' ? d.subject : d) as Record<string, unknown>;

  let subject: TokenSubject | null = null;
  if (isId(raw.characterId)) subject = { characterId: raw.characterId };
  else if (isId(raw.creatureVariantId)) subject = { creatureVariantId: raw.creatureVariantId };
  else if (isId(raw.creatureId)) subject = { creatureId: raw.creatureId };
  if (!subject) return null;

  const size = TOKEN_SIZES.includes(d.size as TokenSize) ? (d.size as TokenSize) : 'medium';
  const nickname = typeof d.nickname === 'string' && d.nickname.trim() ? d.nickname.trim() : undefined;
  return { subject, size, ...(nickname ? { nickname } : {}) };
}

/**
 * Snap a position to the grid a node declares.
 *
 * `size` is 0 or absent on a node with no grid — a world map, a region — and there SNAPPING IS WRONG:
 * a city pin does not sit on a battle grid, and rounding its position would visibly move every marker the
 * DM placed. So no grid means the position is returned untouched, rather than snapped to an imagined
 * one-unit grid.
 */
export function snapToGrid(x: number, y: number, grid: { size?: number } | null | undefined) {
  const size = Number(grid?.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) return { x, y };
  return { x: Math.round(x / size) * size, y: Math.round(y / size) * size };
}

/** The on-screen side of a token in world units — its footprint, from the node's grid. */
export function tokenFootprint(size: TokenSize, grid: { size?: number } | null | undefined): number {
  const cell = Number(grid?.size ?? 0);
  const squares = SIZE_SQUARES[size] ?? 1;
  // A gridless map still needs a drawable size; 2 world units reads as a marker at the zoom these maps
  // open at, and a token there is a pin rather than a piece on a board.
  return cell > 0 ? cell * squares : 2 * squares;
}

/**
 * Keep a token inside the map.
 *
 * Maps are a 0–100 world box (the same box pins live in), and a token dragged past the edge would be
 * unreachable rather than merely off-screen — the viewport clamps its own pan to the bounds, so nothing
 * could scroll to it.
 */
export function clampToMap(x: number, y: number, bounds?: { maxX?: number; maxY?: number } | null) {
  const maxX = Number(bounds?.maxX ?? 100);
  const maxY = Number(bounds?.maxY ?? 100);
  return {
    x: Math.min(Math.max(0, x), Number.isFinite(maxX) ? maxX : 100),
    y: Math.min(Math.max(0, y), Number.isFinite(maxY) ? maxY : 100),
  };
}
