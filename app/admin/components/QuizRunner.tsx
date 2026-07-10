// app/admin/components/QuizRunner.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, FileText } from 'lucide-react';
import FillBlankQuestion from './FillBlankQuestion';

type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'fill_blank' | 'multi_select' | 'ordering' | 'drag_label' | 'numeric_input' | 'math_template' | 'essay';

// For drag_label questions the API sends `options` as an object (terms +
// target prompts) instead of a string[]. This shape is client-visible; the
// correct term-per-target mapping stays server-side in correct_answer.
interface DragLabelOptions { terms: string[]; targets: string[] }

interface Question {
  id: string;
  question_text: string;
  question_type: QuestionType;
  options: string[];
  difficulty: string;
  _math_vars?: Record<string, number>;
  _original_type?: string;
  _blank_count?: number;
  // Dynamic (template-linked) questions: the quiz API generates fresh values per
  // attempt and returns the per-attempt answer/tolerance/steps on the question.
  // These must be echoed back on submit so the grader scores against the values
  // THIS attempt actually saw (server can't recompute them — they're random).
  _dynamic?: boolean;
  _template_id?: string;
  _generated_answer?: string;
  _solution_steps?: unknown[];
  _tolerance?: number;
  _diagram?: string; // inline SVG figure matching this generated problem
}

interface StudyReference {
  type: 'topic' | 'lesson' | 'module';
  id: string;
  label: string;
}

interface GradedResult {
  question_id: string;
  user_answer: string;
  is_correct: boolean;
  correct_answer: string;
  explanation: string;
  partial_score?: number;
  blank_results?: boolean[];
  correct_answers?: string[];
  study_references?: StudyReference[];
  ai_feedback?: {
    score: number;
    max_points: number;
    percentage: number;
    feedback: string;
    strengths: string[];
    improvements: string[];
    is_passing: boolean;
  };
}

interface QuizRunnerProps {
  type: 'lesson_quiz' | 'module_test' | 'exam_prep';
  lessonId?: string;
  moduleId?: string;
  examCategory?: string;
  questionCount?: number;
  title: string;
  backUrl: string;
  backLabel: string;
  nextLessonUrl?: string;
  nextLessonLabel?: string;
  // Fires once when the quiz is graded — lets a host react to the score
  // (e.g. the FS module page unlocking the next module on a pass).
  onComplete?: (summary: { score_percent: number; passed: boolean; correct_answers: number; total_questions: number }) => void;
}

export default function QuizRunner({ type, lessonId, moduleId, examCategory, questionCount = 5, title, backUrl, backLabel, nextLessonUrl, nextLessonLabel, onComplete }: QuizRunnerProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Transient "picked term" per drag_label question (tap-a-term then tap-a-slot).
  const [dragPick, setDragPick] = useState<Record<string, string>>({});
  const [results, setResults] = useState<{
    results: GradedResult[];
    score_percent: number;
    correct_answers: number;
    total_questions: number;
    passed: boolean;
    partial_total?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [noQuestions, setNoQuestions] = useState(false);
  const [historicalAvg, setHistoricalAvg] = useState<{ avg: number; attempts: number } | null>(null);
  const startTime = useRef(Date.now());

  const fetchQuiz = useCallback(async () => {
    const params = new URLSearchParams({ type, count: String(questionCount) });
    if (lessonId) params.set('lesson_id', lessonId);
    if (moduleId) params.set('module_id', moduleId);
    if (examCategory) params.set('exam_category', examCategory);

    try {
      const res = await fetch(`/api/admin/learn/quizzes?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (data.questions.length === 0) {
          setNoQuestions(true);
        } else {
          setQuestions(data.questions);
          startTime.current = Date.now();
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [type, questionCount, lessonId, moduleId, examCategory]);

  useEffect(() => {
    fetchQuiz();
  }, [fetchQuiz]);

  // Seed a starting order for `ordering` questions once, shuffled so the stored
  // option order is never a giveaway. The seeded order IS the current answer
  // until the student rearranges it.
  useEffect(() => {
    if (questions.length === 0) return;
    setAnswers(prev => {
      let changed = false;
      const next = { ...prev };
      for (const q of questions) {
        if (q.question_type === 'ordering' && !next[q.id]) {
          const shuffled = [...(q.options || [])];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          next[q.id] = JSON.stringify(shuffled);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [questions]);

  function isQuestionAnswered(q: Question): boolean {
    const ans = answers[q.id];
    if (!ans) return false;
    switch (q.question_type) {
      case 'fill_blank': {
        try {
          const arr = JSON.parse(ans) as string[];
          return arr.length > 0 && arr.every(a => a !== '');
        } catch { return false; }
      }
      case 'multi_select': {
        try {
          const arr = JSON.parse(ans) as string[];
          return arr.length > 0;
        } catch { return false; }
      }
      case 'ordering': {
        try {
          const arr = JSON.parse(ans) as string[];
          return arr.length === (q.options?.length || 0) && arr.length > 0;
        } catch { return false; }
      }
      case 'drag_label': {
        try {
          const arr = JSON.parse(ans) as string[];
          const n = getDragLabelOpts(q).targets.length;
          return n > 0 && arr.length === n && arr.every(x => x !== '');
        } catch { return false; }
      }
      default:
        return ans.trim() !== '';
    }
  }

  const answeredCount = questions.filter(q => isQuestionAnswered(q)).length;

  async function submit() {
    if (answeredCount < questions.length) {
      alert('Please answer all questions before submitting.');
      return;
    }
    setSubmitting(true);
    const elapsed = Math.round((Date.now() - startTime.current) / 1000);

    try {
      const res = await fetch('/api/admin/learn/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          lesson_id: lessonId || null,
          module_id: moduleId || null,
          exam_category: examCategory || null,
          time_spent_seconds: elapsed,
          answers: questions.map(q => ({
            question_id: q.id,
            user_answer: answers[q.id] || '',
            math_vars: q._math_vars || undefined,
            // Echo back the per-attempt dynamic fields the API generated, so the
            // grader scores the randomized question against the values shown.
            _dynamic: q._dynamic || undefined,
            _generated_answer: q._generated_answer ?? undefined,
            _tolerance: q._tolerance ?? undefined,
            _solution_steps: q._solution_steps || undefined,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        onComplete?.({
          score_percent: data.score_percent, passed: data.passed,
          correct_answers: data.correct_answers, total_questions: data.total_questions,
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch { /* ignore */ }
    setSubmitting(false);
  }

  // Fetch historical average when results are available
  useEffect(() => {
    if (!results) return;
    (async () => {
      try {
        const res = await fetch('/api/admin/learn/quizzes?history=true&limit=50');
        if (res.ok) {
          const data = await res.json();
          const attempts = (data.attempts || []).filter((a: any) => {
            if (type === 'lesson_quiz' && lessonId) return a.attempt_type === 'lesson_quiz' && a.lesson_id === lessonId;
            if (type === 'module_test' && moduleId) return a.attempt_type === 'module_test' && a.module_id === moduleId;
            if (type === 'exam_prep' && examCategory) return a.attempt_type === 'exam_prep' && a.exam_category === examCategory;
            return a.attempt_type === type;
          });
          if (attempts.length > 0) {
            const total = attempts.reduce((s: number, a: any) => s + (a.score_percent || 0), 0);
            setHistoricalAvg({ avg: Math.round(total / attempts.length), attempts: attempts.length });
          }
        }
      } catch { /* silent */ }
    })();
  }, [results, type, lessonId, moduleId, examCategory]);

  function retake() {
    setResults(null);
    setAnswers({});
    setHistoricalAvg(null);
    setLoading(true);
    fetchQuiz();
  }

  // Multi-select toggle
  function toggleMultiSelect(qId: string, opt: string) {
    const current: string[] = (() => {
      try { return JSON.parse(answers[qId] || '[]'); } catch { return []; }
    })();
    const idx = current.indexOf(opt);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(opt);
    }
    setAnswers(prev => ({ ...prev, [qId]: JSON.stringify(current) }));
  }

  function isMultiSelected(qId: string, opt: string): boolean {
    try {
      const arr = JSON.parse(answers[qId] || '[]') as string[];
      return arr.includes(opt);
    } catch { return false; }
  }

  // Ordering: read the current arrangement (falls back to option order).
  function getOrdering(qId: string, options: string[]): string[] {
    try {
      const arr = JSON.parse(answers[qId] || '[]') as string[];
      return arr.length === options.length ? arr : [...options];
    } catch { return [...options]; }
  }

  // Move an item up (dir -1) or down (dir +1) in the ordering.
  function moveOrderingItem(qId: string, options: string[], index: number, dir: -1 | 1) {
    const arr = getOrdering(qId, options);
    const target = index + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    setAnswers(prev => ({ ...prev, [qId]: JSON.stringify(arr) }));
  }

  // Drag-label: `options` is a { terms, targets } object for these questions.
  function getDragLabelOpts(q: Question): DragLabelOptions {
    const o = q.options as unknown as DragLabelOptions | string[];
    if (o && !Array.isArray(o) && Array.isArray((o as DragLabelOptions).terms)) {
      return { terms: (o as DragLabelOptions).terms || [], targets: (o as DragLabelOptions).targets || [] };
    }
    return { terms: Array.isArray(o) ? o : [], targets: [] };
  }
  // Current assignment: array parallel to targets, each entry a placed term or ''.
  function getDragAssign(qId: string, nTargets: number): string[] {
    try {
      const arr = JSON.parse(answers[qId] || '[]') as string[];
      if (arr.length === nTargets) return arr;
    } catch { /* fall through */ }
    return Array(nTargets).fill('');
  }
  function pickDragTerm(qId: string, term: string) {
    setDragPick(prev => ({ ...prev, [qId]: prev[qId] === term ? '' : term }));
  }
  // Tap a target slot: place the picked term (moving it off any other slot), or
  // if nothing is picked and the slot is filled, clear it back to the pool.
  function placeDragLabel(q: Question, targetIdx: number) {
    const { targets } = getDragLabelOpts(q);
    const assign = getDragAssign(q.id, targets.length);
    const picked = dragPick[q.id] || '';
    if (picked) {
      for (let i = 0; i < assign.length; i++) if (assign[i] === picked) assign[i] = '';
      assign[targetIdx] = picked;
      setAnswers(prev => ({ ...prev, [q.id]: JSON.stringify(assign) }));
      setDragPick(prev => ({ ...prev, [q.id]: '' }));
    } else if (assign[targetIdx]) {
      assign[targetIdx] = '';
      setAnswers(prev => ({ ...prev, [q.id]: JSON.stringify(assign) }));
    }
  }

  // Fill blank
  function getFillBlanks(qId: string): string[] {
    try { return JSON.parse(answers[qId] || '[]'); } catch { return []; }
  }

  function setFillBlanks(qId: string, blanks: string[]) {
    setAnswers(prev => ({ ...prev, [qId]: JSON.stringify(blanks) }));
  }

  if (loading) return <div className="admin-empty"><div className="admin-empty__icon"><Loader2 size={30} strokeWidth={2} className="animate-spin" /></div><div className="admin-empty__title">Loading questions...</div></div>;
  if (noQuestions) return (
    <div className="admin-empty">
      <div className="admin-empty__icon"><FileText size={30} strokeWidth={1.5} /></div>
      <div className="admin-empty__title">No questions available yet</div>
      <div className="admin-empty__desc">Questions will be added by an admin. Check back later!</div>
      <a href={backUrl} className="admin-btn admin-btn--ghost" style={{ marginTop: '1rem' }}>{backLabel}</a>
    </div>
  );

  /* ============= RESULTS VIEW ============= */
  if (results) {
    return (
      <div className="quiz-results">
        <div className="quiz-results__header">
          <h2 className="quiz-results__title">{results.passed ? 'Passed!' : 'Keep Studying'}</h2>
          <div className={`quiz-results__score ${results.passed ? 'quiz-results__score--pass' : 'quiz-results__score--fail'}`}>
            {results.score_percent}%
          </div>
          <p className="quiz-results__summary">
            {results.correct_answers} of {results.total_questions} correct
            {results.passed ? ' \u2014 Great work!' : ' \u2014 You need 70% to pass.'}
          </p>
          {historicalAvg && historicalAvg.attempts > 1 && (
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.82rem', color: '#6B7280', marginTop: '0.5rem' }}>
              Your average across {historicalAvg.attempts} attempt{historicalAvg.attempts !== 1 ? 's' : ''}:{' '}
              <span className={`quiz-avg-badge ${historicalAvg.avg >= 70 ? 'quiz-avg-badge--green' : historicalAvg.avg >= 40 ? 'quiz-avg-badge--yellow' : 'quiz-avg-badge--red'}`}>
                {historicalAvg.avg}%
              </span>
            </p>
          )}
        </div>

        {/* Areas to Review summary — deduplicated study references from all missed questions */}
        {(() => {
          const allRefs = new Map<string, { type: string; id: string; label: string }>();
          results.results.filter(r => !r.is_correct && r.study_references).forEach(r => {
            r.study_references!.forEach(ref => {
              if (!allRefs.has(ref.id)) allRefs.set(ref.id, ref);
            });
          });
          if (allRefs.size === 0) return null;
          return (
            <div className="quiz-results__review-summary">
              <h3 className="quiz-results__review-title">{'\u{1F4DA}'} Areas to Review</h3>
              <p className="quiz-results__review-desc">Based on the questions you missed, we recommend reviewing these topics:</p>
              <div className="quiz-results__review-links">
                {[...allRefs.values()].map((ref, i) => {
                  let href = '';
                  if (ref.type === 'topic' && moduleId && lessonId) {
                    href = `/admin/learn/modules/${moduleId}/${lessonId}#topic-${ref.id}`;
                  } else if (ref.type === 'lesson' && moduleId) {
                    href = `/admin/learn/modules/${moduleId}/${ref.id}`;
                  } else if (ref.type === 'module') {
                    href = `/admin/learn/modules/${ref.id}`;
                  }
                  return (
                    <a key={i} href={href} className="quiz-results__review-link">
                      {ref.type === 'topic' ? '\u{1F4CC}' : ref.type === 'lesson' ? '\u{1F4D6}' : '\u{1F4DA}'}{' '}
                      {ref.label}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })()}

        <div className="quiz-results__questions">
          {questions.map((q, i) => {
            const r = results.results.find(r => r.question_id === q.id);
            const partialScore = r?.partial_score;
            const isPartial = partialScore !== undefined && partialScore > 0 && partialScore < 1;
            return (
              <div key={q.id} className={`quiz-results__question ${r?.is_correct ? 'quiz-results__question--correct' : isPartial ? 'quiz-results__question--partial' : 'quiz-results__question--wrong'}`}>
                <div className="quiz-results__question-num">
                  {r?.is_correct ? '\u2705' : isPartial ? '\u26A0\uFE0F' : '\u274C'} Question {i + 1}
                  {isPartial && <span className="quiz-results__partial-badge">{Math.round((partialScore || 0) * 100)}% credit</span>}
                </div>

                {q.question_type === 'fill_blank' ? (
                  <div className="quiz-results__fill-blank">
                    <p className="quiz-results__question-text" style={{ marginBottom: '.75rem' }}>{q.question_text.replace(/\{\{BLANK\}\}/g, '______')}</p>
                    {r?.blank_results && r.correct_answers && (
                      <div className="quiz-results__blanks">
                        {r.blank_results.map((correct: boolean, bi: number) => {
                          const userBlanks = (() => { try { return JSON.parse(r.user_answer); } catch { return []; } })();
                          return (
                            <div key={bi} className={`quiz-results__blank-item ${correct ? 'quiz-results__blank-item--correct' : 'quiz-results__blank-item--wrong'}`}>
                              <span>Blank {bi + 1}: </span>
                              <strong>{userBlanks[bi] || '(empty)'}</strong>
                              {!correct && <span className="quiz-results__blank-correct"> &rarr; {r.correct_answers![bi]}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : q.question_type === 'essay' ? (
                  <>
                    <p className="quiz-results__question-text">{q.question_text}</p>
                    <div className="quiz-results__essay-response">
                      <h5 className="quiz-results__essay-label">Your Response:</h5>
                      <p className="quiz-results__essay-text">{r?.user_answer || '(no response)'}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="quiz-results__question-text">{q.question_text}</p>
                    <div className="quiz-results__answer">
                      <span>Your answer: <strong>{formatUserAnswer(r?.user_answer || '', q.question_type)}</strong></span>
                      {!r?.is_correct && <span>Correct answer: <strong>{formatCorrectAnswer(r?.correct_answer || '', q.question_type)}</strong></span>}
                    </div>
                  </>
                )}
                {/* AI Feedback for essay questions */}
                {r?.ai_feedback && (
                  <div className="quiz-results__ai-feedback">
                    <div className="quiz-results__ai-header">
                      <span className="quiz-results__ai-badge">AI Evaluation</span>
                      <span className={`quiz-results__ai-score ${r.ai_feedback.is_passing ? 'quiz-results__ai-score--pass' : 'quiz-results__ai-score--fail'}`}>
                        {r.ai_feedback.score}/{r.ai_feedback.max_points} ({r.ai_feedback.percentage}%)
                      </span>
                    </div>
                    <p className="quiz-results__ai-summary">{r.ai_feedback.feedback}</p>
                    {r.ai_feedback.strengths.length > 0 && (
                      <div className="quiz-results__ai-section">
                        <h5 className="quiz-results__ai-section-title quiz-results__ai-section-title--good">What you got right</h5>
                        <ul className="quiz-results__ai-list">
                          {r.ai_feedback.strengths.map((s, si) => (
                            <li key={si} className="quiz-results__ai-list-item quiz-results__ai-list-item--good">{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {r.ai_feedback.improvements.length > 0 && (
                      <div className="quiz-results__ai-section">
                        <h5 className="quiz-results__ai-section-title quiz-results__ai-section-title--improve">How to improve</h5>
                        <ul className="quiz-results__ai-list">
                          {r.ai_feedback.improvements.map((imp, ii) => (
                            <li key={ii} className="quiz-results__ai-list-item quiz-results__ai-list-item--improve">{imp}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {r?.explanation && !r?.ai_feedback && <p className="quiz-results__explanation">{r.explanation}</p>}
                {/* Study Recommendations for missed questions */}
                {!r?.is_correct && r?.study_references && r.study_references.length > 0 && (
                  <div className="quiz-results__study-refs">
                    <h5 className="quiz-results__study-refs-title">{'\u{1F4DA}'} Recommended Study Material</h5>
                    <div className="quiz-results__study-refs-list">
                      {r.study_references.map((ref, ri) => {
                        let href = '';
                        if (ref.type === 'topic' && moduleId && lessonId) {
                          href = `/admin/learn/modules/${moduleId}/${lessonId}#topic-${ref.id}`;
                        } else if (ref.type === 'lesson' && moduleId) {
                          href = `/admin/learn/modules/${moduleId}/${ref.id}`;
                        } else if (ref.type === 'module') {
                          href = `/admin/learn/modules/${ref.id}`;
                        }
                        return (
                          <a key={ri} href={href} className="quiz-results__study-ref-link">
                            {ref.type === 'topic' ? '\u{1F4CC}' : ref.type === 'lesson' ? '\u{1F4D6}' : '\u{1F4DA}'}{' '}
                            {ref.label}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="quiz-results__actions">
          {results.passed && nextLessonUrl && (
            <a href={nextLessonUrl} className="admin-btn admin-btn--primary">
              {nextLessonLabel || 'Next Lesson'} &rarr;
            </a>
          )}
          <button className={`admin-btn ${results.passed && nextLessonUrl ? 'admin-btn--secondary' : 'admin-btn--primary'}`} onClick={retake}>Retake (New Questions)</button>
          <a href={backUrl} className="admin-btn admin-btn--ghost">{backLabel}</a>
        </div>
      </div>
    );
  }

  /* ============= QUIZ VIEW ============= */
  return (
    <div className="quiz">
      <div className="quiz__header">
        <a href={backUrl} className="admin-lesson__nav-link">&larr; {backLabel}</a>
        <h2 className="quiz__title">{title}</h2>
        <p className="quiz__subtitle">{questions.length} questions &mdash; Answer all to submit</p>
      </div>

      <div className="quiz__questions">
        {questions.map((q, i) => (
          <div key={q.id} className="quiz__question">
            <div className="quiz__question-header">
              <span className="quiz__question-num">Question {i + 1}</span>
              <div className="quiz__question-badges">
                <span className={`quiz__question-diff quiz__question-diff--${q.difficulty}`}>{q.difficulty}</span>
                {q.question_type === 'fill_blank' && <span className="quiz__question-type-badge">Fill in the Blank</span>}
                {q.question_type === 'multi_select' && <span className="quiz__question-type-badge">Select All That Apply</span>}
                {q.question_type === 'ordering' && <span className="quiz__question-type-badge">Put In Order</span>}
                {(q.question_type === 'numeric_input' || q._original_type === 'math_template') && <span className="quiz__question-type-badge">Numeric Answer</span>}
                {q.question_type === 'essay' && <span className="quiz__question-type-badge">AI-Graded Essay</span>}
              </div>
            </div>

            {/* Generated figure that matches this problem's numbers */}
            {q._diagram && (
              <div className="quiz__diagram" style={{ margin: '0.75rem 0', maxWidth: 540 }} dangerouslySetInnerHTML={{ __html: q._diagram }} />
            )}

            {/* Multiple Choice / True-False */}
            {(q.question_type === 'multiple_choice' || q.question_type === 'true_false') && (
              <>
                <p className="quiz__question-text">{q.question_text}</p>
                <div className="quiz__options">
                  {q.options.map((opt, oi) => (
                    <div
                      key={oi}
                      className={`quiz__option ${answers[q.id] === opt ? 'quiz__option--selected' : ''}`}
                      onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAnswers(prev => ({ ...prev, [q.id]: opt })); } }}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Multi Select */}
            {q.question_type === 'multi_select' && (
              <>
                <p className="quiz__question-text">{q.question_text}</p>
                <div className="quiz__options">
                  {q.options.map((opt, oi) => (
                    <div
                      key={oi}
                      className={`quiz__option quiz__option--multi ${isMultiSelected(q.id, opt) ? 'quiz__option--selected' : ''}`}
                      onClick={() => toggleMultiSelect(q.id, opt)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMultiSelect(q.id, opt); } }}
                    >
                      <span className="quiz__option-check">{isMultiSelected(q.id, opt) ? '\u2713' : ''}</span>
                      {opt}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Ordering — arrange items top (first) to bottom (last) */}
            {q.question_type === 'ordering' && (
              <>
                <p className="quiz__question-text">{q.question_text}</p>
                <div className="quiz__ordering" role="list">
                  {getOrdering(q.id, q.options).map((opt, oi, arr) => (
                    <div key={opt} className="quiz__ordering-item" role="listitem">
                      <span className="quiz__ordering-rank">{oi + 1}</span>
                      <span className="quiz__ordering-label">{opt}</span>
                      <span className="quiz__ordering-controls">
                        <button
                          type="button"
                          className="quiz__ordering-btn"
                          aria-label={`Move "${opt}" up`}
                          disabled={oi === 0}
                          onClick={() => moveOrderingItem(q.id, q.options, oi, -1)}
                        >{'▲'}</button>
                        <button
                          type="button"
                          className="quiz__ordering-btn"
                          aria-label={`Move "${opt}" down`}
                          disabled={oi === arr.length - 1}
                          onClick={() => moveOrderingItem(q.id, q.options, oi, 1)}
                        >{'▼'}</button>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Drag-label — pick a term, then tap the target it belongs to */}
            {q.question_type === 'drag_label' && (() => {
              const { terms, targets } = getDragLabelOpts(q);
              const assign = getDragAssign(q.id, targets.length);
              const picked = dragPick[q.id] || '';
              const placed = new Set(assign.filter(Boolean));
              return (
                <>
                  <p className="quiz__question-text">{q.question_text}</p>
                  {q._diagram && (
                    <div className="quiz__diagram" style={{ margin: '0.75rem 0', maxWidth: 540 }} dangerouslySetInnerHTML={{ __html: q._diagram }} />
                  )}
                  <p className="quiz__drag-hint">Tap a term to pick it up, then tap the box it belongs to. Tap a filled box to return its term.</p>
                  <div className="quiz__drag-pool">
                    {terms.filter(t => !placed.has(t)).map(t => (
                      <button
                        type="button"
                        key={t}
                        className={`quiz__drag-term ${picked === t ? 'quiz__drag-term--picked' : ''}`}
                        aria-pressed={picked === t}
                        onClick={() => pickDragTerm(q.id, t)}
                      >{t}</button>
                    ))}
                  </div>
                  <div className="quiz__drag-targets">
                    {targets.map((prompt, ti) => (
                      <button
                        type="button"
                        key={ti}
                        className={`quiz__drag-target ${assign[ti] ? 'quiz__drag-target--filled' : ''} ${picked ? 'quiz__drag-target--active' : ''}`}
                        aria-label={`${prompt}${assign[ti] ? `, currently: ${assign[ti]}` : ', empty'}`}
                        onClick={() => placeDragLabel(q, ti)}
                      >
                        <span className="quiz__drag-target-prompt">{prompt}</span>
                        <span className="quiz__drag-target-slot">{assign[ti] || '—'}</span>
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}

            {/* Short Answer */}
            {q.question_type === 'short_answer' && (
              <>
                <p className="quiz__question-text">{q.question_text}</p>
                <input
                  type="text"
                  className="quiz__text-input"
                  placeholder="Type your answer..."
                  value={answers[q.id] || ''}
                  onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                />
              </>
            )}

            {/* Numeric Input */}
            {(q.question_type === 'numeric_input' || q.question_type === 'math_template') && (
              <>
                <p className="quiz__question-text">{q.question_text}</p>
                <div className="quiz__numeric-wrap">
                  <input
                    type="number"
                    step="any"
                    className="quiz__text-input quiz__text-input--numeric"
                    placeholder="Enter your numeric answer..."
                    value={answers[q.id] || ''}
                    onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                  />
                </div>
              </>
            )}

            {/* Essay / Paragraph */}
            {q.question_type === 'essay' && (
              <>
                <p className="quiz__question-text">{q.question_text}</p>
                <textarea
                  className="quiz__essay-input"
                  placeholder="Write your response here... Be thorough and explain your reasoning."
                  rows={6}
                  value={answers[q.id] || ''}
                  onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                />
                <span className="quiz__essay-hint">
                  {(answers[q.id] || '').length} characters &mdash; Aim for a detailed, well-structured response
                </span>
              </>
            )}

            {/* Fill in the Blank */}
            {q.question_type === 'fill_blank' && (
              <FillBlankQuestion
                questionText={q.question_text}
                options={q.options}
                blanks={getFillBlanks(q.id)}
                onChange={b => setFillBlanks(q.id, b)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="quiz__submit">
        <button
          className="admin-btn admin-btn--primary"
          onClick={submit}
          disabled={submitting || answeredCount < questions.length}
          style={{ padding: '0.75rem 2rem', fontSize: '0.95rem' }}
        >
          {submitting ? 'Grading...' : `Submit ${type === 'module_test' ? 'Test' : 'Quiz'}`}
        </button>
        <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>
          {answeredCount}/{questions.length} answered
        </span>
      </div>
    </div>
  );
}

function formatUserAnswer(answer: string, qType: QuestionType): string {
  if (qType === 'multi_select') {
    try { return (JSON.parse(answer) as string[]).join(', '); } catch { return answer; }
  }
  if (qType === 'ordering') {
    try { return (JSON.parse(answer) as string[]).map((s, i) => `${i + 1}. ${s}`).join('  →  '); } catch { return answer; }
  }
  if (qType === 'drag_label') {
    try { return (JSON.parse(answer) as string[]).map((s, i) => `${i + 1}. ${s || '(blank)'}`).join(' · '); } catch { return answer; }
  }
  return answer || '(blank)';
}

function formatCorrectAnswer(answer: string, qType: QuestionType): string {
  if (qType === 'multi_select') {
    try { return (JSON.parse(answer) as string[]).join(', '); } catch { return answer; }
  }
  if (qType === 'fill_blank') {
    try { return (JSON.parse(answer) as string[]).join(', '); } catch { return answer; }
  }
  if (qType === 'ordering') {
    try { return (JSON.parse(answer) as string[]).map((s, i) => `${i + 1}. ${s}`).join('  →  '); } catch { return answer; }
  }
  if (qType === 'drag_label') {
    try { return (JSON.parse(answer) as string[]).map((s, i) => `${i + 1}. ${s}`).join(' · '); } catch { return answer; }
  }
  return answer;
}
