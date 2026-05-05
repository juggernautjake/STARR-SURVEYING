'use client';
// app/admin/cad/components/CompletenessPanel.tsx
//
// Phase 7 §6.2 — drawing-completeness checklist panel.
// Slides in from the right and shows the live result of
// `checkDrawingCompleteness({ doc, annotations, queue })`.
//
// Each row carries:
//   * an icon for the severity (✅ pass, ⚠️ warning, ❌ error,
//     ◦ info)
//   * the human label
//   * the per-check `details` text when the check failed
//   * an optional "Fix" button when `fixHint` was set; the
//     button dispatches a `cad:openSettings` /
//     `cad:openTitleBlock` / `aiQueuePanel` event so the user
//     lands on the right surface in one click.
//
// Footer surfaces the rolled-up summary and the
// "Mark Ready for RPLS Review" button. The button is disabled
// until `summary.ready === true` (zero ERRORs). When clicked,
// it dispatches `cad:markReadyForReview` so the upcoming §7
// RPLS-workflow slice can hook in without coupling this UI
// to that state machine yet.

import { useMemo } from 'react';

import {
  checkDrawingCompleteness,
  summarizeCompleteness,
  type CompletenessCheck,
  type CompletenessSeverity,
} from '@/lib/cad/delivery';
import {
  useAIStore,
  useAnnotationStore,
  useDeliveryStore,
  useDrawingStore,
} from '@/lib/cad/store';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Callback invoked when a row's "Fix" button is clicked.
   *  The host wires `hint` to the right surface (title-block
   *  panel, AI review queue, layer panel). */
  onFix?: (hint: NonNullable<CompletenessCheck['fixHint']>) => void;
  /** Callback invoked when the user marks the drawing ready
   *  for RPLS review. The §7 RPLS-workflow slice will hook
   *  in here; for now this just bubbles up the summary so the
   *  host can decide what to do. */
  onMarkReady?: (
    checks: CompletenessCheck[],
    summary: ReturnType<typeof summarizeCompleteness>
  ) => void;
}

const SEVERITY_ICON: Record<
  CompletenessSeverity | 'PASS',
  { icon: string; color: string }
> = {
  PASS: { icon: '✅', color: '#16A34A' },
  ERROR: { icon: '❌', color: '#DC2626' },
  WARNING: { icon: '⚠️', color: '#D97706' },
  INFO: { icon: '◦', color: '#475569' },
};

export default function CompletenessPanel({
  open,
  onClose,
  onFix,
  onMarkReady,
}: Props) {
  const document = useDrawingStore((s) => s.document);
  const annotations = useAnnotationStore((s) => s.annotations);
  const queue = useAIStore((s) => s.result?.reviewQueue ?? null);
  const hasLegalDescription = useDeliveryStore(
    (s) => s.description !== null
  );

  const checks = useMemo(
    () =>
      checkDrawingCompleteness({
        doc: document,
        annotations,
        queue,
        hasLegalDescription,
      }),
    [document, annotations, queue, hasLegalDescription]
  );
  const summary = useMemo(() => summarizeCompleteness(checks), [checks]);

  if (!open) return null;

  return (
    <aside style={styles.panel} role="dialog" aria-label="Drawing completeness">
      <header style={styles.header}>
        <h2 style={styles.title}>Drawing Completeness</h2>
        <button
          type="button"
          onClick={onClose}
          style={styles.close}
          aria-label="Close"
        >
          ✕
        </button>
      </header>

      <ul style={styles.list}>
        {checks.map((check) => (
          <CheckRow key={check.id} check={check} onFix={onFix} />
        ))}
      </ul>

      <footer style={styles.footer}>
        <p style={styles.summaryText}>{describeSummary(summary)}</p>
        <button
          type="button"
          disabled={!summary.ready}
          onClick={() => {
            if (!summary.ready) return;
            onMarkReady?.(checks, summary);
            onClose();
          }}
          style={
            summary.ready
              ? styles.markReadyBtn
              : styles.markReadyBtnDisabled
          }
          title={
            summary.ready
              ? 'Submit the drawing to the RPLS for review'
              : 'Resolve all errors before marking ready'
          }
        >
          Mark Ready for RPLS Review
        </button>
      </footer>
    </aside>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function CheckRow({
  check,
  onFix,
}: {
  check: CompletenessCheck;
  onFix?: (hint: NonNullable<CompletenessCheck['fixHint']>) => void;
}) {
  const meta = check.passed ? SEVERITY_ICON.PASS : SEVERITY_ICON[check.severity];
  const showFix = !check.passed && check.fixHint && onFix;
  return (
    <li style={styles.row}>
      <span style={{ ...styles.rowIcon, color: meta.color }}>{meta.icon}</span>
      <div style={styles.rowMain}>
        <div style={styles.rowLabel}>{check.label}</div>
        {!check.passed && check.details ? (
          <div style={styles.rowDetails}>{check.details}</div>
        ) : null}
      </div>
      {showFix && check.fixHint ? (
        <button
          type="button"
          onClick={() => onFix?.(check.fixHint!)}
          style={styles.fixBtn}
          title={fixButtonTitle(check.fixHint)}
        >
          {fixButtonLabel(check.fixHint)}
        </button>
      ) : null}
    </li>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function describeSummary(summary: {
  errors: number;
  warnings: number;
  infos: number;
  ready: boolean;
}): string {
  if (summary.ready && summary.warnings === 0) {
    return 'All checks passed — drawing is ready for RPLS review.';
  }
  if (summary.ready) {
    return `${summary.warnings} warning${summary.warnings === 1 ? '' : 's'} — drawing can ship but you may want to address them first.`;
  }
  return `${summary.errors} error${summary.errors === 1 ? '' : 's'}, ${summary.warnings} warning${summary.warnings === 1 ? '' : 's'} — drawing not ready for RPLS review.`;
}

function fixButtonLabel(
  hint: NonNullable<CompletenessCheck['fixHint']>
): string {
  switch (hint) {
    case 'TITLE_BLOCK':
      return 'Fix';
    case 'REVIEW_QUEUE':
      return 'Open queue';
    case 'LAYERS':
      return 'Layers';
    default:
      return 'Fix';
  }
}

function fixButtonTitle(
  hint: NonNullable<CompletenessCheck['fixHint']>
): string {
  switch (hint) {
    case 'TITLE_BLOCK':
      return 'Open the title-block panel';
    case 'REVIEW_QUEUE':
      return 'Open the AI review queue';
    case 'LAYERS':
      return 'Open the layer panel';
    default:
      return '';
  }
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
    zIndex: 900,
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
  list: {
    listStyle: 'none',
    padding: 8,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    overflowY: 'auto',
    flex: 1,
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
  },
  rowIcon: { fontSize: 16, lineHeight: '20px', minWidth: 16 },
  rowMain: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 13, color: '#1F2937' },
  rowDetails: {
    marginTop: 2,
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 1.4,
  },
  fixBtn: {
    background: '#FFFFFF',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    color: '#1F2937',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  footer: {
    padding: '12px 16px',
    borderTop: '1px solid #E2E5EB',
    background: '#FAFBFC',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  summaryText: {
    margin: 0,
    fontSize: 12,
    color: '#374151',
    lineHeight: 1.4,
  },
  markReadyBtn: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  markReadyBtnDisabled: {
    background: '#9CA3AF',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'not-allowed',
    opacity: 0.65,
  },
};
