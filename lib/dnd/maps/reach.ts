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
// ── TERRAIN, WHICH IT NOW DOES KNOW ────────────────────────────────────────────────────────────────
//
// This header used to say difficult terrain and blockers were unauthored and the overlay said so out
// loud. `lib/dnd/maps/terrain.ts` is the writer's half, and **nothing in the search changed to accept
// it** — terrain was always a parameter (`cost: (cell) => number | null`) rather than a lookup this
// module invents, which is exactly why the day it arrived cost one argument.
//
// It stays optional, and `terrainApplied` still comes back `false` on a map that authors none, because
// "counted terrain and found none" and "did not look" are different claims and the readout makes one of
// them.

import { supabaseAdmin } from '@/lib/supabase';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import type { Character } from '@/app/dnd/_sheet/types';
import { readGrid, squareAt, hexAt, type MapGrid } from './grid';
import type { TokenSubject } from './tokens';
import {
  MAP_BOUNDS, diagonalRuleFor, reachableHexes, reachableSquares,
  type DiagonalRule, type HexCell, type Reachable,
} from './movement';
import { describeArea, parseAreas, type TemplateShape } from './templates';
import type { Cell } from './grid';
// M5-2's other half — difficult ground and blockers, read off the node's own objects.
import { hexTerrainCost, terrainCost, type TerrainPatch } from './terrain';
// M5-3's other half — the reach of this character's own weapons, parsed from the sheet.
import { attacksFrom, type SheetAttack } from './attacks';

/** A spell on this character's sheet that states an area, ready to lay on the map (M5-3). */
export interface SheetTemplate {
  spell: string;
  shape: TemplateShape;
  sizeFt: number;
  label: string;
  /** `cone:15` — the URL form, so a template is a link like every other control on this surface. */
  param: string;
}

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
  /** Whether terrain was CONSULTED — false on a map that authors none. "Counted and found nothing" and
   *  "did not look" are different claims, and the readout makes exactly one of them. */
  terrainApplied: boolean;
  /** Null when the node has no grid, which is every space map and every continent. */
  grid: MapGrid | null;
  /**
   * M5-3 — the areas this character's OWN spells state, parsed from the sheet's text.
   *
   * Read, never restated. The whole point of the slice is that *"the map and the sheet cannot disagree
   * about a spell's size"*, and a second structured copy of the number is a copy that goes stale.
   */
  templates: SheetTemplate[];
  /**
   * M5-3 — the reaches this character's OWN attacks state, parsed from the sheet's `range` field.
   *
   * Read, never restated, exactly like the spell areas beside them: a glaive that becomes a whip on the
   * sheet becomes a whip on the map, with nothing to re-save and nothing that can disagree.
   */
  attacks: SheetAttack[];
  /** The character's own ruleset — it decides the cone angle, not the map's. */
  system: string | null;
}

const EMPTY: ReachView = {
  speedFt: 0, baseFt: 0, diagonals: 'free', squares: [], hexes: [],
  origin: null, truncated: false, terrainApplied: false, grid: null, templates: [], attacks: [], system: null,
};

/**
 * The areas stated by the spells on this sheet (M5-3).
 *
 * Deduplicated by shape + size, because a caster with four 15ft cones needs ONE 15ft-cone template, not
 * four identical buttons — the map cares about the shape, not which spell asked for it. The first spell
 * to state it keeps the naming, so the control still says something a player recognises.
 */
function templatesFrom(char: Character): SheetTemplate[] {
  const spells = (char.spells ?? []) as Array<{ name?: string; range?: string }>;
  const seen = new Map<string, SheetTemplate>();
  for (const sp of spells) {
    for (const area of parseAreas(sp.range)) {
      const key = `${area.shape}:${area.sizeFt}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        spell: sp.name ?? 'Spell',
        shape: area.shape as TemplateShape,
        sizeFt: area.sizeFt,
        label: `${sp.name ?? 'Spell'} — ${describeArea(area)}`,
        param: key,
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.sizeFt - b.sizeFt);
}

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
  /**
   * M5-2's other half, arriving. The node's own `area` objects that carry `data.terrain` — passed in
   * rather than queried here, because the page has already fetched this node's objects through the G3
   * split and a second query would be both wasted work and a second chance to get the filter wrong.
   *
   * Absent means what it has always meant: open ground, and `terrainApplied` stays false so the UI keeps
   * saying so out loud.
   */
  terrain?: readonly TerrainPatch[];
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

  const templates = templatesFrom(char);
  const attacks = attacksFrom(char.attacks as Array<{ name?: string; range?: string }> | undefined, system);

  const patches = args.terrain ?? [];

  if (grid.kind === 'hex') {
    const origin = hexAt(args.x, args.y, grid);
    const r = reachableHexes(origin, { budgetFt: speedFt, grid, cost: hexTerrainCost(patches, grid), bounds: MAP_BOUNDS });
    return { speedFt, baseFt, diagonals, squares: [], hexes: r.cells, origin, truncated: r.truncated, terrainApplied: r.terrainApplied, grid, templates, attacks, system };
  }

  const origin = squareAt(args.x, args.y, grid);
  const r = reachableSquares(origin, { budgetFt: speedFt, grid, diagonals, cost: terrainCost(patches, grid), bounds: MAP_BOUNDS });
  return { speedFt, baseFt, diagonals, squares: r.cells, hexes: [], origin, truncated: r.truncated, terrainApplied: r.terrainApplied, grid, templates, attacks, system };
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
