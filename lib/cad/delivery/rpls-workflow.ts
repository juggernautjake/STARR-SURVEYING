// lib/cad/delivery/rpls-workflow.ts
//
// Phase 7 §7 — RPLS review workflow state machine.
//
// Pure data + pure transitions. The Zustand store in
// `lib/cad/store/review-workflow-store.ts` wraps these helpers
// and adds the side-effects (event logging, persistence). Keep
// the rules here so the same machine is reusable from the
// server side once we wire delivery emails / job-status feeds.
//
// Status flow:
//
//   DRAFT ──► READY_FOR_REVIEW ──► IN_REVIEW ──► CHANGES_REQUESTED
//                                       │              │
//                                       │              └─► READY_FOR_REVIEW
//                                       │
//                                       └─► APPROVED ──► SEALED ──► DELIVERED
//
// The RPLS may also reject outright from IN_REVIEW (back to
// CHANGES_REQUESTED with a note). Re-submitting after changes
// resets the cycle without losing prior history.
//
// Pure: no I/O, no Zustand. Returns frozen-ish records (not
// literally `Object.freeze`; we just never mutate the input).

export type RPLSWorkflowStatus =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'IN_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'SEALED'
  | 'DELIVERED';

export type RPLSReviewEventType =
  | 'SUBMITTED'
  | 'OPENED'
  | 'COMMENTED'
  | 'CHANGES_REQUESTED'
  | 'RESUBMITTED'
  | 'APPROVED'
  | 'SEALED'
  | 'DELIVERED';

export interface RPLSReviewEvent {
  /** ISO 8601 timestamp the event was recorded. */
  at:        string;
  event:     RPLSReviewEventType;
  /** Display name of the actor (RPLS or party). */
  by:        string;
  note:      string | null;
  /** Set when the event corresponds to a specific revision
   *  (e.g. CHANGES_REQUESTED → revisionId points at the
   *  document version the RPLS was reviewing). */
  revisionId?: string;
}

export interface RPLSReviewRecord {
  jobId:         string;
  status:        RPLSWorkflowStatus;
  /** ISO 8601 timestamp of the most recent submission. Null
   *  while the job has never been submitted. */
  submittedAt:   string | null;
  rplsId:        string;
  rplsName:      string;
  rplsLicense:   string;
  reviewHistory: RPLSReviewEvent[];
}

// ────────────────────────────────────────────────────────────
// Transitions
// ────────────────────────────────────────────────────────────

const ALLOWED_NEXT: Record<RPLSWorkflowStatus, RPLSWorkflowStatus[]> = {
  DRAFT: ['READY_FOR_REVIEW'],
  READY_FOR_REVIEW: ['IN_REVIEW', 'DRAFT'],
  IN_REVIEW: ['CHANGES_REQUESTED', 'APPROVED'],
  CHANGES_REQUESTED: ['READY_FOR_REVIEW', 'DRAFT'],
  APPROVED: ['SEALED', 'CHANGES_REQUESTED'],
  SEALED: ['DELIVERED'],
  DELIVERED: [],
};

/** True when the machine permits `from → to`. */
export function canTransition(
  from: RPLSWorkflowStatus,
  to: RPLSWorkflowStatus
): boolean {
  return ALLOWED_NEXT[from]?.includes(to) ?? false;
}

/** Map a transition to the canonical event type the new
 *  history row should carry. Returns null when no transition
 *  fires (caller should reject before calling). */
export function transitionEvent(
  from: RPLSWorkflowStatus,
  to: RPLSWorkflowStatus
): RPLSReviewEventType | null {
  if (from === 'DRAFT' && to === 'READY_FOR_REVIEW') return 'SUBMITTED';
  if (from === 'CHANGES_REQUESTED' && to === 'READY_FOR_REVIEW')
    return 'RESUBMITTED';
  if (to === 'IN_REVIEW') return 'OPENED';
  if (to === 'CHANGES_REQUESTED') return 'CHANGES_REQUESTED';
  if (to === 'APPROVED') return 'APPROVED';
  if (to === 'SEALED') return 'SEALED';
  if (to === 'DELIVERED') return 'DELIVERED';
  return null;
}

export interface TransitionInputs {
  to:         RPLSWorkflowStatus;
  by:         string;
  note?:      string | null;
  revisionId?: string;
}

export interface TransitionResult {
  ok:      true;
  record:  RPLSReviewRecord;
  event:   RPLSReviewEvent;
}

export interface TransitionError {
  ok:      false;
  reason:  string;
}

/**
 * Run a transition against an existing record. Returns either
 * the new record + the appended event, or a structured error.
 * Never mutates the input.
 */
export function runTransition(
  record: RPLSReviewRecord,
  inputs: TransitionInputs
): TransitionResult | TransitionError {
  if (!canTransition(record.status, inputs.to)) {
    return {
      ok: false,
      reason: `Cannot transition from ${record.status} to ${inputs.to}.`,
    };
  }
  const eventType = transitionEvent(record.status, inputs.to);
  if (!eventType) {
    return {
      ok: false,
      reason:
        `No event mapping for transition ${record.status} → ${inputs.to}.`,
    };
  }
  const event: RPLSReviewEvent = {
    at: new Date().toISOString(),
    event: eventType,
    by: inputs.by,
    note: inputs.note ?? null,
    ...(inputs.revisionId ? { revisionId: inputs.revisionId } : {}),
  };
  const submittedAt =
    eventType === 'SUBMITTED' || eventType === 'RESUBMITTED'
      ? event.at
      : record.submittedAt;
  return {
    ok: true,
    record: {
      ...record,
      status: inputs.to,
      submittedAt,
      reviewHistory: [...record.reviewHistory, event],
    },
    event,
  };
}

/**
 * Append a non-transition event (e.g. a free-form RPLS comment
 * during IN_REVIEW). Doesn't change status. Useful so the
 * UI can stamp every comment into the audit trail.
 */
export function appendComment(
  record: RPLSReviewRecord,
  by: string,
  note: string,
  revisionId?: string
): RPLSReviewRecord {
  const event: RPLSReviewEvent = {
    at: new Date().toISOString(),
    event: 'COMMENTED',
    by,
    note,
    ...(revisionId ? { revisionId } : {}),
  };
  return {
    ...record,
    reviewHistory: [...record.reviewHistory, event],
  };
}

// ────────────────────────────────────────────────────────────
// Factory
// ────────────────────────────────────────────────────────────

export interface CreateRecordInputs {
  jobId:        string;
  rplsId:       string;
  rplsName:     string;
  rplsLicense:  string;
}

/** Build a fresh DRAFT record. */
export function createDraftRecord(
  inputs: CreateRecordInputs
): RPLSReviewRecord {
  return {
    jobId: inputs.jobId,
    status: 'DRAFT',
    submittedAt: null,
    rplsId: inputs.rplsId,
    rplsName: inputs.rplsName,
    rplsLicense: inputs.rplsLicense,
    reviewHistory: [],
  };
}
