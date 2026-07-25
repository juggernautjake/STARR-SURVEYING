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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './sheetchat.module.css';
import { useResizable } from './useResizable';

interface Msg {
  role: 'user' | 'ai';
  text: string;
  /** For an AI reply that made a mechanics change: the batch to undo, so the message can offer a
   *  one-click "Undo this change". Cleared once undone. */
  batchId?: string;
  undone?: boolean;
  /** Workstream B — a PROPOSED change, not yet saved. The message carries the exact tool call the
   *  server described, and Confirm sends it back to be applied. Nothing was written to produce this. */
  proposal?: { tool: string; input: unknown };
  /** How the proposal was resolved, so the buttons collapse into a statement of what happened. */
  resolved?: 'sheet' | 'variant' | 'cancelled';
}

/** Reveal the latest AI message with a typewriter effect for a smooth streamed feel. */
function useTypewriter(msgs: Msg[]): string {
  const last = msgs[msgs.length - 1];
  // Keyed on the TEXT, not the message object: resolving a proposal in place (Confirm/Cancel sets
  // `resolved`) makes a new object for the same message, and depending on identity replayed the whole
  // typewriter every time a button was pressed.
  const full = last && last.role === 'ai' ? last.text : null;
  const [shown, setShown] = useState('');
  useEffect(() => {
    if (full == null) { setShown(''); return; }
    setShown('');
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setShown(full.slice(0, i));
      if (i >= full.length) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [full]);
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

  /** Refresh whatever the change touched: a layout edit changes server props, everything else the
   *  mounted sheet. */
  const refreshAfter = useCallback(
    (kind: string) => {
      if (kind === 'layout') router.refresh();
      else window.dispatchEvent(new CustomEvent('dnd:reload-character', { detail: { id: characterId } }));
    },
    [characterId, router],
  );

  /**
   * PHASE 1 — ask. The assistant either ANSWERS (nothing is written) or PROPOSES a change, describing
   * what it does and where on the sheet to look. Neither outcome touches the character: the change is
   * only saved if the user confirms it below. Assumes the caller owns the busy flag (see the queue).
   */
  const runEdit = useCallback(
    async (instruction: string) => {
      setMsgs((prev) => [...prev, { role: 'user', text: instruction }]);
      try {
        const r = await fetch(`/api/dnd/characters/${characterId}/ai-edit`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction, mode: 'preview' }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setMsgs((prev) => [...prev, { role: 'ai', text: j.error ?? 'That could not be done.' }]);
        } else if (j.kind === 'proposal') {
          setMsgs((prev) => [...prev, { role: 'ai', text: j.text || j.description || 'I can make that change.', proposal: j.proposal }]);
        } else {
          // A plain answer — a question must never mutate the sheet, so there is nothing to confirm.
          setMsgs((prev) => [...prev, { role: 'ai', text: j.text || 'I don’t have an answer for that.' }]);
        }
      } catch {
        setMsgs((prev) => [...prev, { role: 'ai', text: 'Network error — please try again.' }]);
      }
    },
    [characterId],
  );

  const [confirming, setConfirming] = useState<number | null>(null);
  /**
   * PHASE 2 — commit. The UNIVERSAL SAVE CHOICE: the same decision the draft Save banner offers, so
   * every commit in the app means one of exactly two things — change the version you're looking at, or
   * branch a new variant that has the change while this version keeps what it had.
   */
  const confirm = useCallback(
    async (index: number, target: 'sheet' | 'variant') => {
      const msg = msgs[index];
      if (!msg?.proposal) return;
      setConfirming(index);
      try {
        const r = await fetch(`/api/dnd/characters/${characterId}/ai-edit`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'confirm', proposal: msg.proposal, target }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setMsgs((prev) => [...prev, { role: 'ai', text: j.error ?? 'That change could not be saved.' }]);
        } else {
          const n = j.editCount ?? 0;
          setMsgs((prev) => prev.map((m, i) => (i === index ? { ...m, resolved: target } : m)));
          setMsgs((prev) => [...prev, {
            role: 'ai',
            text: target === 'variant'
              ? `Saved as a new variant — ${characterName} is unchanged. Open VERSIONS to switch to it.`
              : (j.summary || `Applied ${n} change${n === 1 ? '' : 's'} to ${j.name ?? characterName}.`),
            // Undo is bound to the live sheet's batch; a variant save has none (nothing on this
            // version changed), so no Undo button is offered there.
            batchId: j.kind === 'mechanics' && j.batchId ? j.batchId : undefined,
          }]);
          if (target === 'variant') router.refresh(); // the VERSIONS list gained a card
          else refreshAfter(j.kind);
        }
      } catch {
        setMsgs((prev) => [...prev, { role: 'ai', text: 'Network error — the change was not saved.' }]);
      } finally {
        setConfirming(null);
      }
    },
    [characterId, characterName, msgs, refreshAfter, router],
  );

  const [undoing, setUndoing] = useState<string | null>(null);
  /** Undo a whole AI change (the batch that message made) in one click. */
  const undo = useCallback(
    async (batchId: string) => {
      setUndoing(batchId);
      try {
        const r = await fetch(`/api/dnd/characters/${characterId}/edits/revert-batch`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setMsgs((prev) => [...prev, { role: 'ai', text: j.error ?? 'Could not undo that change.' }]);
        } else {
          setMsgs((prev) => prev.map((m) => (m.batchId === batchId ? { ...m, undone: true } : m)));
          setMsgs((prev) => [...prev, { role: 'ai', text: `Undone — reverted ${j.reverted ?? 0} change${j.reverted === 1 ? '' : 's'}. Your character is back to how it was.` }]);
          window.dispatchEvent(new CustomEvent('dnd:reload-character', { detail: { id: characterId } }));
        }
      } catch {
        setMsgs((prev) => [...prev, { role: 'ai', text: 'Network error — could not undo.' }]);
      } finally {
        setUndoing(null);
      }
    },
    [characterId],
  );

  // Queue rather than drop. Sheet edits MUST stay serial — two concurrent ai-edit calls would
  // each read the sheet, apply their own change, and write back, so whichever landed second would
  // silently erase the first (a lost update). But "serial" is not a reason to refuse the typist:
  // the request is in flight, not the person. So a message sent while busy waits its turn.
  const [queue, setQueue] = useState<string[]>([]);

  function send() {
    const instruction = input.trim();
    if (!instruction) return;
    setInput('');
    setQueue((q) => [...q, instruction]);
  }

  useEffect(() => {
    if (busy || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setBusy(true);
    void runEdit(next).finally(() => setBusy(false));
  }, [busy, queue, runEdit]);

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
            <div className={styles.headSub}>Asks answered · changes confirmed before saving</div>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className={styles.close}>×</button>
        </div>

        <div ref={listRef} className={styles.stream}>
          {msgs.length === 0 && (
            <div className={styles.hint}>
              <strong>Ask anything</strong> about {characterName} or the rules — “what does Alert do?”, “can I
              cast this while grappled?”, “what are my best options at this level?” — and get a grounded answer.
              <br /><br />
              <strong>Or ask for a change</strong> — “give them the Alert feat”, “raise Strength to 18”, “add a
              counter for focus points”, “make the headers gold”. Changes are <em>proposed first</em>: you see
              what it does and where to check it, then choose to apply it to this version or save it as a new
              variant. Nothing is saved until you confirm. Only this character is affected.
            </div>
          )}
          {msgs.map((m, i) => {
            const isLastAi = i === msgs.length - 1 && m.role === 'ai';
            const text = isLastAi ? typed : m.text;
            return (
              <div key={i} className={`${styles.bubble} ${m.role === 'user' ? styles.user : styles.ai}`}>
                {text}
                {isLastAi && text.length < m.text.length && <span className={styles.caret}>▍</span>}
                {/* A PROPOSAL — nothing has been saved yet. Confirm decides both whether and where. */}
                {m.proposal && (
                  m.resolved ? (
                    <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
                      {m.resolved === 'sheet' ? '✓ applied to this sheet' : m.resolved === 'variant' ? '✓ saved as a new variant' : '✕ cancelled'}
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button" onClick={() => confirm(i, 'sheet')} disabled={confirming !== null}
                        title="Save this change to the version you're looking at"
                        style={{ fontSize: 11.5, cursor: 'pointer', padding: '4px 11px', borderRadius: 12, border: '1px solid var(--hx-gold-2, currentColor)', background: 'rgba(200,170,110,0.14)', color: 'inherit' }}
                      >
                        {confirming === i ? 'Saving…' : '✓ Apply to this sheet'}
                      </button>
                      <button
                        type="button" onClick={() => confirm(i, 'variant')} disabled={confirming !== null}
                        title="Branch a new variant that has this change — this version keeps what it has"
                        // Teal, matching the draft Save banner: branching a variant is a real choice, not the
                        // leftover option, so it gets its own tone rather than a bare outline.
                        style={{ fontSize: 11.5, cursor: 'pointer', padding: '4px 11px', borderRadius: 12, border: '1px solid var(--hx-teal-1, #0ac8b9)', background: 'rgba(10,200,185,0.14)', color: 'var(--hx-teal-1, #0ac8b9)' }}
                      >
                        + Save as new variant
                      </button>
                      <button
                        type="button" onClick={() => setMsgs((prev) => prev.map((x, xi) => (xi === i ? { ...x, resolved: 'cancelled' } : x)))}
                        disabled={confirming !== null}
                        style={{ fontSize: 11.5, cursor: 'pointer', padding: '4px 11px', borderRadius: 12, border: 'none', background: 'transparent', color: 'inherit', opacity: 0.7 }}
                      >
                        Cancel
                      </button>
                    </div>
                  )
                )}
                {m.batchId && (
                  m.undone ? (
                    <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>↩ change undone</div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => undo(m.batchId!)}
                      disabled={undoing === m.batchId}
                      title="Undo everything this change did"
                      style={{ marginTop: 6, fontSize: 11.5, cursor: 'pointer', padding: '3px 10px', borderRadius: 12, border: '1px solid var(--hx-line, currentColor)', background: 'transparent', color: 'inherit', opacity: 0.9 }}
                    >
                      {undoing === m.batchId ? 'Undoing…' : '⟲ Undo this change'}
                    </button>
                  )
                )}
              </div>
            );
          })}
          {busy && (
            <div className={`${styles.bubble} ${styles.ai} ${styles.typing}`} aria-label="Assistant is working">
              <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
            </div>
          )}
        </div>

        {/* Queued while the assistant works. Shown, not silently held: a message you typed and
            can't see is indistinguishable from one that was dropped. */}
        {queue.length > 0 && (
          <div className={styles.queued}>
            {queue.length} queued — will send {queue.length === 1 ? 'next' : 'in order'}
          </div>
        )}

        <div className={styles.inputRow}>
          <textarea
            className={styles.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={aiConfigured ? 'Ask a question, or describe a change…' : 'AI is not configured'}
            // NOT disabled while busy. The request is in flight, not the person — locking the box
            // for the whole round-trip takes it away at exactly the moment you have something to
            // add. Sends made while busy queue (see above) instead of being dropped.
            disabled={!aiConfigured}
            rows={2}
          />
          <button type="button" className={styles.send} onClick={send} disabled={!aiConfigured || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
