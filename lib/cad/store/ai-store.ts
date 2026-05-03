'use client';
// lib/cad/store/ai-store.ts — Zustand store for the Phase 6 AI
// drawing pipeline UI. Tracks the dialog open/close state, the
// in-flight job status (idle / running / done / error), the
// latest result, and the user-facing error message.
//
// The AIDrawingDialog reads + writes this; downstream review-
// queue UI components (next slice) will consume the result +
// per-feature status.
//
// Pure client-side state. The actual pipeline call goes through
// POST /api/admin/cad/ai-pipeline.
import { create } from 'zustand';

import type { AIJobResult } from '../ai-engine/types';

export type AIPipelineStatus = 'idle' | 'running' | 'done' | 'error';

interface AIStore {
  // Dialog visibility.
  isDialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;

  // Pipeline state.
  status: AIPipelineStatus;
  /** Last successful result from the pipeline. Cleared when a
   *  new run starts; preserved across dialog close so the next
   *  slice's review queue can still render. */
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
}

export const useAIStore = create<AIStore>((set) => ({
  isDialogOpen: false,
  status: 'idle',
  result: null,
  error: null,

  openDialog: () => set({ isDialogOpen: true }),
  closeDialog: () => set({ isDialogOpen: false }),

  start: () =>
    set({ status: 'running', error: null }),
  setResult: (result) =>
    set({ status: 'done', result, error: null }),
  setError: (message) =>
    set({ status: 'error', error: message }),
  reset: () =>
    set({ status: 'idle', result: null, error: null }),
}));
