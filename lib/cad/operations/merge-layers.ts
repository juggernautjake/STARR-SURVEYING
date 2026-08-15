// lib/cad/operations/merge-layers.ts
//
// C7 of docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// Merge one layer into another: move every feature across, then delete the emptied layer.
//
// ── WHY MERGE, WHEN ISOLATE AND MOVE-SELECTION ALREADY EXIST ────────────────────────────────────
//
// Checking C7's list against the panel found isolate, show-all and move-selection-to-layer already
// built. Merge and split-by-code were the two genuinely missing. Merge is the one a surveyor needs
// most often and for the least interesting reason: layers arrive from imports, from field codes and
// from other people's drawings, and three of them turn out to mean the same thing. Without merge
// the fix is select-all-on-a-layer, move, then delete — three operations, three undo steps, and a
// selection that is easy to get wrong on a busy drawing.
//
// ── WHAT MAKES THIS ONE UNDO ────────────────────────────────────────────────────────────────────
//
// The move and the delete are pushed as a single BATCH entry. That matters more than tidiness: a
// merge that undoes in two steps can be left half-undone — features back on a layer that no longer
// exists — and `getVisibleFeatures` drops a feature whose layer is missing SILENTLY. The symptom
// is geometry that exists, is selectable and saved, and cannot be seen; the same class S13d exists
// to make loud.
//
// Undo order is the reverse of apply order, which the undo store handles, so the layer is restored
// before the features are moved back onto it.

import type { Feature, Layer, UndoOperation } from '../types';

export interface MergeLayersInput {
  sourceLayerId: string;
  targetLayerId: string;
  layers: Readonly<Record<string, Layer>>;
  features: Readonly<Record<string, Feature>>;
}

export type MergeLayersRefusal =
  | 'SAME_LAYER'
  | 'SOURCE_MISSING'
  | 'TARGET_MISSING'
  | 'TARGET_LOCKED'
  | 'SOURCE_LOCKED'
  | 'SOURCE_PROTECTED';

export interface MergeLayersPlan {
  ok: true;
  /** Features to re-parent, in document order. */
  featureIds: string[];
  /** The undo operations, already ordered for apply (undo replays them reversed). */
  operations: UndoOperation[];
  /** For the confirmation prompt and the undo label. */
  sourceName: string;
  targetName: string;
}

export interface MergeLayersRefused {
  ok: false;
  reason: MergeLayersRefusal;
}

/**
 * Plan a merge without performing it.
 *
 * Pure: takes the document's maps, returns the operations. Kept separate from the store write so
 * the refusals and the operation ordering can be tested without a running editor — the store call
 * is then a thin wrapper that cannot get the interesting part wrong.
 */
export function planLayerMerge(input: MergeLayersInput): MergeLayersPlan | MergeLayersRefused {
  const { sourceLayerId, targetLayerId, layers, features } = input;

  if (sourceLayerId === targetLayerId) return { ok: false, reason: 'SAME_LAYER' };
  const source = layers[sourceLayerId];
  if (!source) return { ok: false, reason: 'SOURCE_MISSING' };
  const target = layers[targetLayerId];
  if (!target) return { ok: false, reason: 'TARGET_MISSING' };
  // A locked TARGET cannot receive geometry — the same rule `transferSelectionToLayer` applies.
  if (target.locked) return { ok: false, reason: 'TARGET_LOCKED' };
  // A locked SOURCE is refused too, which `transferSelectionToLayer` does not check because moving
  // features OUT of a locked layer is a different question from writing INTO one. Here the source
  // is destroyed, and destroying a layer somebody locked is exactly what the lock is for.
  if (source.locked) return { ok: false, reason: 'SOURCE_LOCKED' };
  if (source.isProtected) return { ok: false, reason: 'SOURCE_PROTECTED' };

  const featureIds = Object.values(features)
    .filter((f) => f.layerId === sourceLayerId)
    .map((f) => f.id);

  const operations: UndoOperation[] = featureIds.map((id) => ({
    type: 'MODIFY_FEATURE',
    data: { id, before: { layerId: sourceLayerId }, after: { layerId: targetLayerId } },
  }));

  // Last, so that on undo it is restored FIRST — before the features are moved back onto it. The
  // reverse order is what stops undo leaving features parented to a layer that does not exist yet.
  operations.push({ type: 'REMOVE_LAYER', data: source as unknown as Record<string, unknown> });

  return {
    ok: true,
    featureIds,
    operations,
    sourceName: source.name,
    targetName: target.name,
  };
}

/** Human-readable reason, for the surveyor rather than the log. */
export function describeMergeRefusal(reason: MergeLayersRefusal): string {
  switch (reason) {
    case 'SAME_LAYER':        return 'Pick a different layer to merge into.';
    case 'SOURCE_MISSING':    return 'That layer no longer exists.';
    case 'TARGET_MISSING':    return 'The layer you are merging into no longer exists.';
    case 'TARGET_LOCKED':     return 'The layer you are merging into is locked. Unlock it first.';
    case 'SOURCE_LOCKED':     return 'That layer is locked, and merging would delete it. Unlock it first.';
    case 'SOURCE_PROTECTED':  return 'That layer is protected and cannot be deleted.';
  }
}
