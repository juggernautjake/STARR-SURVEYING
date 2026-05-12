'use client';
// app/admin/cad/components/RPLSSubmissionDialog.tsx
//
// Phase 7 §7.2 — Submit-for-RPLS-Review dialog. Pops when the
// surveyor clicks "Mark Ready for RPLS Review" on the
// completeness panel and the gate is satisfied. Confirms the
// resolved RPLS, captures an optional message for them, and
// runs the DRAFT → READY_FOR_REVIEW transition only after the
// surveyor explicitly confirms.
//
// Why a separate dialog instead of submitting straight from
// the completeness panel: the spec calls out the message-to-
// RPLS step as the surveyor's last chance to add context
// before the file goes downstream, and we want a clear audit
// trail entry that includes that message.

import { useState, useRef } from 'react';

import { useDrawingStore, useReviewWorkflowStore } from '@/lib/cad/store';
import type { CompletenessSummary } from '@/lib/cad/delivery';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface Props {
  open: boolean;
  /** The completeness summary that triggered the dialog. Shown
   *  as a confirmation banner so the user sees what they're
   *  about to submit. */
  summary: CompletenessSummary | null;
  onClose: () => void;
}

export default function RPLSSubmissionDialog({
  open,
  summary,
  onClose,
}: Props) {
  useEscapeToClose(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const document = useDrawingStore((s) => s.document);
  const review = useReviewWorkflowStore();

  const tb = document.settings.titleBlock;
  const rplsName = tb.surveyorName?.trim() || document.author || '';
  const rplsLicense = tb.surveyorLicense?.trim() || '';
  const firmName = tb.firmName?.trim() || '';

  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const canSubmit =
    !!summary?.ready && rplsName.length > 0 && rplsLicense.length > 0;
  const blockedReason = !summary?.ready
    ? 'Completeness check has unresolved errors.'
    : rplsName.length === 0
      ? 'Surveyor name is missing on the title block.'
      : rplsLicense.length === 0
        ? 'Surveyor license number is missing on the title block.'
        : null;

  function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      review.loadOrCreate({
        jobId: document.id,
        rplsId: document.author || rplsName,
        rplsName,
        rplsLicense,
      });
      const note = buildSubmissionNote(summary, message);
      const ok = review.markReadyForReview({
        by: document.author || rplsName,
        note,
      });
      if (!ok) {
        // Surface the transition error inline; the user can
        // retry after addressing it.
        return;
      }
      onClose();
      setMessage('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div ref={dialogRef} style={styles.backdrop} onClick={onClose}>
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Submit for RPLS review"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={styles.header}>
          <h2 style={styles.title}>Submit for RPLS Review</h2>
          <button
            type="button"
            onClick={onClose}
            style={styles.close}
            aria-label="Close"
            disabled={submitting}
          >
            ✕
          </button>
        </header>

        <div style={styles.body}>
          {summary ? (
            <div
              style={summary.ready ? styles.bannerOk : styles.bannerFail}
            >
              {summary.ready
                ? `✓ Completeness check passed (${summary.warnings} warning${summary.warnings === 1 ? '' : 's'}).`
                : `✗ Completeness check has ${summary.errors} error${summary.errors === 1 ? '' : 's'} — resolve before submitting.`}
            </div>
          ) : null}

          <section style={styles.section}>
            <span style={styles.sectionLabel}>RPLS</span>
            <div style={styles.sectionValue}>
              {rplsName || <em style={styles.muted}>name missing</em>}
              {rplsLicense ? (
                <span style={styles.license}>
                  &nbsp;· License {rplsLicense}
                </span>
              ) : (
                <span style={styles.muted}>&nbsp;· license missing</span>
              )}
            </div>
            {firmName ? (
              <div style={styles.sectionSub}>{firmName}</div>
            ) : null}
            <div style={styles.sectionHint}>
              Pulled from the title block. Update there if this isn&apos;t
              the right RPLS.
            </div>
          </section>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Message to RPLS (optional)</span>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Anything the RPLS should know before reviewing — e.g. boundary only, deed reconciliation flagged 2 corners, etc."
              style={styles.textarea}
              disabled={submitting}
            />
          </label>

          {review.lastError ? (
            <div style={styles.error}>{review.lastError}</div>
          ) : null}
        </div>

        <footer style={styles.footer}>
          <button
            type="button"
            onClick={onClose}
            style={styles.cancelBtn}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            style={
              canSubmit && !submitting ? styles.submitBtn : styles.submitBtnDisabled
            }
            title={blockedReason ?? 'Send to the RPLS for review'}
          >
            {submitting ? 'Submitting…' : 'Submit for Review'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function buildSubmissionNote(
  summary: CompletenessSummary | null,
  message: string
): string {
  const parts: string[] = [];
  if (summary) {
    parts.push(
      `Completeness: ${summary.warnings} warning(s), ${summary.infos} info(s).`
    );
  }
  const trimmed = message.trim();
  if (trimmed.length > 0) {
    parts.push(`Surveyor note: ${trimmed}`);
  }
  return parts.join(' ');
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.55)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 80,
    zIndex: 1100,
  },
  modal: {
    background: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 560,
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 20px',
    borderBottom: '1px solid #E2E5EB',
  },
  title: { fontSize: 16, fontWeight: 600, margin: 0, color: '#111827' },
  close: {
    background: 'transparent',
    border: 'none',
    fontSize: 18,
    color: '#6B7280',
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  body: {
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  bannerOk: {
    padding: '8px 10px',
    background: '#DCFCE7',
    border: '1px solid #86EFAC',
    color: '#166534',
    borderRadius: 6,
    fontSize: 12,
  },
  bannerFail: {
    padding: '8px 10px',
    background: '#FEE2E2',
    border: '1px solid #FCA5A5',
    color: '#7F1D1D',
    borderRadius: 6,
    fontSize: 12,
  },
  section: {
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  sectionLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionValue: { fontSize: 14, color: '#111827' },
  sectionSub: { fontSize: 12, color: '#374151' },
  sectionHint: {
    marginTop: 2,
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  license: { fontSize: 12, color: '#475569' },
  muted: { color: '#9CA3AF', fontStyle: 'italic' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: 600, color: '#374151' },
  textarea: {
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  error: {
    padding: 10,
    background: '#FEF2F2',
    border: '1px solid #FCA5A5',
    color: '#B91C1C',
    borderRadius: 6,
    fontSize: 12,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    padding: '12px 20px',
    borderTop: '1px solid #E2E5EB',
    background: '#FAFBFC',
    borderRadius: '0 0 12px 12px',
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#374151',
  },
  submitBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  submitBtnDisabled: {
    background: '#9CA3AF',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'not-allowed',
    fontSize: 13,
    fontWeight: 600,
    opacity: 0.65,
  },
};
