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
import { Sparkles, GraduationCap, X, Send, BookOpen, Volume2, VolumeX, Mic } from 'lucide-react';
import ProblemCard, { type ProblemData, type GradeResult } from '@/app/admin/components/learn/ProblemCard';

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
type ThreadItem =
  | { kind: 'msg'; role: 'user' | 'assistant'; content: string }
  | { kind: 'card'; cardId: string; problem: ProblemData; answerToken: string };
type Mode = 'idle' | 'selecting' | 'chatting';

// Minimal shape of the Web Speech API (not in the standard TS lib DOM types).
interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start(): void; stop(): void;
}
function getSpeechRecognition(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

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
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [related, setRelated] = useState<RelatedProblem[]>([]);
  const cardSeq = useRef(0);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speak, setSpeak] = useState(false);
  const speakRef = useRef(speak);
  useEffect(() => { speakRef.current = speak; }, [speak]);
  const [listening, setListening] = useState(false);
  const [sttSupported, setSttSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  useEffect(() => { setSttSupported(!!getSpeechRecognition()); }, []);
  const endRef = useRef<HTMLDivElement>(null);

  // Dictate into the composer via the browser's speech recognition.
  function toggleMic() {
    if (listening) { recognitionRef.current?.stop(); return; }
    const SR = getSpeechRecognition();
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    const base = input.trim() ? input.trim() + ' ' : '';
    rec.onresult = (e) => {
      let txt = '';
      for (let i = e.resultIndex; i < e.results.length; i++) txt += e.results[i][0]?.transcript ?? '';
      setInput(base + txt);
    };
    rec.onend = () => { setListening(false); recognitionRef.current = null; };
    rec.onerror = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }
  function stopListening() {
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    recognitionRef.current = null;
    setListening(false);
  }

  // Read a reply aloud with the browser's speech synthesis (markdown stripped).
  function speakText(md: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const plain = md
      .replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*(.*?)\*\*/g, '$1').replace(/[*_#>]/g, '')
      .replace(/^\s*[-•]\s*/gm, '').replace(/\s+/g, ' ').trim();
    if (!plain) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plain);
    u.lang = 'en-US';
    u.rate = 1;
    window.speechSynthesis.speak(u);
  }
  function stopSpeaking() {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
  }

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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread, loading]);
  // Stop any speech + dictation if the component unmounts mid-utterance.
  useEffect(() => () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
  }, []);

  function cancelSelecting() {
    setMode('idle'); setSelText(''); setSelPos(null);
    window.getSelection()?.removeAllRanges();
  }
  function closeChat() {
    stopSpeaking(); stopListening();
    setMode('idle'); setThread([]); setRelated([]); setTopic(''); setError(null); setInput('');
  }
  function toggleSpeak() {
    setSpeak((s) => { if (s) stopSpeaking(); return !s; });
  }

  // The chat transcript (messages only) that the tutor API needs as history.
  const threadMsgs = (): Msg[] =>
    thread.filter((it): it is Extract<ThreadItem, { kind: 'msg' }> => it.kind === 'msg')
      .map((m) => ({ role: m.role, content: m.content }));

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
      const replyText = String(data.reply || '');
      setThread((prev) => [...prev, { kind: 'msg', role: 'assistant', content: replyText }]);
      if (speakRef.current) speakText(replyText);
      if (Array.isArray(data.relatedProblems)) setRelated(data.relatedProblems);
    } catch {
      setError('Network error — please try again.');
    }
    setLoading(false);
  }

  function startChat() {
    const t = selText.trim();
    if (!t) return;
    setTopic(t); setMode('chatting'); setThread([]); setRelated([]); setError(null); setSelPos(null);
    window.getSelection()?.removeAllRanges();
    ask([], t); // empty history → the route seeds the opening explanation
  }

  function sendFollowup() {
    const t = input.trim();
    if (!t || loading) return;
    if (listening) stopListening();
    setThread((prev) => [...prev, { kind: 'msg', role: 'user', content: t }]);
    setInput('');
    ask([...threadMsgs(), { role: 'user', content: t }], topic);
  }

  // Load a practice problem into the thread (from a suggestion, or "another").
  async function spawnCard(action: 'fetch' | 'another', questionId: string) {
    setError(null);
    try {
      const res = await fetch('/api/admin/learn/tutor-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, questionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.problem) { setError(data.error || 'Could not load the problem.'); return; }
      cardSeq.current += 1;
      setThread((prev) => [...prev, { kind: 'card', cardId: `c${cardSeq.current}`, problem: data.problem, answerToken: data.answerToken }]);
    } catch { setError('Network error — please try again.'); }
  }

  // "Explain with AI": ask the tutor to walk through the problem (shows a short
  // user line in the thread but sends the full problem context to the model).
  function handleExplain(problem: ProblemData, studentAnswer: string, result: GradeResult | null) {
    const detail = `Please explain this practice problem step by step and show the worked solution:\n\n"${problem.question_text}"\n\nMy answer was: ${studentAnswer || '(blank)'}.${result?.correctAnswer ? ` The correct answer is ${result.correctAnswer}.` : ''}`;
    setThread((prev) => [...prev, { kind: 'msg', role: 'user', content: 'Explain this problem for me.' }]);
    ask([...threadMsgs(), { role: 'user', content: detail }], topic);
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
              <div className="ai-tutor__head-actions">
                <button className={`ai-tutor__icon-btn ${speak ? 'ai-tutor__icon-btn--on' : ''}`} onClick={toggleSpeak}
                  aria-pressed={speak} title={speak ? 'Reading replies aloud — click to mute' : 'Read replies aloud'}>
                  {speak ? <Volume2 size={17} /> : <VolumeX size={17} />}
                </button>
                <button className="ai-tutor__close" onClick={closeChat} aria-label="Close conversation"><X size={18} /></button>
              </div>
            </div>
            <div className="ai-tutor__topic">
              <span className="ai-tutor__topic-label">Exploring</span>
              “{topic.length > 260 ? topic.slice(0, 260) + '…' : topic}”
            </div>
            <div className="ai-tutor__thread">
              {thread.map((it, i) =>
                it.kind === 'card' ? (
                  <ProblemCard key={it.cardId} problem={it.problem} answerToken={it.answerToken}
                    onExplain={handleExplain} onAnother={(id) => spawnCard('another', id)} />
                ) : (
                  <div key={i} className={`ai-tutor__msg ai-tutor__msg--${it.role}`}>
                    {it.role === 'assistant'
                      ? <div className="ai-tutor__bubble" dangerouslySetInnerHTML={{ __html: '<p>' + renderReply(it.content) + '</p>' }} />
                      : <div className="ai-tutor__bubble">{it.content}</div>}
                  </div>
                )
              )}
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
                  <div className="ai-tutor__related-head"><BookOpen size={14} /> Practice these — tap to try it here</div>
                  {related.map((p) => (
                    <button key={p.id} type="button" className="ai-tutor__related-item ai-tutor__related-item--btn"
                      onClick={() => spawnCard('fetch', p.id)}>
                      <span className="ai-tutor__related-diff">{p.difficulty}</span> {p.question_text}
                    </button>
                  ))}
                </div>
              )}
              <div ref={endRef} />
            </div>
            <div className="ai-tutor__compose">
              {sttSupported && (
                <button className={`ai-tutor__mic ${listening ? 'is-listening' : ''}`} onClick={toggleMic}
                  aria-pressed={listening} title={listening ? 'Stop dictation' : 'Dictate your message'}>
                  <Mic size={16} />
                </button>
              )}
              <textarea className="ai-tutor__input" value={input} rows={1}
                placeholder={listening ? 'Listening… speak now' : 'Ask a follow-up question…'}
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
