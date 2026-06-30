// lib/cad/store/undo-store.ts — Undo/redo stack
import { create } from 'zustand';
import type { UndoEntry, UndoOperation, Feature, Layer } from '../types';
import { generateId } from '../types';
import { useDrawingStore } from './drawing-store';
import { cadLog } from '../logger';

const MAX_UNDO_STACK = 500;

interface UndoStore {
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  pushUndo: (entry: UndoEntry) => void;
  /**
   * Merge the separate ADD_FEATURE undo entries for `featureIds` into a single
   * BATCH entry, so one undo reverses them all at once. Used when a gesture
   * commits many features incrementally (e.g. a polyline drawn as per-click
   * LINE segments) but should undo as one unit. Entries not currently on the
   * stack (already undone) are ignored; a no-op when fewer than 2 match.
   */
  coalesceEntries: (featureIds: string[], description: string) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;

  canUndo: () => boolean;
  canRedo: () => boolean;
  undoDescription: () => string | null;
  redoDescription: () => string | null;
}

function applyOperations(operations: UndoOperation[], reverse: boolean) {
  const { addFeature, removeFeature, updateFeature, addLayer, removeLayer, updateLayer } =
    useDrawingStore.getState();

  const ops = reverse ? [...operations].reverse() : operations;

  for (const op of ops) {
    try {
      const data = op.data as Record<string, unknown>;
      switch (op.type) {
        case 'ADD_FEATURE':
          if (reverse) removeFeature(data.id as string);
          else addFeature(data as unknown as Feature);
          break;
        case 'REMOVE_FEATURE':
          if (reverse) addFeature(data as unknown as Feature);
          else removeFeature(data.id as string);
          break;
        case 'MODIFY_FEATURE': {
          const featureData = data as { id: string; before: Partial<Feature>; after: Partial<Feature> };
          updateFeature(featureData.id, reverse ? featureData.before : featureData.after);
          break;
        }
        case 'ADD_LAYER':
          if (reverse) removeLayer(data.id as string);
          else addLayer(data as unknown as Layer);
          break;
        case 'REMOVE_LAYER':
          if (reverse) addLayer(data as unknown as Layer);
          else removeLayer(data.id as string);
          break;
        case 'MODIFY_LAYER': {
          const layerData = data as { id: string; before: Partial<Layer>; after: Partial<Layer> };
          updateLayer(layerData.id, reverse ? layerData.before : layerData.after);
          break;
        }
        case 'BATCH': {
          const batchOps = data.operations as UndoOperation[];
          applyOperations(batchOps, reverse);
          break;
        }
        default:
          cadLog.warn('UndoStore', `Unknown undo operation type: "${op.type}"`);
      }
    } catch (err) {
      cadLog.error('UndoStore', `Failed to apply operation "${op.type}" — skipping`, err);
    }
  }
}

export const useUndoStore = create<UndoStore>((set, get) => ({
  undoStack: [],
  redoStack: [],

  pushUndo: (entry) =>
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_UNDO_STACK + 1), entry],
      redoStack: [], // New action clears redo stack
    })),

  coalesceEntries: (featureIds, description) =>
    set((state) => {
      const idSet = new Set(featureIds);
      const pulled: UndoOperation[] = [];
      const remaining: UndoEntry[] = [];
      for (const entry of state.undoStack) {
        const op = entry.operations[0];
        if (
          entry.operations.length === 1 &&
          op.type === 'ADD_FEATURE' &&
          idSet.has((op.data as Feature).id)
        ) {
          pulled.push(op);
        } else {
          remaining.push(entry);
        }
      }
      if (pulled.length < 2) return {}; // nothing meaningful to merge
      // The pulled entries were the most-recent pushes (a draw gesture is
      // uninterrupted), so appending the batch keeps it at the top of the
      // stack — one undo now reverses the whole gesture.
      return { undoStack: [...remaining, makeBatchEntry(description, pulled)] };
    }),

  undo: () => {
    const { undoStack, redoStack } = get();
    if (undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    applyOperations(entry.operations, true);
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, entry],
    });
  },

  redo: () => {
    const { undoStack, redoStack } = get();
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    applyOperations(entry.operations, false);
    set({
      undoStack: [...undoStack, entry],
      redoStack: redoStack.slice(0, -1),
    });
  },

  clear: () => set({ undoStack: [], redoStack: [] }),

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
  undoDescription: () => {
    const stack = get().undoStack;
    return stack.length > 0 ? stack[stack.length - 1].description : null;
  },
  redoDescription: () => {
    const stack = get().redoStack;
    return stack.length > 0 ? stack[stack.length - 1].description : null;
  },
}));

/** Helper: create an UndoEntry for a single ADD_FEATURE operation */
export function makeAddFeatureEntry(feature: Feature): UndoEntry {
  return {
    id: generateId(),
    description: `Add ${feature.type.toLowerCase()}`,
    timestamp: Date.now(),
    operations: [{ type: 'ADD_FEATURE', data: feature }],
  };
}

/** Helper: create an UndoEntry for a single REMOVE_FEATURE operation */
export function makeRemoveFeatureEntry(feature: Feature): UndoEntry {
  return {
    id: generateId(),
    description: `Delete ${feature.type.toLowerCase()}`,
    timestamp: Date.now(),
    operations: [{ type: 'REMOVE_FEATURE', data: feature }],
  };
}

/** Helper: create a BATCH UndoEntry for multiple operations */
export function makeBatchEntry(description: string, operations: UndoOperation[]): UndoEntry {
  return {
    id: generateId(),
    description,
    timestamp: Date.now(),
    operations: [{ type: 'BATCH', data: { operations } }],
  };
}
