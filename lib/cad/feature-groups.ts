// lib/cad/feature-groups.ts
//
// cad-layer-grouping-and-context-menus Slice 2 — pure helpers for
// the nested-FeatureGroup hierarchy. Each FeatureGroup has an
// optional `parentGroupId` pointing at another FeatureGroup; null /
// undefined means the group sits at the layer root. These helpers
// answer questions about ancestry without touching the store, so the
// move-validation + tree-rendering code can call them freely.
//
// Pure module: no React, no DOM, no store. Fully unit-testable.

import type { FeatureGroup } from './types';

export type FeatureGroupMap = Record<string, FeatureGroup>;

/** Normalize a possibly-missing parentGroupId field to null. */
export function parentOf(group: FeatureGroup | undefined): string | null {
  if (!group) return null;
  return group.parentGroupId ?? null;
}

/** Walk up the parent chain starting from `groupId`, returning every
 *  ancestor id in root-most-first order. Stops on null parent or on
 *  a stale parentGroupId (parent not in the map). Self is NOT
 *  included.
 *
 *  Cycle-safe: if the chain loops back on itself (which should never
 *  happen in a well-formed doc but can occur under a malformed save
 *  or a buggy reparent), the walk stops the first time it revisits
 *  a node it's already seen. */
export function ancestorChain(groups: FeatureGroupMap, groupId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([groupId]);
  let cursor: string | null = parentOf(groups[groupId]);
  while (cursor !== null) {
    if (seen.has(cursor)) return out; // cycle guard
    seen.add(cursor);
    out.unshift(cursor);
    cursor = parentOf(groups[cursor]);
  }
  return out;
}

/** True when `candidateAncestorId` appears in `groupId`'s ancestor
 *  chain — i.e. `groupId` is a descendant of `candidateAncestorId`.
 *  False if `groupId` and `candidateAncestorId` are equal (a group
 *  is NOT its own descendant). */
export function isDescendantOf(
  groups: FeatureGroupMap,
  groupId: string,
  candidateAncestorId: string,
): boolean {
  if (groupId === candidateAncestorId) return false;
  return ancestorChain(groups, groupId).includes(candidateAncestorId);
}

/** All groups that have `rootId` somewhere in their ancestor chain.
 *  Excludes `rootId` itself. Order is unspecified but stable for a
 *  given input. */
export function allDescendants(groups: FeatureGroupMap, rootId: string): string[] {
  const out: string[] = [];
  for (const g of Object.values(groups)) {
    if (g.id === rootId) continue;
    if (isDescendantOf(groups, g.id, rootId)) out.push(g.id);
  }
  return out;
}

/** Validation used by the drawing-store's moveFeatureGroup action.
 *  Returns true (= REJECT) when the move would create a cycle:
 *
 *   - `newParentId === groupId` (a group can't be its own parent).
 *   - `newParentId` is a descendant of `groupId` (would close a loop).
 *
 *  Returns false (= ALLOW) for any safe reparent, including
 *  moving to layer-root (newParentId === null) and moving to a
 *  sibling / unrelated group. */
export function wouldCreateCycle(
  groups: FeatureGroupMap,
  groupId: string,
  newParentId: string | null,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === groupId) return true;
  return isDescendantOf(groups, newParentId, groupId);
}

/** Direct children of `parentId`. `parentId === null` returns
 *  layer-root groups (those with `parentGroupId == null`). */
export function childrenOf(groups: FeatureGroupMap, parentId: string | null): FeatureGroup[] {
  return Object.values(groups).filter((g) => parentOf(g) === parentId);
}

/** cad-layer-grouping Slice 4 — compute the destination
 *  parentGroupId for a "Group Selected" operation. Returns:
 *
 *   - The shared `featureGroupId` when ALL features in the selection
 *     already belong to the SAME existing group (the new sub-group
 *     nests under that parent).
 *   - `null` otherwise (selection spans multiple groups, or contains
 *     ungrouped features) — the new group becomes a layer-root
 *     group.
 *
 *  Pure: takes the features' featureGroupId values directly, so it
 *  doesn't need to know about the store. The caller hands in the
 *  list of currently-selected features. */
export function computeDestinationParentGroup(
  selection: ReadonlyArray<{ featureGroupId?: string | null }>,
): string | null {
  if (selection.length === 0) return null;
  const groupIds = new Set<string | null>();
  for (const f of selection) groupIds.add(f.featureGroupId ?? null);
  // All-or-nothing rule: every selected feature must share the EXACT
  // same group id (or all be ungrouped). Mixed ⇒ null (layer-root).
  if (groupIds.size !== 1) return null;
  const sole = groupIds.values().next().value as string | null;
  // All ungrouped ⇒ layer-root.
  return sole === undefined || sole === null ? null : sole;
}
