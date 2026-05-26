// lib/cad/points/point-rename.ts
//
// Graceful point-name changes (plan §10.3). Renaming a point can break
// references — linework `pointRefs`, cross-layer `:N` derivatives, and
// downstream exports key on the name. These pure helpers compute the
// blast radius and produce update plans for the two strategies:
//   • rename-in-place (updates the point + every reference, one batch)
//   • duplicate (new point with the new name, original untouched)
//
// Spec: docs/planning/in-progress/cad-standalone-and-ux-audit.md §10.3

import type { DrawingDocument, Feature } from '../types';
import { generateId } from '../types';
import { pointNumberOf } from '../feature-fields';
import { POINT_REFS_KEY, parsePointRefs, encodePointRefs } from './point-registry';

export type RenameStrategy = 'ASK' | 'RENAME' | 'DUPLICATE';

export interface NameReferences {
  /** POINT features carrying exactly this name. */
  pointFeatureIds: string[];
  /** Linework features whose pointRefs include the name (or a `:N`
   *  derivative), with the matching refs for context. */
  linework: { featureId: string; layerId: string; refs: string[] }[];
  /** Derivative names (`name:1`, `name:2`, …) present anywhere. */
  derivatives: string[];
}

function isDerivativeOf(ref: string, base: string): boolean {
  return ref.startsWith(`${base}:`) && /^\d+$/.test(ref.slice(base.length + 1));
}

/** Find everything that references `name` so the UI can warn the user. */
export function findNameReferences(doc: DrawingDocument, name: string): NameReferences {
  const pointFeatureIds: string[] = [];
  const linework: NameReferences['linework'] = [];
  const derivatives = new Set<string>();

  for (const f of Object.values(doc.features)) {
    if (f.type === 'POINT' && pointNumberOf(f) === name) pointFeatureIds.push(f.id);
    const refs = parsePointRefs((f.properties as Record<string, unknown> | undefined)?.[POINT_REFS_KEY]);
    if (refs.length === 0) continue;
    const matched = refs.filter((r) => r === name || isDerivativeOf(r, name));
    if (matched.length > 0) {
      linework.push({ featureId: f.id, layerId: f.layerId, refs: matched });
      for (const r of matched) if (r !== name) derivatives.add(r);
    }
  }

  return { pointFeatureIds, linework, derivatives: [...derivatives].sort() };
}

export interface FeatureUpdate {
  featureId: string;
  properties: Record<string, string | number | boolean>;
}

/**
 * Plan a rename-in-place: returns the property updates for the point
 * feature(s) and every referencing linework feature. `:N` derivatives
 * are rebased (`old:N` → `new:N`) so the cross-layer relationship holds.
 * Apply all updates in a single undo batch.
 */
export function planRename(
  doc: DrawingDocument,
  oldName: string,
  newName: string,
): FeatureUpdate[] {
  const updates: FeatureUpdate[] = [];
  for (const f of Object.values(doc.features)) {
    const props = { ...(f.properties ?? {}) } as Record<string, string | number | boolean>;
    let changed = false;

    if (f.type === 'POINT' && pointNumberOf(f) === oldName) {
      props.pointName = newName;
      changed = true;
    }

    const refs = parsePointRefs((f.properties as Record<string, unknown> | undefined)?.[POINT_REFS_KEY]);
    if (refs.length > 0) {
      const next = refs.map((r) => {
        if (r === oldName) return newName;
        if (isDerivativeOf(r, oldName)) return `${newName}:${r.slice(oldName.length + 1)}`;
        return r;
      });
      if (next.some((r, i) => r !== refs[i])) {
        props[POINT_REFS_KEY] = encodePointRefs(next);
        changed = true;
      }
    }

    if (changed) updates.push({ featureId: f.id, properties: props });
  }
  return updates;
}

/**
 * Plan a duplicate: clone the source POINT feature with a new id and the
 * new name, leaving the original (and all references to it) intact.
 * Returns the new feature for the caller to add, or null if the source
 * isn't a POINT.
 */
export function planDuplicate(
  doc: DrawingDocument,
  sourcePointId: string,
  newName: string,
): Feature | null {
  const src = doc.features[sourcePointId];
  if (!src || src.type !== 'POINT') return null;
  return {
    ...src,
    id: generateId(),
    geometry: { ...src.geometry, point: src.geometry.point ? { ...src.geometry.point } : undefined },
    properties: { ...(src.properties ?? {}), pointName: newName },
  };
}

/** True when `newName` is already taken by another POINT (rename target
 *  collisions should be blocked/warned). */
export function nameIsTaken(doc: DrawingDocument, newName: string, exceptId?: string): boolean {
  for (const f of Object.values(doc.features)) {
    if (f.id === exceptId) continue;
    if (f.type === 'POINT' && pointNumberOf(f) === newName) return true;
  }
  return false;
}
