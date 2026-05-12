// lib/cad/ai/undo-batch.ts
//
// Phase 6 §32.10 — per-AI-action undo helpers.
//
// Every tool-registry call that stamps provenance writes an
// `aiBatchId` onto the resulting feature's properties. A single
// AI turn (one AUTO run, one COPILOT acceptance loop, one
// COMMAND task) shares one batchId across every feature it
// produces. These helpers walk the undo stack to find / pop
// a whole batch at a time — so the surveyor can rip out the
// 47 features Claude just dropped with one click instead of
// 47 Ctrl+Z taps.

import { useUndoStore } from '../store';
import type { UndoEntry, UndoOperation, Feature } from '../types';

/**
 * Extract the AI batch id from the first feature-producing op
 * in an undo entry. Looks through top-level ADD_FEATURE ops
 * and one level of BATCH-wrapped ops. Returns null when the
 * entry isn't an AI write (manual draw, layer-only edits,
 * existing legacy entries…).
 */
export function aiBatchIdFromEntry(entry: UndoEntry): string | null {
  return readFromOps(entry.operations);
}

function readFromOps(ops: UndoOperation[]): string | null {
  for (const op of ops) {
    if (op.type === 'ADD_FEATURE') {
      const f = op.data as Feature;
      const id = f.properties?.aiBatchId;
      if (typeof id === 'string' && id.length > 0) return id;
    } else if (op.type === 'BATCH') {
      const inner =
        (op.data as { operations?: UndoOperation[] }).operations ?? [];
      const nested = readFromOps(inner);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Walk the undo stack from the top and find the topmost
 * contiguous run of entries that share an `aiBatchId`. Returns
 * the id + how many entries match, or null when the top entry
 * isn't part of an AI batch (so the undo button keeps its
 * normal per-entry behaviour).
 *
 * Contiguity matters because undo is stack-based — popping
 * non-adjacent entries would corrupt subsequent undos.
 */
export function findMostRecentAIBatch(): {
  batchId: string;
  count: number;
} | null {
  const stack = useUndoStore.getState().undoStack;
  if (stack.length === 0) return null;
  const top = stack[stack.length - 1];
  const topId = aiBatchIdFromEntry(top);
  if (topId === null) return null;
  let count = 1;
  for (let i = stack.length - 2; i >= 0; i--) {
    if (aiBatchIdFromEntry(stack[i]) === topId) count++;
    else break;
  }
  return { batchId: topId, count };
}

/**
 * Pop the most recent AI batch off the undo stack. Returns
 * the (batchId, count) that was popped, or null when there
 * was nothing to pop (top entry isn't AI). Every popped entry
 * lands on the redo stack so `useUndoStore.redo()` can re-
 * apply them one at a time.
 */
export function undoMostRecentAIBatch(): {
  batchId: string;
  count: number;
} | null {
  const found = findMostRecentAIBatch();
  if (!found) return null;
  const undo = useUndoStore.getState().undo;
  for (let i = 0; i < found.count; i++) {
    undo();
  }
  return found;
}
