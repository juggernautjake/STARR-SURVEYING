// lib/cad/import/dedupe-points.ts
//
// cad-duplicate-point-handling Slice 1 — pure deduper for
// collisions where two `SurveyPoint`s share a `pointNumber`.
// Matches Traverse PC's own `:N` convention so a re-export
// lands in a format Traverse PC recognises.
//
// Rules (deterministic, source-order based):
//
//   1. Group every point by its `pointNumber`.
//   2. The FIRST occurrence keeps the bare `pointName`.
//   3. Later occurrences are renamed to `<baseName>:1`,
//      `<baseName>:2`, ..., using the next id not already in
//      use by ANY point in the input (so a source that
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

/** Auto-rename colliding `pointNumber`s using the `:N` convention.
 *  Source order is preserved; the first occurrence of each number
 *  keeps the bare name, later occurrences are suffixed. */
export function dedupePointNumbers(points: ReadonlyArray<SurveyPoint>): DedupeResult {
  // Collect every existing name so the deduper can skip IDs that
  // are already in use (e.g. a source already containing `23:1`).
  const usedNames = new Set<string>(points.map((p) => p.pointName));

  // First-seen `pointName` per `pointNumber` (the one that keeps
  // the bare name).
  const baseByNumber = new Map<number, { layerId: string; pointName: string }>();

  const renamed: SurveyPoint[] = [];
  const renames: PointRename[] = [];

  for (const pt of points) {
    const base = baseByNumber.get(pt.pointNumber);
    if (!base) {
      baseByNumber.set(pt.pointNumber, { layerId: pt.layerId, pointName: pt.pointName });
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
