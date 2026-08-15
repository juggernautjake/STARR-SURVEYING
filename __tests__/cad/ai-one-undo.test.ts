// __tests__/cad/ai-one-undo.test.ts
//
// C37 — every AI action is one undo.
//
// The batch machinery has existed since Phase 6 §32.10, but it read the batch id off the FEATURES
// an entry created, which meant it could only ever see tools that CREATE. C35 added move / rotate /
// scale / mirror / delete, which push MODIFY_FEATURE and REMOVE_FEATURE entries and create nothing:
// `aiBatchIdFromEntry` returned null for all five, and the "undo that whole AI request" walk
// stopped dead at the first of them — with the other thirty-nine features still moved.
//
// So the two things pinned here are: the id can live on the ENTRY, and a turn that mixes creating
// and modifying tools reverses in one step.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  aiBatchIdFromEntry,
  findMostRecentAIBatch,
  undoMostRecentAIBatch,
  runAsOneAIBatch,
} from '@/lib/cad/ai/undo-batch';
import {
  addPoint,
  drawLineBetween,
  moveFeatures,
  rotateFeatures,
  scaleFeatures,
  mirrorFeatures,
  deleteFeatures,
} from '@/lib/cad/ai/tool-registry';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { useUndoStore, makeAddFeatureEntry } from '@/lib/cad/store';
import { generateId } from '@/lib/cad/types';
import type { Feature, Layer } from '@/lib/cad/types';

function makeLayer(id: string, name: string): Layer {
  return {
    id,
    name,
    visible: true,
    locked: false,
    frozen: false,
    color: '#000000',
    lineWeight: 0.5,
    lineTypeId: 'SOLID',
    opacity: 1,
    groupId: null,
    sortOrder: 0,
    isDefault: false,
    isProtected: false,
    autoAssignCodes: [],
  };
}

function resetStores(): string {
  useDrawingStore.getState().newDocument();
  useUndoStore.getState().clear();
  const id = generateId();
  useDrawingStore.getState().addLayer(makeLayer(id, 'TEST_LAYER'));
  useDrawingStore.getState().setActiveLayer(id);
  return id;
}

function point(x: number, y: number): Feature {
  const r = addPoint.execute({ x, y });
  if (!r.ok) throw new Error(`addPoint failed: ${r.reason}`);
  return r.result;
}

/** Coordinates of a POINT feature as it stands in the live document. */
function liveXY(id: string): { x: number; y: number } {
  const f = useDrawingStore.getState().document.features[id];
  if (!f?.geometry.point) throw new Error(`feature '${id}' has no point geometry`);
  return { x: f.geometry.point.x, y: f.geometry.point.y };
}

const stack = () => useUndoStore.getState().undoStack;

beforeEach(() => {
  resetStores();
});

describe('C37 — the batch id on the entry', () => {
  it('reads the entry id for a MODIFY batch, which has no created features to read from', () => {
    const a = point(0, 0);
    const b = point(100, 0);
    useUndoStore.getState().clear();

    const r = moveFeatures.execute({ ids: [a.id, b.id], dx: 10, dy: 5, aiBatchId: 'turn-1' });
    expect(r.ok).toBe(true);
    expect(stack()).toHaveLength(1);
    // Before C37 this was null: the entry holds MODIFY_FEATURE ops, and the scan only looked at
    // ADD_FEATURE. Every "undo the AI turn" walk terminated here.
    expect(aiBatchIdFromEntry(stack()[0])).toBe('turn-1');
  });

  it('reads the entry id for a REMOVE batch too', () => {
    const a = point(0, 0);
    useUndoStore.getState().clear();

    expect(deleteFeatures.execute({ ids: [a.id], aiBatchId: 'turn-2' }).ok).toBe(true);
    expect(aiBatchIdFromEntry(stack()[0])).toBe('turn-2');
  });

  it('leaves the entry unlabelled when no batch id is supplied', () => {
    const a = point(0, 0);
    useUndoStore.getState().clear();

    expect(moveFeatures.execute({ ids: [a.id], dx: 1, dy: 1 }).ok).toBe(true);
    // A direct / UI-driven call is not an AI turn, and labelling it one would let "undo the last AI
    // request" reach into edits the AI never made.
    expect(aiBatchIdFromEntry(stack()[0])).toBeNull();
  });

  it('still reads the feature stamp on pre-C37 entries', () => {
    const legacy: Feature = {
      ...point(5, 5),
      properties: { aiBatchId: 'legacy-batch' },
    };
    useUndoStore.getState().clear();
    useUndoStore.getState().pushUndo(makeAddFeatureEntry(legacy));

    expect(aiBatchIdFromEntry(stack()[0])).toBe('legacy-batch');
  });
});

describe('C37 — a whole AI turn reverses in one step', () => {
  it('pops every modify tool of one turn together', () => {
    const a = point(0, 0);
    const b = point(100, 0);
    useUndoStore.getState().clear();
    const ids = [a.id, b.id];
    const batch = 'turn-multi';

    // One AI request, four tools: "square these up, then double them and flip them over the axis."
    expect(moveFeatures.execute({ ids, dx: 10, dy: 0, aiBatchId: batch }).ok).toBe(true);
    expect(rotateFeatures.execute({ ids, angleDeg: 90, aiBatchId: batch }).ok).toBe(true);
    expect(scaleFeatures.execute({ ids, factor: 2, aiBatchId: batch }).ok).toBe(true);
    expect(
      mirrorFeatures.execute({
        ids,
        axisStart: { x: 0, y: 0 },
        axisEnd: { x: 0, y: 100 },
        aiBatchId: batch,
      }).ok,
    ).toBe(true);
    expect(stack()).toHaveLength(4);

    const found = findMostRecentAIBatch();
    expect(found).toEqual({ batchId: batch, count: 4 });

    const popped = undoMostRecentAIBatch();
    expect(popped).toEqual({ batchId: batch, count: 4 });
    expect(stack()).toHaveLength(0);
    // Not "the stack is empty" — the geometry is actually back where the surveyor left it.
    expect(liveXY(a.id)).toEqual({ x: 0, y: 0 });
    expect(liveXY(b.id)).toEqual({ x: 100, y: 0 });
  });

  it('stops at a manual edit rather than reaching past it', () => {
    const a = point(0, 0);
    useUndoStore.getState().clear();

    expect(moveFeatures.execute({ ids: [a.id], dx: 10, dy: 0, aiBatchId: 'older' }).ok).toBe(true);
    // The surveyor nudges it themselves — no batch id.
    expect(moveFeatures.execute({ ids: [a.id], dx: 1, dy: 0 }).ok).toBe(true);
    expect(moveFeatures.execute({ ids: [a.id], dx: 100, dy: 0, aiBatchId: 'newer' }).ok).toBe(true);

    const popped = undoMostRecentAIBatch();
    expect(popped).toEqual({ batchId: 'newer', count: 1 });
    // Contiguity is the whole rule: undo is a stack, and popping the 'older' entry from under the
    // surveyor's own edit would apply it out of order and corrupt everything above it.
    expect(stack()).toHaveLength(2);
    expect(liveXY(a.id).x).toBe(11);
  });

  it('does not merge two different turns that happen to be adjacent', () => {
    const a = point(0, 0);
    useUndoStore.getState().clear();

    expect(moveFeatures.execute({ ids: [a.id], dx: 10, dy: 0, aiBatchId: 'turn-a' }).ok).toBe(true);
    expect(moveFeatures.execute({ ids: [a.id], dx: 20, dy: 0, aiBatchId: 'turn-b' }).ok).toBe(true);

    expect(undoMostRecentAIBatch()).toEqual({ batchId: 'turn-b', count: 1 });
    expect(undoMostRecentAIBatch()).toEqual({ batchId: 'turn-a', count: 1 });
    expect(stack()).toHaveLength(0);
  });
});

describe('C37 — runAsOneAIBatch labels the whole call', () => {
  it('labels entries from tools that never learned about batch ids', () => {
    const a = point(0, 0);
    const b = point(100, 0);
    useUndoStore.getState().clear();

    // A turn that draws AND modifies. `drawLineBetween` takes provenance, not a batch id; the
    // wrapper covers it — and covers any tool added later, which is the point of wrapping the call
    // site instead of threading an argument through twenty-five signatures.
    const { batchId } = runAsOneAIBatch(() => {
      const line = drawLineBetween.execute({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 } });
      if (!line.ok) throw new Error(`drawLineBetween failed: ${line.reason}`);
      const moved = moveFeatures.execute({ ids: [a.id, b.id], dx: 0, dy: 50 });
      if (!moved.ok) throw new Error(`moveFeatures failed: ${moved.reason}`);
    });

    expect(stack()).toHaveLength(2);
    expect(stack().every((e) => aiBatchIdFromEntry(e) === batchId)).toBe(true);
    expect(undoMostRecentAIBatch()).toEqual({ batchId, count: 2 });
    expect(liveXY(a.id)).toEqual({ x: 0, y: 0 });
  });

  it('leaves entries pushed before the call alone', () => {
    const a = point(0, 0);
    useUndoStore.getState().clear();
    expect(moveFeatures.execute({ ids: [a.id], dx: 1, dy: 0 }).ok).toBe(true);
    const before = stack()[0];

    runAsOneAIBatch(() => {
      moveFeatures.execute({ ids: [a.id], dx: 2, dy: 0 });
    });

    expect(stack()).toHaveLength(2);
    expect(aiBatchIdFromEntry(stack()[0])).toBeNull();
    expect(stack()[0].id).toBe(before.id);
  });

  it('does not overwrite a batch id a tool already set', () => {
    const a = point(0, 0);
    useUndoStore.getState().clear();

    const { batchId } = runAsOneAIBatch(() => {
      moveFeatures.execute({ ids: [a.id], dx: 1, dy: 0, aiBatchId: 'explicit' });
    });

    expect(batchId).not.toBe('explicit');
    expect(aiBatchIdFromEntry(stack()[0])).toBe('explicit');
  });

  it('honours a caller-supplied id so several calls can share one turn', () => {
    const a = point(0, 0);
    useUndoStore.getState().clear();

    runAsOneAIBatch(() => {
      moveFeatures.execute({ ids: [a.id], dx: 1, dy: 0 });
    }, 'shared-turn');
    runAsOneAIBatch(() => {
      moveFeatures.execute({ ids: [a.id], dx: 2, dy: 0 });
    }, 'shared-turn');

    expect(undoMostRecentAIBatch()).toEqual({ batchId: 'shared-turn', count: 2 });
    expect(liveXY(a.id).x).toBe(0);
  });

  it('returns the wrapped call result untouched', () => {
    const a = point(0, 0);
    const { result } = runAsOneAIBatch(() =>
      moveFeatures.execute({ ids: [a.id], dx: 3, dy: 0 }),
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.result.changed).toBe(1);
  });
});

describe('C37 — the chat path labels its tool calls', () => {
  it('wraps CALL_TOOL in runAsOneAIBatch rather than trusting the model for the id', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('lib/cad/store/ai-conversations-store.ts', 'utf8'),
    );
    const block = src.slice(src.indexOf("if (action.type === 'CALL_TOOL')"));
    const body = block.slice(0, block.indexOf('\n        if (action.type ==='));
    expect(body).toContain('runAsOneAIBatch');
    // The id must not be a model-supplied argument: an id the model can invent is an id it can
    // reuse, and two unrelated turns sharing one would make "undo that request" swallow both.
    expect(body).not.toMatch(/aiBatchId\s*:/);
  });
});
