import { describe, it, expect, beforeEach } from 'vitest';
import { useUndoStore, makeAddFeatureEntry } from '@/lib/cad/store/undo-store';
import type { Feature, UndoOperation } from '@/lib/cad/types';

// Minimal feature stub — coalesceEntries only reads `id`, makeAddFeatureEntry
// only also reads `type` for its description.
const feat = (id: string): Feature => ({ id, type: 'LINE' } as unknown as Feature);

function batchOps(entry: { operations: UndoOperation[] }): UndoOperation[] {
  const op = entry.operations[0];
  return (op.data as { operations: UndoOperation[] }).operations;
}

describe('undoStore.coalesceEntries', () => {
  beforeEach(() => useUndoStore.getState().clear());

  it('merges several ADD_FEATURE entries into one BATCH at the top', () => {
    const s = useUndoStore.getState();
    s.pushUndo(makeAddFeatureEntry(feat('a')));
    s.pushUndo(makeAddFeatureEntry(feat('b')));
    s.pushUndo(makeAddFeatureEntry(feat('c')));
    expect(useUndoStore.getState().undoStack).toHaveLength(3);

    useUndoStore.getState().coalesceEntries(['a', 'b', 'c'], 'Draw polyline');

    const stack = useUndoStore.getState().undoStack;
    expect(stack).toHaveLength(1);
    expect(stack[0].description).toBe('Draw polyline');
    expect(stack[0].operations[0].type).toBe('BATCH');
    // All three ADD ops preserved, in order.
    const ops = batchOps(stack[0]);
    expect(ops.map((o) => (o.data as Feature).id)).toEqual(['a', 'b', 'c']);
  });

  it('only merges matching ids and leaves unrelated entries in place', () => {
    const s = useUndoStore.getState();
    s.pushUndo(makeAddFeatureEntry(feat('a')));
    s.pushUndo(makeAddFeatureEntry(feat('x'))); // unrelated
    s.pushUndo(makeAddFeatureEntry(feat('b')));

    useUndoStore.getState().coalesceEntries(['a', 'b'], 'Draw polyline');

    const stack = useUndoStore.getState().undoStack;
    expect(stack).toHaveLength(2);
    // Unrelated entry stays first; the merged batch is appended on top.
    expect((stack[0].operations[0].data as Feature).id).toBe('x');
    expect(stack[1].operations[0].type).toBe('BATCH');
    expect(batchOps(stack[1]).map((o) => (o.data as Feature).id)).toEqual(['a', 'b']);
  });

  it('is a no-op when fewer than two entries match', () => {
    const s = useUndoStore.getState();
    s.pushUndo(makeAddFeatureEntry(feat('a')));
    useUndoStore.getState().coalesceEntries(['a'], 'Draw polyline');
    const stack = useUndoStore.getState().undoStack;
    expect(stack).toHaveLength(1);
    // Untouched — still the original single ADD entry, not a batch.
    expect(stack[0].operations[0].type).toBe('ADD_FEATURE');
  });
});

describe('undoStore.dropAddEntry', () => {
  beforeEach(() => useUndoStore.getState().clear());

  it('removes the matching ADD entry from the stack without touching redo', () => {
    const s = useUndoStore.getState();
    s.pushUndo(makeAddFeatureEntry(feat('a')));
    s.pushUndo(makeAddFeatureEntry(feat('b')));

    useUndoStore.getState().dropAddEntry('b');

    const st = useUndoStore.getState();
    expect(st.undoStack).toHaveLength(1);
    expect((st.undoStack[0].operations[0].data as Feature).id).toBe('a');
    expect(st.redoStack).toHaveLength(0); // not redoable — fully discarded
  });

  it('is a no-op when no entry matches', () => {
    const s = useUndoStore.getState();
    s.pushUndo(makeAddFeatureEntry(feat('a')));
    useUndoStore.getState().dropAddEntry('zzz');
    expect(useUndoStore.getState().undoStack).toHaveLength(1);
  });
});
