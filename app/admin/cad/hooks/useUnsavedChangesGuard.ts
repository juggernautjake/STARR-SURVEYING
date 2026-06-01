'use client';
// app/admin/cad/hooks/useUnsavedChangesGuard.ts
//
// Two layers of "you have unsaved changes" protection:
//
//  1. A native `beforeunload` listener (registered by
//     `useUnsavedChangesGuard()`) so the browser shows its own
//     "Leave site?" prompt on tab-close / refresh / address-bar
//     navigation while the drawing is dirty.
//
//  2. An in-app guard store + `UnsavedChangesModal` for programmatic
//     discard actions that the browser can't intercept (New Drawing,
//     Open / Import another file, client-side navigation away from
//     the CAD page). `requestDiscard(action)` runs `action`
//     immediately when the drawing is clean, otherwise it opens the
//     modal and lets the surveyor Save → continue, Discard → continue,
//     or Cancel.

import { useEffect, useCallback } from 'react';
import { create } from 'zustand';
import { useDrawingStore } from '@/lib/cad/store';

// ── Guard modal store ─────────────────────────────────────────────
//
// A single shared modal coordinates every discard prompt so any
// surface (MenuBar, CADLayout event handlers, the link interceptor)
// can request a guarded action without prop-drilling. The actual
// Save → continue choreography lives in `UnsavedChangesModal`.

interface UnsavedGuardState {
  /** Whether the confirm modal is showing. */
  isOpen: boolean;
  /** The action to run once the surveyor chooses to continue. */
  pending: (() => void) | null;
  /** True while a Save dispatched from the modal is in flight; the
   *  modal watches the drawing's dirty flag and runs `pending` once
   *  the save clears it. */
  awaitingSave: boolean;
  /**
   * Run `action` immediately when the drawing has no unsaved changes,
   * otherwise open the confirm modal with `action` pending.
   */
  requestDiscard: (action: () => void) => void;
  /** Begin a Save-then-continue flow (the modal dispatches the save). */
  beginSave: () => void;
  /** Run the pending action now (Don't Save) + reset. */
  proceedWithoutSaving: () => void;
  /** Close the modal without running anything (Cancel). */
  cancel: () => void;
  /** Reset all guard state (used after the pending action runs). */
  reset: () => void;
}

export const useUnsavedGuardStore = create<UnsavedGuardState>((set, get) => ({
  isOpen: false,
  pending: null,
  awaitingSave: false,

  requestDiscard: (action) => {
    if (!useDrawingStore.getState().isDirty) {
      action();
      return;
    }
    set({ isOpen: true, pending: action, awaitingSave: false });
  },

  // Hide the confirm UI but keep `pending` alive while the save runs;
  // the modal's watcher resumes `pending` once the save clears the
  // dirty flag (so a first-time Save dialog isn't stacked on top).
  beginSave: () => set({ isOpen: false, awaitingSave: true }),

  proceedWithoutSaving: () => {
    const { pending } = get();
    set({ isOpen: false, pending: null, awaitingSave: false });
    pending?.();
  },

  cancel: () => set({ isOpen: false, pending: null, awaitingSave: false }),

  reset: () => set({ isOpen: false, pending: null, awaitingSave: false }),
}));

/**
 * Convenience accessor for non-React call sites (event handlers, the
 * link interceptor). Runs `action` immediately when clean, else opens
 * the guard modal.
 */
export function requestDiscard(action: () => void) {
  useUnsavedGuardStore.getState().requestDiscard(action);
}

/**
 * Registers the native `beforeunload` guard whenever the drawing has
 * unsaved changes, and returns a `guard(action)` helper kept for
 * backward compatibility (now delegates to the shared modal store).
 */
export function useUnsavedChangesGuard() {
  const isDirty = useDrawingStore((s) => s.isDirty);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Leave anyway?';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const guard = useCallback((action: () => void) => {
    useUnsavedGuardStore.getState().requestDiscard(action);
  }, []);

  return { guard, isDirty, requestDiscard };
}
