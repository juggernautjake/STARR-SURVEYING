'use client';
// app/admin/cad/components/ReviewQueuePanel.tsx
//
// Phase 6 UI slice 2 — review queue panel. Slides in from the
// right when the AI pipeline produces a result, lists every
// review item grouped by tier 5 → 1, and lets the surveyor
// hit Accept / Modify / Reject per row.
//
// Modify is a stub for v1 — clicking it just marks the item
// MODIFIED + opens an inline note input. Geometry editing
// from the queue lands in a follow-up slice (it requires the
// drawing-store apply path to gate on the queue's status).
//
// Reads + writes useAIStore. The Phase 6 spec says the canvas
// should also glow per-tier; that lands as the next slice when
// the apply-to-document wire goes in.

import { useState } from 'react';

import {
  useAIStore,
  useAnnotationStore,
  useDrawingStore,
  useSelectionStore,
  useViewportStore,
} from '@/lib/cad/store';
import type {
  AIJobResult,
  ReviewItem,
  ReviewItemStatus,
} from '@/lib/cad/ai-engine/types';
import type { Feature } from '@/lib/cad/types';
import { featureBounds } from '@/lib/cad/geometry/bounds';

const TIER_ORDER: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];

const TIER_LABELS: Record<1 | 2 | 3 | 4 | 5, { label: string; emoji: string; color: string }> = {
  5: { label: 'Auto-accepted (95–100)', emoji: '★★★★★', color: '#15803D' },
  4: { label: 'Confirm (80–94)',         emoji: '★★★★☆', color: '#65A30D' },
  3: { label: 'Review (60–79)',          emoji: '★★★☆☆', color: '#D97706' },
  2: { label: 'Decide (40–59)',          emoji: '★★☆☆☆', color: '#DC2626' },
  1: { label: 'Manual queue (0–39)',     emoji: '★☆☆☆☆', color: '#7F1D1D' },
};

const STATUS_LABELS: Record<ReviewItemStatus, { label: string; bg: string; fg: string }> = {
  PENDING:  { label: 'pending',  bg: '#FEF3C7', fg: '#78350F' },
  ACCEPTED: { label: 'accepted', bg: '#DCFCE7', fg: '#166534' },
  MODIFIED: { label: 'modified', bg: '#DBEAFE', fg: '#1E3A8A' },
  REJECTED: { label: 'rejected', bg: '#FEE2E2', fg: '#7F1D1D' },
};

export default function ReviewQueuePanel() {
  const isOpen = useAIStore((s) => s.isQueuePanelOpen);
  const close = useAIStore((s) => s.closeQueuePanel);
  const result = useAIStore((s) => s.result);
  const setItemStatus = useAIStore((s) => s.setItemStatus);
  const openExplanation = useAIStore((s) => s.openExplanation);
  const addFeature = useDrawingStore((s) => s.addFeature);
  const removeFeature = useDrawingStore((s) => s.removeFeature);
  const drawingFeatures = useDrawingStore((s) => s.document.features);
  const getFeature = useDrawingStore((s) => s.getFeature);
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation);
  const selectMultiple = useSelectionStore((s) => s.selectMultiple);
  const zoomToExtents = useViewportStore((s) => s.zoomToExtents);

  if (!isOpen) return null;

  /**
   * Phase 6 apply-on-accept. Idempotently adds the feature
   * (with an `aiConfidenceTier` property the canvas renderer
   * can read for the §11 confidence glow) plus its linked
   * annotations to the drawing document. Re-clicking Accept on
   * an already-applied item is a no-op.
   */
  function applyReviewItem(item: ReviewItem, payload: AIJobResult) {
    if (!item.featureId) return;
    if (drawingFeatures[item.featureId]) return; // already applied
    const sourceFeature = payload.features.find(
      (f) => f.id === item.featureId
    );
    if (!sourceFeature) return;
    const tagged: Feature = {
      ...sourceFeature,
      properties: {
        ...sourceFeature.properties,
        aiConfidenceTier: item.tier,
        aiConfidence: item.confidence,
      },
    };
    addFeature(tagged);
    for (const annotation of payload.annotations) {
      if (annotation.linkedFeatureId === item.featureId) {
        addAnnotation(annotation);
      }
    }
  }

  /**
   * Phase 6 unwind-on-reject. Removes a previously-applied
   * feature from the drawing when the surveyor rejects after
   * accepting. Best-effort — annotation cleanup is handled by
   * the annotation store's own reactive cleanup; we just yank
   * the feature here.
   */
  function unapplyReviewItem(item: ReviewItem) {
    if (!item.featureId) return;
    if (!drawingFeatures[item.featureId]) return;
    removeFeature(item.featureId);
  }

  /**
   * Phase 6 §1913-§1914 — batch-accept every PENDING item at or
   * above the given minimum tier. Tier-5 items already auto-
   * accept at pipeline time so the headline batch buttons are
   * still useful when the surveyor rejected a few and wants to
   * restore everything in one click, OR when a future config
   * disables the per-item auto-accept.
   */
  function batchAccept(minTier: 4 | 5) {
    if (!result) return;
    for (const tier of [5, 4, 3, 2, 1] as const) {
      if (tier < minTier) continue;
      for (const item of result.reviewQueue.tiers[tier]) {
        if (item.status === 'ACCEPTED') continue;
        applyReviewItem(item, result);
        setItemStatus(item.id, 'ACCEPTED', null);
      }
    }
  }

  /**
   * Phase 6 §1911 — clicking a review row's title selects the
   * underlying feature and zooms the viewport to it. Pending /
   * rejected items whose feature hasn't been applied to the
   * drawing yet fall back to selecting the original AI-payload
   * feature only (no zoom, since there's nothing on canvas to
   * zoom to). Tier-5 items, which auto-accept at pipeline time,
   * always have a live feature to focus.
   */
  function focusReviewItem(item: ReviewItem) {
    if (!item.featureId) return;
    const live = getFeature(item.featureId);
    if (!live) return;
    selectMultiple([item.featureId], 'REPLACE');
    zoomToExtents(featureBounds(live));
  }

  const summary = result?.reviewQueue.summary ?? {
    totalElements: 0,
    acceptedCount: 0,
    modifiedCount: 0,
    rejectedCount: 0,
    pendingCount: 0,
  };

  return (
    <aside style={styles.panel}>
      <header style={styles.header}>
        <div>
          <div style={styles.headerTitle}>AI Review Queue</div>
          {result ? (
            <div style={styles.headerSubtitle}>
              {summary.totalElements} item
              {summary.totalElements === 1 ? '' : 's'} ·{' '}
              {summary.acceptedCount} accepted · {summary.pendingCount}{' '}
              pending · {summary.rejectedCount} rejected
            </div>
          ) : (
            <div style={styles.headerSubtitle}>
              No pipeline run yet. Use File → Run AI Drawing Engine.
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          style={styles.close}
          aria-label="Close review queue"
        >
          ✕
        </button>
      </header>

      {/* Phase 6 §1913-§1914 — batch-accept toolbar */}
      {result && summary.totalElements > 0 ? (() => {
        const tier5Pending = result.reviewQueue.tiers[5].filter(
          (i) => i.status !== 'ACCEPTED',
        ).length;
        const tier45Pending =
          tier5Pending +
          result.reviewQueue.tiers[4].filter(
            (i) => i.status !== 'ACCEPTED',
          ).length;
        return (
          <div style={styles.batchBar}>
            <button
              type="button"
              onClick={() => batchAccept(5)}
              disabled={tier5Pending === 0}
              style={
                tier5Pending === 0
                  ? styles.btnBatchDisabled
                  : styles.btnBatch
              }
              title="Accept every PENDING tier-5 (★★★★★) item"
            >
              Accept ★★★★★ ({tier5Pending})
            </button>
            <button
              type="button"
              onClick={() => batchAccept(4)}
              disabled={tier45Pending === 0}
              style={
                tier45Pending === 0
                  ? styles.btnBatchDisabled
                  : styles.btnBatch
              }
              title="Accept every PENDING tier-4-or-5 item"
            >
              Accept ≥ ★★★★ ({tier45Pending})
            </button>
          </div>
        );
      })() : null}

      <div style={styles.body}>
        {!result ? (
          <p style={styles.empty}>Run the pipeline first.</p>
        ) : summary.totalElements === 0 ? (
          <p style={styles.empty}>
            Pipeline produced zero features. Check the run warnings
            on the dialog.
          </p>
        ) : (
          TIER_ORDER.slice()
            .reverse()
            .map((tier) => {
              const items = result.reviewQueue.tiers[tier];
              if (items.length === 0) return null;
              const meta = TIER_LABELS[tier];
              return (
                <section key={tier} style={styles.tierSection}>
                  <h3 style={styles.tierHeader}>
                    <span style={{ color: meta.color }}>
                      {meta.emoji}
                    </span>{' '}
                    {meta.label}{' '}
                    <span style={styles.tierCount}>({items.length})</span>
                  </h3>
                  <ul style={styles.list}>
                    {items.map((item) => (
                      <ReviewRow
                        key={item.id}
                        item={item}
                        onAction={(status, note) => {
                          if (status === 'ACCEPTED' && result) {
                            applyReviewItem(item, result);
                          } else if (
                            status === 'REJECTED' &&
                            item.status === 'ACCEPTED'
                          ) {
                            unapplyReviewItem(item);
                          }
                          setItemStatus(item.id, status, note);
                        }}
                        onFocus={() => focusReviewItem(item)}
                        onExplain={
                          item.featureId &&
                          result?.explanations[item.featureId]
                            ? () => openExplanation(item.featureId!)
                            : null
                        }
                      />
                    ))}
                  </ul>
                </section>
              );
            })
        )}
      </div>
    </aside>
  );
}

function ReviewRow({
  item,
  onAction,
  onExplain,
  onFocus,
}: {
  item: ReviewItem;
  onAction: (status: ReviewItemStatus, note: string | null) => void;
  onExplain: (() => void) | null;
  onFocus: () => void;
}) {
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState(item.userNote ?? '');
  const status = STATUS_LABELS[item.status];
  const tierColor = TIER_LABELS[item.tier].color;

  return (
    <li
      style={{
        ...styles.row,
        borderLeftColor: tierColor,
        opacity: item.status === 'REJECTED' ? 0.55 : 1,
      }}
    >
      <div style={styles.rowMain}>
        <div style={styles.rowTopRow}>
          <button
            type="button"
            onClick={onFocus}
            style={styles.rowTitleBtn}
            title="Select and zoom to this feature"
          >
            {item.title}
          </button>
          <span style={styles.rowConfidence}>{item.confidence}</span>
        </div>
        <div style={styles.rowMeta}>
          <span style={styles.categoryChip}>{item.category}</span>
          <span
            style={{
              ...styles.statusChip,
              background: status.bg,
              color: status.fg,
            }}
          >
            {status.label}
          </span>
          {item.flags.slice(0, 3).map((flag, i) => (
            <span key={i} style={styles.flagChip}>
              {flag}
            </span>
          ))}
          {item.flags.length > 3 ? (
            <span style={styles.flagChip}>
              +{item.flags.length - 3} more
            </span>
          ) : null}
        </div>
        {item.userNote ? (
          <div style={styles.userNote}>“{item.userNote}”</div>
        ) : null}
      </div>
      <div style={styles.actions}>
        {onExplain ? (
          <button
            type="button"
            onClick={onExplain}
            style={styles.btnExplain}
            title="Open the AI explanation for this element"
          >
            ⓘ Explain
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onAction('ACCEPTED', null)}
          disabled={item.status === 'ACCEPTED'}
          style={
            item.status === 'ACCEPTED'
              ? styles.btnActiveAccept
              : styles.btnAccept
          }
        >
          ✓ Accept
        </button>
        <button
          type="button"
          onClick={() => setShowNote((v) => !v)}
          style={
            item.status === 'MODIFIED'
              ? styles.btnActiveModify
              : styles.btnModify
          }
        >
          ✎ Modify
        </button>
        <button
          type="button"
          onClick={() => onAction('REJECTED', null)}
          disabled={item.status === 'REJECTED'}
          style={
            item.status === 'REJECTED'
              ? styles.btnActiveReject
              : styles.btnReject
          }
        >
          ✗ Reject
        </button>
      </div>
      {showNote ? (
        <div style={styles.noteEditor}>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why does this need modification?"
            style={styles.noteInput}
          />
          <div style={styles.noteEditorButtons}>
            <button
              type="button"
              onClick={() => setShowNote(false)}
              style={styles.btnCancelNote}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onAction('MODIFIED', note.trim() || null);
                setShowNote(false);
              }}
              style={styles.btnSaveNote}
            >
              Save modification
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: 420,
    background: '#FFFFFF',
    borderLeft: '1px solid #E2E5EB',
    boxShadow: '-12px 0 30px rgba(15, 23, 42, 0.12)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 950,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderBottom: '1px solid #E2E5EB',
    gap: 12,
  },
  headerTitle: { fontSize: 15, fontWeight: 600, color: '#111827' },
  headerSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  close: {
    background: 'transparent',
    border: 'none',
    fontSize: 18,
    color: '#6B7280',
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  body: { flex: 1, overflowY: 'auto', padding: '8px 14px 16px' },
  empty: {
    padding: '24px 8px',
    color: '#6B7280',
    fontSize: 13,
    fontStyle: 'italic',
  },
  tierSection: { marginBottom: 16 },
  tierHeader: {
    fontSize: 12,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    margin: '14px 0 8px',
  },
  tierCount: { color: '#9CA3AF' },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  row: {
    border: '1px solid #E2E5EB',
    borderLeftWidth: 4,
    borderLeftStyle: 'solid',
    borderRadius: 8,
    padding: 10,
    background: '#FFFFFF',
  },
  rowMain: { marginBottom: 8 },
  rowTopRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowTitle: { fontSize: 13, color: '#111827' },
  rowTitleBtn: {
    fontSize: 13,
    color: '#111827',
    background: 'transparent',
    border: 'none',
    padding: 0,
    margin: 0,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left' as const,
    textDecoration: 'underline dotted',
    textUnderlineOffset: 3,
  },
  rowConfidence: {
    fontSize: 11,
    fontWeight: 600,
    color: '#374151',
    fontVariant: 'tabular-nums',
  },
  rowMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'center',
    marginTop: 6,
    fontSize: 10,
  },
  categoryChip: {
    padding: '1px 6px',
    background: '#F3F4F6',
    color: '#374151',
    borderRadius: 4,
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  statusChip: {
    padding: '1px 6px',
    borderRadius: 4,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  flagChip: {
    padding: '1px 6px',
    background: '#FEF3C7',
    color: '#854D0E',
    borderRadius: 4,
  },
  userNote: {
    fontSize: 11,
    color: '#374151',
    fontStyle: 'italic',
    marginTop: 6,
    background: '#F9FAFB',
    padding: '6px 8px',
    borderRadius: 4,
  },
  actions: { display: 'flex', gap: 6 },
  btnExplain: {
    flex: 1,
    padding: '6px 8px',
    border: '1px solid #475569',
    color: '#475569',
    background: '#FFFFFF',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnAccept: {
    flex: 1,
    padding: '6px 8px',
    border: '1px solid #15803D',
    color: '#15803D',
    background: '#FFFFFF',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  batchBar: {
    display: 'flex',
    gap: 8,
    padding: '8px 12px',
    borderBottom: '1px solid #E5E7EB',
    background: '#F9FAFB',
  },
  btnBatch: {
    flex: 1,
    padding: '6px 8px',
    border: '1px solid #15803D',
    color: '#FFFFFF',
    background: '#15803D',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnBatchDisabled: {
    flex: 1,
    padding: '6px 8px',
    border: '1px solid #D1D5DB',
    color: '#9CA3AF',
    background: '#F3F4F6',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'not-allowed',
  },
  btnActiveAccept: {
    flex: 1,
    padding: '6px 8px',
    border: '1px solid #15803D',
    color: '#FFFFFF',
    background: '#15803D',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'default',
  },
  btnModify: {
    flex: 1,
    padding: '6px 8px',
    border: '1px solid #1D4ED8',
    color: '#1D4ED8',
    background: '#FFFFFF',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnActiveModify: {
    flex: 1,
    padding: '6px 8px',
    border: '1px solid #1D4ED8',
    color: '#FFFFFF',
    background: '#1D4ED8',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnReject: {
    flex: 1,
    padding: '6px 8px',
    border: '1px solid #B91C1C',
    color: '#B91C1C',
    background: '#FFFFFF',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnActiveReject: {
    flex: 1,
    padding: '6px 8px',
    border: '1px solid #B91C1C',
    color: '#FFFFFF',
    background: '#B91C1C',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'default',
  },
  noteEditor: {
    marginTop: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  noteInput: {
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    padding: '6px 8px',
    fontSize: 12,
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  noteEditorButtons: { display: 'flex', justifyContent: 'flex-end', gap: 6 },
  btnCancelNote: {
    background: 'transparent',
    border: '1px solid #E2E5EB',
    color: '#374151',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
  },
  btnSaveNote: {
    background: '#1D4ED8',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
