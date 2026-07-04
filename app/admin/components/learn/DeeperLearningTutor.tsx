// app/admin/components/learn/DeeperLearningTutor.tsx
//
// "Deeper learning with AI" — highlight any passage while studying and open a
// focused, accuracy-first AI conversation about it.
//
// Flow (deliberate, not auto-triggered):
//   1. Click "Deeper learning with AI" → enters highlight mode (banner shown).
//   2. Select the word/sentence/section (re-selectable as many times as needed).
//   3. Click the floating "Take me deeper →" → opens the chat scoped to that text.
//   4. Converse; see related practice problems; close/cancel anytime (or Esc).
'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, GraduationCap, X, Send, BookOpen } from 'lucide-react';

export interface TutorContext {
  moduleId?: string;
  moduleNumber?: number;
  moduleTitle?: string;
  /** Current tab/section title, resolved lazily so it stays fresh. */
  getSectionTitle?: () => string | undefined;
  /** Where the "practice this" links point (e.g. the module quiz). */
  quizHref?: string;
}

interface Msg { role: 'user' | 'assistant'; content: string }
interface RelatedProblem { id: string; question_text: string; difficulty: string }
type Mode = 'idle' | 'selecting' | 'chatting';

/** Minimal, XSS-safe markdown → HTML for the tutor's replies (escape first). */
function renderReply(text: string): string {
  const esc = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    .replace(/<br\/>\s*(<ul>)/g, '$1')
    .replace(/(<\/ul>)\s*<br\/>/g, '$1');
}

export default function DeeperLearningTutor({ context }: { context: TutorContext }) {
  const [mode, setMode] = useState<Mode>('idle');
  const [selText, setSelText] = useState('');
  const [selPos, setSelPos] = useState<{ x: number; y: number } | null>(null);
  const [topic, setTopic] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [related, setRelated] = useState<RelatedProblem[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Track the live text selection while highlighting.
  useEffect(() => {
    if (mode !== 'selecting') return;
    const onSel = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (text && sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0).getBoundingClientRect();
        setSelText(text);
        setSelPos({ x: r.left + r.width / 2, y: r.bottom + window.scrollY });
      } else {
        setSelText(''); setSelPos(null);
      }
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [mode]);

  // Escape cancels/closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (mode === 'chatting') closeChat();
      else if (mode === 'selecting') cancelSelecting();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  function cancelSelecting() {
    setMode('idle'); setSelText(''); setSelPos(null);
    window.getSelection()?.removeAllRanges();
  }
  function closeChat() {
    setMode('idle'); setMessages([]); setRelated([]); setTopic(''); setError(null); setInput('');
  }

  async function ask(history: Msg[], forTopic: string) {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/learn/ai-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          highlightedText: forTopic,
          moduleId: context.moduleId,
          moduleNumber: context.moduleNumber,
          moduleTitle: context.moduleTitle,
          sectionTitle: context.getSectionTitle?.(),
          messages: history,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || `Request failed (${res.status})`); setLoading(false); return; }
      setMessages((prev) => [...prev, { role: 'assistant', content: String(data.reply || '') }]);
      if (Array.isArray(data.relatedProblems)) setRelated(data.relatedProblems);
    } catch {
      setError('Network error — please try again.');
    }
    setLoading(false);
  }

  function startChat() {
    const t = selText.trim();
    if (!t) return;
    setTopic(t); setMode('chatting'); setMessages([]); setRelated([]); setError(null); setSelPos(null);
    window.getSelection()?.removeAllRanges();
    ask([], t); // empty history → the route seeds the opening explanation
  }

  function sendFollowup() {
    const t = input.trim();
    if (!t || loading) return;
    const next: Msg[] = [...messages, { role: 'user', content: t }];
    setMessages(next); setInput('');
    ask(next, topic);
  }

  return (
    <>
      {mode === 'idle' && (
        <button className="ai-tutor__launch" onClick={() => setMode('selecting')}
          title="Highlight a passage, then dive deeper with AI">
          <Sparkles size={16} /> Deeper learning with AI
        </button>
      )}

      {mode === 'selecting' && (
        <div className="ai-tutor__banner" role="status">
          <Sparkles size={15} />
          <span>Highlight the word, sentence, or section you want to explore, then click <b>Take me deeper</b>.</span>
          <button className="ai-tutor__banner-cancel" onClick={cancelSelecting}>Cancel</button>
        </div>
      )}

      {mode === 'selecting' && selText && selPos && (
        <button className="ai-tutor__go" style={{ left: selPos.x, top: selPos.y + 8 }} onClick={startChat}>
          <GraduationCap size={15} /> Take me deeper →
        </button>
      )}

      {mode === 'chatting' && (
        <>
          <div className="ai-tutor__scrim" onClick={closeChat} />
          <div className="ai-tutor__panel" role="dialog" aria-modal="true" aria-label="AI tutor conversation">
            <div className="ai-tutor__head">
              <div className="ai-tutor__title"><GraduationCap size={18} /> Deeper learning</div>
              <button className="ai-tutor__close" onClick={closeChat} aria-label="Close conversation"><X size={18} /></button>
            </div>
            <div className="ai-tutor__topic">
              <span className="ai-tutor__topic-label">Exploring</span>
              “{topic.length > 260 ? topic.slice(0, 260) + '…' : topic}”
            </div>
            <div className="ai-tutor__thread">
              {messages.map((m, i) => (
                <div key={i} className={`ai-tutor__msg ai-tutor__msg--${m.role}`}>
                  {m.role === 'assistant'
                    ? <div className="ai-tutor__bubble" dangerouslySetInnerHTML={{ __html: '<p>' + renderReply(m.content) + '</p>' }} />
                    : <div className="ai-tutor__bubble">{m.content}</div>}
                </div>
              ))}
              {loading && (
                <div className="ai-tutor__msg ai-tutor__msg--assistant">
                  <div className="ai-tutor__bubble ai-tutor__bubble--typing" aria-label="Thinking">
                    <span>Thinking</span>
                    <span className="ai-tutor__dots"><span></span><span></span><span></span></span>
                  </div>
                </div>
              )}
              {error && <div className="ai-tutor__error">{error}</div>}
              {related.length > 0 && (
                <div className="ai-tutor__related">
                  <div className="ai-tutor__related-head"><BookOpen size={14} /> Practice these on the platform</div>
                  {related.map((p) => (
                    context.quizHref
                      ? <a key={p.id} className="ai-tutor__related-item" href={context.quizHref}>
                          <span className="ai-tutor__related-diff">{p.difficulty}</span> {p.question_text}
                        </a>
                      : <div key={p.id} className="ai-tutor__related-item">
                          <span className="ai-tutor__related-diff">{p.difficulty}</span> {p.question_text}
                        </div>
                  ))}
                </div>
              )}
              <div ref={endRef} />
            </div>
            <div className="ai-tutor__compose">
              <textarea className="ai-tutor__input" value={input} rows={1} placeholder="Ask a follow-up question…"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFollowup(); } }} />
              <button className="ai-tutor__send" onClick={sendFollowup} disabled={loading || !input.trim()} aria-label="Send">
                <Send size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
