// lib/cad/points/disambiguate.ts
//
// cad-domain-audit Slice L — pure helper that picks a non-colliding
// point name for new POINT features. Mirrors the TRV import rule
// (cad-ux-cleanup-pass Slice 2): first occurrence keeps the bare
// name; subsequent collisions get `${bare}:K` where K is the
// smallest free suffix, skipping any `:N` the document already
// claims so the rename can never re-collide with an existing point.
//
// The TRV importer disambiguates a whole list at once; this helper
// disambiguates a SINGLE candidate against the current drawing — the
// shape the AI `addPoint` tool and the manual Draw Point tool need.

import type { DrawingDocument, Feature } from '../types';
import { pointNumberOf } from '../feature-fields';

/** Split `bare:N` into `{ bare, suffix }`; everything else becomes
 *  `{ bare: id, suffix: 0 }`. Mirrors `splitDuplicateSuffix` in the
 *  TRV importer. */
function splitDuplicateSuffix(id: string): { bare: string; suffix: number } {
  const m = id.match(/^(.+):(\d+)$/);
  if (!m) return { bare: id, suffix: 0 };
  return { bare: m[1], suffix: parseInt(m[2], 10) };
}

/** Set of every point name in the document. Includes the explicit
 *  `pointNumberOf` resolution so the multi-key fallback chain
 *  (`pointNo` → `pointNumber` → `pointName` → `name`) is honoured. */
function collectTakenNames(doc: DrawingDocument): Set<string> {
  const out = new Set<string>();
  for (const f of Object.values(doc.features)) {
    if (f.type !== 'POINT') continue;
    const name = pointNumberOf(f);
    if (name) out.add(name);
  }
  return out;
}

/** Pick a non-colliding point name for a NEW point. `requestedName` is
 *  what the caller wants; if it's empty or undefined the caller didn't
 *  request a name, and an empty string is returned (the caller can fall
 *  back to its own naming flow, e.g. `nameDrawnFeature`). */
export function disambiguatePointName(doc: DrawingDocument, requestedName: string | undefined): string {
  const requested = (requestedName ?? '').trim();
  if (requested.length === 0) return '';
  const taken = collectTakenNames(doc);
  if (!taken.has(requested)) return requested;
  // Collision — find the smallest free `${bare}:K`. Skip any suffix
  // already claimed by an existing point so the rename doesn't
  // immediately collide with a later record.
  const { bare } = splitDuplicateSuffix(requested);
  let k = 1;
  let candidate = `${bare}:${k}`;
  while (taken.has(candidate)) {
    k += 1;
    candidate = `${bare}:${k}`;
  }
  return candidate;
}

/** Returns the disambiguated name AND a flag saying whether the
 *  requested name had to be renamed. Useful for surface code that
 *  wants to notify the surveyor. */
export function disambiguatePointNameWithRename(
  doc: DrawingDocument,
  requestedName: string | undefined,
): { name: string; renamed: boolean } {
  const requested = (requestedName ?? '').trim();
  const name = disambiguatePointName(doc, requested);
  return { name, renamed: requested.length > 0 && name !== requested };
}

/** Convenience — apply the disambiguation to a partial properties
 *  object before stamping it on a new POINT feature. Reads any of the
 *  legacy keys (`pointNo` / `pointNumber` / `pointName` / `name`) for
 *  the request, then writes the result back under `pointName` (the
 *  canonical key). Leaves the properties object UNCHANGED when no
 *  name was requested. */
export function stampDisambiguatedPointName(
  doc: DrawingDocument,
  properties: Record<string, string | number | boolean> | undefined,
): Record<string, string | number | boolean> | undefined {
  const requested =
    (typeof properties?.pointNo === 'string' && properties.pointNo) ||
    (typeof properties?.pointNumber === 'string' && properties.pointNumber) ||
    (typeof properties?.pointName === 'string' && properties.pointName) ||
    (typeof properties?.name === 'string' && properties.name) ||
    '';
  if (!requested) return properties;
  const name = disambiguatePointName(doc, requested);
  return { ...(properties ?? {}), pointName: name };
}

/** Re-exported so callers that want a no-op "is this name in use"
 *  check can avoid running the whole disambiguation pipeline. */
export function isPointNameTaken(doc: DrawingDocument, name: string): boolean {
  const taken = collectTakenNames(doc);
  return taken.has(name);
}

// `pointNumberOf` is re-exported for convenience so callers can do one
// import. Implementation lives in `../feature-fields.ts`.
export { pointNumberOf };

// Re-export for downstream tests that want to assert on the canonical
// Feature type without re-importing from `../types`.
export type { Feature, DrawingDocument };
