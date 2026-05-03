'use client';
// lib/cad/store/ai-store.ts — Zustand store for the Phase 6 AI
// drawing pipeline UI. Tracks the dialog open/close state, the
// in-flight job status (idle / running / done / error), the
// latest result, and the user-facing error message.
//
// The AIDrawingDialog reads + writes this; the ReviewQueuePanel
// (Phase 6 UI slice 2) consumes the result + per-item status.
// Per-item updates land back in the same `result.reviewQueue`
// shape so a reload of the panel renders consistently.
//
// Pure client-side state. The actual pipeline call goes through
// POST /api/admin/cad/ai-pipeline.
import { create } from 'zustand';

import type {
  AIJobResult,
  ReviewItem,
  ReviewItemStatus,
} from '../ai-engine/types';

export type AIPipelineStatus = 'idle' | 'running' | 'done' | 'error';

interface AIStore {
  // Dialog visibility.
  isDialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;

  // Review queue panel visibility (Phase 6 UI slice 2).
  isQueuePanelOpen: boolean;
  openQueuePanel: () => void;
  closeQueuePanel: () => void;
  toggleQueuePanel: () => void;

  // Pipeline state.
  status: AIPipelineStatus;
  /** Last successful result from the pipeline. Cleared when a
   *  new run starts; preserved across dialog close so the
   *  review queue can still render. */
  result: AIJobResult | null;
  /** User-facing error message when status === 'error'. */
  error: string | null;

  /** Set when /api/admin/cad/ai-pipeline returns. */
  setResult: (result: AIJobResult) => void;
  /** Mark the run as failed. Pass a friendly message. */
  setError: (message: string) => void;
  /** Reset to idle. Used by the dialog before re-running and
   *  when the user dismisses the result. */
  reset: () => void;
  /** Mark the run as in-flight. */
  start: () => void;

  /** Mutate one review item's status (Accept / Modify / Reject /
   *  Pending). No-ops when no result is loaded or the item id
   *  isn't found. Updates the summary counters in lock-step. */
  setItemStatus: (
    itemId: string,
    status: ReviewItemStatus,
    userNote?: string | null
  ) => void;
}

export const useAIStore = create<AIStore>((set) => ({
  isDialogOpen: false,
  isQueuePanelOpen: false,
  status: 'idle',
  result: null,
  error: null,

  openDialog: () => set({ isDialogOpen: true }),
  closeDialog: () => set({ isDialogOpen: false }),

  openQueuePanel: () => set({ isQueuePanelOpen: true }),
  closeQueuePanel: () => set({ isQueuePanelOpen: false }),
  toggleQueuePanel: () =>
    set((s) => ({ isQueuePanelOpen: !s.isQueuePanelOpen })),

  start: () => set({ status: 'running', error: null }),
  setResult: (result) =>
    set({
      status: 'done',
      result,
      error: null,
      // Auto-open the review panel on first successful result
      // so the surveyor sees what the pipeline produced.
      isQueuePanelOpen: true,
    }),
  setError: (message) => set({ status: 'error', error: message }),
  reset: () => set({ status: 'idle', result: null, error: null }),

  setItemStatus: (itemId, nextStatus, userNote = null) =>
    set((state) => {
      if (!state.result) return state;
      const queue = state.result.reviewQueue;

      let foundItem: ReviewItem | null = null;
      let foundTier: 1 | 2 | 3 | 4 | 5 | null = null;
      for (const tier of [5, 4, 3, 2, 1] as const) {
        const list = queue.tiers[tier];
        const ix = list.findIndex((i) => i.id === itemId);
        if (ix !== -1) {
          foundItem = list[ix];
          foundTier = tier;
          break;
        }
      }
      if (!foundItem || foundTier === null) return state;

      const prevStatus = foundItem.status;
      const updatedItem: ReviewItem = {
        ...foundItem,
        status: nextStatus,
        userNote,
      };

      const tierList = queue.tiers[foundTier].map((i) =>
        i.id === itemId ? updatedItem : i
      );

      // Recompute summary counters by walking the whole queue —
      // cheap (single-digit hundreds at most) and bulletproof
      // against bookkeeping drift if multiple writers race.
      const summary = {
        totalElements: 0,
        acceptedCount: 0,
        modifiedCount: 0,
        rejectedCount: 0,
        pendingCount: 0,
      };
      const tiersOut = { ...queue.tiers, [foundTier]: tierList };
      for (const tier of [5, 4, 3, 2, 1] as const) {
        for (const it of tiersOut[tier]) {
          summary.totalElements += 1;
          if (it.status === 'ACCEPTED') summary.acceptedCount += 1;
          else if (it.status === 'MODIFIED') summary.modifiedCount += 1;
          else if (it.status === 'REJECTED') summary.rejectedCount += 1;
          else summary.pendingCount += 1;
        }
      }
      // Reference prevStatus so future telemetry can fire here
      // (e.g. "user reversed an accepted decision"); silenced
      // for the v1 noop.
      void prevStatus;

      return {
        result: {
          ...state.result,
          reviewQueue: { tiers: tiersOut, summary },
        },
      };
    }),
}));
