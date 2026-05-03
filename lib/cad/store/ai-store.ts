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
  ClarifyingQuestion,
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

  // §28.4 clarifying-question dialog visibility. Auto-opened
  // by `setResult` when deliberation flagged shouldShowDialog;
  // manual open/close lets the user re-visit it.
  isQuestionDialogOpen: boolean;
  openQuestionDialog: () => void;
  closeQuestionDialog: () => void;

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

  /** §28.4 — record the user's answer to a clarifying question.
   *  Answers stay in the result object so a subsequent re-run
   *  can fold them back into the pipeline payload. */
  setQuestionAnswer: (questionId: string, answer: string) => void;
  /** §28.4 — mark a question skipped (only optional questions
   *  honor this; BLOCKING questions ignore the call). */
  setQuestionSkipped: (questionId: string, skipped: boolean) => void;
  /** §28.4 — bulk-skip every non-blocking question. */
  skipAllOptionalQuestions: () => void;
}

export const useAIStore = create<AIStore>((set) => ({
  isDialogOpen: false,
  isQueuePanelOpen: false,
  isQuestionDialogOpen: false,
  status: 'idle',
  result: null,
  error: null,

  openDialog: () => set({ isDialogOpen: true }),
  closeDialog: () => set({ isDialogOpen: false }),

  openQueuePanel: () => set({ isQueuePanelOpen: true }),
  closeQueuePanel: () => set({ isQueuePanelOpen: false }),
  toggleQueuePanel: () =>
    set((s) => ({ isQueuePanelOpen: !s.isQueuePanelOpen })),

  openQuestionDialog: () => set({ isQuestionDialogOpen: true }),
  closeQuestionDialog: () => set({ isQuestionDialogOpen: false }),

  start: () => set({ status: 'running', error: null }),
  setResult: (result) =>
    set({
      status: 'done',
      result,
      error: null,
      // Auto-open the review panel on first successful result
      // so the surveyor sees what the pipeline produced.
      isQueuePanelOpen: true,
      // §28.1 short-circuit: only pop the question dialog when
      // deliberation actually wants the user to answer something.
      isQuestionDialogOpen:
        result.deliberationResult?.shouldShowDialog ?? false,
    }),
  setError: (message) => set({ status: 'error', error: message }),
  reset: () =>
    set({
      status: 'idle',
      result: null,
      error: null,
      isQuestionDialogOpen: false,
    }),

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

  setQuestionAnswer: (questionId, answer) =>
    set((state) =>
      mutateQuestion(state, questionId, (q) => ({
        ...q,
        userAnswer: answer,
        skipped: false,
      }))
    ),

  setQuestionSkipped: (questionId, skipped) =>
    set((state) =>
      mutateQuestion(state, questionId, (q) =>
        // Blocking questions cannot be skipped per §28.4.
        q.priority === 'BLOCKING' && skipped ? q : { ...q, skipped }
      )
    ),

  skipAllOptionalQuestions: () =>
    set((state) => {
      if (!state.result?.deliberationResult) return state;
      const deliberation = state.result.deliberationResult;
      const questions = deliberation.questions.map((q) =>
        q.priority === 'BLOCKING' || q.userAnswer !== null
          ? q
          : { ...q, skipped: true }
      );
      return rebuildDeliberation(state, questions);
    }),
}));

// ────────────────────────────────────────────────────────────
// Helpers — keep `set` callbacks readable
// ────────────────────────────────────────────────────────────

function mutateQuestion(
  state: AIStore,
  questionId: string,
  mutate: (q: ClarifyingQuestion) => ClarifyingQuestion
): Partial<AIStore> {
  if (!state.result?.deliberationResult) return state;
  const deliberation = state.result.deliberationResult;
  let touched = false;
  const questions = deliberation.questions.map((q) => {
    if (q.id !== questionId) return q;
    touched = true;
    return mutate(q);
  });
  if (!touched) return state;
  return rebuildDeliberation(state, questions);
}

function rebuildDeliberation(
  state: AIStore,
  questions: ClarifyingQuestion[]
): Partial<AIStore> {
  if (!state.result?.deliberationResult) return state;
  const deliberation = state.result.deliberationResult;
  const blocking = questions.filter((q) => q.priority === 'BLOCKING');
  const optional = questions.filter((q) => q.priority !== 'BLOCKING');
  return {
    result: {
      ...state.result,
      deliberationResult: {
        ...deliberation,
        questions,
        blockingQuestions: blocking,
        optionalQuestions: optional,
      },
    },
  };
}
