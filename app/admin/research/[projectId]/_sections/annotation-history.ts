// app/admin/research/[projectId]/_sections/annotation-history.ts — Phase B1a.
//
// ── WHY RULES, NOT A HOOK ───────────────────────────────────────────────────────────────────────
//
// The mechanical extractions have run out. Measured on 2026-08-31, the two stage blocks still
// inline in `page.tsx` reference **90 identifiers** (`review`) and **75** (`jobprep`) from the page.
// A component with a 90-prop interface moves complexity without reducing any of it.
//
// What blocks those extractions is not markup, it is STATE. The most self-contained group is this
// one: four `useState`s and four handlers that together are a single undo/redo stack.
//
// A `useAnnotationHistory` hook was written first and then DELETED unshipped. Swapping the page onto
// it meant rewriting **83 references** in a 3,278-line file with no way to run the result — and the
// hook would have been dead code until every one of them moved. Shipping an unwired hook is the
// exact defect this session spent the day fixing.
//
// So the RULES come out and the state stays. The page's four handlers now call these functions;
// nothing else about the page changes, and the logic is single-sourced and testable.
//
// ── AND IT WAS COMPLETELY UNTESTED ──────────────────────────────────────────────────────────────
//
// Undo/redo is exactly the kind of logic that looks obvious and is not: the redo stack has to clear
// on a new edit, the history has to cap without losing the newest entries, and a "silent" change
// during a drag must NOT push history or every pixel of a drag becomes an undo step. None of that
// had a test, because none of it could be reached — it was four closures inside a 3,600-line
// component.
//
// Extracted here it is ordinary functions over ordinary values, and the reducer below is exported
// so the rules can be tested without React at all.

import type { UserAnnotation } from '../../components/DrawingCanvas';

/** Capped so a long editing session cannot grow without bound. */
export const MAX_UNDO_HISTORY = 50;

export interface AnnotationHistoryState {
  annotations: UserAnnotation[];
  /** Past states, oldest first. The last entry is what `undo` returns to. */
  past: UserAnnotation[][];
  /** Undone states. Cleared by any new edit — see `commit`. */
  future: UserAnnotation[][];
  hasUnsavedChanges: boolean;
}

export const EMPTY_HISTORY: AnnotationHistoryState = {
  annotations: [],
  past: [],
  future: [],
  hasUnsavedChanges: false,
};

/**
 * A tracked edit: pushes the current state onto the undo stack and DISCARDS the redo stack.
 *
 * Discarding `future` is the part that is easy to leave out and impossible to notice by hand:
 * without it, undo → edit → redo restores a state that never followed the edit, and the drawing
 * silently gains annotations the surveyor deleted.
 */
export function commit(state: AnnotationHistoryState, next: UserAnnotation[]): AnnotationHistoryState {
  const past = [...state.past, state.annotations];
  return {
    annotations: next,
    // Trim from the FRONT. Slicing the other way would keep the fifty oldest states and throw away
    // everything recent, which is the opposite of what an undo stack is for.
    past: past.length > MAX_UNDO_HISTORY ? past.slice(-MAX_UNDO_HISTORY) : past,
    future: [],
    hasUnsavedChanges: true,
  };
}

/**
 * An untracked edit: changes the annotations without touching the stacks.
 *
 * Used while dragging or resizing. Every mouse-move during a drag calls this; if it committed,
 * one drag would become a hundred undo steps and undo would become useless.
 */
export function silentChange(state: AnnotationHistoryState, next: UserAnnotation[]): AnnotationHistoryState {
  return { ...state, annotations: next, hasUnsavedChanges: true };
}

export function undo(state: AnnotationHistoryState): AnnotationHistoryState {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  return {
    annotations: previous,
    past: state.past.slice(0, -1),
    future: [...state.future, state.annotations],
    hasUnsavedChanges: true,
  };
}

export function redo(state: AnnotationHistoryState): AnnotationHistoryState {
  if (state.future.length === 0) return state;
  const next = state.future[state.future.length - 1];
  return {
    annotations: next,
    past: [...state.past, state.annotations],
    future: state.future.slice(0, -1),
    hasUnsavedChanges: true,
  };
}

/**
 * Replace the annotations and forget the history.
 *
 * For loading a different drawing. The page did this in three separate places, each resetting the
 * two stacks by hand — and a fourth place that forgot would have let somebody undo their way into
 * the previous drawing's annotations.
 */
export function reset(annotations: UserAnnotation[]): AnnotationHistoryState {
  return { annotations, past: [], future: [], hasUnsavedChanges: false };
}
