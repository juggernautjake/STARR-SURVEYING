// __tests__/cad/ai/undo-batch.test.ts
//
// Phase 6 §32.10 — per-AI-action undo + "Undo AI batch"
// helpers. Drives the undo store directly through tool-registry
// calls + mock proposals to keep the suite Node-only.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  aiBatchIdFromEntry,
  findMostRecentAIBatch,
  undoMostRecentAIBatch,
} from '@/lib/cad/ai/undo-batch';
import { addPoint } from '@/lib/cad/ai/tool-registry';
import { useAIStore } from '@/lib/cad/store';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { useUndoStore, makeAddFeatureEntry, makeBatchEntry } from '@/lib/cad/store';
import { generateId } from '@/lib/cad/types';
import type { Feature, Layer } from '@/lib/cad/types';

function makeLayer(id: string, name: string): Layer {
  return {
    id, name,
    visible: true, locked: false, frozen: false,
    color: '#000000', lineWeight: 0.5, lineTypeId: 'SOLID', opacity: 1,
    groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
    autoAssignCodes: [],
  };
}

function resetStores(): string {
  useDrawingStore.getState().newDocument();
  useUndoStore.getState().clear();
  useAIStore.getState().setMode('COPILOT');
  useAIStore.getState().setSandbox(false);
  useAIStore.getState().clearProposalQueue();
  const id = generateId();
  useDrawingStore.getState().addLayer(makeLayer(id, 'TEST_LAYER'));
  useDrawingStore.getState().setActiveLayer(id);
  return id;
}

function makeProvenance(batchId: string, origin = 'COPILOT_addPoint') {
  return {
    aiOrigin: origin,
    aiConfidence: 0.9,
    aiPromptHash: 'fnv1a-test',
    aiSourcePoints: [],
    aiBatchId: batchId,
  };
}

function aiAddPoint(x: number, y: number, batchId: string): Feature {
  const r = addPoint.execute({
    x, y,
    provenance: makeProvenance(batchId),
  });
  if (!r.ok) throw new Error('addPoint failed: ' + r.reason);
  return r.result;
}

describe('aiBatchIdFromEntry', () => {
  beforeEach(() => resetStores());

  it('reads aiBatchId from a single ADD_FEATURE op', () => {
    aiAddPoint(0, 0, 'batch-1');
    const entry = useUndoStore.getState().undoStack[0];
    expect(aiBatchIdFromEntry(entry)).toBe('batch-1');
  });

  it('returns null for non-AI entries', () => {
    // Push a feature without provenance — uses makeAddFeatureEntry
    // directly to simulate a manual draw.
    const layerId = useDrawingStore.getState().activeLayerId;
    const manual: Feature = {
      id: generateId(),
      type: 'POINT',
      geometry: { type: 'POINT', point: { x: 1, y: 1 } },
      layerId,
      style: {
        color: null, lineWeight: null, opacity: 1,
        lineTypeId: null, symbolId: null, symbolSize: null,
        symbolRotation: 0, labelVisible: null, labelFormat: null,
        labelOffset: { x: 0, y: 0 }, isOverride: false,
      },
      properties: {},
    };
    useDrawingStore.getState().addFeature(manual);
    useUndoStore.getState().pushUndo(makeAddFeatureEntry(manual));
    const entry = useUndoStore.getState().undoStack[0];
    expect(aiBatchIdFromEntry(entry)).toBeNull();
  });

  it('walks into a BATCH op to find the inner aiBatchId', () => {
    const layerId = useDrawingStore.getState().activeLayerId;
    const feature: Feature = {
      id: generateId(),
      type: 'POINT',
      geometry: { type: 'POINT', point: { x: 2, y: 2 } },
      layerId,
      style: {
        color: null, lineWeight: null, opacity: 1,
        lineTypeId: null, symbolId: null, symbolSize: null,
        symbolRotation: 0, labelVisible: null, labelFormat: null,
        labelOffset: { x: 0, y: 0 }, isOverride: false,
      },
      properties: { aiOrigin: 'X', aiBatchId: 'inner-batch' },
    };
    useDrawingStore.getState().addFeature(feature);
    useUndoStore.getState().pushUndo(
      makeBatchEntry('batch test', [{ type: 'ADD_FEATURE', data: feature }]),
    );
    const entry = useUndoStore.getState().undoStack[0];
    expect(aiBatchIdFromEntry(entry)).toBe('inner-batch');
  });
});

describe('findMostRecentAIBatch', () => {
  beforeEach(() => resetStores());

  it('returns null when the stack is empty', () => {
    expect(findMostRecentAIBatch()).toBeNull();
  });

  it('returns null when the top entry has no aiBatchId', () => {
    aiAddPoint(0, 0, 'batch-1');
    // Now push a manual entry on top.
    const layerId = useDrawingStore.getState().activeLayerId;
    const manual: Feature = {
      id: generateId(), type: 'POINT',
      geometry: { type: 'POINT', point: { x: 99, y: 99 } },
      layerId,
      style: { color: null, lineWeight: null, opacity: 1, lineTypeId: null, symbolId: null, symbolSize: null, symbolRotation: 0, labelVisible: null, labelFormat: null, labelOffset: { x: 0, y: 0 }, isOverride: false },
      properties: {},
    };
    useDrawingStore.getState().addFeature(manual);
    useUndoStore.getState().pushUndo(makeAddFeatureEntry(manual));
    expect(findMostRecentAIBatch()).toBeNull();
  });

  it('counts every consecutive same-batch entry from the top', () => {
    aiAddPoint(0, 0, 'batch-1');
    aiAddPoint(1, 1, 'batch-1');
    aiAddPoint(2, 2, 'batch-1');
    const found = findMostRecentAIBatch();
    expect(found).toEqual({ batchId: 'batch-1', count: 3 });
  });

  it('stops counting at a non-matching entry', () => {
    aiAddPoint(0, 0, 'batch-A');
    aiAddPoint(1, 1, 'batch-B'); // intervening batch
    aiAddPoint(2, 2, 'batch-B');
    const found = findMostRecentAIBatch();
    expect(found).toEqual({ batchId: 'batch-B', count: 2 });
  });

  it('stops counting at a manual entry between AI batches', () => {
    aiAddPoint(0, 0, 'batch-A');
    aiAddPoint(1, 1, 'batch-A');
    // Manual feature in between:
    const layerId = useDrawingStore.getState().activeLayerId;
    const manual: Feature = {
      id: generateId(), type: 'POINT',
      geometry: { type: 'POINT', point: { x: 5, y: 5 } },
      layerId,
      style: { color: null, lineWeight: null, opacity: 1, lineTypeId: null, symbolId: null, symbolSize: null, symbolRotation: 0, labelVisible: null, labelFormat: null, labelOffset: { x: 0, y: 0 }, isOverride: false },
      properties: {},
    };
    useDrawingStore.getState().addFeature(manual);
    useUndoStore.getState().pushUndo(makeAddFeatureEntry(manual));
    aiAddPoint(2, 2, 'batch-A');
    aiAddPoint(3, 3, 'batch-A');
    const found = findMostRecentAIBatch();
    // Top two are batch-A, then a manual entry breaks the run.
    expect(found).toEqual({ batchId: 'batch-A', count: 2 });
  });
});

describe('undoMostRecentAIBatch', () => {
  beforeEach(() => resetStores());

  it('returns null + leaves the stack untouched when no AI batch is at top', () => {
    expect(undoMostRecentAIBatch()).toBeNull();
    expect(useUndoStore.getState().undoStack).toHaveLength(0);
  });

  it('pops every entry in the topmost AI batch and moves them to redoStack', () => {
    aiAddPoint(0, 0, 'batch-1');
    aiAddPoint(1, 1, 'batch-1');
    aiAddPoint(2, 2, 'batch-1');
    expect(useUndoStore.getState().undoStack).toHaveLength(3);
    const result = undoMostRecentAIBatch();
    expect(result).toEqual({ batchId: 'batch-1', count: 3 });
    expect(useUndoStore.getState().undoStack).toHaveLength(0);
    expect(useUndoStore.getState().redoStack).toHaveLength(3);
    // Drawing-store reflects the rollback — every feature gone.
    const features = Object.values(useDrawingStore.getState().document.features);
    expect(features).toHaveLength(0);
  });

  it('only pops the top batch when an older batch is below', () => {
    aiAddPoint(0, 0, 'batch-A');
    aiAddPoint(1, 1, 'batch-B');
    aiAddPoint(2, 2, 'batch-B');
    const result = undoMostRecentAIBatch();
    expect(result).toEqual({ batchId: 'batch-B', count: 2 });
    expect(useUndoStore.getState().undoStack).toHaveLength(1);
    // Older batch-A entry remains; its feature should still be in the store.
    const features = Object.values(useDrawingStore.getState().document.features);
    expect(features).toHaveLength(1);
  });

  it('redo() re-applies every popped entry one at a time', () => {
    aiAddPoint(0, 0, 'batch-1');
    aiAddPoint(1, 1, 'batch-1');
    undoMostRecentAIBatch();
    // Two entries on redoStack — redo() once brings the older one back.
    useUndoStore.getState().redo();
    expect(Object.values(useDrawingStore.getState().document.features)).toHaveLength(1);
    useUndoStore.getState().redo();
    expect(Object.values(useDrawingStore.getState().document.features)).toHaveLength(2);
  });
});
