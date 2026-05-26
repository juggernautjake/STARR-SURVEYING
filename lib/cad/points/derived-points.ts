// lib/cad/points/derived-points.ts
//
// §17b / §8c-deriv — materialize "created points" that live only as
// vertex `pointRefs` on linework (minted vertex names like 257/258 and
// cross-layer `:N` derivatives like 255:1) into exportable point
// records, so EVERY created point lands in CSV/PNEZD output — not just
// standalone POINT features. Points that already exist as POINT features
// are skipped (they export directly); names are de-duplicated.
//
// Pure + framework-free; unit-tested.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md §17b

import type { DrawingDocument } from '../types';
import { pointNumberOf } from '../feature-fields';
import { featureCoords } from './point-registry';
import { parsePointRefs, POINT_REFS_KEY } from './point-registry';

export interface DerivedPoint {
  name: string;
  northing: number;
  easting: number;
  layerId: string;
}

export function collectDerivedPoints(doc: DrawingDocument): DerivedPoint[] {
  const dp = doc.settings.displayPreferences;
  const oN = dp?.originNorthing ?? 0;
  const oE = dp?.originEasting ?? 0;

  // Names already present as standalone POINT features — those export
  // directly, so don't duplicate them here.
  const pointNames = new Set<string>();
  for (const f of Object.values(doc.features)) {
    if (f.type === 'POINT') {
      const n = pointNumberOf(f);
      if (n) pointNames.add(n);
    }
  }

  const seen = new Set<string>();
  const out: DerivedPoint[] = [];
  for (const f of Object.values(doc.features)) {
    if (f.hidden) continue;
    const refs = parsePointRefs((f.properties as Record<string, unknown> | undefined)?.[POINT_REFS_KEY]);
    if (refs.length === 0) continue;
    const coords = featureCoords(f);
    for (let i = 0; i < refs.length && i < coords.length; i++) {
      const name = refs[i];
      if (!name || pointNames.has(name) || seen.has(name)) continue;
      seen.add(name);
      out.push({
        name,
        northing: coords[i].y + oN,
        easting: coords[i].x + oE,
        layerId: f.layerId,
      });
    }
  }
  return out;
}
