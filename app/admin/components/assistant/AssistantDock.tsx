'use client';
// app/admin/components/assistant/AssistantDock.tsx — the assistant, on every admin page (audit §5, item 14).
//
// A FAB in the shared floating row plus a panel above it, matching FloatingMessenger and the Fieldbook
// so it is where a user already looks for a floating tool rather than being a fifth convention.
//
// ── THREE THINGS THIS RENDERS THAT A CHAT UI USUALLY DOES NOT ───────────────────────────────────
//
// 1. WHICH TOOLS RAN. `toolCalls` comes back with every reply. Showing "looked up: find_job,
//    equipment_status" is the difference between an answer a surveyor can check and one they have to
//    take on faith — and this assistant answers questions where taking it on faith sends a crew to
//    the wrong property.
// 2. THE CONFIRMATION GATE, as a decision and not a notice. The server has already refused to run the
//    write; the panel shows exactly what it would do, with the arguments, and sends the approval back.
// 3. THE PAGE IT IS ON. The route is part of the grounding, so the header says so — otherwise "what
//    is this page for?" looks like a question about nothing.

import { useEffect, useRef, useState } from 'react';
import { Bot, Send, X, RotateCcw, Wrench, AlertTriangle } from 'lucide-react';
import { useAssistant } from './AssistantProvider';
import { routeLabel } from '@/lib/admin/route-registry';
import { usePathname } from 'next/navigation';

/** Tool names are registry identifiers; a person reading a transcript should see words. */
const TOOL_LABELS: Record<string, string> = {
  find_job: 'looked up a job',
  my_hours: 'read your hours',
  equipment_status: 'checked equipment',
  search_everything: 'searched the firm',
  compliance_due: 'checked expiry dates',
  log_mileage: 'logged mileage',
};
const toolLabel = (name: string) => TOOL_LABELS[name] ?? name.replace(/_/g, ' ');

const SUGGESTIONS = [
  'What is this page for?',
  'What am I clocked into?',
  'What expires in the next 30 days?',
];

export default function AssistantDock() {
  const { open, busy, turns, pending, toggleAssistant, closeAssistant, send, approvePending, rejectPending, reset } =
    useAssistant();
  const [draft, setDraft] = useState('');
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Pin to the newest turn. `turns.length` rather than `turns` as the dependency: the array identity
  // changes on every keystroke-free re-render too, and scrolling on those steals the scrollbar from
  // somebody reading back through an earlier answer.
  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length, busy, pending, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeAssistant();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeAssistant]);

  function submit() {
    const text = draft;
    setDraft('');
    void send(text);
  }

  return (
    <div className="assistant-fab-wrap">
      <span className="assistant-fab-tooltip">Assistant</span>
      <button
        type="button"
        className="assistant-fab"
        onClick={toggleAssistant}
        aria-label={open ? 'Close the assistant' : 'Ask the assistant'}
        aria-expanded={open}
        title="Assistant"
      >
        <Bot size={22} strokeWidth={2} aria-hidden="true" />
      </button>

      {open ? (
        <section className="assistant-panel" role="dialog" aria-label="Assistant">
          <header className="assistant-panel__head">
            <div className="assistant-panel__title">
              <Bot size={16} aria-hidden="true" />
              <span>Assistant</span>
              {/* Naming the page makes "what is this for?" a question with a subject. */}
              <span className="assistant-panel__page">{routeLabel(pathname)}</span>
            </div>
            <div className="assistant-panel__actions">
              {turns.length > 0 ? (
                <button type="button" onClick={reset} aria-label="Start a new conversation" title="New conversation">
                  <RotateCcw size={15} />
                </button>
              ) : null}
              <button type="button" onClick={closeAssistant} aria-label="Close the assistant" title="Close">
                <X size={17} />
              </button>
            </div>
          </header>

          <div className="assistant-panel__body" ref={scrollRef}>
            {turns.length === 0 && !busy ? (
              <div className="assistant-panel__empty">
                <p>
                  Ask about this page, your jobs, your hours, equipment, or surveying itself. I can look things up
                  in the firm&apos;s own records.
                </p>
                <div className="assistant-panel__suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => void send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {turns.map((t, i) => (
              <div
                key={i}
                className={`assistant-turn assistant-turn--${t.role}${t.error ? ' assistant-turn--error' : ''}`}
              >
                {t.error ? <AlertTriangle size={14} aria-hidden="true" className="assistant-turn__icon" /> : null}
                <div className="assistant-turn__text">{t.content}</div>
                {t.toolCalls && t.toolCalls.length > 0 ? (
                  <div className="assistant-turn__tools">
                    <Wrench size={11} aria-hidden="true" />
                    {t.toolCalls.map((c) => toolLabel(c.name)).join(' · ')}
                  </div>
                ) : null}
              </div>
            ))}

            {pending ? (
              <div className="assistant-confirm" role="group" aria-label="Confirm an action">
                <div className="assistant-confirm__head">This will change something. Approve?</div>
                <div className="assistant-confirm__what">{toolLabel(pending.name)}</div>
                <dl className="assistant-confirm__args">
                  {Object.entries(pending.input ?? {}).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k.replace(/_/g, ' ')}</dt>
                      <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="assistant-confirm__buttons">
                  <button type="button" className="assistant-confirm__yes" onClick={() => void approvePending()} disabled={busy}>
                    Approve
                  </button>
                  <button type="button" className="assistant-confirm__no" onClick={rejectPending} disabled={busy}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {busy ? <div className="assistant-turn assistant-turn--assistant assistant-turn--busy">Thinking…</div> : null}
          </div>

          <form
            className="assistant-panel__composer"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              // Enter sends, Shift+Enter breaks the line. The opposite would be safer for accidental
              // sends and wrong for a tool people use one short question at a time, on a phone.
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Ask anything…"
              aria-label="Ask the assistant"
              disabled={busy}
            />
            <button type="submit" aria-label="Send" disabled={busy || !draft.trim()}>
              <Send size={16} />
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
