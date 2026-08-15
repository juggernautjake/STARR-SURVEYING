'use client';
// lib/hub/widgets/field-assistant/index.tsx
//
// C0e of docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// The surveying field assistant — bearings and back-azimuths, angle arithmetic, traverse setup and
// closure, latitude/departure, field procedure, mileage. Ask it a question, get a short answer.
//
// ── WHY IT BECAME A WIDGET ──────────────────────────────────────────────────────────────────────
//
// It was a tab inside the Work Mode field-crew shell, which is being retired (D8). Nothing else in
// the product answers these questions, and its route had exactly one caller, so deleting the shell
// would have deleted the capability.
//
// The hub is the right home rather than a page of its own: this is a personal utility the same way
// the calculator and the mileage tracker are, the owner is deliberately consolidating around the
// hub and Quick Actions, and a widget can sit open beside whatever else is being worked on. The
// route moved with it — `/api/admin/work-mode/assistant` → `/api/admin/field-assistant` — because a
// path naming a shell that no longer exists is a comment that has started lying.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────────────────────────
//
// No history beyond the session and no persistence. The route keeps only the last twelve turns by
// design ("a field chat doesn't need deep history"), and storing survey answers as though they were
// records would invite someone to treat a model's arithmetic as a measurement. It is a calculator
// you can talk to, not a fieldbook.

import React, { useCallback, useRef, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';

export interface FieldAssistantContent extends Record<string, unknown> {
  /** Optional free-text context prepended to the question — e.g. a job number the crew is on. */
  jobContext: string;
}

const DEFAULTS: FieldAssistantContent = { jobContext: '' };

interface Msg { role: 'user' | 'assistant'; content: string }

/** Starter questions. A blank chat box does not tell a surveyor what this thing is for. */
const SUGGESTIONS = [
  'Back-azimuth of N30°E?',
  'Closure error for a 4-sided traverse?',
  'Convert 127°14′36″ to decimal degrees',
];

function FieldAssistantWidget({ size, content }: WidgetProps<FieldAssistantContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  const send = useCallback(async (question?: string) => {
    const text = (question ?? input).trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/field-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          ...(settings.jobContext.trim() ? { jobContext: settings.jobContext.trim() } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 503 means no API key is configured. Saying so beats a generic failure, because it is
        // fixable by the owner rather than by retrying.
        setError(j.error ?? 'The assistant could not answer.');
        return;
      }
      const reply = typeof j.reply === 'string' ? j.reply : typeof j.content === 'string' ? j.content : '';
      if (!reply) { setError('The assistant returned an empty answer.'); return; }
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
      requestAnimationFrame(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); });
    } catch {
      setError('Network error — the question was not sent.');
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, settings.jobContext]);

  const tiny = bucket === 'tiny';

  return (
    <div style={st.wrap}>
      <div ref={logRef} style={st.log} aria-live="polite">
        {messages.length === 0 ? (
          <div style={st.empty}>
            <p style={st.emptyText}>
              Ask about bearings, angles, traverse, closure, or field procedure.
            </p>
            {!tiny && (
              <div style={st.suggestions}>
                {SUGGESTIONS.map((q) => (
                  <button key={q} type="button" onClick={() => void send(q)} style={st.chip}>{q}</button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} style={m.role === 'user' ? st.user : st.assistant}>
              {m.content}
            </div>
          ))
        )}
        {busy && <div style={st.thinking}>Thinking…</div>}
        {error && <div role="alert" style={st.error}>{error}</div>}
      </div>

      <form
        style={st.form}
        onSubmit={(e) => { e.preventDefault(); void send(); }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tiny ? 'Ask…' : 'Ask a surveying question…'}
          aria-label="Ask the field assistant"
          style={st.input}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()} style={{ ...st.send, opacity: busy || !input.trim() ? 0.5 : 1 }}>
          {tiny ? '→' : 'Ask'}
        </button>
      </form>
    </div>
  );
}

function FieldAssistantSettings({ value, onChange }: WidgetSettingsFormProps<FieldAssistantContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={{ display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 }}>
          Job context (optional)
        </span>
        <input
          type="text"
          value={settings.jobContext}
          onChange={(e) => onChange({ ...settings, jobContext: e.target.value })}
          placeholder="e.g. Job 2026-0014, 12ac tract off FM 1431"
          style={{
            width: '100%',
            height: 'var(--input-height, 40px)',
            boxSizing: 'border-box',
            padding: '0 8px',
            borderRadius: 6,
            border: '1px solid var(--theme-border)',
            background: 'var(--theme-bg-surface)',
            color: 'var(--theme-fg-primary)',
            font: 'inherit',
            fontSize: 'var(--hub-font-sm, 0.875rem)',
          }}
        />
        <span style={{ display: 'block', fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)', marginTop: 4 }}>
          Sent with every question so answers can reference the job you are on.
        </span>
      </label>
    </div>
  );
}

defineWidget<FieldAssistantContent>({
  id: 'field-assistant',
  label: 'Field Assistant',
  description: 'Ask surveying questions — bearings, angles, traverse, closure, field procedure.',
  category: 'personal',
  iconName: 'MessageCircleQuestion',
  defaultSize: { w: 3, h: 3 },
  // 1×1 is the catalogue-wide contract (Slice 217), enforced by
  // `__tests__/hub/widgets-responsive-217.test.ts`. The `tiny` bucket drops the suggestion chips
  // and shortens the placeholder so the ask box still fits.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: FieldAssistantWidget,
  SettingsForm: FieldAssistantSettings,
});

const st: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 'var(--hub-spc-2, 8px)' },
  log: { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 2 },
  empty: { display: 'flex', flexDirection: 'column', gap: 8, margin: 'auto 0' },
  emptyText: { margin: 0, fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)', lineHeight: 1.5 },
  suggestions: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    border: '1px solid var(--theme-border)',
    background: 'var(--theme-bg-elevated)',
    color: 'var(--theme-fg-primary)',
    borderRadius: 999,
    padding: '5px 10px',
    fontSize: 'var(--hub-font-xs, 0.75rem)',
    cursor: 'pointer',
    font: 'inherit',
    textAlign: 'left',
  },
  user: {
    alignSelf: 'flex-end',
    maxWidth: '90%',
    background: 'var(--theme-accent)',
    color: 'var(--theme-accent-fg, #fff)',
    borderRadius: '10px 10px 2px 10px',
    padding: '6px 10px',
    fontSize: 'var(--hub-font-sm, 0.875rem)',
    whiteSpace: 'pre-wrap',
  },
  assistant: {
    alignSelf: 'flex-start',
    maxWidth: '95%',
    background: 'var(--theme-bg-elevated)',
    color: 'var(--theme-fg-primary)',
    borderRadius: '10px 10px 10px 2px',
    padding: '6px 10px',
    fontSize: 'var(--hub-font-sm, 0.875rem)',
    whiteSpace: 'pre-wrap',
    lineHeight: 1.5,
  },
  thinking: { fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)', fontStyle: 'italic' },
  error: { fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-danger)' },
  form: { display: 'flex', gap: 6, flexShrink: 0 },
  input: {
    flex: 1,
    minWidth: 0,
    height: 'var(--input-height, 40px)',
    boxSizing: 'border-box',
    padding: '0 10px',
    borderRadius: 8,
    border: '1px solid var(--theme-border)',
    background: 'var(--theme-bg-surface)',
    color: 'var(--theme-fg-primary)',
    font: 'inherit',
    fontSize: 'var(--hub-font-sm, 0.875rem)',
  },
  send: {
    height: 'var(--button-height, 40px)',
    padding: '0 14px',
    borderRadius: 8,
    border: '1px solid var(--theme-accent)',
    background: 'var(--theme-accent)',
    color: 'var(--theme-accent-fg, #fff)',
    fontWeight: 600,
    fontSize: 'var(--hub-font-sm, 0.875rem)',
    cursor: 'pointer',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
};
