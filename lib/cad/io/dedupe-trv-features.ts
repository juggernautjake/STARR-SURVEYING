// lib/cad/io/dedupe-trv-features.ts
//
// cad-duplicate-point-handling Slice 4 — TRV import auto-rename
// when merging a freshly-mapped TRV into an EXISTING drawing.
//
// Scenario: the user imports a TRV that contains point id `23`
// into a drawing that already has a point `23` (typically from
// a previous TRV import). The TRV's own `:N` convention can't
// resolve this because each TRV file disambiguates only within
// itself — cross-file collisions need our help.
//
// This module walks the new POINT features about to be added,
// checks each `trvPointId` against the existing drawing's
// trvPointId set, and renames colliders using the next free
// `:N` suffix. The feature's `id` (uuid prefix) is also rewritten
// so it stays in sync with the new trvPointId.
//
// Pure module: no DOM, no React, no store deps. Tested against
// synthetic before/after sets.

import type { Feature } from '../types';
import type { PointRename } from '../import/dedupe-points';

const POINT_KEY_PREFIX = 'trv-point:';
const pointKey = (trvId: string) => `${POINT_KEY_PREFIX}${trvId}`;

/** Walk every POINT feature in `newFeatures`. For each one whose
 *  `trvPointId` already exists in `existingFeatures`, pick the
 *  next free `:N` suffix and rewrite both `trvPointId` and the
 *  feature `id`. Other feature types pass through untouched.
 *
 *  Returns the (possibly-rewritten) feature list + a rename log
 *  matching the `PointRename` shape Slice 1 introduced so a UI
 *  call site can show the renames the same way it shows CSV
 *  pipeline renames. */
export function dedupeTrvFeaturesAgainstDrawing(
  newFeatures: ReadonlyArray<Feature>,
  existingFeatures: ReadonlyArray<Feature>,
): { features: Feature[]; renames: PointRename[] } {
  // Pre-collect every trvPointId already in use, both from the
  // existing drawing AND from earlier passes of THIS import (so
  // intra-import duplicates also resolve cleanly).
  const usedIds = new Set<string>();
  for (const f of existingFeatures) {
    const tid = f.properties.trvPointId;
    if (typeof tid === 'string') usedIds.add(tid);
  }

  // Layer lookup so we can tag SAME_LAYER vs CROSS_LAYER renames.
  const existingLayerByTrvId = new Map<string, string>();
  for (const f of existingFeatures) {
    const tid = f.properties.trvPointId;
    if (typeof tid === 'string') existingLayerByTrvId.set(tid, f.layerId);
  }

  const out: Feature[] = [];
  const renames: PointRename[] = [];

  for (const f of newFeatures) {
    // cad-trv-dual-layer-filename Slice 2 — render-only point mirrors
    // (the Drawing-layer copies) share their canonical point's
    // trvPointId. Leave them untouched + out of the used-id set so
    // they don't trigger a spurious `:N` rename against their twin.
    if (f.type !== 'POINT' || f.properties.trvPointMirror) {
      out.push(f);
      continue;
    }
    const trvId = f.properties.trvPointId;
    if (typeof trvId !== 'string' || !usedIds.has(trvId)) {
      if (typeof trvId === 'string') usedIds.add(trvId);
      out.push(f);
      continue;
    }

    // Collision: find the next free `:N`.
    let suffix = 1;
    let candidate = `${trvId}:${suffix}`;
    while (usedIds.has(candidate)) {
      suffix++;
      candidate = `${trvId}:${suffix}`;
    }
    usedIds.add(candidate);

    const baseLayerId = existingLayerByTrvId.get(trvId) ?? '';
    const kind: PointRename['kind'] = f.layerId === baseLayerId ? 'SAME_LAYER' : 'CROSS_LAYER';

    const renamed: Feature = {
      ...f,
      id: pointKey(candidate),
      properties: { ...f.properties, trvPointId: candidate, originalTrvPointId: trvId },
    };
    out.push(renamed);
    renames.push({
      surveyPointId: f.id,
      fromName: trvId,
      toName: candidate,
      baseLayerId,
      thisLayerId: f.layerId,
      kind,
    });
  }
  return { features: out, renames };
}
