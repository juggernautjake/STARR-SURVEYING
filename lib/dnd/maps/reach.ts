// lib/dnd/maps/reach.ts — "how far can THIS token go", resolved from the sheet. M5-2.
//
// The pure geometry is `movement.ts`. This is the half that has to ask the character how fast it is, and
// it exists as its own module for the reason `subjects.ts` gives for existing: **a number copied onto the
// token is a number that goes stale.** Speed is read at render time, every time, so a character who gains
// a Longstrider or takes a level of exhaustion has a different overlay on the next paint — with nothing
// to re-save and nothing that can disagree.
//
// ── THE EXHAUSTION RULE IS NOT REIMPLEMENTED HERE, DELIBERATELY ────────────────────────────────────
//
// `buildLedger(char).value('speed_walk', base)` already folds every effect that touches speed: the
// −5ft-per-exhaustion-level rule this repo shipped earlier, conditions, spells, DM overrides. Computing
// speed any other way in this file would be a second implementation that drifts — and the first symptom
// would be a map that lets an exhausted character move further than their own sheet says.
//
// ── WHAT IT STILL DOES NOT KNOW ────────────────────────────────────────────────────────────────────
//
// Difficult terrain and blockers. `dnd_map_objects` can carry them; nothing writes one. `terrainApplied`
// comes back `false` and the UI says so out loud — see `movement.ts` on why the reader takes terrain as a
// parameter instead of inventing a lookup.

import { supabaseAdmin } from '@/lib/supabase';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import type { Character } from '@/app/dnd/_sheet/types';
import { readGrid, squareAt, hexAt, type MapGrid } from './grid';
import type { TokenSubject } from './tokens';
import {
  diagonalRuleFor, reachableHexes, reachableSquares,
  type DiagonalRule, type HexCell, type Reachable,
} from './movement';
import type { Cell } from './grid';

export interface ReachView {
  /** Walking speed in feet AFTER every effect the ledger folds in. */
  speedFt: number;
  /** The unmodified sheet value, so the UI can show "25 ft (base 30)" when something is reducing it. */
  baseFt: number;
  diagonals: DiagonalRule;
  squares: Array<Reachable<Cell>>;
  hexes: Array<Reachable<HexCell>>;
  /** The cell the token is standing in — excluded from the reachable set, needed for the outline. */
  origin: Cell | HexCell | null;
  truncated: boolean;
  /** Always false today. See the header — it is a promise the UI must not make on the map's behalf. */
  terrainApplied: boolean;
  /** Null when the node has no grid, which is every space map and every continent. */
  grid: MapGrid | null;
}

const EMPTY: ReachView = {
  speedFt: 0, baseFt: 0, diagonals: 'free', squares: [], hexes: [],
  origin: null, truncated: false, terrainApplied: false, grid: null,
};

/**
 * Resolve the reach of one token.
 *
 * ONE token, not all of them: this loads a character row and runs the effect ledger, which is far too
 * much work to do for every figure on a crowded board when only the selected one is being drawn.
 */
export async function loadReach(args: {
  subject: TokenSubject | null;
  /** The token's position in world units. */
  x: number; y: number;
  rawGrid: unknown;
  system?: string | null;
}): Promise<ReachView> {
  const grid = readGrid(args.rawGrid);
  // No grid is a normal state, not a failure — you cannot count squares on a continent.
  if (!grid || !args.subject) return EMPTY;

  // Characters only, for now. A bestiary creature has a speed too, but it lives in a different shape and
  // does not go through the effect ledger — guessing at it would be the copied-number defect again, so a
  // creature token simply gets no overlay rather than a plausible wrong one.
  if (!('characterId' in args.subject)) return { ...EMPTY, grid };

  const { data } = await supabaseAdmin
    .from('dnd_characters')
    .select('id, system, data')
    .eq('id', args.subject.characterId)
    .maybeSingle();

  const row = data as { system?: string | null; data?: unknown } | null;
  if (!row?.data) return { ...EMPTY, grid };

  const char = row.data as Character;
  const baseFt = Number((char.combat as { speed?: number } | undefined)?.speed ?? 30);
  // The ledger, not arithmetic here. See the header.
  const speedFt = Number(buildLedger(char).value('speed_walk', baseFt));

  const system = args.system ?? row.system ?? null;
  const diagonals = diagonalRuleFor(system);

  if (grid.kind === 'hex') {
    const origin = hexAt(args.x, args.y, grid);
    const r = reachableHexes(origin, { budgetFt: speedFt, grid });
    return { speedFt, baseFt, diagonals, squares: [], hexes: r.cells, origin, truncated: r.truncated, terrainApplied: r.terrainApplied, grid };
  }

  const origin = squareAt(args.x, args.y, grid);
  const r = reachableSquares(origin, { budgetFt: speedFt, grid, diagonals });
  return { speedFt, baseFt, diagonals, squares: r.cells, hexes: [], origin, truncated: r.truncated, terrainApplied: r.terrainApplied, grid };
}

/** How the overlay describes itself. Kept here so the wording and the caveat travel with the data. */
export function reachSummary(view: ReachView): string {
  if (!view.grid) return 'This map has no grid, so there is nothing to count.';
  if (view.speedFt <= 0) return 'This character has no walking speed.';
  const rule = view.diagonals === 'alternating'
    ? 'diagonals alternate 5/10 ft'
    : view.diagonals === 'orthogonal' ? 'no diagonal movement' : 'diagonals cost one square';
  const modified = view.speedFt !== view.baseFt ? ` (base ${view.baseFt} ft)` : '';
  return `${view.speedFt} ft${modified} · ${rule}`;
}
