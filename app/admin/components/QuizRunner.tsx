// app/admin/components/QuizRunner.tsx
'use client';

import { useState, useEffect, useRef } from 'react';

interface Question {
  id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'short_answer';
  options: string[];
  difficulty: string;
}

interface GradedResult {
  question_id: string;
  user_answer: string;
  is_correct: boolean;
  correct_answer: string;
  explanation: string;
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
  const [results, setResults] = useState<{ results: GradedResult[]; score_percent: number; correct_answers: number; total_questions: number; passed: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [noQuestions, setNoQuestions] = useState(false);
  const startTime = useRef(Date.now());

  useEffect(() => {
    fetchQuiz();
  }, []);

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

  async function submit() {
    if (Object.keys(answers).length < questions.length) {
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
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data);
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

  if (loading) return <div className="admin-empty"><div className="admin-empty__icon">⏳</div><div className="admin-empty__title">Loading questions...</div></div>;
  if (noQuestions) return (
    <div className="admin-empty">
      <div className="admin-empty__icon">📝</div>
      <div className="admin-empty__title">No questions available yet</div>
      <div className="admin-empty__desc">Questions will be added by an admin. Check back later!</div>
      <a href={backUrl} className="admin-btn admin-btn--ghost" style={{ marginTop: '1rem' }}>{backLabel}</a>
    </div>
  );

  // Results View
  if (results) {
    return (
      <div className="quiz-results">
        <div className="quiz-results__header">
          <h2 className="quiz-results__title">{results.passed ? '🎉 Passed!' : '📚 Keep Studying'}</h2>
          <div className={`quiz-results__score ${results.passed ? 'quiz-results__score--pass' : 'quiz-results__score--fail'}`}>
            {results.score_percent}%
          </div>
          <p className="quiz-results__summary">
            {results.correct_answers} of {results.total_questions} correct
            {results.passed ? ' — Great work!' : ' — You need 70% to pass.'}
          </p>
        </div>

        <div className="quiz-results__questions">
          {questions.map((q, i) => {
            const r = results.results.find(r => r.question_id === q.id);
            return (
              <div key={q.id} className={`quiz-results__question ${r?.is_correct ? 'quiz-results__question--correct' : 'quiz-results__question--wrong'}`}>
                <div className="quiz-results__question-num">
                  {r?.is_correct ? '✅' : '❌'} Question {i + 1}
                </div>
                <p className="quiz-results__question-text">{q.question_text}</p>
                <div className="quiz-results__answer">
                  <span>Your answer: <strong>{r?.user_answer || '(blank)'}</strong></span>
                  {!r?.is_correct && <span>Correct answer: <strong>{r?.correct_answer}</strong></span>}
                </div>
                {r?.explanation && <p className="quiz-results__explanation">💡 {r.explanation}</p>}
              </div>
            );
          })}
        </div>

        <div className="quiz-results__actions">
          <button className="admin-btn admin-btn--primary" onClick={retake}>🔄 Retake (New Questions)</button>
          <a href={backUrl} className="admin-btn admin-btn--ghost">{backLabel}</a>
        </div>
      </div>
    );
  }

  // Quiz View
  return (
    <div className="quiz">
      <div className="quiz__header">
        <a href={backUrl} className="admin-lesson__nav-link">← {backLabel}</a>
        <h2 className="quiz__title">{title}</h2>
        <p className="quiz__subtitle">{questions.length} questions — Answer all to submit</p>
      </div>

      <div className="quiz__questions">
        {questions.map((q, i) => (
          <div key={q.id} className="quiz__question">
            <div className="quiz__question-header">
              <span className="quiz__question-num">Question {i + 1}</span>
              <span className={`quiz__question-diff quiz__question-diff--${q.difficulty}`}>{q.difficulty}</span>
            </div>
            <p className="quiz__question-text">{q.question_text}</p>

            {(q.question_type === 'multiple_choice' || q.question_type === 'true_false') && (
              <div className="quiz__options">
                {q.options.map((opt, oi) => (
                  <label key={oi} className={`quiz__option ${answers[q.id] === opt ? 'quiz__option--selected' : ''}`}>
                    <input
                      type="radio"
                      name={q.id}
                      value={opt}
                      checked={answers[q.id] === opt}
                      onChange={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {q.question_type === 'short_answer' && (
              <input
                type="text"
                className="quiz__short-answer"
                placeholder="Type your answer..."
                value={answers[q.id] || ''}
                onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
              />
            )}
          </div>
        ))}
      </div>

      <div className="quiz__submit">
        <button
          className="admin-btn admin-btn--primary"
          onClick={submit}
          disabled={submitting || Object.keys(answers).length < questions.length}
          style={{ padding: '0.75rem 2rem', fontSize: '0.95rem' }}
        >
          {submitting ? 'Grading...' : `Submit ${type === 'module_test' ? 'Test' : 'Quiz'}`}
        </button>
        <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>
          {Object.keys(answers).length}/{questions.length} answered
        </span>
      </div>
    </div>
  );
}
