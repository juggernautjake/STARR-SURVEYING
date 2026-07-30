// lib/dnd/bestiary/ig-curation.ts — choose WHICH creatures Intuitive Games gets (B4-2).
//
// Plan: *"IG's 200 come from transposing a curated spread across CR bands and types."*
//
// ── WHY A CURATION FUNCTION AND NOT "TRANSPOSE EVERYTHING" ───────────────────────────────────────────
//
// Running all 334 SRD creatures through the transposer is one line and produces a worse bestiary. The SRD
// is not evenly distributed — 87 of its 334 are beasts, and 43 sit at CR 2 — so a straight copy gives IG a
// catalogue that is a quarter woodland animals and nearly empty above CR 10. A DM opening the IG bestiary
// to find a boss for a level-15 party would find frogs.
//
// So this takes a STRATIFIED spread: walk the (type × CR band) grid and take from each cell in turn, so the
// selection fills out breadth before it fills out depth. The result covers every type the source has and
// every band it reaches, and only then starts adding second and third picks.
//
// ── DETERMINISTIC, BECAUSE THE IMPORT RE-RUNS ────────────────────────────────────────────────────────
//
// `npm run import:bestiary` is safe to re-run because the slug is stable. That property has to hold here
// too, and it cannot if the selection is random or depends on the row order Postgres happened to return —
// a second run would pick a different 200, orphan the first 200, and double the catalogue. Ordering is by
// (cr_sort, name), both of which are properties of the creature rather than of the query.
//
// PURE. No DB, no AI — the caller supplies rows and gets back a subset, which is what makes the spread
// assertable in a test rather than eyeballed in a report.
import { normalizeCreatureType } from './taxonomy';

export interface CurationRow {
  slug: string;
  name: string;
  type: string | null;
  cr: string | null;
  crSort: number | null;
}

/**
 * The bands a DM actually thinks in, which are tiers of play rather than equal slices of the CR line.
 *
 * They are deliberately uneven: the distance from CR 0 to CR 1 is a whole tier of adventuring, and the
 * distance from CR 21 to CR 30 is one boss fight. Splitting the range into equal numeric chunks would put
 * two thirds of the game in one bucket.
 *
 * CONTIGUOUS AND HALF-OPEN (`min <= cr < max`), which the first draft got wrong. Written as inclusive
 * endpoints — 1/8…1/2, then 1…4 — the bands read correctly for the CRs 5e actually prints but leave gaps
 * between them, and a creature at CR 0.625 (a PF2 level, a homebrew rating) fell into no band and was
 * dropped from the grid without a word. A band list used to decide what gets catalogued has to cover the
 * number line, not just the values someone expected.
 */
export const CR_BANDS = [
  { key: 'trivial', label: 'CR 0', min: -Infinity, max: 0.125 },
  { key: 'low', label: 'CR 1/8–1/2', min: 0.125, max: 1 },
  { key: 'early', label: 'CR 1–4', min: 1, max: 5 },
  { key: 'mid', label: 'CR 5–10', min: 5, max: 11 },
  { key: 'high', label: 'CR 11–16', min: 11, max: 17 },
  { key: 'apex', label: 'CR 17+', min: 17, max: Infinity },
] as const;

export type CrBandKey = (typeof CR_BANDS)[number]['key'];

/** Which band a CR falls in, or null when the row has no CR at all (nothing to place it by). */
export function crBand(crSort: number | null): CrBandKey | null {
  if (crSort === null || !Number.isFinite(crSort)) return null;
  // `trivial` catches everything at or below 0 — including PF2's real level −1 — because a creature weaker
  // than the weakest 5e rating is still the easiest thing a DM can field, not an unplaceable outlier.
  const hit = CR_BANDS.find((b) => crSort >= b.min && crSort < b.max);
  return hit ? hit.key : CR_BANDS[CR_BANDS.length - 1].key;
}

export interface CurationCell {
  type: string;
  band: CrBandKey;
  rows: CurationRow[];
}

/** The (type × band) grid, each cell sorted deterministically. Exported so the script can report coverage. */
export function gridFor(rows: CurationRow[]): CurationCell[] {
  const cells = new Map<string, CurationCell>();
  for (const r of rows) {
    const type = normalizeCreatureType(r.type ?? '');
    const band = crBand(r.crSort);
    if (!type || !band) continue; // Unplaceable rows are skipped rather than dumped in a default bucket.
    const key = `${type}|${band}`;
    const cell = cells.get(key) ?? { type, band, rows: [] };
    cell.rows.push(r);
    cells.set(key, cell);
  }
  for (const cell of cells.values()) {
    cell.rows.sort((a, b) => (a.crSort ?? 0) - (b.crSort ?? 0) || a.name.localeCompare(b.name));
  }
  // Cell ORDER matters as much as row order: the round-robin below takes one from each cell per pass, so a
  // stable cell order is what makes the whole selection reproducible.
  return [...cells.values()].sort(
    (a, b) => a.type.localeCompare(b.type)
      || CR_BANDS.findIndex((x) => x.key === a.band) - CR_BANDS.findIndex((x) => x.key === b.band),
  );
}

export interface CurationResult {
  picked: CurationRow[];
  /** (type × band) cells the source has nothing for — the honest version of "every type, every band". */
  emptyCells: { type: string; band: CrBandKey }[];
  /** Cells the source covers, so a report can say 41/84 rather than an unanchored number. */
  filledCells: number;
}

/**
 * Take `limit` creatures spread as evenly as the source allows.
 *
 * BREADTH FIRST, by round-robin over the grid. Pass 1 takes the lowest-CR creature from every occupied
 * cell, pass 2 takes the second, and so on — so if the budget runs out early it runs out having covered
 * every type and band once, which is the property the plan actually asked for. Taking cells in order and
 * exhausting each would instead spend the whole budget on aberrations.
 */
export function curateForIg(rows: CurationRow[], limit: number): CurationResult {
  const grid = gridFor(rows);
  const picked: CurationRow[] = [];
  const seen = new Set<string>();

  const types = [...new Set(grid.map((c) => c.type))];
  const emptyCells: { type: string; band: CrBandKey }[] = [];
  for (const type of types) {
    for (const b of CR_BANDS) {
      if (!grid.some((c) => c.type === type && c.band === b.key)) emptyCells.push({ type, band: b.key });
    }
  }

  const depth = Math.max(0, ...grid.map((c) => c.rows.length));
  for (let pass = 0; pass < depth && picked.length < limit; pass += 1) {
    for (const cell of grid) {
      if (picked.length >= limit) break;
      const row = cell.rows[pass];
      // A slug can only be picked once even though `seen` looks redundant against pass-indexing: two rows
      // in different editions of the same SRD share a name, and shipping "Goblin" twice would read as a bug.
      if (!row || seen.has(row.slug)) continue;
      seen.add(row.slug);
      picked.push(row);
    }
  }

  return { picked, emptyCells, filledCells: grid.length };
}
