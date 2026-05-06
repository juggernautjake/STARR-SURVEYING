'use client';
// app/admin/cad/components/DrawingChatPanel.tsx
//
// Phase 7 §4 — persistent drawing-level chat. Slide-in right
// sidebar with a transcript, message input, and per-message
// "Apply" buttons for any structured action Claude proposes
// (NO_ACTION skips the button).
//
// Reads + writes `useDrawingChatStore`. The store handles the
// API round-trip and any action execution; this component
// stays thin.

import { useEffect, useRef, useState } from 'react';

import { useDrawingChatStore } from '@/lib/cad/store';
import type {
  DrawingChatAction,
  DrawingChatMessage,
} from '@/lib/cad/ai-engine/drawing-chat';

export default function DrawingChatPanel() {
  const isOpen = useDrawingChatStore((s) => s.isOpen);
  const close = useDrawingChatStore((s) => s.close);
  const history = useDrawingChatStore((s) => s.history);
  const loading = useDrawingChatStore((s) => s.loading);
  const send = useDrawingChatStore((s) => s.send);
  const applyAction = useDrawingChatStore((s) => s.applyAction);
  const reset = useDrawingChatStore((s) => s.reset);
  const [draft, setDraft] = useState('');
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history.length, loading]);

  if (!isOpen) return null;

  function handleSend() {
    const text = draft.trim();
    if (text.length === 0 || loading) return;
    void send(text);
    setDraft('');
  }

  return (
    <aside style={styles.panel} role="dialog" aria-label="Drawing chat">
      <header style={styles.header}>
        <div>
          <h2 style={styles.title}>AI Drawing Assistant</h2>
          <p style={styles.subtitle}>
            Ask about the drawing, request changes, or run a re-analysis.
          </p>
        </div>
        <div style={styles.headerActions}>
          {history.length > 0 ? (
            <button
              type="button"
              onClick={reset}
              style={styles.smallBtn}
              title="Clear the chat transcript for this session"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            onClick={close}
            style={styles.close}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </header>

      <div ref={scrollerRef} style={styles.transcript}>
        {history.length === 0 ? (
          <p style={styles.empty}>
            Try “What’s the boundary acreage?”, “Set the survey date to
            today”, or “Re-run the pipeline using the deed bearings”.
          </p>
        ) : (
          history.map((m) => (
            <ChatBubble
              key={m.id}
              message={m}
              onApplyAction={applyAction}
              applyDisabled={loading}
            />
          ))
        )}
        {loading ? <div style={styles.typing}>AI is thinking…</div> : null}
      </div>

      <div style={styles.inputRow}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          placeholder="Type a message (Enter to send, Shift+Enter for newline)"
          style={styles.textarea}
          disabled={loading}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={loading || draft.trim().length === 0}
          style={
            loading || draft.trim().length === 0
              ? styles.sendBtnDisabled
              : styles.sendBtn
          }
        >
          {loading ? 'Sending…' : 'Send'}
        </button>
      </div>
    </aside>
  );
}

function ChatBubble({
  message,
  onApplyAction,
  applyDisabled,
}: {
  message: DrawingChatMessage;
  onApplyAction: (action: DrawingChatAction) => void;
  applyDisabled: boolean;
}) {
  const isUser = message.role === 'USER';
  const action = message.action;
  const showApply = !!action && action.type !== 'NO_ACTION';
  return (
    <div
      style={{
        ...styles.bubbleRow,
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div style={isUser ? styles.bubbleUser : styles.bubbleAi}>
        <div style={styles.bubbleText}>{message.content}</div>
        {action ? (
          <div style={styles.bubbleAction}>
            <strong>Proposed action:</strong> {action.type}
            {action.description ? ` — ${action.description}` : ''}
            {showApply ? (
              <button
                type="button"
                onClick={() => onApplyAction(action)}
                disabled={applyDisabled}
                style={
                  applyDisabled ? styles.applyBtnDisabled : styles.applyBtn
                }
              >
                Apply
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
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
    zIndex: 935,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '12px 16px',
    borderBottom: '1px solid #E2E5EB',
  },
  title: { fontSize: 14, fontWeight: 600, margin: 0, color: '#111827' },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 1.4,
  },
  headerActions: { display: 'flex', alignItems: 'center', gap: 6 },
  close: {
    background: 'transparent',
    border: 'none',
    fontSize: 16,
    color: '#6B7280',
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  smallBtn: {
    background: 'transparent',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    color: '#475569',
    cursor: 'pointer',
  },
  transcript: {
    flex: 1,
    overflowY: 'auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    background: '#F8FAFC',
  },
  empty: {
    margin: 0,
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    lineHeight: 1.5,
  },
  typing: {
    fontSize: 11,
    color: '#475569',
    fontStyle: 'italic',
    paddingLeft: 4,
  },
  bubbleRow: { display: 'flex' },
  bubbleUser: {
    maxWidth: '85%',
    background: '#1D3095',
    color: '#FFFFFF',
    padding: '8px 10px',
    borderRadius: 10,
    fontSize: 12,
    lineHeight: 1.4,
  },
  bubbleAi: {
    maxWidth: '85%',
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
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  applyBtn: {
    marginLeft: 'auto',
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 4,
    padding: '4px 10px',
    fontSize: 10,
    fontWeight: 600,
    cursor: 'pointer',
  },
  applyBtnDisabled: {
    marginLeft: 'auto',
    background: '#94A3B8',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 4,
    padding: '4px 10px',
    fontSize: 10,
    fontWeight: 600,
    cursor: 'not-allowed',
    opacity: 0.7,
  },
  inputRow: {
    padding: 12,
    borderTop: '1px solid #E2E5EB',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    background: '#FAFBFC',
  },
  textarea: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #E2E5EB',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  sendBtn: {
    alignSelf: 'flex-end',
    background: '#1D3095',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  sendBtnDisabled: {
    alignSelf: 'flex-end',
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
