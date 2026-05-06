'use client';
// lib/cad/store/review-workflow-store.ts
//
// Phase 7 §7 — RPLS workflow Zustand store. Wraps the pure
// state-machine helpers in `lib/cad/delivery/rpls-workflow.ts`
// with side-effects: in-memory record, error surface, and a
// thin convenience API the UI can call without importing the
// transition rules.
//
// Persistence to `DrawingDocument.settings` lands in a
// follow-up slice (it requires bumping the document schema +
// migration). For now the record lives only in-memory across
// the session, which is enough to wire the Mark Ready /
// RPLS Review Mode UIs.

import { create } from 'zustand';

import {
  appendComment,
  createDraftRecord,
  runTransition,
  type CreateRecordInputs,
  type RPLSReviewRecord,
  type RPLSWorkflowStatus,
} from '../delivery/rpls-workflow';

interface TransitionArgs {
  by:        string;
  note?:     string | null;
  revisionId?: string;
}

interface ReviewWorkflowStore {
  /** Active record. Null until `loadOrCreate` is called. */
  record: RPLSReviewRecord | null;
  /** Most recent transition error. Cleared on success. */
  lastError: string | null;

  /** Replace the record (used when persistence lands and we
   *  hydrate from `DrawingDocument.settings`). */
  loadRecord: (record: RPLSReviewRecord) => void;
  /** Initialize a fresh DRAFT record for the given job /
   *  RPLS pair when no record exists yet. No-op when a record
   *  is already loaded — that path goes through `loadRecord`. */
  loadOrCreate: (inputs: CreateRecordInputs) => void;

  // Transitions — each runs the state machine + records the
  // event. Returns true on success, false on transition error.
  markReadyForReview: (args: TransitionArgs) => boolean;
  openForReview:      (args: TransitionArgs) => boolean;
  requestChanges:     (args: TransitionArgs) => boolean;
  approve:            (args: TransitionArgs) => boolean;
  seal:               (args: TransitionArgs) => boolean;
  deliver:            (args: TransitionArgs) => boolean;
  /** Bring the workflow back to DRAFT — used by "withdraw"
   *  flows when an RPLS hasn't yet opened a submission. */
  resetToDraft:       (args: TransitionArgs) => boolean;

  /** Append a free-form RPLS comment without changing status. */
  addComment:         (args: { by: string; note: string; revisionId?: string }) => void;

  /** Drop the record (used after Deliver completes + the job
   *  archive lands; mostly for tests today). */
  reset: () => void;
}

export const useReviewWorkflowStore = create<ReviewWorkflowStore>(
  (set, get) => ({
    record: null,
    lastError: null,

    loadRecord: (record) => set({ record, lastError: null }),

    loadOrCreate: (inputs) => {
      if (get().record) return;
      set({ record: createDraftRecord(inputs), lastError: null });
    },

    markReadyForReview: (args) => transition('READY_FOR_REVIEW', args, set, get),
    openForReview:      (args) => transition('IN_REVIEW', args, set, get),
    requestChanges:     (args) => transition('CHANGES_REQUESTED', args, set, get),
    approve:            (args) => transition('APPROVED', args, set, get),
    seal:               (args) => transition('SEALED', args, set, get),
    deliver:            (args) => transition('DELIVERED', args, set, get),
    resetToDraft:       (args) => transition('DRAFT', args, set, get),

    addComment: ({ by, note, revisionId }) =>
      set((s) => {
        if (!s.record) return s;
        return {
          record: appendComment(s.record, by, note, revisionId),
        };
      }),

    reset: () => set({ record: null, lastError: null }),
  })
);

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

type SetFn = (
  partial:
    | Partial<ReviewWorkflowStore>
    | ((state: ReviewWorkflowStore) => Partial<ReviewWorkflowStore>)
) => void;
type GetFn = () => ReviewWorkflowStore;

function transition(
  to: RPLSWorkflowStatus,
  args: TransitionArgs,
  set: SetFn,
  get: GetFn
): boolean {
  const { record } = get();
  if (!record) {
    set({ lastError: 'No active review record loaded.' });
    return false;
  }
  const result = runTransition(record, {
    to,
    by: args.by,
    note: args.note ?? null,
    ...(args.revisionId ? { revisionId: args.revisionId } : {}),
  });
  if (!result.ok) {
    set({ lastError: result.reason });
    return false;
  }
  set({ record: result.record, lastError: null });
  return true;
}
