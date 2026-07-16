// app/dnd/_ui/SheetEditChat.tsx — the bottom-right AI edit chat (Phase V, Slice 8),
// themed to the site's Hextech look with a streaming feel (Slice 14).
//
// The owner/DM asks for any change to THIS character — mechanics (feats, abilities,
// transformations, spells, stats) or the sheet itself (layout, widgets, styling). Each
// request goes to the grounded, system-scoped `/ai-edit` route (which only ever writes
// this one character). Mechanics changes reload the mounted sheet via a window event;
// layout/style changes refresh the server props. The AI reply reveals with a typewriter
// caret and a bouncing "typing" indicator streams while the agent works.
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './sheetchat.module.css';
import { useResizable } from './useResizable';

interface Msg { role: 'user' | 'ai'; text: string }

/** Reveal the latest AI message with a typewriter effect for a smooth streamed feel. */
function useTypewriter(msgs: Msg[]): string {
  const last = msgs[msgs.length - 1];
  const [shown, setShown] = useState('');
  useEffect(() => {
    if (!last || last.role !== 'ai') { setShown(''); return; }
    setShown('');
    let i = 0;
    const full = last.text;
    const id = setInterval(() => {
      i += 2;
      setShown(full.slice(0, i));
      if (i >= full.length) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [last]);
  return shown;
}

export default function SheetEditChat({
  characterId,
  characterName,
  aiConfigured,
}: {
  characterId: string;
  characterName: string;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const typed = useTypewriter(msgs);
  // Anchored bottom-right, so the top-left grip must invert BOTH axes to grow into the screen.
  // Sized per-character: you want the panel big while building a sheet, small while playing it.
  const { size, resizing, handleProps } = useResizable(
    { w: 390, h: 540 },
    { storageKey: `dnd:chat-size:edit:${characterId}`, invert: { x: true, y: true }, min: { w: 300, h: 260 } },
  );

  useEffect(() => {
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }));
  }, [msgs, typed, busy]);

  async function send() {
    const instruction = input.trim();
    if (!instruction || busy) return;
    setInput('');
    setMsgs((prev) => [...prev, { role: 'user', text: instruction }]);
    setBusy(true);
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/ai-edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsgs((prev) => [...prev, { role: 'ai', text: j.error ?? 'That change could not be applied.' }]);
      } else {
        const n = j.editCount ?? 0;
        setMsgs((prev) => [...prev, { role: 'ai', text: j.summary || `Applied ${n} change${n === 1 ? '' : 's'} to ${j.name ?? characterName}.` }]);
        if (j.kind === 'layout') {
          router.refresh();
        } else {
          window.dispatchEvent(new CustomEvent('dnd:reload-character', { detail: { id: characterId } }));
        }
      }
    } catch {
      setMsgs((prev) => [...prev, { role: 'ai', text: 'Network error — please try again.' }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className={styles.root}>
        <button type="button" onClick={() => setOpen(true)} className={styles.launcher}>
          <span aria-hidden className={styles.spark}>✦</span> Edit with AI
        </button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div
        className={`${styles.panel} ${resizing ? styles.resizing : ''}`}
        // `size` is null until mount (reading localStorage during render would hydrate-mismatch),
        // so the CSS default holds for the first paint and the remembered size takes over after.
        style={size ? { width: size.w, height: size.h } : undefined}
      >
        <div className={styles.grip} {...handleProps} />
        <div className={styles.head}>
          <span aria-hidden className={styles.spark}>✦</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.headTitle}>SHEET ASSISTANT</div>
            <div className={styles.headSub}>Edits only {characterName}&apos;s sheet</div>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className={styles.close}>×</button>
        </div>

        <div ref={listRef} className={styles.stream}>
          {msgs.length === 0 && (
            <div className={styles.hint}>
              Ask for any change — mechanics like “add a fire-breath action”, “give them the Alert feat”,
              “raise Strength to 18”; or the sheet itself: “add a counter for focus points”, “move the stats
              to the top”, “make the headers gold”. Only this character is affected.
            </div>
          )}
          {msgs.map((m, i) => {
            const isLastAi = i === msgs.length - 1 && m.role === 'ai';
            const text = isLastAi ? typed : m.text;
            return (
              <div key={i} className={`${styles.bubble} ${m.role === 'user' ? styles.user : styles.ai}`}>
                {text}
                {isLastAi && text.length < m.text.length && <span className={styles.caret}>▍</span>}
              </div>
            );
          })}
          {busy && (
            <div className={`${styles.bubble} ${styles.ai} ${styles.typing}`} aria-label="Assistant is working">
              <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
            </div>
          )}
        </div>

        <div className={styles.inputRow}>
          <textarea
            className={styles.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={aiConfigured ? 'Describe a change…' : 'AI is not configured'}
            disabled={busy || !aiConfigured}
            rows={2}
          />
          <button type="button" className={styles.send} onClick={send} disabled={busy || !aiConfigured || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
