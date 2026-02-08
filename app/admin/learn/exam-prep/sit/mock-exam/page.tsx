// app/admin/learn/exam-prep/sit/mock-exam/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { usePageError } from '../../../../hooks/usePageError';

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  options: string[];
  difficulty: string;
  tags: string[];
}

interface GradedResult {
  question_id: string;
  user_answer: string;
  is_correct: boolean;
  correct_answer: string;
  explanation: string;
  category: string;
}

interface CategoryScore {
  correct: number;
  total: number;
  percent: number;
}

type ExamPhase = 'intro' | 'exam' | 'results';

export default function MockExamPage() {
  const { safeFetch } = usePageError('MockExamPage');
  const searchParams = useSearchParams();
  const isQuickMode = searchParams.get('quick') === 'true';

  const [phase, setPhase] = useState<ExamPhase>('intro');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(isQuickMode ? 3600 : 19200); // 60 or 320 minutes
  const [results, setResults] = useState<{
    score_percent: number;
    correct_answers: number;
    total_questions: number;
    passed: boolean;
    results: GradedResult[];
    category_scores: Record<string, CategoryScore>;
    time_spent_seconds: number;
  } | null>(null);
  const [showNav, setShowNav] = useState(true);

  const startTime = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submitRef = useRef<(auto: boolean) => void>(() => {});

  const handleSubmit = useCallback(async (autoSubmit = false) => {
    if (submitting) return;
    if (!autoSubmit) {
      const unanswered = questions.filter(q => !answers[q.id]);
      if (unanswered.length > 0) {
        const proceed = confirm(`You have ${unanswered.length} unanswered question${unanswered.length > 1 ? 's' : ''}. Submit anyway?`);
        if (!proceed) return;
      }
    }

    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const elapsed = Math.round((Date.now() - startTime.current) / 1000);

    try {
      const res = await fetch('/api/admin/learn/exam-prep/fs/mock-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: questions.map(q => ({
            question_id: q.id,
            user_answer: answers[q.id] || '',
          })),
          time_spent_seconds: elapsed,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setPhase('results');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) { console.error('MockExamPage: submit failed', err); }
    setSubmitting(false);
  }, [answers, questions, submitting]);

  // Keep ref in sync
  useEffect(() => { submitRef.current = handleSubmit; }, [handleSubmit]);

  // Timer
  useEffect(() => {
    if (phase === 'exam' && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            submitRef.current(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
    return undefined;
  }, [phase]);

  async function startExam() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/learn/exam-prep/fs/mock-exam');
      if (res.ok) {
        const data = await res.json();
        let qs = data.questions || [];
        if (isQuickMode) qs = qs.slice(0, 20);
        setQuestions(qs);
        setTimeLeft(isQuickMode ? 3600 : data.time_limit_seconds || 19200);
        startTime.current = Date.now();
        setPhase('exam');
      }
    } catch (err) { console.error('MockExamPage: start failed', err); }
    setLoading(false);
  }

  function formatTimer(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function getTimerColor(): string {
    const total = isQuickMode ? 3600 : 19200;
    const pct = timeLeft / total;
    if (pct <= 0.1) return '#EF4444';
    if (pct <= 0.25) return '#F97316';
    return '#1D3095';
  }

  const answeredCount = questions.filter(q => answers[q.id]).length;

  // ============= INTRO PHASE =============
  if (phase === 'intro') {
    return (
      <>
        <div className="admin-learn__header">
          <Link href="/admin/learn/exam-prep/sit" className="admin-module-detail__back">&larr; Back to FS Prep</Link>
          <h2 className="admin-learn__title">
            {isQuickMode ? '\u26A1 FS Readiness Check' : '\uD83D\uDCDD FS Mock Exam'}
          </h2>
        </div>

        <div className="fs-mock__intro">
          <div className="fs-mock__intro-card">
            <h3>{isQuickMode ? 'Quick Readiness Check' : 'Full NCEES FS Practice Exam'}</h3>
            <div className="fs-mock__intro-details">
              <div className="fs-mock__intro-detail">
                <strong>Questions</strong>
                <span>{isQuickMode ? '20' : '110'}</span>
              </div>
              <div className="fs-mock__intro-detail">
                <strong>Time Limit</strong>
                <span>{isQuickMode ? '60 minutes' : '5 hours 20 minutes'}</span>
              </div>
              <div className="fs-mock__intro-detail">
                <strong>Passing Score</strong>
                <span>70%</span>
              </div>
              <div className="fs-mock__intro-detail">
                <strong>Format</strong>
                <span>Multiple choice, True/False, Numeric</span>
              </div>
            </div>

            <div className="fs-mock__intro-rules">
              <h4>Exam Rules</h4>
              <ul>
                <li>The timer starts when you click &ldquo;Begin Exam&rdquo;</li>
                <li>You can navigate between questions using the sidebar</li>
                <li>Unanswered questions are marked as incorrect</li>
                <li>The exam auto-submits when time expires</li>
                <li>You&apos;ll see detailed results with category breakdowns after submission</li>
              </ul>
            </div>

            <button
              className="admin-btn admin-btn--primary"
              onClick={startExam}
              disabled={loading}
              style={{ padding: '1rem 3rem', fontSize: '1.1rem', marginTop: '1.5rem' }}
            >
              {loading ? 'Loading Questions...' : 'Begin Exam'}
            </button>
          </div>
        </div>
      </>
    );
  }

  // ============= RESULTS PHASE =============
  if (phase === 'results' && results) {
    const catEntries = Object.entries(results.category_scores)
      .sort((a, b) => a[1].percent - b[1].percent);

    return (
      <>
        <div className="admin-learn__header">
          <Link href="/admin/learn/exam-prep/sit" className="admin-module-detail__back">&larr; Back to FS Prep</Link>
          <h2 className="admin-learn__title">
            {results.passed ? '\u2705 Exam Passed!' : '\uD83D\uDCDA Keep Studying'}
          </h2>
        </div>

        <div className="fs-mock__results">
          <div className={`fs-mock__results-score ${results.passed ? 'fs-mock__results-score--pass' : 'fs-mock__results-score--fail'}`}>
            <span className="fs-mock__results-pct">{results.score_percent}%</span>
            <span className="fs-mock__results-detail">
              {results.correct_answers}/{results.total_questions} correct
            </span>
            <span className="fs-mock__results-time">
              Time: {formatTimer(results.time_spent_seconds)}
            </span>
          </div>

          {/* Category Breakdown */}
          <div className="fs-mock__category-breakdown">
            <h3>Score by Category</h3>
            {catEntries.map(([cat, score]) => (
              <div key={cat} className="fs-mock__category-row">
                <span className="fs-mock__category-name">{cat}</span>
                <div className="fs-mock__category-bar-track">
                  <div
                    className="fs-mock__category-bar-fill"
                    style={{
                      width: `${score.percent}%`,
                      background: score.percent >= 70 ? '#10B981' : score.percent >= 50 ? '#F59E0B' : '#EF4444',
                    }}
                  />
                </div>
                <span className="fs-mock__category-score">
                  {score.correct}/{score.total} ({score.percent}%)
                </span>
              </div>
            ))}
          </div>

          {/* Weak Areas */}
          {catEntries.filter(([, s]) => s.percent < 70).length > 0 && (
            <div className="fs-mock__weak-areas">
              <h3>Areas Needing Improvement</h3>
              <ul>
                {catEntries.filter(([, s]) => s.percent < 70).map(([cat, score]) => (
                  <li key={cat}>
                    <strong>{cat}</strong> &mdash; {score.percent}% ({score.correct}/{score.total})
                  </li>
                ))}
              </ul>
              <p className="fs-mock__weak-tip">
                Go back to the relevant study modules and review these topics before retaking the exam.
              </p>
            </div>
          )}

          {/* Question Review */}
          <div className="fs-mock__question-review">
            <h3>Question Review</h3>
            {questions.map((q, i) => {
              const r = results.results.find(r => r.question_id === q.id);
              return (
                <div key={q.id} className={`fs-mock__review-q ${r?.is_correct ? 'fs-mock__review-q--correct' : 'fs-mock__review-q--wrong'}`}>
                  <div className="fs-mock__review-header">
                    <span>{r?.is_correct ? '\u2705' : '\u274C'} Q{i + 1}</span>
                    <span className="fs-mock__review-cat">{r?.category || 'general'}</span>
                  </div>
                  <p className="fs-mock__review-text">{q.question_text}</p>
                  <div className="fs-mock__review-answers">
                    <span>Your answer: <strong>{r?.user_answer || '(blank)'}</strong></span>
                    {!r?.is_correct && <span>Correct: <strong>{r?.correct_answer}</strong></span>}
                  </div>
                  {r?.explanation && <p className="fs-mock__review-explanation">{r.explanation}</p>}
                </div>
              );
            })}
          </div>

          <div className="fs-mock__results-actions">
            <Link href="/admin/learn/exam-prep/sit" className="admin-btn admin-btn--primary">Back to FS Prep</Link>
            <button className="admin-btn admin-btn--secondary" onClick={() => { setPhase('intro'); setAnswers({}); setResults(null); }}>
              Retake Exam
            </button>
          </div>
        </div>
      </>
    );
  }

  // ============= EXAM PHASE =============
  const currentQuestion = questions[currentQ];
  if (!currentQuestion) return null;

  return (
    <div className="fs-mock__exam">
      {/* Timer Bar */}
      <div className="fs-mock__timer-bar">
        <div className="fs-mock__timer-left">
          <span className="fs-mock__timer-clock" style={{ color: getTimerColor() }}>
            &#x23F1; {formatTimer(timeLeft)}
          </span>
          <span className="fs-mock__timer-progress">
            {answeredCount}/{questions.length} answered
          </span>
        </div>
        <div className="fs-mock__timer-right">
          <button
            className="admin-btn admin-btn--ghost"
            onClick={() => setShowNav(prev => !prev)}
            style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
          >
            {showNav ? 'Hide Nav' : 'Show Nav'}
          </button>
          <button
            className="admin-btn admin-btn--primary"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            style={{ fontSize: '0.85rem' }}
          >
            {submitting ? 'Submitting...' : 'Submit Exam'}
          </button>
        </div>
      </div>

      <div className="fs-mock__exam-layout">
        {/* Question Navigation Sidebar */}
        {showNav && (
          <div className="fs-mock__nav">
            <div className="fs-mock__nav-title">Questions</div>
            <div className="fs-mock__nav-grid">
              {questions.map((q, i) => (
                <button
                  key={q.id}
                  className={`fs-mock__nav-btn ${i === currentQ ? 'fs-mock__nav-btn--current' : ''} ${answers[q.id] ? 'fs-mock__nav-btn--answered' : ''}`}
                  onClick={() => setCurrentQ(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Question Area */}
        <div className="fs-mock__question-area">
          <div className="fs-mock__question-header">
            <span className="fs-mock__question-num">Question {currentQ + 1} of {questions.length}</span>
            <span className={`quiz__question-diff quiz__question-diff--${currentQuestion.difficulty}`}>
              {currentQuestion.difficulty}
            </span>
          </div>

          <p className="fs-mock__question-text">{currentQuestion.question_text}</p>

          {/* Multiple Choice / True-False Options */}
          {(currentQuestion.question_type === 'multiple_choice' || currentQuestion.question_type === 'true_false') && (
            <div className="quiz__options">
              {currentQuestion.options.map((opt, oi) => (
                <div
                  key={oi}
                  className={`quiz__option ${answers[currentQuestion.id] === opt ? 'quiz__option--selected' : ''}`}
                  onClick={() => setAnswers(prev => ({ ...prev, [currentQuestion.id]: opt }))}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setAnswers(prev => ({ ...prev, [currentQuestion.id]: opt }));
                    }
                  }}
                >
                  {opt}
                </div>
              ))}
            </div>
          )}

          {/* Numeric Input */}
          {currentQuestion.question_type === 'numeric_input' && (
            <div className="quiz__numeric-wrap">
              <input
                type="number"
                step="any"
                className="quiz__text-input quiz__text-input--numeric"
                placeholder="Enter your numeric answer..."
                value={answers[currentQuestion.id] || ''}
                onChange={e => setAnswers(prev => ({ ...prev, [currentQuestion.id]: e.target.value }))}
              />
            </div>
          )}

          {/* Short Answer */}
          {currentQuestion.question_type === 'short_answer' && (
            <input
              type="text"
              className="quiz__text-input"
              placeholder="Type your answer..."
              value={answers[currentQuestion.id] || ''}
              onChange={e => setAnswers(prev => ({ ...prev, [currentQuestion.id]: e.target.value }))}
            />
          )}

          {/* Navigation */}
          <div className="fs-mock__question-nav">
            <button
              className="admin-btn admin-btn--ghost"
              onClick={() => setCurrentQ(prev => Math.max(0, prev - 1))}
              disabled={currentQ === 0}
            >
              &larr; Previous
            </button>
            <button
              className="admin-btn admin-btn--secondary"
              onClick={() => setCurrentQ(prev => Math.min(questions.length - 1, prev + 1))}
              disabled={currentQ === questions.length - 1}
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
