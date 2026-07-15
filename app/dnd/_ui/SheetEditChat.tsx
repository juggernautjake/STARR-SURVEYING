// app/dnd/_ui/SheetEditChat.tsx — the bottom-right AI edit chat (Phase V, Slice 8).
//
// A floating, on-theme (Hextech) chat dock the owner/DM uses to ask for changes to THIS
// character after it's generated: new feats, abilities, mechanics, transformations,
// spells, attacks, stats — phrased in plain language. Each request goes to the grounded,
// system-scoped `/ai-edit` route (which only ever writes this one character), then the
// mounted sheet reloads live via a window event. Scope is stated in the header so the
// user knows the agent only touches this character's sheet (Slice 8b boundary).
'use client';

import { useRef, useState } from 'react';

interface Msg { role: 'user' | 'ai'; text: string }

export default function SheetEditChat({
  characterId,
  characterName,
  aiConfigured,
}: {
  characterId: string;
  characterName: string;
  aiConfigured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  function push(m: Msg) {
    setMsgs((prev) => [...prev, m]);
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }));
  }

  async function send() {
    const instruction = input.trim();
    if (!instruction || busy) return;
    setInput('');
    push({ role: 'user', text: instruction });
    setBusy(true);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/ai-edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        push({ role: 'ai', text: j.error ?? 'That change could not be applied.' });
      } else {
        const n = j.editCount ?? 0;
        push({ role: 'ai', text: j.summary || `Applied ${n} change${n === 1 ? '' : 's'} to ${j.name ?? characterName}.` });
        // Tell the mounted sheet (a separate React tree) to refetch the fresh data.
        window.dispatchEvent(new CustomEvent('dnd:reload-character', { detail: { id: characterId } }));
      }
    } catch {
      push({ role: 'ai', text: 'Network error — please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 60, fontFamily: 'var(--hx-font-body, system-ui, sans-serif)' }}>
      {open ? (
        <div
          style={{
            width: 'min(380px, calc(100vw - 36px))',
            height: 'min(520px, calc(100vh - 120px))',
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(180deg, rgba(14,30,48,0.98), rgba(6,16,28,0.98))',
            border: '1px solid var(--hx-line, rgba(200,170,110,0.35))',
            borderRadius: 12,
            boxShadow: '0 12px 40px rgba(1,10,19,0.6), 0 0 0 1px rgba(10,200,185,0.08)',
            overflow: 'hidden',
            backdropFilter: 'blur(6px)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--hx-line, rgba(200,170,110,0.28))' }}>
            <span aria-hidden style={{ color: 'var(--hx-teal-1, #0ac8b9)' }}>✦</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--hx-font-display, serif)', color: 'var(--hx-gold-2, #f0e6d2)', fontSize: 14, letterSpacing: '0.03em' }}>SHEET ASSISTANT</div>
              <div style={{ fontSize: 10.5, color: 'var(--hx-muted, #7a8ba0)' }}>Edits only {characterName}&apos;s sheet</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'transparent', border: 0, color: 'var(--hx-muted, #7a8ba0)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>

          {/* Messages */}
          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'grid', gap: 8, alignContent: 'start' }}>
            {msgs.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--hx-muted, #7a8ba0)', lineHeight: 1.5 }}>
                Ask for any change to this character — “add a fire-breath action”, “give them the Alert feat”,
                “raise Strength to 18”, “add a second-wind transformation”. Only this sheet is affected.
              </div>
            )}
            {msgs.map((m, i) => (
              <div
                key={i}
                style={{
                  justifySelf: m.role === 'user' ? 'end' : 'start',
                  maxWidth: '86%',
                  padding: '8px 11px',
                  borderRadius: 10,
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: m.role === 'user' ? 'var(--hx-gold-2, #f0e6d2)' : 'var(--hx-text, #cdd9e5)',
                  background: m.role === 'user' ? 'rgba(200,170,110,0.14)' : 'rgba(10,200,185,0.10)',
                  border: `1px solid ${m.role === 'user' ? 'rgba(200,170,110,0.3)' : 'rgba(10,200,185,0.28)'}`,
                }}
              >
                {m.text}
              </div>
            ))}
            {busy && <div style={{ justifySelf: 'start', fontSize: 12, color: 'var(--hx-muted, #7a8ba0)' }}>Applying…</div>}
          </div>

          {/* Input */}
          <div style={{ padding: 10, borderTop: '1px solid var(--hx-line, rgba(200,170,110,0.28))', display: 'flex', gap: 8 }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder={aiConfigured ? 'Describe a change…' : 'AI is not configured'}
              disabled={busy || !aiConfigured}
              rows={2}
              style={{
                flex: 1,
                resize: 'none',
                padding: '8px 10px',
                fontSize: 13,
                color: 'var(--hx-text, #cdd9e5)',
                background: 'rgba(1,10,19,0.6)',
                border: '1px solid var(--hx-line, rgba(200,170,110,0.28))',
                borderRadius: 8,
                fontFamily: 'inherit',
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={busy || !aiConfigured || !input.trim()}
              style={{
                alignSelf: 'stretch',
                padding: '0 14px',
                borderRadius: 8,
                border: '1px solid var(--hx-teal-1, #0ac8b9)',
                background: 'rgba(10,200,185,0.16)',
                color: 'var(--hx-gold-2, #f0e6d2)',
                cursor: busy || !aiConfigured || !input.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: 13,
                opacity: busy || !aiConfigured || !input.trim() ? 0.5 : 1,
              }}
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 16px',
            borderRadius: 999,
            border: '1px solid var(--hx-teal-1, #0ac8b9)',
            background: 'linear-gradient(180deg, rgba(14,30,48,0.96), rgba(6,16,28,0.96))',
            color: 'var(--hx-gold-2, #f0e6d2)',
            boxShadow: '0 8px 24px rgba(1,10,19,0.5), 0 0 16px rgba(10,200,185,0.25)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13.5,
            fontFamily: 'var(--hx-font-display, serif)',
            letterSpacing: '0.03em',
          }}
        >
          <span aria-hidden style={{ color: 'var(--hx-teal-1, #0ac8b9)' }}>✦</span> Edit with AI
        </button>
      )}
    </div>
  );
}
