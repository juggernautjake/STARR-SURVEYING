'use client';
// app/admin/cad/components/ElementExplanationPopup.tsx
//
// Phase 6 §30.3 — per-element explanation popup. Reads the
// feature, confidence score, and explanation from useAIStore.
// Renders a stack of collapsible sections:
//   1. Reasoning  (paragraph)
//   2. Data used  (weighted, color-tagged sources)
//   3. Assumptions (bullets)
//   4. Alternatives considered
//   5. Confidence breakdown (Stage-6 factors as bars)
//
// The chat input + REDRAW_* action buttons (§30.4 + §30.6)
// land in the next slice — this component leaves space for
// them under a "Chat (coming soon)" placeholder so the layout
// doesn't shift when chat lands.
//
// Closes via the ✕ button, the backdrop click, or the Esc key.

import { useEffect, useRef, useState } from 'react';

import { useAIStore } from '@/lib/cad/store';
import type {
  ConfidenceFactorExplanation,
  ConfidenceFactors,
  ElementChatMessage,
  ElementExplanation,
  ExplanationDataRef,
} from '@/lib/cad/ai-engine/types';

const FACTOR_LABELS: Record<keyof ConfidenceFactors, string> = {
  codeClarity: 'Code Clarity',
  coordinateValidity: 'Coordinate Validity',
  deedRecordMatch: 'Deed/Record Match',
  contextualConsistency: 'Contextual Consistency',
  closureQuality: 'Closure Quality',
  curveDataCompleteness: 'Curve Data Completeness',
};

const WEIGHT_DOT: Record<ExplanationDataRef['weight'], string> = {
  HIGH: '🟢',
  MEDIUM: '🟡',
  LOW: '⚪',
};

export default function ElementExplanationPopup() {
  const featureId = useAIStore((s) => s.explanationFeatureId);
  const close = useAIStore((s) => s.closeExplanation);
  const result = useAIStore((s) => s.result);
  const sendChatMessage = useAIStore((s) => s.sendChatMessage);
  const chatLoading = useAIStore((s) =>
    featureId ? Boolean(s.chatLoadingByFeature[featureId]) : false
  );

  useEffect(() => {
    if (!featureId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [featureId, close]);

  if (!featureId || !result) return null;
  const explanation = result.explanations[featureId] as
    | ElementExplanation
    | undefined;
  if (!explanation) return null;
  const score = result.scores[featureId];
  const confidence = score?.score ?? 0;
  const tier = score?.tier ?? 3;

  // Pull a friendly title from the matching review item; fall
  // back to the explanation summary's lead clause.
  const title =
    findReviewItemTitle(result.reviewQueue, featureId) ??
    explanation.summary.split('—')[0]?.trim() ??
    'Element';

  return (
    <div style={styles.backdrop} onClick={close}>
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="AI element explanation"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <h2 style={styles.title}>{title}</h2>
            <p style={styles.summary}>{explanation.summary}</p>
          </div>
          <div style={styles.headerRight}>
            <span style={styles.confidence}>{confidence}%</span>
            <span
              style={{
                ...styles.tier,
                background: tierBackground(tier),
                color: tierForeground(tier),
              }}
            >
              Tier {tier}
            </span>
            <button
              type="button"
              style={styles.close}
              onClick={close}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </header>

        <div style={styles.confidenceBarOuter}>
          <div
            style={{
              ...styles.confidenceBarInner,
              width: `${confidence}%`,
              background: tierBackground(tier),
            }}
          />
        </div>

        <div style={styles.body}>
          <Section title="Why I drew it this way">
            <p style={styles.paragraph}>{explanation.reasoning}</p>
          </Section>

          {explanation.dataUsed.length > 0 ? (
            <Section title={`Data I used (${explanation.dataUsed.length})`}>
              <ul style={styles.dataList}>
                {explanation.dataUsed.map((d, i) => (
                  <li key={i} style={styles.dataRow}>
                    <span style={styles.dataDot}>{WEIGHT_DOT[d.weight]}</span>
                    <span style={styles.dataLabel}>{d.label}</span>
                    <span style={styles.dataValue}>{d.value}</span>
                    <span style={styles.dataWeight}>{d.weight}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {explanation.assumptions.length > 0 ? (
            <Section title="Assumptions I made">
              <ul style={styles.bulletList}>
                {explanation.assumptions.map((a, i) => (
                  <li key={i} style={styles.bullet}>
                    {a}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {explanation.alternatives.length > 0 ? (
            <Section title="Alternatives I considered">
              <ul style={styles.bulletList}>
                {explanation.alternatives.map((alt, i) => (
                  <li key={i} style={styles.bullet}>
                    <strong>{alt.description}</strong> — rejected because{' '}
                    <em>{alt.whyRejected}</em>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {explanation.confidenceBreakdown.length > 0 ? (
            <Section title="Confidence breakdown">
              <ul style={styles.factorList}>
                {explanation.confidenceBreakdown.map((f) => (
                  <FactorRow key={f.factor} factor={f} />
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Chat with the AI about this element">
            <ChatPanel
              messages={explanation.chatHistory}
              loading={chatLoading}
              onSend={(content) => {
                if (!featureId) return;
                void sendChatMessage(featureId, content);
              }}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Chat panel
// ────────────────────────────────────────────────────────────

function ChatPanel({
  messages,
  loading,
  onSend,
}: {
  messages: ElementChatMessage[];
  loading: boolean;
  onSend: (content: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  function send() {
    const text = draft.trim();
    if (text.length === 0 || loading) return;
    onSend(text);
    setDraft('');
  }

  function quickAction(text: string) {
    if (loading) return;
    onSend(text);
  }

  return (
    <div style={styles.chatBox}>
      <div ref={scrollerRef} style={styles.chatScroller}>
        {messages.length === 0 ? (
          <p style={styles.chatEmpty}>
            Ask a question about this element, or instruct a change
            (e.g. &ldquo;use the deed radius instead&rdquo;,
            &ldquo;change material to wood privacy&rdquo;).
          </p>
        ) : (
          messages.map((m) => <ChatBubble key={m.id} message={m} />)
        )}
        {loading ? (
          <div style={styles.chatTyping}>AI is thinking…</div>
        ) : null}
      </div>
      <textarea
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Type your question or instruction (Enter to send, Shift+Enter for newline)"
        style={styles.chatInput}
        disabled={loading}
      />
      <div style={styles.chatActions}>
        <button
          type="button"
          onClick={() => quickAction('Update this element with the change you suggested above.')}
          disabled={loading}
          style={loading ? styles.chatBtnDisabled : styles.chatBtn}
          title="Recompute geometry for this single feature"
        >
          Update This Element
        </button>
        <button
          type="button"
          onClick={() => quickAction('Redraw the entire group on this layer with the change above.')}
          disabled={loading}
          style={loading ? styles.chatBtnDisabled : styles.chatBtn}
          title="Re-run for every feature on this layer"
        >
          Redraw This Group
        </button>
        <button
          type="button"
          onClick={() => quickAction('Re-run the full AI pipeline with the change above.')}
          disabled={loading}
          style={loading ? styles.chatBtnDisabled : styles.chatBtn}
          title="Re-run the full 6-stage pipeline"
        >
          Redraw Full Drawing
        </button>
        <div style={styles.chatActionsSpacer} />
        <button
          type="button"
          onClick={send}
          disabled={loading || draft.trim().length === 0}
          style={
            loading || draft.trim().length === 0
              ? styles.chatSendDisabled
              : styles.chatSend
          }
        >
          {loading ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ElementChatMessage }) {
  const isUser = message.role === 'USER';
  return (
    <div
      style={{
        ...styles.bubbleRow,
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div style={isUser ? styles.bubbleUser : styles.bubbleAi}>
        <div style={styles.bubbleText}>{message.content}</div>
        {message.action ? (
          <div style={styles.bubbleAction}>
            <strong>Proposed action:</strong> {message.action.type}
            {message.action.description
              ? ` — ${message.action.description}`
              : ''}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={styles.section}>
      <h3 style={styles.sectionTitle}>▾ {title}</h3>
      <div style={styles.sectionBody}>{children}</div>
    </section>
  );
}

function FactorRow({ factor }: { factor: ConfidenceFactorExplanation }) {
  const pct = Math.round(factor.score * 100);
  return (
    <li style={styles.factorRow}>
      <div style={styles.factorHeader}>
        <span style={styles.factorLabel}>{FACTOR_LABELS[factor.factor]}</span>
        <span style={styles.factorScore}>{pct}%</span>
      </div>
      <div style={styles.factorBarOuter}>
        <div
          style={{
            ...styles.factorBarInner,
            width: `${pct}%`,
            background: factorBarColor(pct),
          }}
        />
      </div>
      <p style={styles.factorText}>{factor.explanation}</p>
    </li>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function findReviewItemTitle(
  queue: { tiers: Record<1 | 2 | 3 | 4 | 5, Array<{ featureId: string | null; title: string }>> },
  featureId: string
): string | null {
  for (const tier of [5, 4, 3, 2, 1] as const) {
    const item = queue.tiers[tier].find((it) => it.featureId === featureId);
    if (item) return item.title;
  }
  return null;
}

function tierBackground(tier: 1 | 2 | 3 | 4 | 5): string {
  switch (tier) {
    case 5:
      return '#16A34A';
    case 4:
      return '#65A30D';
    case 3:
      return '#D97706';
    case 2:
      return '#DC2626';
    case 1:
    default:
      return '#7F1D1D';
  }
}

function tierForeground(tier: 1 | 2 | 3 | 4 | 5): string {
  return tier >= 4 ? '#FFFFFF' : '#FFFFFF';
}

function factorBarColor(pct: number): string {
  if (pct >= 90) return '#16A34A';
  if (pct >= 70) return '#65A30D';
  if (pct >= 50) return '#D97706';
  if (pct >= 30) return '#DC2626';
  return '#7F1D1D';
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.55)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 60,
    zIndex: 1200,
  },
  modal: {
    background: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 720,
    maxHeight: 'calc(100vh - 120px)',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    padding: '14px 20px',
    borderBottom: '1px solid #E2E5EB',
  },
  headerLeft: { flex: 1, minWidth: 0 },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    margin: 0,
    color: '#111827',
  },
  summary: {
    margin: '4px 0 0 0',
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 1.4,
  },
  confidence: {
    fontSize: 18,
    fontWeight: 700,
    color: '#111827',
    minWidth: 56,
    textAlign: 'right',
  },
  tier: {
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 8px',
    borderRadius: 4,
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
  confidenceBarOuter: {
    height: 6,
    background: '#E5E7EB',
    margin: '0 20px 12px 20px',
    borderRadius: 3,
    overflow: 'hidden',
  },
  confidenceBarInner: { height: '100%', borderRadius: 3 },
  body: {
    padding: '0 20px 20px 20px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    margin: 0,
    color: '#1F2937',
  },
  sectionBody: { fontSize: 13, color: '#374151' },
  paragraph: { margin: 0, lineHeight: 1.55 },
  dataList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  dataRow: {
    display: 'grid',
    gridTemplateColumns: '20px 1fr auto auto',
    gap: 8,
    alignItems: 'center',
    padding: '4px 6px',
    borderRadius: 4,
    background: '#F8FAFC',
    fontSize: 12,
  },
  dataDot: { fontSize: 11 },
  dataLabel: { color: '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis' },
  dataValue: { color: '#6B7280', fontVariantNumeric: 'tabular-nums' },
  dataWeight: {
    fontSize: 10,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bulletList: {
    paddingLeft: 18,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  bullet: { fontSize: 13, color: '#374151', lineHeight: 1.5 },
  factorList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  factorRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '6px 8px',
    borderRadius: 4,
    background: '#F8FAFC',
  },
  factorHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    fontWeight: 600,
    color: '#1F2937',
  },
  factorLabel: {},
  factorScore: { fontVariantNumeric: 'tabular-nums' },
  factorBarOuter: {
    height: 4,
    background: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  factorBarInner: { height: '100%', borderRadius: 2 },
  factorText: {
    margin: 0,
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 1.4,
  },
  chatBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  chatScroller: {
    maxHeight: 220,
    overflowY: 'auto',
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: 6,
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  chatEmpty: {
    margin: 0,
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    lineHeight: 1.5,
  },
  chatTyping: {
    fontSize: 11,
    color: '#475569',
    fontStyle: 'italic',
    paddingLeft: 4,
  },
  bubbleRow: { display: 'flex' },
  bubbleUser: {
    maxWidth: '80%',
    background: '#1D3095',
    color: '#FFFFFF',
    padding: '8px 10px',
    borderRadius: 10,
    fontSize: 12,
    lineHeight: 1.4,
  },
  bubbleAi: {
    maxWidth: '80%',
    background: '#FFFFFF',
    color: '#111827',
    border: '1px solid #E2E8F0',
    padding: '8px 10px',
    borderRadius: 10,
    fontSize: 12,
    lineHeight: 1.4,
  },
  bubbleText: { whiteSpace: 'pre-wrap' },
  bubbleAction: {
    marginTop: 4,
    fontSize: 10,
    color: '#475569',
    paddingTop: 4,
    borderTop: '1px dashed #CBD5E1',
  },
  chatInput: {
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  chatActions: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  chatActionsSpacer: { flex: 1 },
  chatBtn: {
    background: '#FFFFFF',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 11,
    color: '#1F2937',
    cursor: 'pointer',
  },
  chatBtnDisabled: {
    background: '#F1F5F9',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 11,
    color: '#9CA3AF',
    cursor: 'not-allowed',
  },
  chatSend: {
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  chatSendDisabled: {
    background: '#94A3B8',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'not-allowed',
    opacity: 0.7,
  },
};
