'use client';
// app/dnd/_ui/LibraryChat.tsx — "Ask the librarian".
//
// The chat is always FOCUSED on one system, and says so prominently, because the answer to "how
// does exhaustion work" is genuinely different per system. The focus drives the grounding on the
// server (see app/api/dnd/library/chat/route.ts).
//
// When the server detects the question is probably about a DIFFERENT system it still answers for
// the focused one and asks — and we surface a one-tap "switch focus and re-ask" affordance here,
// so acting on that question costs nothing.
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './hextech.module.css';
import { GAME_SYSTEMS, SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems';
import { useResizable } from './useResizable';

interface Hint { key: string; name: string; matched: string; reason: 'named' | 'mechanic' }
interface Msg { role: 'user' | 'ai'; text: string; hint?: Hint | null; systemLabel?: string }

/** Render the markdown-lite the librarian replies in: **bold** and "· " bullets. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const bullet = line.trimStart().startsWith('· ');
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p
            key={i}
            style={{
              margin: line.trim() ? '0 0 6px' : 0,
              paddingLeft: bullet ? 10 : 0,
              lineHeight: 1.6,
            }}
          >
            {parts.map((p, j) =>
              p.startsWith('**') && p.endsWith('**') ? (
                <strong key={j} style={{ color: 'var(--hx-gold-2)' }}>{p.slice(2, -2)}</strong>
              ) : (
                <span key={j}>{p}</span>
              ),
            )}
          </p>
        );
      })}
    </>
  );
}

export default function LibraryChat({
  aiConfigured,
  system: fixedSystem,
  characterId,
  characterName,
  title = 'Ask the librarian',
}: {
  aiConfigured: boolean;
  /** When set, the focus is pinned (a system's own page); otherwise the reader picks. */
  system?: string;
  /** When set, the librarian can reason about THIS character's sheet (situational rulings). */
  characterId?: string;
  characterName?: string;
  title?: string;
}) {
  const [focus, setFocus] = useState<string>(fixedSystem ?? SYSTEM_AMBIGUOUS);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  // Height only: the panel's width is the page column's. Shared across the librarian
  // wherever it mounts (library page or a sheet) — it is one reading preference, not per-page.
  const { size, resizing, handleProps } = useResizable(
    { w: 0, h: 380 },
    { storageKey: 'dnd:chat-size:librarian', axis: 'y', min: { h: 160 } },
  );

  useEffect(() => { if (fixedSystem) setFocus(fixedSystem); }, [fixedSystem]);
  useEffect(() => {
    const el = streamRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [msgs, busy]);

  const ask = useCallback(
    async (question: string, sys: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setErr(null);
      setBusy(true);
      const history = msgs.slice(-6).map((m) => ({ role: m.role, text: m.text }));
      setMsgs((m) => [...m, { role: 'user', text: q }]);
      setInput('');
      try {
        const r = await fetch('/api/dnd/library/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question: q, system: sys, history, characterId }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setErr(j?.error || 'The librarian could not answer.');
          return;
        }
        setMsgs((m) => [...m, { role: 'ai', text: j.reply as string, hint: j.hint ?? null, systemLabel: j.systemLabel }]);
      } catch {
        setErr('The librarian could not be reached.');
      } finally {
        setBusy(false);
      }
    },
    [busy, msgs, characterId],
  );

  /** Re-ask the last question with the focus switched to the hinted system. */
  const switchAndReask = useCallback(
    (hint: Hint) => {
      const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
      setFocus(hint.key);
      if (lastUser) void ask(lastUser.text, hint.key);
    },
    [msgs, ask],
  );

  const focusName = focus === SYSTEM_AMBIGUOUS ? 'No system chosen' : GAME_SYSTEMS.find((s) => s.key === focus)?.name ?? focus;

  return (
    <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
      <div className={styles.framedPanelTop} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 className={styles.panelTitle} style={{ margin: 0 }}>{title}</h2>
        <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
          {characterName ? `Reading ${characterName}’s sheet · ` : ''}Answers are grounded in the focused system only
        </span>
      </div>

      {/* System focus — the whole contract of this chat. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="lib-focus" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hx-teal-1)' }}>
          System focus
        </label>
        {fixedSystem ? (
          <strong style={{ color: 'var(--hx-gold-2)', fontSize: 14 }}>{focusName}</strong>
        ) : (
          <select
            id="lib-focus"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            style={{ padding: '7px 10px', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', fontSize: 13 }}
          >
            <option value={SYSTEM_AMBIGUOUS}>— pick a system —</option>
            {GAME_SYSTEMS.map((s) => (
              <option key={s.key} value={s.key}>{s.name}</option>
            ))}
          </select>
        )}
        {focus === SYSTEM_AMBIGUOUS && (
          <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>Pick one and the answers get specific.</span>
        )}
      </div>

      {!aiConfigured && (
        <div className={styles.notice}>The librarian is offline — no ANTHROPIC_API_KEY is configured. Search still works.</div>
      )}

      <div
        ref={streamRef}
        style={{
          display: 'grid',
          gap: 10,
          // Reader-set, remembered. A long adjudication read through a fixed 380px letterbox is
          // most of why this needed a scrollbar in the first place.
          height: msgs.length ? (size?.h ?? 380) : undefined,
          overflowY: 'auto',
          padding: msgs.length ? '8px 2px' : 0,
          border: msgs.length ? '1px solid var(--hx-line)' : 'none',
          background: msgs.length ? 'rgba(1,10,19,0.35)' : 'transparent',
        }}
      >
        {msgs.map((m, i) => (
          <div key={i} style={{ padding: '6px 10px' }}>
            <div
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: m.role === 'user' ? 'var(--hx-teal-1)' : 'var(--hx-gold-2)',
                marginBottom: 3,
              }}
            >
              {m.role === 'user' ? 'You' : `Librarian${m.systemLabel ? ` · ${m.systemLabel}` : ''}`}
            </div>
            <div style={{ fontSize: 13.5, color: m.role === 'user' ? 'var(--hx-text)' : 'var(--hx-text)', opacity: m.role === 'user' ? 0.9 : 1 }}>
              <Rich text={m.text} />
            </div>
            {/* The "did you mean another system?" affordance — one tap to re-ask correctly. */}
            {m.hint && (
              <div
                style={{
                  marginTop: 6,
                  padding: '7px 9px',
                  border: '1px solid var(--hx-line)',
                  background: 'rgba(10,200,185,0.07)',
                  fontSize: 12,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ color: 'var(--hx-muted)' }}>
                  “{m.hint.matched}” looks like <strong style={{ color: 'var(--hx-gold-2)' }}>{m.hint.name}</strong>.
                </span>
                <button className={styles.hexBtn} onClick={() => switchAndReask(m.hint!)} disabled={busy} style={{ padding: '4px 9px', fontSize: 11.5 }}>
                  Ask {m.hint.name} instead →
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div style={{ padding: '6px 10px', display: 'flex', gap: 8, alignItems: 'center', color: 'var(--hx-muted)', fontSize: 12.5 }}>
            <span className={styles.spinner} /> Consulting {focusName}…
          </div>
        )}
      </div>

      {/* Resize grip: the transcript sits in normal flow anchored at its top, so dragging the
          bottom edge DOWN grows it — no axis inversion here (unlike the bottom-right-anchored
          builder dock). Only shown once there's a transcript to size. */}
      {msgs.length > 0 && (
        <div
          {...handleProps}
          title="Drag to resize (or focus and use ↑/↓)"
          style={{
            height: 9,
            marginTop: -6,
            cursor: 'ns-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: resizing ? 1 : 0.45,
          }}
        >
          <span style={{ width: 46, height: 3, borderRadius: 2, background: 'var(--hx-gold-1)' }} />
        </div>
      )}

      {err && <div className={styles.error}>{err}</div>}

      <form
        onSubmit={(e) => { e.preventDefault(); void ask(input, focus); }}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input, focus); }
          }}
          rows={2}
          disabled={!aiConfigured}
          placeholder={
            characterName
              ? `Ask how a rule applies to ${characterName} — “can I shove while grappled?”`
              : 'Ask a rules question — “how does exhaustion work?”, “what does Vex do?”'
          }
          style={{
            flex: 1,
            // The marketing site's globals.css applies `min-height: 140px` via a bare `textarea`
            // selector (its contact form), which leaks in here and turns this 2-row input into a
            // slab. Reset it; see the same note in sheetchat.module.css.
            minHeight: 0,
            padding: '9px 11px',
            background: 'rgba(1,10,19,0.5)',
            border: '1px solid var(--hx-line)',
            color: 'var(--hx-text)',
            fontSize: 13.5,
            fontFamily: 'var(--hx-font-body)',
            resize: 'vertical',
          }}
        />
        <button className={styles.hexBtn} type="submit" disabled={busy || !input.trim() || !aiConfigured}>
          {busy ? '…' : 'Ask'}
        </button>
      </form>
    </section>
  );
}
