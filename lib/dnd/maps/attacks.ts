// lib/dnd/maps/attacks.ts — how far this weapon reaches, read off the sheet (M5-3's other half).
//
// M5-3 shipped spell areas and named what it had not done: *"weapon/attack reach from the sheet (the
// other half of this slice's title)"*. This is that half.
//
// ── PARSED FROM THE SHEET, NEVER RESTATED ──────────────────────────────────────────────────────────
//
// Same rule the spell areas follow, and for the same reason: `Attack.range` is the field a player reads
// and edits, so a second structured copy of the number is a copy that goes stale. A glaive that becomes
// a whip on the sheet becomes a whip on the map, with nothing to re-save.
//
// ── REACH IS MEASURED THE WAY MOVEMENT IS MEASURED ─────────────────────────────────────────────────
//
// This is the decision that matters, and getting it wrong draws a confidently incorrect shape. "Within
// 10 feet" on a square grid is NOT a circle: it is whatever the system's own distance rule says, which
// is exactly the rule `movement.ts` already implements per system. 5e's free diagonal makes 10ft reach a
// 5×5 SQUARE; PF2's alternating diagonals make it an octagon. Drawing a Euclidean circle would disagree
// with the movement overlay drawn a moment earlier on the same token — two overlays, one map, two
// answers to "how far is that".
//
// So reach borrows `cellDistanceFt` rather than re-deriving distance, and the two cannot drift.

import { squareAt, hexAt, type Cell, type MapGrid } from './grid';
import { cellDistanceFt, hexDistanceFt, type DiagonalRule, type HexCell } from './movement';

/** An attack on the sheet that states a reach, ready to lay on the map. */
export interface SheetAttack {
  name: string;
  reachFt: number;
  label: string;
  /** `atk:10` — the URL form, so an attack is a link like every other control on this surface. */
  param: string;
}

/**
 * The default reach of a melee attack that names no distance.
 *
 * A RULE, not a guess: 5 feet is the melee reach in both 5e and PF2, and a weapon whose range field
 * simply says "Melee" is stating that default rather than declining to say. Inventing a number for a
 * system that does not have one would be the rule-invention this directory keeps refusing, so
 * `reachFor` takes the system and answers null where there is no such default.
 */
const MELEE_DEFAULT_FT: Record<string, number> = {
  '5e': 5, '5e-2014': 5, '5e-2024': 5, pathfinder2e: 5,
};

/**
 * Feet of reach stated by a range string, or null.
 *
 * The cases, and why each is what it is:
 *
 *  · `"5 ft"`, `"10 feet"`, `"Reach 10 ft."` → the number. The common case.
 *  · `"150/600 ft"` → **150**. That is normal range; the second number is long range, which in 5e
 *    imposes disadvantage rather than describing where the weapon reaches. Drawing 600 would tell a
 *    player they can shoot cleanly across the map.
 *  · `"Melee"`, `"Touch"` with no number → the system's melee default, or null for a system without one.
 *  · Anything else → null, and the attack is simply not offered. A shape drawn from a range nobody can
 *    parse is worse than no shape.
 */
export function parseReachFt(range: string | null | undefined, system: string | null | undefined): number | null {
  const text = String(range ?? '').trim().toLowerCase();
  if (!text) return null;

  // A slashed pair is normal/long. Take the first — see the header.
  const slashed = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (slashed) return positive(Number(slashed[1]));

  const number = text.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)?/);
  if (number && /\d/.test(text)) return positive(Number(number[1]));

  if (/\b(melee|touch|adjacent)\b/.test(text)) return MELEE_DEFAULT_FT[String(system ?? '')] ?? null;
  return null;
}

const positive = (n: number): number | null => (Number.isFinite(n) && n > 0 ? n : null);

/** Every distinct reach this character's attacks state, smallest first. */
export function attacksFrom(
  attacks: ReadonlyArray<{ name?: string; range?: string }> | undefined,
  system: string | null | undefined,
): SheetAttack[] {
  // Deduplicated by REACH, not by weapon: three attacks at 5 ft need one 5 ft template, because the map
  // cares about the shape and not which weapon asked for it. Same rule the spell templates follow.
  const seen = new Map<number, SheetAttack>();
  for (const a of attacks ?? []) {
    const reachFt = parseReachFt(a.range, system);
    if (reachFt === null || seen.has(reachFt)) continue;
    seen.set(reachFt, {
      name: a.name ?? 'Attack',
      reachFt,
      label: `${a.name ?? 'Attack'} — ${reachFt} ft reach`,
      param: `atk:${reachFt}`,
    });
  }
  return [...seen.values()].sort((a, b) => a.reachFt - b.reachFt);
}

/**
 * The cells within reach of a token standing at (x, y).
 *
 * Bounded by a cell budget for the same reason the movement search is: a 600 ft reach on a 1 ft grid is
 * a mistake or a joke, and either way the overlay should stop rather than the browser.
 */
export function reachCells(
  x: number,
  y: number,
  reachFt: number,
  grid: MapGrid,
  diagonals: DiagonalRule,
): { squares: Cell[]; hexes: HexCell[] } {
  if (!(reachFt > 0)) return { squares: [], hexes: [] };
  // How many cells out to even consider. The +1 is not slack: alternating diagonals cost more than a
  // straight step, so the furthest cell in feet is nearer in CELLS than the naive ratio suggests, and
  // rounding down would clip the last ring on a free-diagonal grid.
  const span = Math.min(40, Math.ceil(reachFt / Math.max(grid.unitFt, 0.001)) + 1);

  if (grid.kind === 'hex') {
    const origin = hexAt(x, y, grid);
    const hexes: HexCell[] = [];
    for (let dq = -span; dq <= span; dq += 1) {
      for (let dr = -span; dr <= span; dr += 1) {
        const cell = { q: origin.q + dq, r: origin.r + dr };
        if (cell.q === origin.q && cell.r === origin.r) continue;
        if (hexDistanceFt(origin, cell, grid) <= reachFt + 1e-9) hexes.push(cell);
      }
    }
    return { squares: [], hexes };
  }

  const origin = squareAt(x, y, grid);
  const squares: Cell[] = [];
  for (let dc = -span; dc <= span; dc += 1) {
    for (let dr = -span; dr <= span; dr += 1) {
      // The token's OWN square is excluded: you do not attack yourself, and leaving it in makes the
      // outline of the piece disappear under the wash.
      if (dc === 0 && dr === 0) continue;
      const cell = { col: origin.col + dc, row: origin.row + dr };
      if (cellDistanceFt(origin, cell, grid, diagonals) <= reachFt + 1e-9) squares.push(cell);
    }
  }
  return { squares, hexes: [] };
}
