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
import { Sparkles, GraduationCap, X, Send, BookOpen, Volume2, VolumeX, Mic, Headphones, History, MessageCircle, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import ProblemCard, { type ProblemData, type GradeResult } from '@/app/admin/components/learn/ProblemCard';
import MessageAudioPlayer from '@/app/admin/components/learn/MessageAudioPlayer';
import { renderStudyMarkdown } from '@/lib/learn/study-markdown';

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
interface ConversationSummary { id: string; title: string; topic: string | null; module_title: string | null; updated_at: string; message_count: number }

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

/** Compact relative time for the conversation history list. */
function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
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
  // Saved-conversation state.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const savingRef = useRef(false);
  const convIdRef = useRef<string | null>(null);
  useEffect(() => { convIdRef.current = conversationId; }, [conversationId]);
  const [speak, setSpeak] = useState(false);
  const speakRef = useRef(speak);
  useEffect(() => { speakRef.current = speak; }, [speak]);
  const [listening, setListening] = useState(false);
  const [sttSupported, setSttSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const premiumTtsRef = useRef<boolean | null>(null); // null=unknown, false=unavailable
  const [activeAudio, setActiveAudio] = useState<number | null>(null);
  const [convoMode, setConvoMode] = useState(false);
  const convoModeRef = useRef(convoMode);
  useEffect(() => { convoModeRef.current = convoMode; }, [convoMode]);
  useEffect(() => { setSttSupported(!!getSpeechRecognition()); }, []);
  const endRef = useRef<HTMLDivElement>(null);
  const lastItemRef = useRef<HTMLDivElement>(null);
  // Draggable panel width (persisted). Text reflows to whatever width is set.
  const [panelWidth, setPanelWidth] = useState(420);
  const panelWidthRef = useRef(420);
  useEffect(() => {
    try {
      const s = localStorage.getItem('aiTutorPanelWidth');
      const w = s ? parseInt(s, 10) : NaN;
      if (!Number.isNaN(w) && w >= 340) { setPanelWidth(w); panelWidthRef.current = w; }
    } catch { /* ignore */ }
  }, []);

  function startResize(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const move = (ev: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in ev ? ev.touches[0]?.clientX ?? 0 : ev.clientX;
      const w = Math.max(340, Math.min(window.innerWidth - 40, window.innerWidth - clientX));
      panelWidthRef.current = w;
      setPanelWidth(w);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
      document.body.style.userSelect = '';
      try { localStorage.setItem('aiTutorPanelWidth', String(Math.round(panelWidthRef.current))); } catch { /* ignore */ }
    };
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
  }

  // Dictate into the composer via the browser's speech recognition.
  function startListening() {
    const SR = getSpeechRecognition();
    if (!SR || recognitionRef.current) return;
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
  function toggleMic() {
    if (listening) { stopListening(); return; }
    startListening();
  }
  function stopListening() {
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    recognitionRef.current = null;
    setListening(false);
  }

  // Read a reply aloud (markdown stripped). Prefers a premium cloud voice via
  // /api/admin/learn/tts and falls back to the browser voice when no provider key
  // is configured (503), on error, or if autoplay is blocked. onEnd fires when
  // speaking finishes — used by conversation mode to auto-listen.
  async function speakText(md: string, onEnd?: () => void) {
    const plain = md
      .replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*(.*?)\*\*/g, '$1').replace(/[*_#>]/g, '')
      .replace(/^\s*[-•]\s*/gm, '').replace(/\s+/g, ' ').trim();
    if (!plain) { onEnd?.(); return; }
    stopSpeaking();

    // Premium voice first (unless a previous call already found it unavailable).
    if (premiumTtsRef.current !== false) {
      try {
        const res = await fetch('/api/admin/learn/tts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: plain }),
        });
        if (res.ok) {
          premiumTtsRef.current = true;
          const url = URL.createObjectURL(await res.blob());
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => { URL.revokeObjectURL(url); if (audioRef.current === audio) audioRef.current = null; onEnd?.(); };
          try { await audio.play(); return; }
          catch { URL.revokeObjectURL(url); if (audioRef.current === audio) audioRef.current = null; /* fall back */ }
        } else {
          premiumTtsRef.current = false; // 503/502 → don't retry the network each reply
        }
      } catch { /* network error → fall back */ }
    }
    browserSpeak(plain, onEnd);
  }
  function browserSpeak(plain: string, onEnd?: () => void) {
    if (typeof window === 'undefined' || !window.speechSynthesis) { onEnd?.(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plain);
    u.lang = 'en-US';
    u.rate = 1;
    if (onEnd) u.onend = onEnd;
    window.speechSynthesis.speak(u);
  }
  function stopSpeaking() {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    if (audioRef.current) { try { audioRef.current.pause(); } catch { /* noop */ } audioRef.current = null; }
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
      if (showHistory) { if (mode === 'chatting') setShowHistory(false); else closeChat(); }
      else if (mode === 'chatting') closeChat();
      else if (mode === 'selecting') cancelSelecting();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, showHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scrolling: when the AI's reply arrives, align the TOP of that reply to the
  // top of the view so the student reads from the beginning (not the end). For a
  // new user message / the thinking indicator / a problem card, keep the newest
  // content in view at the bottom.
  useEffect(() => {
    const last = thread[thread.length - 1];
    if (!loading && last && last.kind === 'msg' && last.role === 'assistant') {
      lastItemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [thread, loading]);
  // Stop any speech + audio + dictation if the component unmounts mid-utterance.
  useEffect(() => () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    try { audioRef.current?.pause(); } catch { /* noop */ }
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
  }, []);

  function cancelSelecting() {
    setMode('idle'); setSelText(''); setSelPos(null);
    window.getSelection()?.removeAllRanges();
  }
  function closeChat() {
    void saveConversation(); // captures the current thread before it's cleared
    stopSpeaking(); stopListening(); setActiveAudio(null);
    setMode('idle'); setShowHistory(false); setMenuOpen(false);
    setThread([]); setRelated([]); setTopic(''); setError(null); setInput(''); setConvoMode(false);
    setConversationId(null); convIdRef.current = null;
  }
  function toggleSpeak() {
    setSpeak((s) => { if (s) stopSpeaking(); return !s; });
  }
  // Hands-free: read replies aloud, then auto-listen. Turning it on enables speak.
  function toggleConvo() {
    setConvoMode((c) => {
      const next = !c;
      if (next) setSpeak(true);
      else { stopSpeaking(); stopListening(); }
      return next;
    });
  }

  // ── Saved conversations ──────────────────────────────────────────────────
  // Upsert the current conversation (only once there's a real exchange).
  async function saveConversation() {
    const msgs = thread.filter((it): it is Extract<ThreadItem, { kind: 'msg' }> => it.kind === 'msg');
    const hasExchange = msgs.some((m) => m.role === 'user') && msgs.some((m) => m.role === 'assistant');
    if (!hasExchange || savingRef.current) return;
    savingRef.current = true;
    try {
      const firstUser = msgs.find((m) => m.role === 'user')?.content || '';
      const title = (topic || firstUser || 'Study chat').replace(/\s+/g, ' ').slice(0, 60);
      const res = await fetch('/api/admin/learn/tutor-conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: convIdRef.current || undefined,
          title, topic: topic || null,
          module_id: context.moduleId, module_title: context.moduleTitle,
          messages: msgs.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.id && !convIdRef.current) { convIdRef.current = data.id; setConversationId(data.id); }
    } catch { /* best effort */ }
    savingRef.current = false;
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/admin/learn/tutor-conversations');
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.conversations)) setHistory(data.conversations);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  }
  function openHistory() { setMenuOpen(false); setShowHistory(true); loadHistory(); }

  async function openConversation(id: string) {
    await saveConversation(); // flush whatever is open first
    try {
      const res = await fetch(`/api/admin/learn/tutor-conversations?id=${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.conversation) { setError('Could not open that conversation.'); return; }
      const c = data.conversation as { id: string; topic: string | null; messages: Array<{ role: string; content: string }> };
      const items: ThreadItem[] = (Array.isArray(c.messages) ? c.messages : [])
        .map((m) => ({ kind: 'msg' as const, role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: String(m.content || '') }));
      setThread(items); setTopic(c.topic || ''); setRelated([]); setError(null);
      setConversationId(c.id); convIdRef.current = c.id;
      setShowHistory(false); setMode('chatting');
    } catch { setError('Could not open that conversation.'); }
  }

  async function deleteConversation(id: string) {
    try {
      await fetch(`/api/admin/learn/tutor-conversations?id=${id}`, { method: 'DELETE' });
      setHistory((prev) => prev.filter((c) => c.id !== id));
      if (convIdRef.current === id) { convIdRef.current = null; setConversationId(null); }
    } catch { /* ignore */ }
  }

  // Open a general conversation (no highlight) with a friendly welcome line.
  function startGeneralChat() {
    setMenuOpen(false); setShowHistory(false);
    setTopic(''); setConversationId(null); convIdRef.current = null;
    setThread([{ kind: 'msg', role: 'assistant', content: `Hi! I'm your study tutor${context.moduleTitle ? ` for ${context.moduleTitle}` : ''}. Ask me anything about the material — or highlight a passage in the lesson and I'll dig into it with you.` }]);
    setRelated([]); setError(null); setInput(''); setMode('chatting');
  }

  // Auto-save (debounced) whenever the conversation changes while chatting.
  useEffect(() => {
    if (mode !== 'chatting') return;
    const t = setTimeout(() => { void saveConversation(); }, 1200);
    return () => clearTimeout(t);
  }, [thread, mode]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Conversation mode: read the reply, then auto-open the mic so the student
      // can just speak back (listen only AFTER speaking, to avoid mic/TTS echo).
      if (speakRef.current || convoModeRef.current) {
        setActiveAudio(null); // global read-aloud takes over — pause any per-message players
        speakText(replyText, convoModeRef.current ? () => startListening() : undefined);
      }
      if (Array.isArray(data.relatedProblems)) setRelated(data.relatedProblems);
    } catch {
      setError('Network error — please try again.');
    }
    setLoading(false);
  }

  function startChat() {
    const t = selText.trim();
    if (!t) return;
    setConversationId(null); convIdRef.current = null;
    setTopic(t); setMode('chatting'); setThread([]); setRelated([]); setError(null); setSelPos(null);
    setMenuOpen(false); setShowHistory(false);
    window.getSelection()?.removeAllRanges();
    ask([], t); // empty history → the route seeds the opening explanation
  }

  // Falls back to the module/general context when there's no highlighted topic
  // (a general "open chat"), since the tutor API needs a non-empty focus.
  const effectiveTopic = () => topic || context.moduleTitle || 'General surveying study help';

  function sendFollowup() {
    const t = input.trim();
    if (!t || loading) return;
    if (listening) stopListening();
    setThread((prev) => [...prev, { kind: 'msg', role: 'user', content: t }]);
    setInput('');
    ask([...threadMsgs(), { role: 'user', content: t }], effectiveTopic());
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
    // Written/essay answers can't be auto-graded — ask the tutor to grade them.
    const written = result != null && result.gradable === false;
    const detail = written
      ? `I answered this practice question in writing. Please grade my answer: say what is correct, what is missing or wrong, and then give the ideal answer.\n\nQuestion: "${problem.question_text}"\n\nMy written answer: ${studentAnswer || '(blank)'}\n\nModel answer for reference: ${result?.correctAnswer || '(none on file — use your own expertise)'}`
      : `Please explain this practice problem step by step and show the worked solution:\n\n"${problem.question_text}"\n\nMy answer was: ${studentAnswer || '(blank)'}.${result?.correctAnswer ? ` The correct answer is ${result.correctAnswer}.` : ''}`;
    const userLine = written ? 'Please grade my written answer.' : 'Explain this problem for me.';
    setThread((prev) => [...prev, { kind: 'msg', role: 'user', content: userLine }]);
    ask([...threadMsgs(), { role: 'user', content: detail }], effectiveTopic());
  }

  return (
    <>
      {mode === 'idle' && !showHistory && (
        <div className="ai-tutor__launch-wrap">
          <button className="ai-tutor__launch" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-haspopup="menu">
            <Sparkles size={16} /> Study with AI tutor
          </button>
          {menuOpen && (
            <>
              <div className="ai-tutor__menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="ai-tutor__menu" role="menu">
                <button className="ai-tutor__menu-item" role="menuitem" onClick={startGeneralChat}>
                  <MessageCircle size={15} /> Open a chat
                </button>
                <button className="ai-tutor__menu-item" role="menuitem" onClick={() => { setMenuOpen(false); setMode('selecting'); }}>
                  <Sparkles size={15} /> Highlight &amp; explore
                </button>
                <button className="ai-tutor__menu-item" role="menuitem" onClick={openHistory}>
                  <History size={15} /> Past conversations
                </button>
              </div>
            </>
          )}
        </div>
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

      {(mode === 'chatting' || showHistory) && (
        <div className="ai-tutor__panel" role="dialog" aria-label="AI tutor conversation"
          style={{ ['--ai-tutor-w' as string]: `${panelWidth}px` } as React.CSSProperties}>
          <div className="ai-tutor__resize" onMouseDown={startResize} onTouchStart={startResize}
            role="separator" aria-label="Drag to resize the panel" title="Drag to resize" />
          {showHistory ? (
            <>
              <div className="ai-tutor__head">
                <button className="ai-tutor__icon-btn" onClick={() => (mode === 'chatting' ? setShowHistory(false) : closeChat())} title="Back" aria-label="Back"><ChevronLeft size={18} /></button>
                <div className="ai-tutor__title"><History size={17} /> Your conversations</div>
                <button className="ai-tutor__close" onClick={closeChat} aria-label="Close"><X size={18} /></button>
              </div>
              <div className="ai-tutor__history">
                <button className="ai-tutor__new" onClick={startGeneralChat}><Plus size={15} /> New conversation</button>
                {historyLoading ? (
                  <div className="ai-tutor__hist-empty">Loading…</div>
                ) : history.length === 0 ? (
                  <div className="ai-tutor__hist-empty">No saved conversations yet. Start one and it’ll appear here for review.</div>
                ) : (
                  history.map((c) => (
                    <div key={c.id} className={`ai-tutor__hist-item ${c.id === conversationId ? 'is-current' : ''}`}>
                      <button className="ai-tutor__hist-open" onClick={() => openConversation(c.id)}>
                        <div className="ai-tutor__hist-title">{c.title || 'Conversation'}</div>
                        <div className="ai-tutor__hist-meta">{c.module_title ? `${c.module_title} · ` : ''}{c.message_count} message{c.message_count === 1 ? '' : 's'} · {relTime(c.updated_at)}</div>
                      </button>
                      <button className="ai-tutor__hist-del" onClick={() => deleteConversation(c.id)} title="Delete" aria-label="Delete conversation"><Trash2 size={15} /></button>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="ai-tutor__head">
                <div className="ai-tutor__title"><GraduationCap size={18} /> Deeper learning</div>
                <div className="ai-tutor__head-actions">
                  <button className="ai-tutor__icon-btn" onClick={openHistory} title="Past conversations" aria-label="Past conversations"><History size={17} /></button>
                  {sttSupported && (
                    <button className={`ai-tutor__icon-btn ${convoMode ? 'ai-tutor__icon-btn--on' : ''}`} onClick={toggleConvo}
                      aria-pressed={convoMode} title={convoMode ? 'Hands-free conversation on — click to stop' : 'Hands-free conversation (reads replies, then listens)'}>
                      <Headphones size={17} />
                    </button>
                  )}
                  <button className={`ai-tutor__icon-btn ${speak ? 'ai-tutor__icon-btn--on' : ''}`} onClick={toggleSpeak}
                    aria-pressed={speak} title={speak ? 'Reading replies aloud — click to mute' : 'Read replies aloud'}>
                    {speak ? <Volume2 size={17} /> : <VolumeX size={17} />}
                  </button>
                  <button className="ai-tutor__close" onClick={closeChat} aria-label="Close conversation"><X size={18} /></button>
                </div>
              </div>
              <div className="ai-tutor__topic">
                <span className="ai-tutor__topic-label">{topic ? 'Exploring' : 'Chat'}</span>
                {topic ? ` “${topic.length > 260 ? topic.slice(0, 260) + '…' : topic}”` : ' General study conversation'}
              </div>
              <div className="ai-tutor__thread">
              {thread.map((it, i) =>
                it.kind === 'card' ? (
                  <ProblemCard key={it.cardId} problem={it.problem} answerToken={it.answerToken}
                    onExplain={handleExplain} onAnother={(id) => spawnCard('another', id)} />
                ) : (
                  <div key={i} ref={i === thread.length - 1 ? lastItemRef : undefined}
                    className={`ai-tutor__msg ai-tutor__msg--${it.role}`}>
                    {it.role === 'assistant'
                      ? (
                        <div className="ai-tutor__msg-col">
                          <div className="ai-tutor__bubble study-md" dangerouslySetInnerHTML={{ __html: renderStudyMarkdown(it.content) }} />
                          <MessageAudioPlayer text={it.content} active={activeAudio === i}
                            onActivate={() => { setActiveAudio(i); stopSpeaking(); }} />
                        </div>
                      )
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
            </>
          )}
        </div>
      )}
    </>
  );
}
