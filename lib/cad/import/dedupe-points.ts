// lib/cad/import/dedupe-points.ts
//
// cad-duplicate-point-handling Slice 1 — pure deduper for
// collisions where two `SurveyPoint`s share a `pointName`.
// Matches Traverse PC's own `:N` convention so a re-export
// lands in a format Traverse PC recognises.
//
// Why key on `pointName` and not `pointNumber`: the parser
// derives `pointNumber` from any LEADING digits of the raw name
// (so "23calc", "23cald" and "23set" all collapse to 23) while
// keeping the full alphanumeric `pointName` as the real, displayed
// identifier. Grouping by `pointNumber` therefore treated those
// three DISTINCT codes as duplicates and silently renamed them to
// "23calc", "23calc:1", "23calc:2". A collision only matters when
// two points truly share the SAME displayed name, so we dedupe on
// `pointName` — distinct codes import with their true names.
//
// Rules (deterministic, source-order based):
//
//   1. Group every point by its `pointName`.
//   2. The FIRST occurrence keeps the bare `pointName`.
//   3. Later occurrences (same exact name) are renamed to
//      `<baseName>:1`, `<baseName>:2`, ..., using the next id not
//      already in use by ANY point in the input (so a source that
//      already has `23` + `23:1` keeps both + new collisions
//      step to `:2`, `:3`).
//   4. Cross-layer collisions (`23` on layer Topo + `23` on
//      layer Boundaries) and same-layer collisions both get
//      renamed — the LOG entry records which kind it was so
//      the import-confirm dialog can call them out separately.
//   5. `originalPointName` on the renamed point preserves the
//      pre-dedupe name so a downstream UI can show
//      "23 → 23:1 (cross-layer)".
//
// Pure module: no DOM, no React, no store access.

import type { SurveyPoint } from '../types';

export interface PointRename {
  /** UUID of the renamed SurveyPoint (the `.id` field). */
  surveyPointId: string;
  /** PRE-dedupe `pointName` (what came in from the parser). */
  fromName: string;
  /** POST-dedupe `pointName` (with `:N` suffix). */
  toName: string;
  /** Layer of the FIRST occurrence (the one that kept the bare
   *  name). */
  baseLayerId: string;
  /** Layer of THIS occurrence (the one being renamed). */
  thisLayerId: string;
  /** SAME_LAYER when both occurrences live on the same layer;
   *  CROSS_LAYER otherwise. */
  kind: 'SAME_LAYER' | 'CROSS_LAYER';
}

export interface DedupeResult {
  /** Points with `pointName` rewritten + `originalPointName`
   *  attached on renamed entries. Source ordering preserved. */
  renamed: SurveyPoint[];
  /** One entry per rename, in source order. Empty when no
   *  collisions were found. */
  renames: PointRename[];
}

/** A SurveyPoint augmented with the pre-dedupe name so a UI /
 *  export step can show the renames. The store accepts arbitrary
 *  extra fields on SurveyPoint via a structural cast — kept as a
 *  named interface here for clarity at the call site. */
export interface DedupedSurveyPoint extends SurveyPoint {
  originalPointName?: string;
}

/** Auto-rename colliding `pointName`s using the `:N` convention.
 *  Source order is preserved; the first occurrence of each name
 *  keeps the bare name, later occurrences (same exact name) are
 *  suffixed. Distinct names — even ones that share leading digits,
 *  e.g. "23calc" vs "23cald" — are never treated as collisions. */
export function dedupePointNumbers(points: ReadonlyArray<SurveyPoint>): DedupeResult {
  // Collect every existing name so the deduper can skip IDs that
  // are already in use (e.g. a source already containing `23:1`).
  const usedNames = new Set<string>(points.map((p) => p.pointName));

  // First-seen occurrence per `pointName` (the one that keeps the
  // bare name).
  const baseByName = new Map<string, { layerId: string; pointName: string }>();

  const renamed: SurveyPoint[] = [];
  const renames: PointRename[] = [];

  for (const pt of points) {
    const base = baseByName.get(pt.pointName);
    if (!base) {
      baseByName.set(pt.pointName, { layerId: pt.layerId, pointName: pt.pointName });
      renamed.push(pt);
      continue;
    }

    // Collision. Pick the next `:N` not already in use.
    const baseName = base.pointName;
    let suffix = 1;
    let candidate = `${baseName}:${suffix}`;
    while (usedNames.has(candidate)) {
      suffix++;
      candidate = `${baseName}:${suffix}`;
    }
    usedNames.add(candidate);

    const kind = pt.layerId === base.layerId ? 'SAME_LAYER' : 'CROSS_LAYER';
    const deduped: DedupedSurveyPoint = {
      ...pt,
      pointName: candidate,
      originalPointName: pt.pointName,
    };
    renamed.push(deduped);
    renames.push({
      surveyPointId: pt.id,
      fromName: pt.pointName,
      toName: candidate,
      baseLayerId: base.layerId,
      thisLayerId: pt.layerId,
      kind,
    });
  }

  return { renamed, renames };
}

/** Pretty-print the rename log for the import-confirm dialog +
 *  the Copy button. Two-line format per entry. */
export function formatRenames(renames: ReadonlyArray<PointRename>): string {
  if (renames.length === 0) return '';
  const lines: string[] = [];
  for (const r of renames) {
    const tag = r.kind === 'CROSS_LAYER'
      ? `cross-layer: ${r.baseLayerId} → ${r.thisLayerId}`
      : `same-layer (${r.thisLayerId})`;
    lines.push(`${r.fromName} → ${r.toName}  [${tag}]`);
  }
  return lines.join('\n');
}
