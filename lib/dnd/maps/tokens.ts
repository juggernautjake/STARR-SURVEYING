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

import { readGrid, snapPoint } from './grid';

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
  /**
   * The DM's explicit OVERRIDE of the footprint, or **null when they have not stated one**.
   *
   * Null is not "medium". A creature already knows how big it is — a character through its species, a
   * bestiary creature through its stat block — and defaulting here would silently draw every Ogre at one
   * square while the sheet next to it says Large. So the parser reports what was written and the RENDERER
   * resolves it against the subject, which is the only layer that knows what the subject is.
   *
   * The override still exists because footprint genuinely is the map's business (M5-1): a DM who wants
   * this particular giant to take four squares should get four squares.
   */
  size: TokenSize | null;
  /** A DM's own name for this instance — "Goblin B" — when three of the same creature are on the map. */
  nickname?: string;
}

/** Stable key for a subject, so a token and the row it stands for can be matched in one map lookup. */
export function subjectKey(subject: TokenSubject): string {
  if ('characterId' in subject) return `character:${subject.characterId}`;
  if ('creatureVariantId' in subject) return `variant:${subject.creatureVariantId}`;
  return `creature:${subject.creatureId}`;
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

  // An unrecognised size reads as NOT STATED rather than as medium — see `TokenData.size`. A token whose
  // blob says `size: "enormous"` is a token whose author's intent we cannot honour, and guessing "medium"
  // for it hides that just as thoroughly as guessing for a blank.
  const size = TOKEN_SIZES.includes(d.size as TokenSize) ? (d.size as TokenSize) : null;
  const nickname = typeof d.nickname === 'string' && d.nickname.trim() ? d.nickname.trim() : undefined;
  return { subject, size, ...(nickname ? { nickname } : {}) };
}

/**
 * Read a size written by a system that is not this one — a species' `"Medium"`, a stat block's
 * `"Large"`, PF2's `"Gargantuan"`. Returns null for anything unrecognised rather than guessing.
 *
 * Every system in this app uses the same six words for creature size, which is the reason a single
 * `TokenSize` can serve all four (M5-1) — this is just the case-and-whitespace tolerance for reading
 * them back out of prose fields written by four different catalogues.
 */
export function parseTokenSize(raw: unknown): TokenSize | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  return (TOKEN_SIZES as readonly string[]).includes(s) ? (s as TokenSize) : null;
}

/**
 * Snap a position to the grid a node declares.
 *
 * A node with no grid — a world map, a region — is NOT snapped: a city pin does not sit on a battle grid,
 * and rounding its position would visibly move every marker the DM placed. Same for a grid whose owner has
 * turned snapping off, which is how a rug gets laid across a doorway.
 *
 * ── IT USED TO SNAP TO THE CORNER, AND M4-1 IS WHAT MADE THAT VISIBLE ────────────────────────────────
 *
 * This rounded to a MULTIPLE of the cell size — `(7, 12)` on a 5-unit grid became `(5, 10)`, a grid
 * INTERSECTION. Tokens are drawn with `translate(-50%, -50%)`, so a snapped token straddled four squares
 * and the one question a battle grid exists to answer had four answers. It had never misbehaved because
 * no node had a grid until the designer shipped; the geometry now lives in `grid.ts` with the drawing and
 * the feet-to-squares conversion, so the line a DM sees and the square a token lands in cannot disagree.
 */
export function snapToGrid(x: number, y: number, grid: unknown) {
  return snapPoint(x, y, readGrid(grid));
}

/** The on-screen side of a token in world units — its footprint, from the node's grid. */
export function tokenFootprint(size: TokenSize, grid: unknown): number {
  const g = readGrid(grid);
  const squares = SIZE_SQUARES[size] ?? 1;
  // A gridless map still needs a drawable size; 2 world units reads as a marker at the zoom these maps
  // open at, and a token there is a pin rather than a piece on a board.
  return g ? g.size * squares : 2 * squares;
}

/**
 * Where a token of this footprint should be CENTRED so that it covers whole squares.
 *
 * ── WHY THE STORED POSITION IS NOT ALWAYS THE ANSWER ─────────────────────────────────────────────────
 *
 * Tokens render with `translate(-50%, -50%)`, so the stored point is the token's centre. M4-1 snaps that
 * point to a cell CENTRE, which is exactly right for a creature one square wide — and exactly wrong for
 * one that is two squares wide. A 2×2 token centred on a cell centre reaches half a square past the grid
 * in all four directions and covers **nine** squares partially instead of four completely.
 *
 * The rule is the one every published grid uses, and it is about parity rather than size:
 *
 *   - **Odd footprints** (Medium 1×1, Huge 3×3) centre on a cell CENTRE.
 *   - **Even footprints** (Large 2×2, Gargantuan 4×4) centre on a grid VERTEX — the corner where four
 *     squares meet — because that is the only point an even-sided square can sit on and still align.
 *
 * Hex grids are exempt: a hex has no four-way vertex to straddle, so a token of any size centres on its
 * own hex, and a bigger one simply overlaps its neighbours the way a big miniature does on a real hex mat.
 *
 * Snap-off returns the point untouched, like every other placement rule here — a DM who turned snapping
 * off is placing something deliberately between squares and must not be corrected.
 */
export function tokenAnchor(x: number, y: number, size: TokenSize, grid: unknown): { x: number; y: number } {
  const g = readGrid(grid);
  if (!g || !g.snap) return { x, y };
  if (g.kind === 'hex') return snapPoint(x, y, g);

  const squares = SIZE_SQUARES[size] ?? 1;
  if (squares % 2 === 1) return snapPoint(x, y, g);

  // Nearest vertex. `round`, not `floor`: the token should move to the corner it is closest to, so a
  // nudge of a fraction of a square does not slide it a whole square.
  return {
    x: Math.round((x - g.offsetX) / g.size) * g.size + g.offsetX,
    y: Math.round((y - g.offsetY) / g.size) * g.size + g.offsetY,
  };
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
