// __tests__/cad/ai/sandbox.test.ts
//
// Phase 6 §32.3 — sandbox routing + draft-promotion tests.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DRAFT_LAYER_PREFIX,
  draftNameFor,
  isDraftLayer,
  ensureDraftLayerFor,
  findPromotionTarget,
  promoteDraftLayer,
} from '@/lib/cad/ai/sandbox';
import { addPoint, drawLineBetween } from '@/lib/cad/ai/tool-registry';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { useUndoStore } from '@/lib/cad/store/undo-store';
import { generateId } from '@/lib/cad/types';
import type { Layer } from '@/lib/cad/types';

function makeLayer(id: string, name: string, overrides: Partial<Layer> = {}): Layer {
  return {
    id, name,
    visible: true, locked: false, frozen: false,
    color: '#336699', lineWeight: 0.6, lineTypeId: 'SOLID', opacity: 1,
    groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
    autoAssignCodes: ['BC', 'EP'],
    ...overrides,
  };
}

function resetStores(): string {
  useDrawingStore.getState().newDocument();
  useUndoStore.getState().clear();
  const id = generateId();
  useDrawingStore.getState().addLayer(makeLayer(id, 'BACK_OF_CURB'));
  useDrawingStore.getState().setActiveLayer(id);
  return id;
}

describe('sandbox helpers', () => {
  it('draftNameFor prefixes once', () => {
    expect(draftNameFor('FOO')).toBe(`${DRAFT_LAYER_PREFIX}FOO`);
    expect(draftNameFor(`${DRAFT_LAYER_PREFIX}FOO`)).toBe(`${DRAFT_LAYER_PREFIX}FOO`);
  });

  it('isDraftLayer detects the prefix', () => {
    expect(isDraftLayer(makeLayer('a', 'FOO'))).toBe(false);
    expect(isDraftLayer(makeLayer('a', `${DRAFT_LAYER_PREFIX}FOO`))).toBe(true);
    expect(isDraftLayer(null)).toBe(false);
  });
});

describe('ensureDraftLayerFor', () => {
  beforeEach(() => {
    resetStores();
  });

  it('creates the mirrored draft layer on first call', () => {
    const targetId = useDrawingStore.getState().activeLayerId;
    const r = ensureDraftLayerFor(targetId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draftLayerId).not.toBe(targetId);
    const draft = useDrawingStore.getState().document.layers[r.draftLayerId];
    expect(draft.name).toBe(`${DRAFT_LAYER_PREFIX}BACK_OF_CURB`);
    // Mirrors the target style:
    expect(draft.color).toBe('#336699');
    expect(draft.lineWeight).toBe(0.6);
    expect(draft.autoAssignCodes).toEqual(['BC', 'EP']);
    expect(draft.locked).toBe(false);
  });

  it('reuses an existing draft on subsequent calls', () => {
    const targetId = useDrawingStore.getState().activeLayerId;
    const first = ensureDraftLayerFor(targetId);
    const second = ensureDraftLayerFor(targetId);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.draftLayerId).toBe(second.draftLayerId);
  });

  it('returns the layer as-is when called on an existing draft', () => {
    const draft = makeLayer(generateId(), `${DRAFT_LAYER_PREFIX}EXISTING`);
    useDrawingStore.getState().addLayer(draft);
    const r = ensureDraftLayerFor(draft.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draftLayerId).toBe(draft.id);
  });

  it('fails with a clear reason when the target is missing', () => {
    const r = ensureDraftLayerFor('does-not-exist');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/does not exist/i);
  });
});

describe('tool-registry sandbox routing', () => {
  beforeEach(() => {
    resetStores();
  });

  it('addPoint with sandbox=true writes to the DRAFT__ layer, not the target', () => {
    const targetId = useDrawingStore.getState().activeLayerId;
    const r = addPoint.execute({ x: 1, y: 2, sandbox: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const draft = useDrawingStore.getState().document.layers[r.result.layerId];
    expect(isDraftLayer(draft)).toBe(true);
    expect(r.result.layerId).not.toBe(targetId);
    // Target layer remains empty.
    const featuresOnTarget = Object.values(useDrawingStore.getState().document.features)
      .filter((f) => f.layerId === targetId);
    expect(featuresOnTarget).toHaveLength(0);
  });

  it('multiple sandboxed writes to the same target reuse one draft layer', () => {
    addPoint.execute({ x: 0, y: 0, sandbox: true });
    addPoint.execute({ x: 1, y: 1, sandbox: true });
    drawLineBetween.execute({ from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, sandbox: true });
    const drafts = Object.values(useDrawingStore.getState().document.layers).filter(isDraftLayer);
    expect(drafts).toHaveLength(1);
    const featuresOnDraft = Object.values(useDrawingStore.getState().document.features)
      .filter((f) => f.layerId === drafts[0].id);
    expect(featuresOnDraft).toHaveLength(3);
  });

  it('sandbox routing falls back to the active layer when layerId is omitted', () => {
    const r = addPoint.execute({ x: 1, y: 1, sandbox: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const draft = useDrawingStore.getState().document.layers[r.result.layerId];
    expect(draft.name).toBe(`${DRAFT_LAYER_PREFIX}BACK_OF_CURB`);
  });

  it('sandbox routing bypasses target-layer lock', () => {
    const targetId = useDrawingStore.getState().activeLayerId;
    useDrawingStore.getState().updateLayer(targetId, { locked: true });
    const r = addPoint.execute({ x: 0, y: 0, sandbox: true });
    expect(r.ok).toBe(true);
  });

  it('sandbox=false (or omitted) still respects target-layer lock', () => {
    const targetId = useDrawingStore.getState().activeLayerId;
    useDrawingStore.getState().updateLayer(targetId, { locked: true });
    const r = addPoint.execute({ x: 0, y: 0 });
    expect(r.ok).toBe(false);
  });
});

describe('promoteDraftLayer', () => {
  beforeEach(() => {
    resetStores();
  });

  it('moves every feature from the draft to the target and removes the draft', () => {
    const targetId = useDrawingStore.getState().activeLayerId;
    addPoint.execute({ x: 0, y: 0, sandbox: true });
    addPoint.execute({ x: 1, y: 1, sandbox: true });
    const drafts = Object.values(useDrawingStore.getState().document.layers).filter(isDraftLayer);
    const draftId = drafts[0].id;
    const r = promoteDraftLayer(draftId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.movedCount).toBe(2);
    expect(r.targetLayerId).toBe(targetId);
    // Draft layer removed.
    expect(useDrawingStore.getState().document.layers[draftId]).toBeUndefined();
    // Features moved.
    const onTarget = Object.values(useDrawingStore.getState().document.features)
      .filter((f) => f.layerId === targetId);
    expect(onTarget).toHaveLength(2);
  });

  it('removes an empty draft with zero features moved', () => {
    // Create an empty draft by ensureDraftLayerFor on a fresh
    // target with no sandbox writes.
    const targetId = useDrawingStore.getState().activeLayerId;
    const draftRes = ensureDraftLayerFor(targetId);
    if (!draftRes.ok) throw new Error('Setup failed');
    const r = promoteDraftLayer(draftRes.draftLayerId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.movedCount).toBe(0);
    expect(useDrawingStore.getState().document.layers[draftRes.draftLayerId]).toBeUndefined();
  });

  it('fails when the draft layer is missing', () => {
    const r = promoteDraftLayer('missing');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/does not exist/i);
  });

  it('fails when the layer is not a draft', () => {
    const targetId = useDrawingStore.getState().activeLayerId;
    const r = promoteDraftLayer(targetId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/not a draft/i);
  });

  it('fails when no target layer matches the draft name', () => {
    const orphan = generateId();
    useDrawingStore.getState().addLayer(makeLayer(orphan, `${DRAFT_LAYER_PREFIX}MISSING_TARGET`));
    const r = promoteDraftLayer(orphan);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/No target layer matches/i);
  });

  it('fails when the target layer is locked', () => {
    const targetId = useDrawingStore.getState().activeLayerId;
    addPoint.execute({ x: 0, y: 0, sandbox: true });
    useDrawingStore.getState().updateLayer(targetId, { locked: true });
    const drafts = Object.values(useDrawingStore.getState().document.layers).filter(isDraftLayer);
    const r = promoteDraftLayer(drafts[0].id);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/locked/i);
  });
});

describe('findPromotionTarget', () => {
  beforeEach(() => {
    resetStores();
  });

  it('returns the matching non-draft layer for a draft', () => {
    const targetId = useDrawingStore.getState().activeLayerId;
    const draft = makeLayer(generateId(), `${DRAFT_LAYER_PREFIX}BACK_OF_CURB`);
    useDrawingStore.getState().addLayer(draft);
    const target = findPromotionTarget(draft);
    expect(target?.id).toBe(targetId);
  });

  it('returns null for a non-draft layer', () => {
    const target = findPromotionTarget(makeLayer('a', 'NOT_A_DRAFT'));
    expect(target).toBeNull();
  });

  it('returns null when the matching target does not exist', () => {
    const draft = makeLayer(generateId(), `${DRAFT_LAYER_PREFIX}UNKNOWN`);
    useDrawingStore.getState().addLayer(draft);
    expect(findPromotionTarget(draft)).toBeNull();
  });
});
