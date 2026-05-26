// lib/cad/points/point-registry.ts
//
// Build a point registry from a drawing and assign names to the
// vertices of newly-created features per the §8 rules. Pure +
// framework-free; the live creation path (a later slice) applies the
// returned assignments inside the same undo batch as the geometry.
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md §8

import type { DrawingDocument, Feature, Point2D } from '../types';
import { pointNumberOf } from '../feature-fields';
import {
  resolveVertexName,
  type NamedCoord,
} from './point-naming';

/** Default coincidence tolerance in world feet. */
export const DEFAULT_COINCIDENCE_TOL = 0.01;

/** Property key under which a feature stores its per-vertex point names.
 *  `Feature.properties` only holds primitives, so the array is JSON-
 *  encoded as a string. */
export const POINT_REFS_KEY = 'pointRefs';

export function encodePointRefs(refs: string[]): string {
  return JSON.stringify(refs);
}

/** Parse a feature's stored pointRefs (JSON string, or a raw array for
 *  defensiveness), returning [] when absent/invalid. */
export function parsePointRefs(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((r): r is string => typeof r === 'string');
  if (typeof value === 'string' && value.trim() !== '') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((r): r is string => typeof r === 'string');
    } catch {
      /* not JSON — ignore */
    }
  }
  return [];
}

/** World coordinates that participate in point identity for a feature. */
export function featureCoords(f: Feature): Point2D[] {
  const g = f.geometry;
  switch (f.type) {
    case 'POINT':
      return g.point ? [g.point] : [];
    case 'LINE':
      return g.start && g.end ? [g.start, g.end] : [];
    case 'POLYLINE':
    case 'POLYGON':
      return g.vertices ? [...g.vertices] : [];
    default:
      return []; // curves/text/image: not named here (see §8.6)
  }
}

/** All point names already present in the document (POINT numbers + any
 *  vertex pointRefs stamped on linework). */
export function collectExistingNames(doc: DrawingDocument): Set<string> {
  const names = new Set<string>();
  for (const f of Object.values(doc.features)) {
    if (f.type === 'POINT') {
      const n = pointNumberOf(f);
      if (n) names.add(n);
    }
    const refs = parsePointRefs((f.properties as Record<string, unknown> | undefined)?.[POINT_REFS_KEY]);
    for (const r of refs) if (r) names.add(r);
  }
  return names;
}

/** Registry of named coordinates from POINT features (+ vertex refs when
 *  their coordinates are recoverable). `excludeIds` omits features that
 *  are themselves being (re)named. */
export function buildPointRegistry(
  doc: DrawingDocument,
  excludeIds?: Set<string>,
): NamedCoord[] {
  const out: NamedCoord[] = [];
  for (const f of Object.values(doc.features)) {
    if (excludeIds?.has(f.id)) continue;
    if (f.type === 'POINT') {
      const name = pointNumberOf(f);
      const pt = f.geometry.point;
      if (name && pt) out.push({ name, x: pt.x, y: pt.y, layerId: f.layerId });
    }
  }
  return out;
}

export type FeatureNameAssignment =
  | { featureId: string; kind: 'POINT'; name: string }
  | { featureId: string; kind: 'VERTICES'; refs: string[] };

/**
 * Assign names to the vertices of the given new features, per §8:
 *   reuse same-layer existing point · derive `base:N` cross-layer · mint.
 * Minted/derived names are added to the working registry so later
 * vertices (and later features in the batch) see them — including a
 * polyline that revisits the same coordinate.
 */
export function assignNamesForNewFeatures(
  doc: DrawingDocument,
  newFeatureIds: string[],
  tol: number = DEFAULT_COINCIDENCE_TOL,
): FeatureNameAssignment[] {
  const exclude = new Set(newFeatureIds);
  const registry = buildPointRegistry(doc, exclude);
  const allNames = collectExistingNames(doc);

  const assignments: FeatureNameAssignment[] = [];

  for (const id of newFeatureIds) {
    const f = doc.features[id];
    if (!f) continue;
    const coords = featureCoords(f);
    if (coords.length === 0) continue;

    const refs: string[] = [];
    for (const c of coords) {
      const { name, action } = resolveVertexName(c, f.layerId, registry, allNames, tol);
      refs.push(name);
      if (action !== 'reuse') {
        registry.push({ name, x: c.x, y: c.y, layerId: f.layerId });
        allNames.add(name);
      }
    }

    if (f.type === 'POINT') {
      assignments.push({ featureId: id, kind: 'POINT', name: refs[0] });
    } else {
      assignments.push({ featureId: id, kind: 'VERTICES', refs });
    }
  }

  return assignments;
}
