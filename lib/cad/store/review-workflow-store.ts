'use client';
// lib/cad/store/review-workflow-store.ts
//
// Phase 7 §7 — RPLS workflow Zustand store. Wraps the pure
// state-machine helpers in `lib/cad/delivery/rpls-workflow.ts`
// with side-effects: in-memory record, error surface, and a
// thin convenience API the UI can call without importing the
// transition rules.
//
// Persisted onto `DrawingDocument.settings.reviewRecord` so
// the audit trail rides with the document file (and the
// existing autosave pipeline picks it up automatically).

import { create } from 'zustand';

import {
  appendComment,
  createDraftRecord,
  runTransition,
  type CreateRecordInputs,
  type RPLSReviewRecord,
  type RPLSWorkflowStatus,
} from '../delivery/rpls-workflow';
import { useDrawingStore } from './drawing-store';

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

  /** Replace the record. Use when restoring from a snapshot
   *  outside the normal hydration flow (e.g. import / undo). */
  loadRecord: (record: RPLSReviewRecord) => void;
  /** Hydrate from `doc.settings.reviewRecord` without writing
   *  back. Called by `DeliveryHydrator` whenever the active
   *  document id changes. */
  hydrateFromDocument: (record: RPLSReviewRecord | null) => void;
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

    loadRecord: (record) => {
      set({ record, lastError: null });
      persistRecord(record);
    },

    hydrateFromDocument: (record) =>
      set({ record, lastError: null }),

    loadOrCreate: (inputs) => {
      if (get().record) return;
      const fresh = createDraftRecord(inputs);
      set({ record: fresh, lastError: null });
      persistRecord(fresh);
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
        const next = appendComment(s.record, by, note, revisionId);
        persistRecord(next);
        return { record: next };
      }),

    reset: () => {
      set({ record: null, lastError: null });
      persistRecord(null);
    },
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
  persistRecord(result.record);
  return true;
}

function persistRecord(record: RPLSReviewRecord | null): void {
  useDrawingStore.getState().updateSettings({ reviewRecord: record });
}
