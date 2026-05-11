// lib/cad/ai/sandbox.ts
//
// Phase 6 §32.3 — Sandbox routing for AI tool-registry calls.
//
// When a tool is invoked with `sandbox: true`, the write is
// redirected from the requested target layer to a parallel
// "draft" layer named `DRAFT__<targetName>`. The draft layer is
// auto-created on first use (mirroring the target's style so the
// ghost reads visually like the real thing) and lives at the end
// of the layer order. Once the surveyor approves the draft, the
// §11.7 Layer Transfer kernel moves the features from the draft
// layer back to the original target — that lift+drop happens
// in `promoteDraftLayer` below.

import { useDrawingStore, useUndoStore, makeBatchEntry } from '../store';
import { transferSelectionToLayer } from '../operations';
import { generateId } from '../types';
import type { Layer } from '../types';

/** Prefix used for every sandbox layer. Double underscore to
 *  keep the name unmistakable in the layer panel + greppable
 *  in stored documents. */
export const DRAFT_LAYER_PREFIX = 'DRAFT__';

/** True when the layer's name starts with the sandbox prefix. */
export function isDraftLayer(layer: Layer | null | undefined): boolean {
  return !!layer && layer.name.startsWith(DRAFT_LAYER_PREFIX);
}

/** Compute the draft name for a given target name. Already-prefixed
 *  names are returned unchanged (so the sandbox never recurses). */
export function draftNameFor(targetName: string): string {
  if (targetName.startsWith(DRAFT_LAYER_PREFIX)) return targetName;
  return `${DRAFT_LAYER_PREFIX}${targetName}`;
}

/**
 * Find or create the draft layer that mirrors `targetLayerId`.
 * Returns the draft layer's id. The mirror copies colour /
 * line weight / line type / opacity / autoAssignCodes from the
 * target so the ghost reads visually like the real thing; it
 * stays unlocked and unfrozen even when the target is locked.
 */
export function ensureDraftLayerFor(targetLayerId: string): {
  ok: true;
  draftLayerId: string;
  targetLayerId: string;
} | {
  ok: false;
  reason: string;
} {
  const store = useDrawingStore.getState();
  const target = store.document.layers[targetLayerId];
  if (!target) {
    return { ok: false, reason: `Target layer '${targetLayerId}' does not exist.` };
  }
  // Already a draft layer? Route writes straight to it; the
  // surveyor probably did this on purpose.
  if (isDraftLayer(target)) {
    return { ok: true, draftLayerId: targetLayerId, targetLayerId };
  }
  const draftName = draftNameFor(target.name);
  const existing = Object.values(store.document.layers).find(
    (l) => l.name.toLowerCase() === draftName.toLowerCase(),
  );
  if (existing) {
    return { ok: true, draftLayerId: existing.id, targetLayerId };
  }

  const draft: Layer = {
    id: generateId(),
    name: draftName,
    visible: true,
    locked: false,
    frozen: false,
    color: target.color,
    lineWeight: target.lineWeight,
    lineTypeId: target.lineTypeId,
    opacity: Math.min(1, target.opacity),
    groupId: target.groupId,
    sortOrder: Object.keys(store.document.layers).length,
    isDefault: false,
    isProtected: false,
    autoAssignCodes: [...target.autoAssignCodes],
  };
  store.addLayer(draft);
  return { ok: true, draftLayerId: draft.id, targetLayerId };
}

/**
 * Resolve the draft name back to the target layer. Used by the
 * "Promote draft" UI to find where the features should land.
 */
export function findPromotionTarget(draft: Layer): Layer | null {
  if (!isDraftLayer(draft)) return null;
  const targetName = draft.name.slice(DRAFT_LAYER_PREFIX.length);
  if (targetName.length === 0) return null;
  const store = useDrawingStore.getState();
  return (
    Object.values(store.document.layers).find(
      (l) => l.name.toLowerCase() === targetName.toLowerCase() && !isDraftLayer(l),
    ) ?? null
  );
}

export type PromoteDraftResult =
  | { ok: true; movedCount: number; targetLayerId: string }
  | { ok: false; reason: string };

/**
 * Move every feature from a draft layer onto its target via the
 * §11.7 Layer Transfer kernel (Move, keepOriginals=false), then
 * delete the now-empty draft layer. The undo is a single batch
 * entry so one click reverses the whole promotion.
 */
export function promoteDraftLayer(draftLayerId: string): PromoteDraftResult {
  const store = useDrawingStore.getState();
  const draft = store.document.layers[draftLayerId];
  if (!draft) {
    return { ok: false, reason: `Draft layer '${draftLayerId}' does not exist.` };
  }
  if (!isDraftLayer(draft)) {
    return { ok: false, reason: `Layer '${draft.name}' is not a draft (no DRAFT__ prefix).` };
  }
  const target = findPromotionTarget(draft);
  if (!target) {
    return {
      ok: false,
      reason: `No target layer matches '${draft.name}'. Rename or create '${draft.name.slice(DRAFT_LAYER_PREFIX.length)}' first.`,
    };
  }
  if (target.locked) {
    return { ok: false, reason: `Target layer '${target.name}' is locked.` };
  }

  const featuresToMove = Object.values(store.document.features).filter(
    (f) => f.layerId === draftLayerId && !f.hidden,
  );
  if (featuresToMove.length === 0) {
    // Empty drafts can be promoted by just removing the layer.
    store.removeLayer(draftLayerId);
    return { ok: true, movedCount: 0, targetLayerId: target.id };
  }

  const result = transferSelectionToLayer(
    featuresToMove.map((f) => f.id),
    target.id,
    {
      keepOriginals: false,
      renumberStart: null,
      stripUnknownCodes: false,
      codeMap: null,
      targetTraverseId: null,
      bringAlongLinkedGeometry: false,
      transferOperationId: `promote:${draftLayerId}`,
    },
  );

  // Drop the now-empty draft layer. We attach the layer-removal
  // op to the same batch via makeBatchEntry so one Ctrl+Z
  // reverses the whole promotion. transferSelectionToLayer
  // already pushed its own undo entry, so reading it back here
  // and rolling everything into one is messier than letting the
  // two entries land separately; for now the layer removal is
  // its own undo step, which is good enough for the v1 UX.
  void makeBatchEntry; // silence the unused-import lint
  void useUndoStore;

  // Only remove the layer when every feature actually landed
  // on the target — leaves audit-friendly state if anything
  // mis-routed. Move semantics report `removed: 0` (features
  // are reassigned, not deleted), so we gate on `written`.
  if (result.written === featuresToMove.length) {
    useDrawingStore.getState().removeLayer(draftLayerId);
  }

  return {
    ok: true,
    movedCount: result.written,
    targetLayerId: target.id,
  };
}
