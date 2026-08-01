// lib/dnd/maps/fog.ts — what a player can see (M7-2).
//
// M7-2: *"Per-node fog with DM reveal brush; token vision radii from the sheet (darkvision etc.)."*
//
// ── FOG IS A MASK, NOT A PER-CELL QUERY ────────────────────────────────────────────────────────────
//
// The obvious implementation asks "is this cell visible" for every cell and paints the dark ones. On a
// 40×40 map that is 1,600 elements to draw a shape that is mostly one colour, and it makes fog look
// blocky in a way nothing else on this map does. So fog is ONE dark rectangle with holes punched in it —
// an SVG mask — and the holes are the revealed regions and the vision circles. One element, any
// resolution, and it composes with pan and zoom for free.
//
// ── VISION IS READ FROM THE SHEET, NEVER RESTATED ──────────────────────────────────────────────────
//
// `speciesView(...).senses` already produces strings a player reads on their own sheet — "Darkvision 60
// ft". Parsing that is the same rule the spell areas and the weapon reaches follow: the map must not
// hold a second opinion about how far a dwarf can see. A character whose senses say nothing gets the
// ordinary sight radius, which is a stated default rather than an invented one.
//
// Pure and total: no I/O, no clock, no randomness.

import { WORLD } from './grid';

/** A region the DM has revealed, in world units, centred on its own point. */
export interface FogHole {
  x: number;
  y: number;
  /** Radius for a vision circle; half-width/half-height for a revealed rectangle. */
  r?: number;
  w?: number;
  h?: number;
}

/**
 * How far a creature sees in the dark when its sheet says nothing.
 *
 * A STATED DEFAULT rather than an invented rule: with fog on, a token that revealed nothing at all would
 * make a party of humans blind, and a DM would have to give every character darkvision to run a dark
 * corridor. Two squares of a 5 ft grid is close enough to "arm's length and a bit" to be defensible and
 * small enough that revealing the room is still the DM's job.
 */
export const DEFAULT_SIGHT_FT = 10;

/**
 * Feet of vision stated by a sheet's senses, or the default.
 *
 * Takes the LARGEST stated sense, not the first. A character with "Darkvision 60 ft" and "Tremorsense 30
 * ft" sees 60 — taking whichever the array happened to list first would make the answer depend on the
 * order a species file was written in.
 */
export function visionFt(senses: readonly string[] | undefined): number {
  let best = DEFAULT_SIGHT_FT;
  for (const s of senses ?? []) {
    const m = String(s).match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)/i);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > best) best = n;
  }
  return best;
}

/**
 * The holes to punch in the fog for a viewer.
 *
 * `revealed` are the DM's brushed regions; `tokens` are the viewer's own pieces and how far each sees.
 * A DM passes no tokens and gets only the revealed regions — because a DM sees everything anyway and
 * their fog is a reminder of what the PARTY cannot see, not a limit on themselves.
 */
export function fogHoles(
  revealed: readonly { x: number; y: number; w: number | null; h: number | null }[],
  tokens: readonly { x: number; y: number; radiusWorld: number }[],
): FogHole[] {
  const holes: FogHole[] = [];
  for (const r of revealed) {
    const w = Number(r.w) > 0 ? Number(r.w) : 5;
    const h = Number(r.h) > 0 ? Number(r.h) : w;
    holes.push({ x: Number(r.x), y: Number(r.y), w, h });
  }
  for (const t of tokens) {
    if (!(t.radiusWorld > 0)) continue;
    holes.push({ x: t.x, y: t.y, r: t.radiusWorld });
  }
  return holes;
}

/**
 * Is this point visible through the fog?
 *
 * Used for the things fog must actually HIDE rather than merely darken — a token in an unrevealed room
 * is not a token drawn faintly, it is a token the other side does not know about. Drawing it under a
 * translucent overlay would leak its position to anyone who turned up their screen brightness, which is
 * the same class of mistake as filtering a secret in React instead of in the query (G3).
 */
export function isVisible(holes: readonly FogHole[], x: number, y: number): boolean {
  for (const h of holes) {
    if (h.r !== undefined) {
      if (Math.hypot(x - h.x, y - h.y) <= h.r) return true;
      continue;
    }
    const w = h.w ?? 0;
    const hh = h.h ?? w;
    if (x >= h.x - w / 2 && x <= h.x + w / 2 && y >= h.y - hh / 2 && y <= h.y + hh / 2) return true;
  }
  return false;
}

/** The whole map, for the mask's base rectangle. */
export const FOG_RECT = { x: 0, y: 0, w: WORLD, h: WORLD };

/** Read the fog marker off an object's `data`. Only `revealed` means anything today. */
export function readFog(data: unknown): 'revealed' | null {
  if (!data || typeof data !== 'object') return null;
  return (data as Record<string, unknown>).fog === 'revealed' ? 'revealed' : null;
}
