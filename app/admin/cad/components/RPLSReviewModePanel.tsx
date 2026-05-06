'use client';
// app/admin/cad/components/RPLSReviewModePanel.tsx
//
// Phase 7 §7.3 — RPLS Review Mode panel. Slides in from the
// right whenever the workflow record is loaded; the body
// switches between four modes based on `record.status`:
//
//   DRAFT             → "not yet submitted" empty-state.
//   READY_FOR_REVIEW  → audit trail + "Open for Review" CTA
//                       that flips the status to IN_REVIEW
//                       (proxy for "the RPLS has clicked into
//                       the drawing"; real auth-aware open
//                       lands when we wire NextAuth context).
//   IN_REVIEW         → audit trail + comment input + the
//                       three action buttons (Request Changes,
//                       Approve, Approve & Seal).
//   APPROVED / SEALED / DELIVERED / CHANGES_REQUESTED → audit
//                       trail in read-only mode + a status
//                       summary strip.
//
// The seal engine + drawing-hash computation (§8) hasn't
// landed yet; "Approve & Seal" runs the APPROVED transition,
// surfaces a toast-style note in the panel saying the seal
// step is pending, and stops short of running the SEALED
// transition. The store transition is wired so once §8 lands
// the same button can flip straight through.

import { useMemo, useState } from 'react';

import {
  useDeliveryStore,
  useDrawingStore,
  useReviewWorkflowStore,
} from '@/lib/cad/store';
import {
  applySeal,
  buildSealData,
  type RPLSReviewEvent,
  type RPLSWorkflowStatus,
} from '@/lib/cad/delivery';

import SealImageUploader from './SealImageUploader';

interface Props {
  open: boolean;
  onClose: () => void;
}

const STATUS_META: Record<
  RPLSWorkflowStatus,
  { label: string; bg: string; fg: string; description: string }
> = {
  DRAFT: {
    label: 'Draft',
    bg: '#F1F5F9',
    fg: '#475569',
    description: 'Drawing has not been submitted for RPLS review yet.',
  },
  READY_FOR_REVIEW: {
    label: 'Ready for Review',
    bg: '#FEF3C7',
    fg: '#78350F',
    description:
      'Submission landed. Waiting for the RPLS to open the drawing.',
  },
  IN_REVIEW: {
    label: 'In Review',
    bg: '#DBEAFE',
    fg: '#1E3A8A',
    description: 'The RPLS is reviewing the drawing.',
  },
  CHANGES_REQUESTED: {
    label: 'Changes Requested',
    bg: '#FEE2E2',
    fg: '#7F1D1D',
    description:
      'The RPLS sent the drawing back with comments. Address and re-submit.',
  },
  APPROVED: {
    label: 'Approved',
    bg: '#DCFCE7',
    fg: '#166534',
    description:
      'The RPLS approved the drawing. Run the seal step to finalize.',
  },
  SEALED: {
    label: 'Sealed',
    bg: '#E0F2FE',
    fg: '#075985',
    description:
      'Seal applied. Drawing is locked pending delivery to the client.',
  },
  DELIVERED: {
    label: 'Delivered',
    bg: '#E0E7FF',
    fg: '#3730A3',
    description: 'Drawing has been delivered to the client.',
  },
};

const EVENT_LABEL: Record<RPLSReviewEvent['event'], string> = {
  SUBMITTED: 'Submitted for review',
  RESUBMITTED: 'Re-submitted after changes',
  OPENED: 'Opened by RPLS',
  COMMENTED: 'Comment',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  SEALED: 'Sealed',
  DELIVERED: 'Delivered',
};

export default function RPLSReviewModePanel({ open, onClose }: Props) {
  const document = useDrawingStore((s) => s.document);
  const loadDocument = useDrawingStore((s) => s.loadDocument);
  const review = useReviewWorkflowStore();
  const [comment, setComment] = useState('');
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const [sealing, setSealing] = useState(false);

  const tb = document.settings.titleBlock;
  const actor = useMemo(
    () =>
      tb.surveyorName?.trim() ||
      document.author?.trim() ||
      'Surveyor',
    [tb.surveyorName, document.author]
  );

  if (!open) return null;
  const record = review.record;
  if (!record) {
    return (
      <aside style={styles.panel} role="dialog" aria-label="RPLS review mode">
        <header style={styles.header}>
          <h2 style={styles.title}>RPLS Review Mode</h2>
          <button
            type="button"
            onClick={onClose}
            style={styles.close}
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div style={styles.empty}>
          <p>No review record yet. Submit the drawing for RPLS review first.</p>
        </div>
      </aside>
    );
  }

  const meta = STATUS_META[record.status];
  const isReadyForOpen = record.status === 'READY_FOR_REVIEW';
  const isInReview = record.status === 'IN_REVIEW';
  const isApproved = record.status === 'APPROVED';
  const isTerminal = record.status === 'DELIVERED';

  function clearAcks() {
    setPendingError(null);
    setPendingNote(null);
  }

  function runOpenForReview() {
    clearAcks();
    const ok = review.openForReview({ by: actor });
    if (!ok) setPendingError(review.lastError ?? 'Could not open for review.');
  }

  function runRequestChanges() {
    clearAcks();
    const trimmed = comment.trim();
    if (trimmed.length === 0) {
      setPendingError(
        'Add a comment describing the requested changes before sending back.'
      );
      return;
    }
    const ok = review.requestChanges({ by: actor, note: trimmed });
    if (ok) {
      setComment('');
      setPendingNote('Drawing returned with changes requested.');
    } else {
      setPendingError(review.lastError ?? 'Transition failed.');
    }
  }

  function runApprove() {
    clearAcks();
    const trimmed = comment.trim();
    const ok = review.approve({
      by: actor,
      note: trimmed.length > 0 ? trimmed : null,
    });
    if (ok) {
      setComment('');
      setPendingNote('Drawing approved. Run the seal step to finalize.');
    } else {
      setPendingError(review.lastError ?? 'Transition failed.');
    }
  }

  async function runApproveAndSeal() {
    clearAcks();
    const trimmed = comment.trim();
    const okApprove = review.approve({
      by: actor,
      note: trimmed.length > 0 ? trimmed : null,
    });
    if (!okApprove) {
      setPendingError(review.lastError ?? 'Transition failed.');
      return;
    }
    setComment('');
    await runApplySeal('Approved & sealed in one step.');
  }

  async function runApplySeal(eventNote?: string) {
    clearAcks();
    const current = review.record;
    if (!current) return;
    if (current.rplsLicense.length === 0) {
      setPendingError(
        'Cannot seal — RPLS license number is missing. Update the title block.'
      );
      return;
    }
    setSealing(true);
    try {
      const cachedSealImage = useDeliveryStore.getState().sealImage;
      const sealData = await buildSealData(document, {
        rplsName: current.rplsName,
        rplsLicense: current.rplsLicense,
        sealImage: cachedSealImage,
        sealType: cachedSealImage ? 'DIGITAL_IMAGE' : 'PLACEHOLDER',
      });
      const sealedDoc = applySeal(document, sealData);
      loadDocument(sealedDoc);
      const ok = review.seal({
        by: actor,
        note:
          eventNote ??
          `Seal applied. Hash: ${sealData.signatureHash.slice(0, 12)}…`,
      });
      if (ok) {
        setPendingNote(
          `Sealed at ${new Date(sealData.sealedAt).toLocaleString()}. ` +
            `Hash ${sealData.signatureHash.slice(0, 12)}… recorded on the ` +
            'document. Drawing is now read-only pending delivery.'
        );
      } else {
        setPendingError(review.lastError ?? 'Seal transition failed.');
      }
    } catch (err) {
      setPendingError(
        err instanceof Error
          ? `Seal failed: ${err.message}`
          : 'Seal failed (unknown error).'
      );
    } finally {
      setSealing(false);
    }
  }

  function runDeliver() {
    clearAcks();
    const ok = review.deliver({ by: actor });
    if (ok) {
      setPendingNote('Drawing marked as DELIVERED.');
    } else {
      setPendingError(review.lastError ?? 'Deliver transition failed.');
    }
  }

  function runAddComment() {
    clearAcks();
    const trimmed = comment.trim();
    if (trimmed.length === 0) {
      setPendingError('Comment cannot be empty.');
      return;
    }
    review.addComment({ by: actor, note: trimmed });
    setComment('');
  }

  return (
    <aside style={styles.panel} role="dialog" aria-label="RPLS review mode">
      <header style={styles.header}>
        <h2 style={styles.title}>RPLS Review Mode</h2>
        <button
          type="button"
          onClick={onClose}
          style={styles.close}
          aria-label="Close"
        >
          ✕
        </button>
      </header>

      <div
        style={{ ...styles.statusStrip, background: meta.bg, color: meta.fg }}
      >
        <strong>{meta.label}</strong>
        <span style={styles.statusDescription}>{meta.description}</span>
      </div>

      <div style={styles.metaRow}>
        <div>
          <span style={styles.metaLabel}>RPLS</span>
          <span style={styles.metaValue}>
            {record.rplsName}
            {record.rplsLicense ? ` · #${record.rplsLicense}` : ''}
          </span>
        </div>
        <div>
          <span style={styles.metaLabel}>Submitted</span>
          <span style={styles.metaValue}>
            {record.submittedAt
              ? formatRelative(record.submittedAt)
              : 'never'}
          </span>
        </div>
      </div>

      <h3 style={styles.sectionTitle}>Audit Trail</h3>
      <ul style={styles.eventList}>
        {record.reviewHistory.length === 0 ? (
          <li style={styles.eventEmpty}>
            No events yet. Submitting for review will land the first row.
          </li>
        ) : (
          record.reviewHistory
            .slice()
            .reverse()
            .map((ev, i) => <EventRow key={i} ev={ev} />)
        )}
      </ul>

      {!isTerminal ? (
        <>
          {(isInReview || isApproved) ? (
            <div style={{ padding: '0 16px 8px' }}>
              <SealImageUploader />
            </div>
          ) : null}
          <h3 style={styles.sectionTitle}>Comment / Note</h3>
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              isReadyForOpen
                ? 'Optional — add a note when you open the drawing.'
                : isInReview
                  ? 'Required for "Request Changes". Optional for "Approve".'
                  : 'Optional note for the next transition.'
            }
            style={styles.textarea}
          />

          {pendingError ? (
            <div style={styles.error}>{pendingError}</div>
          ) : null}
          {pendingNote ? (
            <div style={styles.note}>{pendingNote}</div>
          ) : null}

          <div style={styles.actions}>
            {isReadyForOpen ? (
              <button
                type="button"
                onClick={runOpenForReview}
                style={styles.btnPrimary}
              >
                Open for Review
              </button>
            ) : null}

            {isInReview ? (
              <>
                <button
                  type="button"
                  onClick={runRequestChanges}
                  style={styles.btnDanger}
                >
                  Request Changes
                </button>
                <button
                  type="button"
                  onClick={runApprove}
                  style={styles.btnAccept}
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => void runApproveAndSeal()}
                  disabled={sealing}
                  style={
                    sealing ? styles.btnPrimaryDisabled : styles.btnPrimary
                  }
                  title="Approve and apply the digital seal in one step."
                >
                  {sealing ? 'Sealing…' : 'Approve & Seal'}
                </button>
              </>
            ) : null}

            {isApproved ? (
              <button
                type="button"
                onClick={() => void runApplySeal()}
                disabled={sealing}
                style={
                  sealing ? styles.btnPrimaryDisabled : styles.btnPrimary
                }
                title="Compute the canonical drawing hash + apply the seal."
              >
                {sealing ? 'Sealing…' : 'Apply Seal'}
              </button>
            ) : null}

            {record.status === 'SEALED' ? (
              <button
                type="button"
                onClick={runDeliver}
                style={styles.btnPrimary}
              >
                Mark Delivered
              </button>
            ) : null}

            <button
              type="button"
              onClick={runAddComment}
              style={styles.btnGhost}
              title="Append a comment without changing status."
            >
              Add Comment
            </button>
          </div>
        </>
      ) : (
        <div style={styles.terminal}>
          Workflow is in a terminal state. Reset the document to open a new
          job.
        </div>
      )}
    </aside>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function EventRow({ ev }: { ev: RPLSReviewEvent }) {
  return (
    <li style={styles.eventRow}>
      <div style={styles.eventTopLine}>
        <strong>{EVENT_LABEL[ev.event]}</strong>
        <span style={styles.eventTime}>{formatRelative(ev.at)}</span>
      </div>
      <div style={styles.eventActor}>by {ev.by}</div>
      {ev.note ? <div style={styles.eventNote}>{ev.note}</div> : null}
    </li>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} hr ago`;
  return new Date(iso).toLocaleDateString();
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    top: 60,
    right: 0,
    bottom: 0,
    width: 380,
    background: '#FFFFFF',
    borderLeft: '1px solid #E2E5EB',
    boxShadow: '-8px 0 20px rgba(15, 23, 42, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 950,
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #E2E5EB',
  },
  title: { fontSize: 14, fontWeight: 600, margin: 0, color: '#111827' },
  close: {
    background: 'transparent',
    border: 'none',
    fontSize: 16,
    color: '#6B7280',
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  empty: { padding: 16, color: '#6B7280', fontSize: 13, lineHeight: 1.5 },
  statusStrip: {
    margin: 12,
    padding: '8px 10px',
    borderRadius: 8,
    fontSize: 12,
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusDescription: { fontWeight: 400, opacity: 0.9 },
  metaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    padding: '0 16px 8px',
    fontSize: 12,
    color: '#374151',
  },
  metaLabel: {
    fontSize: 10,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginRight: 4,
  },
  metaValue: { color: '#111827' },
  sectionTitle: {
    margin: 0,
    padding: '8px 16px 4px',
    fontSize: 12,
    fontWeight: 600,
    color: '#1F2937',
  },
  eventList: {
    listStyle: 'none',
    padding: '0 16px',
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  eventEmpty: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
    padding: '4px 0',
  },
  eventRow: {
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    color: '#374151',
  },
  eventTopLine: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: '#111827',
  },
  eventTime: { fontSize: 11, color: '#6B7280' },
  eventActor: { fontSize: 11, color: '#475569', marginTop: 2 },
  eventNote: {
    marginTop: 4,
    fontSize: 11,
    color: '#1F2937',
    whiteSpace: 'pre-wrap',
  },
  textarea: {
    margin: '4px 16px 8px',
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  error: {
    margin: '0 16px 8px',
    padding: 8,
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    color: '#B91C1C',
    borderRadius: 6,
    fontSize: 11,
  },
  note: {
    margin: '0 16px 8px',
    padding: 8,
    background: '#EEF2FF',
    border: '1px solid #C7D2FE',
    color: '#3730A3',
    borderRadius: 6,
    fontSize: 11,
    lineHeight: 1.4,
  },
  actions: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    padding: '0 16px 16px',
  },
  btnPrimary: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnPrimaryDisabled: {
    background: '#94A3B8',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'not-allowed',
    opacity: 0.7,
  },
  btnDanger: {
    background: '#FFFFFF',
    color: '#B91C1C',
    border: '1px solid #FCA5A5',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnAccept: {
    background: '#FFFFFF',
    color: '#15803D',
    border: '1px solid #86EFAC',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnGhost: {
    background: 'transparent',
    color: '#475569',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  terminal: {
    margin: 16,
    padding: 12,
    background: '#F1F5F9',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    fontSize: 12,
    color: '#475569',
    lineHeight: 1.5,
  },
};
