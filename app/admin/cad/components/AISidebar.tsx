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

import { useMemo, useState } from 'react';

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

type CardSortOrder =
  | 'CONFIDENCE_ASC'
  | 'CONFIDENCE_DESC'
  | 'ALPHA'
  | 'TIER'
  | 'CATEGORY';

const SORT_LABELS: Record<CardSortOrder, string> = {
  CONFIDENCE_ASC: 'Lowest first',
  CONFIDENCE_DESC: 'Highest first',
  ALPHA: 'Alphabetical',
  TIER: 'By tier',
  CATEGORY: 'By category',
};

const TIER_COLORS: Record<1 | 2 | 3 | 4 | 5, { border: string; bar: string }> = {
  5: { border: '#16A34A', bar: '#22C55E' },
  4: { border: '#65A30D', bar: '#84CC16' },
  3: { border: '#D97706', bar: '#F59E0B' },
  2: { border: '#DC2626', bar: '#EF4444' },
  1: { border: '#7F1D1D', bar: '#B91C1C' },
};

function QueueTab({
  onOpenReviewPanel,
}: {
  onOpenReviewPanel?: () => void;
}) {
  const queue = useAIStore((s) => s.result?.reviewQueue ?? null);
  const openExplanation = useAIStore((s) => s.openExplanation);
  const setHoveredFeatureId = useUIStore((s) => s.setHoveredFeatureId);
  const [sort, setSort] = useState<CardSortOrder>('CONFIDENCE_ASC');
  const [search, setSearch] = useState('');

  const summary = queue?.summary ?? null;
  const cards = useMemo(() => {
    if (!queue) return [];
    const items = [
      ...queue.tiers[1],
      ...queue.tiers[2],
      ...queue.tiers[3],
      ...queue.tiers[4],
      ...queue.tiers[5],
    ];
    const filtered = search.trim().length
      ? items.filter((it) => {
          const q = search.trim().toLowerCase();
          return (
            it.title.toLowerCase().includes(q) ||
            it.category.toLowerCase().includes(q) ||
            it.flags.some((f) => f.toLowerCase().includes(q))
          );
        })
      : items;
    const sorted = [...filtered];
    switch (sort) {
      case 'CONFIDENCE_ASC':
        sorted.sort((a, b) => a.confidence - b.confidence);
        break;
      case 'CONFIDENCE_DESC':
        sorted.sort((a, b) => b.confidence - a.confidence);
        break;
      case 'ALPHA':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'TIER':
        sorted.sort((a, b) => a.tier - b.tier);
        break;
      case 'CATEGORY':
        sorted.sort(
          (a, b) =>
            a.category.localeCompare(b.category) ||
            a.confidence - b.confidence
        );
        break;
    }
    return sorted;
  }, [queue, sort, search]);

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

      <div style={styles.toolStrip}>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as CardSortOrder)}
          style={styles.sortSelect}
          aria-label="Sort cards"
        >
          {(Object.keys(SORT_LABELS) as CardSortOrder[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          style={styles.searchInput}
          aria-label="Filter cards"
        />
      </div>

      {cards.length === 0 ? (
        <p style={styles.empty}>
          No cards match the current filter. Clear the search to
          see every review item.
        </p>
      ) : (
        <ul style={styles.cardList}>
          {cards.map((item) => (
            <ConfidenceCard
              key={item.id}
              title={item.title}
              category={item.category}
              confidence={item.confidence}
              tier={item.tier}
              flags={item.flags}
              status={item.status}
              onClick={() => {
                if (item.featureId) openExplanation(item.featureId);
              }}
              onHoverChange={(hovered) => {
                if (!item.featureId) return;
                setHoveredFeatureId(hovered ? item.featureId : null);
              }}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onOpenReviewPanel}
        style={styles.btnPrimary}
      >
        Open the full review queue →
      </button>
    </div>
  );
}

function ConfidenceCard({
  title,
  category,
  confidence,
  tier,
  flags,
  status,
  onClick,
  onHoverChange,
}: {
  title: string;
  category: string;
  confidence: number;
  tier: 1 | 2 | 3 | 4 | 5;
  flags: string[];
  status: string;
  onClick: () => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  const colors = TIER_COLORS[tier];
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
        onFocus={() => onHoverChange(true)}
        onBlur={() => onHoverChange(false)}
        style={{
          ...styles.card,
          borderLeft: `3px solid ${colors.border}`,
          opacity: status === 'REJECTED' ? 0.55 : 1,
        }}
        title={`${category} · Tier ${tier} · ${status}`}
      >
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>{title}</span>
          <span style={styles.cardScore}>{confidence}%</span>
        </div>
        <div style={styles.cardBarOuter}>
          <div
            style={{
              ...styles.cardBarInner,
              width: `${Math.max(0, Math.min(100, confidence))}%`,
              background: colors.bar,
            }}
          />
        </div>
        <div style={styles.cardMeta}>
          <span style={styles.cardCategory}>{category}</span>
          {flags.slice(0, 3).map((flag, i) => (
            <span key={i} style={styles.cardFlag}>
              {flag}
            </span>
          ))}
          {flags.length > 3 ? (
            <span style={styles.cardFlag}>+{flags.length - 3}</span>
          ) : null}
        </div>
      </button>
    </li>
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
  const staleIds = useAIStore((s) => s.staleExplanationIds);
  const staleSet = useMemo(() => new Set(staleIds), [staleIds]);
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
      stale: staleSet.has(e.featureId),
    }));
  }, [explanations, reviewQueue, staleSet]);

  if (list.length === 0) {
    return (
      <p style={styles.empty}>
        Explanations get auto-generated when the AI pipeline
        runs. Click any feature on the canvas (or any review
        queue row) to open its detailed explanation.
      </p>
    );
  }
  const staleCount = list.filter((r) => r.stale).length;
  return (
    <div style={styles.column}>
      {staleCount > 0 ? (
        <div style={styles.staleBanner}>
          ⚠ {staleCount} explanation{staleCount === 1 ? '' : 's'} drifted
          from the live geometry — manual canvas edits since the last
          AI run. Re-run to refresh.
        </div>
      ) : null}
      <ul style={styles.explanationList}>
        {list.map((row) => (
          <li key={row.id} style={styles.explanationRow}>
            <button
              type="button"
              onClick={() => open(row.id)}
              style={
                row.stale
                  ? styles.explanationBtnStale
                  : styles.explanationBtn
              }
              title={row.summary}
            >
              <span style={styles.explanationTitleRow}>
                <strong style={styles.explanationTitle}>{row.title}</strong>
                {row.stale ? (
                  <span style={styles.staleChip}>⚠ stale</span>
                ) : null}
              </span>
              <span style={styles.explanationSummary}>
                {truncate(row.summary, 120)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
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
  explanationBtnStale: {
    width: '100%',
    textAlign: 'left',
    background: '#FFFBEB',
    border: '1px solid #FDE68A',
    borderRadius: 6,
    padding: 8,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  explanationTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 6,
  },
  explanationTitle: { fontSize: 12, color: '#1F2937' },
  staleChip: {
    fontSize: 10,
    color: '#B45309',
    background: '#FEF3C7',
    padding: '1px 6px',
    borderRadius: 4,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  explanationSummary: { fontSize: 11, color: '#6B7280', lineHeight: 1.4 },
  staleBanner: {
    background: '#FEF3C7',
    border: '1px solid #FDE68A',
    color: '#78350F',
    padding: 8,
    borderRadius: 6,
    fontSize: 11,
    lineHeight: 1.4,
  },
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
  toolStrip: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  sortSelect: {
    flex: 1,
    fontSize: 11,
    padding: '4px 6px',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    background: '#FFFFFF',
    color: '#1F2937',
  },
  searchInput: {
    flex: 1,
    fontSize: 11,
    padding: '4px 8px',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    background: '#FFFFFF',
    color: '#1F2937',
  },
  cardList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  card: {
    width: '100%',
    textAlign: 'left',
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 6,
    padding: '8px 10px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 6,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#111827',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
  },
  cardScore: {
    fontSize: 11,
    fontWeight: 700,
    color: '#111827',
    fontVariantNumeric: 'tabular-nums',
  },
  cardBarOuter: {
    height: 4,
    background: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  cardBarInner: { height: '100%', borderRadius: 2 },
  cardMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  cardCategory: {
    fontSize: 10,
    background: '#EEF2FF',
    color: '#3730A3',
    padding: '1px 6px',
    borderRadius: 4,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardFlag: {
    fontSize: 10,
    background: '#FEF3C7',
    color: '#78350F',
    padding: '1px 6px',
    borderRadius: 4,
  },
};
