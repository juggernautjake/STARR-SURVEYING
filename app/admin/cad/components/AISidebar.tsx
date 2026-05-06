'use client';
// app/admin/cad/components/AISidebar.tsx
//
// Phase 7 §3 — unified AI sidebar. Single right-edge panel
// that hosts every AI surface in tabs (Review Queue / AI
// Assistant / Explanations / Versions / Checklist) instead of
// scattering them across separate slide-ins.
//
// This first slice ships the sidebar shell + the
// Explanations tab, which didn't exist anywhere as a list
// view (only as a per-feature popup). The other tabs render
// a one-line summary + a primary CTA that opens the existing
// dedicated panel; future slices migrate the full panel
// content into the sidebar so the dedicated overlays can
// retire.

import { useMemo } from 'react';

import {
  useAIStore,
  useDeliveryStore,
  useDrawingChatStore,
  useReviewWorkflowStore,
  useUIStore,
  type AISidebarTab,
} from '@/lib/cad/store';
import {
  checkDrawingCompleteness,
  summarizeCompleteness,
} from '@/lib/cad/delivery';
import { useDrawingStore, useAnnotationStore } from '@/lib/cad/store';

interface Props {
  /** Caller-side openers for the dedicated panels. The
   *  sidebar mounts inline content for the explanations tab
   *  but defers the heavyweight panels to the existing
   *  slide-in components. */
  onOpenReviewPanel?:        () => void;
  onOpenAssistantPanel?:     () => void;
  onOpenCompletenessPanel?:  () => void;
}

const TABS: ReadonlyArray<{ id: AISidebarTab; label: string; emoji: string }> = [
  { id: 'queue', label: 'Review', emoji: '📋' },
  { id: 'assistant', label: 'Chat', emoji: '💬' },
  { id: 'explanations', label: 'Why', emoji: '🧠' },
  { id: 'versions', label: 'Versions', emoji: '⏱' },
  { id: 'checklist', label: 'Checklist', emoji: '✓' },
];

export default function AISidebar({
  onOpenReviewPanel,
  onOpenAssistantPanel,
  onOpenCompletenessPanel,
}: Props) {
  const open = useUIStore((s) => s.showAISidebar);
  const tab = useUIStore((s) => s.aiSidebarTab);
  const setTab = useUIStore((s) => s.setAISidebarTab);
  const close = useUIStore((s) => s.closeAISidebar);

  if (!open) return null;

  return (
    <aside style={styles.panel} role="complementary" aria-label="AI sidebar">
      <header style={styles.header}>
        <h2 style={styles.title}>AI Sidebar</h2>
        <button
          type="button"
          style={styles.close}
          onClick={close}
          aria-label="Close"
        >
          ✕
        </button>
      </header>

      <nav style={styles.tabStrip} aria-label="AI sidebar tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={tab === t.id ? styles.tabActive : styles.tab}
            title={t.label}
          >
            <span style={styles.tabEmoji}>{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <div style={styles.body}>
        {tab === 'queue' ? (
          <QueueTab onOpenReviewPanel={onOpenReviewPanel} />
        ) : tab === 'assistant' ? (
          <AssistantTab onOpenAssistantPanel={onOpenAssistantPanel} />
        ) : tab === 'explanations' ? (
          <ExplanationsTab />
        ) : tab === 'versions' ? (
          <VersionsTab />
        ) : (
          <ChecklistTab onOpenCompletenessPanel={onOpenCompletenessPanel} />
        )}
      </div>
    </aside>
  );
}

// ────────────────────────────────────────────────────────────
// Tabs
// ────────────────────────────────────────────────────────────

function QueueTab({
  onOpenReviewPanel,
}: {
  onOpenReviewPanel?: () => void;
}) {
  const summary = useAIStore((s) => s.result?.reviewQueue.summary ?? null);
  if (!summary) {
    return (
      <p style={styles.empty}>
        No AI review queue yet. Run the AI Drawing Engine
        (File → 🤖 Run AI Drawing Engine…) to populate it.
      </p>
    );
  }
  return (
    <div style={styles.column}>
      <div style={styles.statRow}>
        <Stat label="Total"    value={summary.totalElements} />
        <Stat label="Accepted" value={summary.acceptedCount} accent="#15803D" />
        <Stat label="Modified" value={summary.modifiedCount} accent="#1E3A8A" />
        <Stat label="Rejected" value={summary.rejectedCount} accent="#7F1D1D" />
        <Stat label="Pending"  value={summary.pendingCount}  accent="#92400E" />
      </div>
      <button
        type="button"
        onClick={onOpenReviewPanel}
        style={styles.btnPrimary}
      >
        Open the full review queue →
      </button>
      <p style={styles.hint}>
        The full tier-grouped queue with Accept / Modify / Reject
        controls is still served by the dedicated panel; this
        tab is a quick snapshot.
      </p>
    </div>
  );
}

function AssistantTab({
  onOpenAssistantPanel,
}: {
  onOpenAssistantPanel?: () => void;
}) {
  const history = useDrawingChatStore((s) => s.history);
  const last = history[history.length - 1];
  return (
    <div style={styles.column}>
      <div style={styles.row}>
        <span style={styles.rowLabel}>Messages</span>
        <span style={styles.rowValue}>{history.length}</span>
      </div>
      {last ? (
        <div style={styles.lastMsg}>
          <span style={styles.lastMsgRole}>{last.role}:</span>{' '}
          {truncate(last.content, 120)}
        </div>
      ) : (
        <p style={styles.empty}>
          Start a conversation about the drawing —
          “What’s the boundary acreage?”, “Set survey date”,
          “Re-run with the deed bearings”.
        </p>
      )}
      <button
        type="button"
        onClick={onOpenAssistantPanel}
        style={styles.btnPrimary}
      >
        Open the AI drawing chat →
      </button>
    </div>
  );
}

function ExplanationsTab() {
  const explanations = useAIStore((s) => s.result?.explanations ?? null);
  const reviewQueue = useAIStore((s) => s.result?.reviewQueue ?? null);
  const open = useAIStore((s) => s.openExplanation);
  const list = useMemo(() => {
    if (!explanations) return [];
    return Object.values(explanations).map((e) => ({
      id: e.featureId,
      title:
        findReviewItemTitle(reviewQueue, e.featureId) ??
        e.summary.split('—')[0]?.trim() ??
        e.featureId,
      summary: e.summary,
      generatedAt: e.generatedAt,
    }));
  }, [explanations, reviewQueue]);

  if (list.length === 0) {
    return (
      <p style={styles.empty}>
        Explanations get auto-generated when the AI pipeline
        runs. Click any feature on the canvas (or any review
        queue row) to open its detailed explanation.
      </p>
    );
  }
  return (
    <ul style={styles.explanationList}>
      {list.map((row) => (
        <li key={row.id} style={styles.explanationRow}>
          <button
            type="button"
            onClick={() => open(row.id)}
            style={styles.explanationBtn}
            title={row.summary}
          >
            <strong style={styles.explanationTitle}>{row.title}</strong>
            <span style={styles.explanationSummary}>
              {truncate(row.summary, 120)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function VersionsTab() {
  // Two read-only signals we can already surface today: the
  // RPLS audit trail (sealing / approvals) and the survey-
  // description revision log. Real "AI version snapshots"
  // land once the pipeline persists checkpoints.
  const auditTrail = useReviewWorkflowStore(
    (s) => s.record?.reviewHistory ?? null
  );
  const description = useDeliveryStore((s) => s.description);
  const revisions = description?.revisions ?? null;

  const rows: Array<{ at: string; by: string; label: string }> = [];
  if (auditTrail) {
    for (const ev of auditTrail) {
      rows.push({ at: ev.at, by: ev.by, label: ev.event });
    }
  }
  if (revisions) {
    for (const rev of revisions) {
      rows.push({
        at: rev.at,
        by: rev.by,
        label: `description: ${truncate(rev.summary, 60)}`,
      });
    }
  }
  rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  if (rows.length === 0) {
    return (
      <p style={styles.empty}>
        Version history will populate as the surveyor edits
        the description, transitions the workflow, and seals
        the drawing. AI-pipeline checkpoints land in a
        follow-up slice.
      </p>
    );
  }
  return (
    <ul style={styles.versionList}>
      {rows.map((r, i) => (
        <li key={i} style={styles.versionRow}>
          <span style={styles.versionAt}>{formatRelative(r.at)}</span>
          <span style={styles.versionLabel}>{r.label}</span>
          <span style={styles.versionBy}>{r.by}</span>
        </li>
      ))}
    </ul>
  );
}

function ChecklistTab({
  onOpenCompletenessPanel,
}: {
  onOpenCompletenessPanel?: () => void;
}) {
  const document = useDrawingStore((s) => s.document);
  const annotations = useAnnotationStore((s) => s.annotations);
  const queue = useAIStore((s) => s.result?.reviewQueue ?? null);
  const hasLegalDescription = useDeliveryStore(
    (s) => s.description !== null
  );
  const summary = useMemo(() => {
    const checks = checkDrawingCompleteness({
      doc: document,
      annotations,
      queue,
      hasLegalDescription,
    });
    return summarizeCompleteness(checks);
  }, [document, annotations, queue, hasLegalDescription]);
  return (
    <div style={styles.column}>
      <div style={styles.statRow}>
        <Stat label="Errors"   value={summary.errors}   accent="#7F1D1D" />
        <Stat label="Warnings" value={summary.warnings} accent="#92400E" />
        <Stat label="Info"     value={summary.infos}    accent="#475569" />
      </div>
      <p style={styles.hint}>
        {summary.ready
          ? 'Drawing is ready for RPLS review.'
          : 'Resolve every error before submitting for review.'}
      </p>
      <button
        type="button"
        onClick={onOpenCompletenessPanel}
        style={styles.btnPrimary}
      >
        Open the completeness checklist →
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div style={styles.stat}>
      <span style={{ ...styles.statValue, color: accent ?? '#111827' }}>
        {value}
      </span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

function findReviewItemTitle(
  queue: { tiers: Record<1 | 2 | 3 | 4 | 5, Array<{ featureId: string | null; title: string }>> } | null,
  featureId: string
): string | null {
  if (!queue) return null;
  for (const tier of [5, 4, 3, 2, 1] as const) {
    const item = queue.tiers[tier].find((it) => it.featureId === featureId);
    if (item) return item.title;
  }
  return null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

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
    width: 320,
    background: '#FFFFFF',
    borderLeft: '1px solid #E2E5EB',
    boxShadow: '-8px 0 20px rgba(15, 23, 42, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 920,
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
  tabStrip: {
    display: 'flex',
    gap: 4,
    padding: '8px 8px 0 8px',
    borderBottom: '1px solid #E2E5EB',
    overflowX: 'auto',
  },
  tab: {
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#475569',
    fontSize: 11,
    padding: '6px 8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    whiteSpace: 'nowrap',
  },
  tabActive: {
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid #1D3095',
    color: '#1D3095',
    fontSize: 11,
    fontWeight: 600,
    padding: '6px 8px',
    cursor: 'default',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    whiteSpace: 'nowrap',
  },
  tabEmoji: { fontSize: 13, lineHeight: 1 },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: 12,
  },
  column: { display: 'flex', flexDirection: 'column', gap: 10 },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: '#475569',
  },
  rowLabel: { fontWeight: 600 },
  rowValue: { color: '#111827' },
  empty: {
    margin: 0,
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    lineHeight: 1.5,
  },
  hint: {
    margin: 0,
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 1.4,
  },
  statRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(60px, 1fr))',
    gap: 6,
  },
  stat: {
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: 6,
    padding: '6px 8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statValue: { fontSize: 16, fontWeight: 700 },
  statLabel: {
    fontSize: 10,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  btnPrimary: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  lastMsg: {
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: 6,
    padding: 8,
    fontSize: 11,
    color: '#1F2937',
    lineHeight: 1.4,
  },
  lastMsgRole: { fontWeight: 600 },
  explanationList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  explanationRow: {},
  explanationBtn: {
    width: '100%',
    textAlign: 'left',
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: 6,
    padding: 8,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  explanationTitle: { fontSize: 12, color: '#1F2937' },
  explanationSummary: { fontSize: 11, color: '#6B7280', lineHeight: 1.4 },
  versionList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  versionRow: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    gap: 6,
    alignItems: 'baseline',
    fontSize: 11,
    color: '#374151',
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: 6,
    padding: '6px 8px',
  },
  versionAt: { color: '#6B7280' },
  versionLabel: { color: '#1F2937' },
  versionBy: { color: '#475569', fontStyle: 'italic' },
};
