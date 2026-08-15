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

// Imported from the module rather than the `../store` barrel on purpose: the barrel re-exports
// `ai-conversations-store`, which now imports this file, and routing through it would make that a
// cycle. Same singleton either way.
import { useUndoStore } from '../store/undo-store';
import type { UndoEntry, UndoOperation, Feature } from '../types';
import { generateId } from '../types';

/**
 * C37 — run `fn` and label every undo entry it pushes with one shared `aiBatchId`, so the whole
 * AI turn reverses in one press. Returns whatever `fn` returned; the batch id comes back too for
 * callers that want to report it.
 *
 * This wraps the CALL sites rather than threading an id through all 25 tools' arguments, and the
 * difference matters: a tool added tomorrow is covered by having been called from here, where the
 * threaded version would be one more place to forget. The five modify tools still accept an
 * explicit `aiBatchId` for callers that drive them directly (a proposer applying a plan), and this
 * only stamps entries that do not already carry one, so the two compose instead of fighting.
 */
export function runAsOneAIBatch<T>(fn: () => T, batchId?: string): { batchId: string; result: T } {
  const id = batchId && batchId.length > 0 ? batchId : generateId();
  const stackBefore = useUndoStore.getState().undoStack;
  // Two independent stops for the backwards walk. The marker is the precise one; the timestamp
  // bounds the damage if the marker fell off the far end of a full 500-entry stack mid-call, where
  // walking to the bottom would label the surveyor's entire session as this one AI request.
  const marker = stackBefore.length > 0 ? stackBefore[stackBefore.length - 1].id : null;
  const startedAt = Date.now();
  const result = fn();
  useUndoStore.setState((state) => {
    const next = state.undoStack.slice();
    let changed = false;
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].id === marker || next[i].timestamp < startedAt) break;
      if (!next[i].aiBatchId) {
        next[i] = { ...next[i], aiBatchId: id };
        changed = true;
      }
    }
    return changed ? { undoStack: next } : {};
  });
  return { batchId: id, result };
}

/**
 * Extract the AI batch id from the first feature-producing op
 * in an undo entry. Looks through top-level ADD_FEATURE ops
 * and one level of BATCH-wrapped ops. Returns null when the
 * entry isn't an AI write (manual draw, layer-only edits,
 * existing legacy entries…).
 */
export function aiBatchIdFromEntry(entry: UndoEntry): string | null {
  // C37 — the entry's own id wins.
  //
  // The feature scan below only ever sees `ADD_FEATURE` ops, so it is blind to every tool that
  // MODIFIES or REMOVES: C35's move/rotate/scale/mirror push `MODIFY_FEATURE` batches and delete
  // pushes `REMOVE_FEATURE`. An AI request that moved forty features produced an undo entry this
  // function returned null for, and the "undo the whole AI turn" walk stopped dead at it — one
  // step short, with thirty-nine of the forty still moved.
  //
  // The scan is kept as a fallback so entries written before C37, and any caller that stamps only
  // the feature, keep working.
  if (typeof entry.aiBatchId === 'string' && entry.aiBatchId.length > 0) return entry.aiBatchId;
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
