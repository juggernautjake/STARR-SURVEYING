// app/admin/components/QuizRunner.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import FillBlankQuestion from './FillBlankQuestion';

type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'fill_blank' | 'multi_select' | 'numeric_input' | 'math_template' | 'essay';

interface Question {
  id: string;
  question_text: string;
  question_type: QuestionType;
  options: string[];
  difficulty: string;
  _math_vars?: Record<string, number>;
  _original_type?: string;
  _blank_count?: number;
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
}

export default function QuizRunner({ type, lessonId, moduleId, examCategory, questionCount = 5, title, backUrl, backLabel }: QuizRunnerProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
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
  const startTime = useRef(Date.now());

  useEffect(() => { fetchQuiz(); }, []);

  async function fetchQuiz() {
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
  }

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
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch { /* ignore */ }
    setSubmitting(false);
  }

  function retake() {
    setResults(null);
    setAnswers({});
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

  // Fill blank
  function getFillBlanks(qId: string): string[] {
    try { return JSON.parse(answers[qId] || '[]'); } catch { return []; }
  }

  function setFillBlanks(qId: string, blanks: string[]) {
    setAnswers(prev => ({ ...prev, [qId]: JSON.stringify(blanks) }));
  }

  if (loading) return <div className="admin-empty"><div className="admin-empty__icon">&#x23F3;</div><div className="admin-empty__title">Loading questions...</div></div>;
  if (noQuestions) return (
    <div className="admin-empty">
      <div className="admin-empty__icon">&#x1F4DD;</div>
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
        </div>

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
              </div>
            );
          })}
        </div>

        <div className="quiz-results__actions">
          <button className="admin-btn admin-btn--primary" onClick={retake}>Retake (New Questions)</button>
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
                {(q.question_type === 'numeric_input' || q._original_type === 'math_template') && <span className="quiz__question-type-badge">Numeric Answer</span>}
                {q.question_type === 'essay' && <span className="quiz__question-type-badge">AI-Graded Essay</span>}
              </div>
            </div>

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
  return answer || '(blank)';
}

function formatCorrectAnswer(answer: string, qType: QuestionType): string {
  if (qType === 'multi_select') {
    try { return (JSON.parse(answer) as string[]).join(', '); } catch { return answer; }
  }
  if (qType === 'fill_blank') {
    try { return (JSON.parse(answer) as string[]).join(', '); } catch { return answer; }
  }
  return answer;
}
