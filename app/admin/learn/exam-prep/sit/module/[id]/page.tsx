// app/admin/learn/exam-prep/sit/module/[id]/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Loader2, FileX, Lock, CheckCircle2, ClipboardList, BookOpen, FileText, Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import QuizRunner from '@/app/admin/components/QuizRunner';
import MediaViewer, { type MediaItem } from '@/app/admin/components/MediaViewer';
import DeeperLearningTutor from '@/app/admin/components/learn/DeeperLearningTutor';
import { chunkModule, chunkPosition, firstChunkOfSection, type Chunk } from '@/lib/learn/chunkSection';
import PracticePanel from '@/app/admin/components/learn/PracticePanel';
import FlashcardsPanel from '@/app/admin/components/learn/FlashcardsPanel';
import TermDefinitionPopup, { type TermPopupTarget } from '@/app/admin/components/learn/TermDefinitionPopup';
import { looksLikeTerm, lookupTerm } from '@/lib/learn/fsGlossary';
import { protectMath } from '@/lib/learn/math';
import { usePageError } from '../../../../../hooks/usePageError';

interface ContentSection {
  type: string;
  title: string;
  content: string;
}

interface Formula {
  name: string;
  formula: string;
}

interface WeakArea {
  topic: string;
  weakness_score: number;
  questions_attempted: number;
  questions_correct: number;
}

interface ModuleData {
  id: string;
  module_number: number;
  title: string;
  description: string;
  week_range: string;
  exam_weight_percent: number;
  key_topics: string[];
  key_formulas: Formula[];
  content_sections: ContentSection[];
  icon: string;
  passing_score: number;
  question_count: number;
}

interface ProgressData {
  status: string;
  quiz_best_score: number;
  quiz_attempts_count: number;
}

interface QuizAttempt {
  id: string;
  score_percent: number;
  correct_answers: number;
  total_questions: number;
  completed_at: string;
}

// Lesson section tabs that count toward the "sections read" indicator
// (practice/flashcards are not lesson content).
const CONTENT_TABS = ['overview', 'concepts', 'formulas', 'examples', 'tips'];

export default function FSModulePage() {
  const params = useParams();
  const moduleId = params.id as string;
  const { safeFetch } = usePageError('FSModulePage');

  const [module, setModule] = useState<ModuleData | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [recentAttempts, setRecentAttempts] = useState<QuizAttempt[]>([]);
  const [weakAreas, setWeakAreas] = useState<WeakArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [sectionsRead, setSectionsRead] = useState<string[]>([]);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [viewerMedia, setViewerMedia] = useState<MediaItem | null>(null);
  const [termTarget, setTermTarget] = useState<TermPopupTarget | null>(null);

  // Tap any lesson figure (diagram/photo) to open it in the zoomable MediaViewer
  // — great for reading small labels on a phone. Delegated click on the content.
  // A click on a highlighted term (<strong class="fs-term">) opens a definition
  // popup: instant for glossary terms, AI-defined otherwise.
  function handleContentClick(e: React.MouseEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement;
    const img = el.closest('img.fs-fig__img') as HTMLImageElement | null;
    if (img) {
      setViewerMedia({ url: img.currentSrc || img.src, name: img.alt || 'Figure', type: 'image/*' });
      return;
    }
    const term = el.closest('.fs-term') as HTMLElement | null;
    if (term) {
      const text = (term.textContent || '').trim();
      if (!text) return;
      // `renderMarkdown` marks every **bold** run as a term, and authors bold emphasis, formulas,
      // angle values and headings too. Opening a definition popup for `**not**` or `**112°00′25″**`
      // asks the AI to define something that has no definition — and it will oblige. Skip those.
      if (!looksLikeTerm(text)) return;
      const hit = lookupTerm(text);
      setTermTarget({
        term: text,
        definition: hit ? hit.definition : null,
        context: module ? `Module ${module.module_number} — ${module.title}` : undefined,
        x: e.clientX,
        y: e.clientY,
      });
    }
  }

  const fetchModule = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/learn/exam-prep/fs?module_id=${moduleId}`);
      if (res.ok) {
        const data = await res.json();
        setModule(data.module);
        setProgress(data.progress);
        setQuestionCount(data.question_count);
        setRecentAttempts(data.recent_attempts || []);
        setWeakAreas(data.weak_areas || []);
        setSectionsRead(data.sections_read || []);
      }
    } catch (err) { console.error('FSModulePage: fetch failed', err); }
    setLoading(false);
  }, [moduleId]);

  useEffect(() => { fetchModule(); }, [fetchModule]);

  // Opening the module auto-discovers its built-in flashcards into the global
  // "due" queue (practice-as-you-go). Best-effort; no-op until cards are authored.
  useEffect(() => {
    fetch('/api/admin/learn/exam-prep/fs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'discover_module_cards', module_id: moduleId }),
    }).catch(() => { /* discovery is optional */ });
  }, [moduleId]);

  // Mark a lesson section as read the first time the student opens its tab, so
  // the reading indicator reflects "practice as you go". Idempotent + best-effort.
  useEffect(() => {
    if (!module) return;
    if (!CONTENT_TABS.includes(activeTab) || sectionsRead.includes(activeTab)) return;
    setSectionsRead(prev => (prev.includes(activeTab) ? prev : [...prev, activeTab]));
    fetch('/api/admin/learn/exam-prep/fs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_section_read', module_id: moduleId, section_type: activeTab }),
    }).catch(err => console.error('FSModulePage: mark_section_read failed', err));
  }, [activeTab, module, moduleId, sectionsRead]);

  // When the module quiz is graded, record FS module progress + (on a pass)
  // unlock the next module. This is the FS-specific progression the graded-quiz
  // route does not touch; without it, passing never advanced the course.
  const handleQuizComplete = useCallback(async (summary: { score_percent: number }) => {
    try {
      await fetch('/api/admin/learn/exam-prep/fs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete_quiz', module_id: moduleId, quiz_score: summary.score_percent }),
      });
    } catch (err) { console.error('FSModulePage: complete_quiz failed', err); }
    setQuizCompleted(true);
    fetchModule(); // refresh status/progress so the banner + unlock reflect the pass
  }, [moduleId, fetchModule]);

  function renderMarkdown(rawText: string): string {
    // Pull LaTeX math out first so the markdown/newline passes below can't
    // mangle it, then render it with KaTeX on the way out ($…$ inline,
    // $$…$$ display). `text` is the math-free source the rest of the pipeline
    // operates on.
    const { text, restore } = protectMath(rawText);
    // Escape a string for safe insertion into an HTML attribute/text node.
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // ── Step 1: pull block-level HTML out BEFORE the line-break transforms ──
    // Tables, inline SVG diagrams and explicit <ul>/<ol> lists span multiple
    // lines. Without this, the `\n → <br/>` pass below injects a <br/> after
    // every row/cell, which is exactly why the error-type table looked cramped
    // and broken. Each block is swapped for an opaque placeholder, then
    // restored verbatim at the end.
    const blocks: string[] = [];
    const stash = (html: string) => {
      blocks.push(html);
      return ` B${blocks.length - 1} `;
    };
    const styleTable = (tbl: string) =>
      tbl
        // drop the raw border="1"/cellpadding attrs and give it our styled class
        .replace(/<table[^>]*>/i, '<table class="fs-table">')
        .replace(/\s+(border|cellpadding|cellspacing|style|width)="[^"]*"/gi, '');

    // Inline markdown (bold/italic/code) — reused inside table cells, which are
    // stashed and therefore bypass the main inline pass further down.
    const inline = (s: string) =>
      s.replace(/\*\*(.*?)\*\*/g, '<strong class="fs-term">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>');

    // Convert GitHub-flavored markdown pipe tables → styled HTML tables up
    // front so the <table> stash below protects them from the newline pass.
    // Without this they render as raw "| a | b |" pipe text — the main cause of
    // the cramped/ugly formula + example tables across the modules.
    const splitCells = (row: string) =>
      row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((x) => x.trim());
    const isSepRow = (l: string) => l.includes('|') && /-/.test(l) && /^[\s|:-]+$/.test(l);
    const convertPipeTables = (src: string) => {
      const lines = src.split('\n');
      const acc: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('|') && i + 1 < lines.length && isSepRow(lines[i + 1])) {
          const head = splitCells(line);
          let j = i + 2;
          const rows: string[][] = [];
          while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
            rows.push(splitCells(lines[j]));
            j++;
          }
          const th = head.map((h) => `<th>${inline(h)}</th>`).join('');
          const body = rows
            .map((r) => `<tr>${r.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
            .join('');
          acc.push(`<table class="fs-table"><tr>${th}</tr>${body}</table>`);
          i = j - 1;
        } else {
          acc.push(line);
        }
      }
      return acc.join('\n');
    };

    let out = convertPipeTables(text)
      .replace(/<table[\s\S]*?<\/table>/gi, (m) => stash(styleTable(m)))
      .replace(/<svg[\s\S]*?<\/svg>/gi, (m) => stash(`<div class="fs-embed">${m}</div>`))
      .replace(/<(ul|ol)[\s\S]*?<\/\1>/gi, (m) => stash(m));

    // ── Step 2: markdown → HTML on the remaining prose ──
    out = out
      // Figures: ![Caption](/path.svg "Credit / reference"). The optional quoted
      // title becomes a small credit line so every diagram/photo is attributed.
      .replace(
        /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
        (_m, alt: string, url: string, credit?: string) => {
          const cap = esc(alt || '');
          const creditHtml = credit
            ? `<span class="fs-fig__credit">${esc(credit)}</span>`
            : '';
          const figcap = cap || credit
            ? `<figcaption class="fs-fig__cap">${cap}${creditHtml}</figcaption>`
            : '';
          return `<figure class="fs-fig"><img class="fs-fig__img" loading="lazy" src="${esc(url)}" alt="${cap}"/>${figcap}</figure>`;
        }
      )
      .replace(/\*\*(.*?)\*\*/g, '<strong class="fs-term">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/^### (.*$)/gm, '<h4>$1</h4>')
      .replace(/^## (.*$)/gm, '<h3>$1</h3>')
      .replace(/^# (.*$)/gm, '<h2>$1</h2>')
      .replace(/^- (.*$)/gm, '<li>$1</li>')
      // Wrap each RUN of consecutive <li> lines in its own <ul> (the previous
      // single greedy match wrapped everything between the first and last item
      // — including paragraphs — in one giant list).
      .replace(/(?:^<li>.*$\n?)+/gm, (m) => `<ul>${m.replace(/\n/g, '')}</ul>`)
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');

    // ── Step 3: restore blocks, then strip stray <br/> / empty <p> that the
    // line-break pass left hugging any block element (figure/table/svg/list). ──
    out = out.replace(/ B(\d+) /g, (_m, i) => blocks[Number(i)] ?? '');
    // Wrap so the first + last prose chunks are real <p> elements too (the
    // \n\n → </p><p> pass only creates the internal boundaries), giving every
    // paragraph consistent spacing. Block elements are then lifted back out of
    // any <p> hugging them, and empty paragraphs are dropped.
    out = `<p>${out}</p>`;
    out = out
      .replace(/<br\/>\s*(<figure|<table|<div class="fs-embed"|<ul|<ol)/g, '$1')
      .replace(/(<\/figure>|<\/table>|<\/div>|<\/ul>|<\/ol>)\s*<br\/>/g, '$1')
      .replace(/<p>\s*(<figure|<table|<div class="fs-embed"|<ul|<ol)/g, '$1')
      .replace(/(<\/figure>|<\/table>|<\/div>|<\/ul>|<\/ol>)\s*<\/p>/g, '$1')
      .replace(/<p>\s*<\/p>/g, '');
    // Swap the KaTeX-rendered math back in for its placeholders.
    return restore(out);
  }

  function getContentForTab(tab: string): ContentSection | undefined {
    if (!module) return undefined;
    const typeMap: Record<string, string> = {
      overview: 'overview',
      concepts: 'concepts',
      formulas: 'formulas',
      examples: 'examples',
      tips: 'tips',
    };
    return module.content_sections?.find(s => s.type === typeMap[tab]);
  }

  // ── TWO WAYS TO READ THE SAME MODULE (owner, 2026-09-19) ─────────────────────────────────────
  //
  // "One view will have all of the info formatted just as it is currently. The other will split the
  // information up into bite sized chunks … like a slide show."
  //
  // Both views render the SAME `content_sections` through the SAME `renderMarkdown`, so there is no
  // second copy of the content to keep in step and no second set of bugs in the term-popup, figure
  // zoom and table styling that pipeline is responsible for. The stepped view differs only in how
  // much of it is on screen at once.
  //
  // The preference is remembered, because which one somebody wants is a fact about how they study
  // rather than about the module they happen to have open.
  /** Which practice problem is open, so the tutor hints rather than solves until it is attempted.
   *  A ref, not state: the tutor reads it lazily when a message is sent, and re-rendering this whole
   *  page every time somebody moves to the next problem would be a cost for nothing. */
  const openProblemRef = useRef<{ statement: string; attempted: boolean } | null>(null);
  const reportProblem = useCallback((p: { statement: string; attempted: boolean } | null) => {
    openProblemRef.current = p;
  }, []);

  const [readMode, setReadMode] = useState<'full' | 'steps'>('full');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('fsReadMode');
      if (saved === 'steps' || saved === 'full') setReadMode(saved);
    } catch { /* private window — the default view still works */ }
  }, []);
  const chooseReadMode = useCallback((mode: 'full' | 'steps') => {
    setReadMode(mode);
    try { localStorage.setItem('fsReadMode', mode); } catch { /* nothing to do */ }
  }, []);

  /** The whole module as one sequence of steps, derived from the headings the author wrote. */
  const chunks: Chunk[] = useMemo(
    () => chunkModule(module?.content_sections ?? []),
    [module?.content_sections],
  );
  const [chunkId, setChunkId] = useState<string | null>(null);
  const currentChunk = useMemo(
    () => chunks.find((c) => c.id === chunkId) ?? chunks[0] ?? null,
    [chunks, chunkId],
  );
  const stepAt = chunkPosition(chunks, currentChunk?.id ?? '');

  /** Arrows, and the keyboard. Left and right are what anybody tries on a slideshow. */
  const goStep = useCallback((delta: number) => {
    if (chunks.length === 0) return;
    const next = chunks[Math.min(chunks.length - 1, Math.max(0, stepAt.index + delta))];
    if (next) setChunkId(next.id);
  }, [chunks, stepAt.index]);

  useEffect(() => {
    if (readMode !== 'steps') return;
    const onKey = (e: KeyboardEvent) => {
      // Not while somebody is typing in the tutor.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goStep(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goStep(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readMode, goStep]);

  // Reading a step is reading its section. The existing per-section progress is reused rather than
  // given a parallel per-chunk store, so the header's "N/5 sections read" keeps meaning the same
  // thing in both views.
  useEffect(() => {
    if (readMode !== 'steps' || !currentChunk) return;
    if (!CONTENT_TABS.includes(currentChunk.sectionType)) return;
    if (activeTab !== currentChunk.sectionType) setActiveTab(currentChunk.sectionType);
  }, [readMode, currentChunk, activeTab]);

  if (loading) return (
    <div className="admin-empty">
      <div className="admin-empty__icon"><Loader2 size={30} strokeWidth={2} className="animate-spin" /></div>
      <div className="admin-empty__title">Loading module...</div>
    </div>
  );

  if (!module) return (
    <div className="admin-empty">
      <div className="admin-empty__icon"><FileX size={30} strokeWidth={1.5} /></div>
      <div className="admin-empty__title">Module not found</div>
      <Link href="/admin/learn/exam-prep/sit" className="admin-btn admin-btn--ghost" style={{ marginTop: '1rem' }}>Back to FS Prep</Link>
    </div>
  );

  if (progress?.status === 'locked') return (
    <div className="admin-empty">
      <div className="admin-empty__icon"><Lock size={30} strokeWidth={1.5} /></div>
      <div className="admin-empty__title">Module Locked</div>
      <div className="admin-empty__desc">Complete the previous module to unlock this one.</div>
      <Link href="/admin/learn/exam-prep/sit" className="admin-btn admin-btn--ghost" style={{ marginTop: '1rem' }}>Back to FS Prep</Link>
    </div>
  );

  // Quiz mode
  if (showQuiz) {
    return (
      <div className="fs-module__quiz-wrapper">
        <QuizRunner
          type="module_test"
          moduleId={moduleId}
          questionCount={Math.min(questionCount, 20)}
          title={`${module.icon} Module ${module.module_number} Quiz: ${module.title}`}
          backUrl={`/admin/learn/exam-prep/sit/module/${moduleId}`}
          backLabel="Back to Module"
          onComplete={handleQuizComplete}
        />
      </div>
    );
  }

  const contentSection = getContentForTab(activeTab);
  const isCompleted = progress?.status === 'completed';
  const bestScore = progress?.quiz_best_score || 0;

  const tabs = [
    { key: 'overview', label: 'Overview', icon: '\u{1F4D6}' },
    { key: 'concepts', label: 'Key Concepts', icon: '\u{1F4A1}' },
    { key: 'formulas', label: 'Formulas', icon: '\u{1F522}' },
    { key: 'examples', label: 'Examples', icon: '\u270F\uFE0F' },
    { key: 'tips', label: 'Exam Tips', icon: '\u{1F4CC}' },
    { key: 'practice', label: 'Practice', icon: '\u{1F3CB}\uFE0F' },
    { key: 'flashcards', label: 'Flashcards', icon: '\u{1F0CF}' },
  ];

  return (
    <>
      <div className="admin-learn__header">
        <Link href="/admin/learn/exam-prep/sit" className="admin-module-detail__back">&larr; Back to FS Prep</Link>
        <h2 className="admin-learn__title">{module.icon} Module {module.module_number}: {module.title}</h2>
        <p className="admin-learn__subtitle">{module.description}</p>
        <div className="fs-module__meta">
          <span className="fs-module__meta-item">{module.week_range}</span>
          <span className="fs-module__meta-item">{module.exam_weight_percent}% of FS Exam</span>
          <span className="fs-module__meta-item">{questionCount} quiz questions</span>
          <span className="fs-module__meta-item"><BookOpen size={13} style={{ verticalAlign: "-2px", marginRight: "0.25rem" }} />{sectionsRead.filter(s => CONTENT_TABS.includes(s)).length}/{CONTENT_TABS.length} sections read</span>
          {isCompleted && <span className="fs-module__meta-item fs-module__meta-item--complete"><CheckCircle2 size={13} style={{ verticalAlign: "-2px", marginRight: "0.25rem" }} />Completed</span>}
        </div>
      </div>

      {/* Progress & Score Banner */}
      {(bestScore > 0 || isCompleted) && (
        <div className={`fs-module__score-banner ${isCompleted ? 'fs-module__score-banner--pass' : 'fs-module__score-banner--progress'}`}>
          <div className="fs-module__score-info">
            <span className="fs-module__score-label">Best Quiz Score</span>
            <span className={`fs-module__score-value ${bestScore >= 70 ? 'fs-module__score-value--pass' : 'fs-module__score-value--fail'}`}>
              {bestScore}%
            </span>
          </div>
          <div className="fs-module__score-info">
            <span className="fs-module__score-label">Attempts</span>
            <span className="fs-module__score-value">{progress?.quiz_attempts_count || 0}</span>
          </div>
          <div className="fs-module__score-info">
            <span className="fs-module__score-label">Status</span>
            <span className="fs-module__score-value">{isCompleted ? 'Passed' : 'In Progress'}</span>
          </div>
        </div>
      )}

      {/* Study Recommendations */}
      {weakAreas.length > 0 && !isCompleted && (
        <div className="fs-module__recommendations">
          <h4><ClipboardList size={16} style={{ verticalAlign: "-3px", marginRight: "0.4rem" }} />Recommended Review Areas</h4>
          <p className="fs-module__rec-desc">Based on your quiz performance, focus on these topics:</p>
          <div className="fs-module__rec-list">
            {weakAreas
              .filter(w => w.weakness_score > 0.3)
              .sort((a, b) => b.weakness_score - a.weakness_score)
              .map((w, i) => (
                <div key={i} className="fs-module__rec-item">
                  <span className="fs-module__rec-topic">{w.topic}</span>
                  <span className="fs-module__rec-score" style={{ color: w.weakness_score > 0.6 ? 'var(--color-error)' : 'var(--color-warning)' }}>
                    {w.questions_correct}/{w.questions_attempted} correct
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Content Tabs */}
      <div className="fs-module__tabs">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`fs-module__tab ${activeTab === tab.key ? 'fs-module__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            dangerouslySetInnerHTML={{ __html: `${tab.icon} ${tab.label}` }}
          />
        ))}
      </div>

      {/* Content Area */}
      <div className="fs-module__content">
        {/* Which way to read it. Only where there is something to step through — Practice and
            Flashcards are already one-thing-at-a-time and have no chunks. */}
        {CONTENT_TABS.includes(activeTab) && chunks.length > 0 && (
          <div className="fs-read-mode" role="group" aria-label="How to read this module">
            <button
              type="button"
              className={`fs-read-mode__btn${readMode === 'full' ? ' fs-read-mode__btn--on' : ''}`}
              aria-pressed={readMode === 'full'}
              onClick={() => chooseReadMode('full')}
              data-testid="fs-read-full"
            >
              <FileText size={13} aria-hidden /> Full page
            </button>
            <button
              type="button"
              className={`fs-read-mode__btn${readMode === 'steps' ? ' fs-read-mode__btn--on' : ''}`}
              aria-pressed={readMode === 'steps'}
              onClick={() => {
                // Enter the stepped view at the section being read, not back at the very start.
                const first = firstChunkOfSection(chunks, activeTab);
                if (first) setChunkId(first.id);
                chooseReadMode('steps');
              }}
              data-testid="fs-read-steps"
            >
              <Layers size={13} aria-hidden /> Step through
              <span className="fs-read-mode__count">{chunks.length}</span>
            </button>
          </div>
        )}
        <div className="fs-module__tutor-bar">
          <DeeperLearningTutor context={{
            moduleId,
            moduleNumber: module.module_number,
            moduleTitle: module.title,
            // In the stepped view the tutor is told the CHUNK, not the section. "Explain this"
            // should mean the twelve lines on screen, not the four pages they came from.
            getOpenProblem: () => openProblemRef.current,
            getSectionTitle: () => (readMode === 'steps' && currentChunk
              ? `${currentChunk.sectionTitle} — ${currentChunk.title}`
              : tabs.find(t => t.key === activeTab)?.label),
          }} />
        </div>
        {readMode === 'steps' && CONTENT_TABS.includes(activeTab) && currentChunk ? (
          <div className="fs-step">
            <div className="fs-step__rail" aria-hidden="true">
              <div className="fs-step__rail-fill" style={{ width: `${((stepAt.index + 1) / Math.max(1, stepAt.total)) * 100}%` }} />
            </div>
            <div className="fs-step__head">
              <span className="fs-step__section">{currentChunk.sectionTitle}</span>
              <h3 className="fs-step__title">
                {currentChunk.title}
                {/* Said out loud, because a heading repeated across three slides otherwise reads as
                    the same slide shown three times. */}
                {currentChunk.partsInHeading > 1 && (
                  <span className="fs-step__part"> ({currentChunk.part} of {currentChunk.partsInHeading})</span>
                )}
              </h3>
            </div>

            <div
              className="fs-module__content-text fs-step__body"
              onClick={handleContentClick}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(currentChunk.content) }}
            />

            <div className="fs-step__nav">
              <button
                type="button"
                className="fs-step__arrow"
                onClick={() => goStep(-1)}
                disabled={stepAt.index === 0}
                aria-label="Previous step"
                data-testid="fs-step-prev"
              >
                <ChevronLeft size={18} aria-hidden /> Back
              </button>
              <span className="fs-step__count" aria-live="polite">
                {stepAt.index + 1} of {stepAt.total}
              </span>
              <button
                type="button"
                className="fs-step__arrow fs-step__arrow--next"
                onClick={() => goStep(1)}
                disabled={stepAt.index >= stepAt.total - 1}
                aria-label="Next step"
                data-testid="fs-step-next"
              >
                Next <ChevronRight size={18} aria-hidden />
              </button>
            </div>
            <p className="fs-step__hint">Use the arrow keys, or ask the tutor about this step.</p>
          </div>
        ) : activeTab === 'practice' ? (
          <PracticePanel moduleId={moduleId} onProblemChange={reportProblem} />
        ) : activeTab === 'flashcards' ? (
          <FlashcardsPanel moduleId={moduleId} moduleNumber={module.module_number} />
        ) : activeTab === 'formulas' && module.key_formulas && module.key_formulas.length > 0 ? (
          <div className="fs-module__formulas-grid">
            <h3>Key Formulas for {module.title}</h3>
            {module.key_formulas.map((f, i) => (
              <div key={i} className="fs-module__formula-card">
                <div className="fs-module__formula-name">{f.name}</div>
                <div className="fs-module__formula-expr">{f.formula}</div>
                {/* ── PRACTICE, FROM THE FORMULA (owner, 2026-09-19) ──────────────────────────
                    "we have the formulas page, and I would need the opportunity to do practice
                    problems for the formulas."

                    Sends you to Practice filtered to this module's problems rather than opening a
                    problem here. The practice panel already owns the queue, the difficulty filter
                    and the tally, and a second problem runner on the formulas tab would be a second
                    place for that state to be wrong. */}
                <button
                  type="button"
                  className="fs-module__formula-practice"
                  onClick={() => setActiveTab('practice')}
                  data-testid={`fs-formula-practice-${i}`}
                >
                  Practice this
                </button>
              </div>
            ))}
            {contentSection && (
              <div className="fs-module__content-text" onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: renderMarkdown(contentSection.content) }} />
            )}
          </div>
        ) : contentSection ? (
          <div className="fs-module__content-text" onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: renderMarkdown(contentSection.content) }} />
        ) : (
          <div className="admin-empty" style={{ padding: '2rem' }}>
            <div className="admin-empty__icon"><BookOpen size={30} strokeWidth={1.5} /></div>
            <div className="admin-empty__title">Content coming soon</div>
            <div className="admin-empty__desc">This section&apos;s content is being prepared.</div>
          </div>
        )}
      </div>

      {/* Key Topics */}
      {module.key_topics && module.key_topics.length > 0 && (
        <div className="fs-module__topics">
          <h4>Topics Covered</h4>
          <div className="fs-module__topics-grid">
            {module.key_topics.map((topic, i) => (
              <span key={i} className="fs-module__topic-tag">{topic}</span>
            ))}
          </div>
        </div>
      )}

      {/* Quiz Section */}
      <div className="fs-module__quiz-section">
        <h3><FileText size={18} style={{ verticalAlign: "-3px", marginRight: "0.4rem" }} />Module {module.module_number} Quiz</h3>
        <p>
          {questionCount} questions covering all topics in this module.
          You need {module.passing_score}% to pass and unlock the next module.
        </p>
        <button
          className="admin-btn admin-btn--primary"
          onClick={() => setShowQuiz(true)}
          disabled={questionCount === 0}
          style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}
        >
          {questionCount > 0
            ? (isCompleted ? 'Retake Quiz' : bestScore > 0 ? 'Try Again' : 'Start Quiz')
            : 'No Questions Available Yet'}
        </button>

        {/* Recent Attempts */}
        {recentAttempts.length > 0 && (
          <div className="fs-module__attempts">
            <h4>Recent Quiz Attempts</h4>
            {recentAttempts.slice(0, 5).map(a => (
              <div key={a.id} className="fs-module__attempt">
                <span className={`fs-module__attempt-score ${a.score_percent >= 70 ? 'fs-module__attempt-score--pass' : 'fs-module__attempt-score--fail'}`}>
                  {a.score_percent}%
                </span>
                <span className="fs-module__attempt-detail">{a.correct_answers}/{a.total_questions} correct</span>
                <span className="fs-module__attempt-date">{new Date(a.completed_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <MediaViewer media={viewerMedia} onClose={() => setViewerMedia(null)} />
      {termTarget && <TermDefinitionPopup target={termTarget} onClose={() => setTermTarget(null)} />}
    </>
  );
}
