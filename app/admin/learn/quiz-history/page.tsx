// app/admin/learn/quiz-history/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePageError } from '../../hooks/usePageError';

interface QuizAttempt {
  id: string;
  attempt_type: string;
  module_id?: string;
  lesson_id?: string;
  exam_category?: string;
  total_questions: number;
  correct_answers: number;
  score_percent: number;
  time_spent_seconds: number;
  completed_at: string;
}

interface AttemptDetail {
  question_id: string;
  question_text: string;
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
  explanation?: string;
}

export default function QuizHistoryPage() {
  const { data: session } = useSession();
  const { safeFetch, safeAction } = usePageError('QuizHistoryPage');
  const role = session?.user?.role || 'employee';
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, AttemptDetail[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [adminEmail, setAdminEmail] = useState<string>('');

  useEffect(() => { fetchHistory(); }, [adminEmail]);

  async function fetchHistory() {
    setLoading(true);
    try {
      let url = '/api/admin/learn/quizzes?history=true&limit=50';
      if (adminEmail && role === 'admin') {
        url += `&user_email=${encodeURIComponent(adminEmail)}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setAttempts(data.attempts || []);
      }
    } catch (err) { console.error('QuizHistoryPage: failed to fetch history', err); }
    setLoading(false);
  }

  async function loadDetails(attemptId: string) {
    if (details[attemptId]) {
      setExpandedId(expandedId === attemptId ? null : attemptId);
      return;
    }
    setLoadingDetails(attemptId);
    setExpandedId(attemptId);
    try {
      const res = await fetch(`/api/admin/learn/quizzes?attempt_id=${attemptId}`);
      if (res.ok) {
        const data = await res.json();
        setDetails(prev => ({ ...prev, [attemptId]: data.answers || [] }));
      }
    } catch (err) { console.error('QuizHistoryPage: failed to load attempt details', err); }
    setLoadingDetails(null);
  }

  const filtered = attempts.filter(a => {
    if (filterType === 'all') return true;
    return a.attempt_type === filterType;
  });

  // Calculate aggregates
  const avgScore = filtered.length > 0
    ? Math.round(filtered.reduce((sum, a) => sum + a.score_percent, 0) / filtered.length)
    : 0;
  const passRate = filtered.length > 0
    ? Math.round((filtered.filter(a => a.score_percent >= 70).length / filtered.length) * 100)
    : 0;
  const totalAttempts = filtered.length;

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  function formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }

  function getTypeBadge(type: string, category?: string): { label: string; className: string } {
    if (type === 'exam_prep') return { label: `${category || 'Exam'} Prep`, className: 'quiz-history__badge--exam' };
    if (type === 'module_test') return { label: 'Module Test', className: 'quiz-history__badge--module' };
    return { label: 'Lesson Quiz', className: 'quiz-history__badge--lesson' };
  }

  if (loading) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">⏳</div>
        <div className="admin-empty__title">Loading quiz history...</div>
      </div>
    );
  }

  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn" className="learn__back">&larr; Back to Learning Hub</Link>
        <h2 className="learn__title">Quiz &amp; Test History</h2>
        <p className="learn__subtitle">Review all your quiz attempts, scores, and detailed answer breakdowns.</p>
      </div>

      {/* Admin: Employee selector */}
      {role === 'admin' && (
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>View as:</label>
          <input
            type="email"
            placeholder="Employee email (blank = yours)"
            value={adminEmail}
            onChange={e => setAdminEmail(e.target.value)}
            className="fc-form__input"
            style={{ maxWidth: '300px' }}
          />
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={fetchHistory}>Load</button>
        </div>
      )}

      {/* Aggregate Stats */}
      <div className="quiz-history__stats">
        <div className="quiz-history__stat">
          <span className="quiz-history__stat-value">{totalAttempts}</span>
          <span className="quiz-history__stat-label">Attempts</span>
        </div>
        <div className="quiz-history__stat">
          <span className="quiz-history__stat-value">{avgScore}%</span>
          <span className="quiz-history__stat-label">Avg Score</span>
        </div>
        <div className="quiz-history__stat">
          <span className="quiz-history__stat-value">{passRate}%</span>
          <span className="quiz-history__stat-label">Pass Rate</span>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[['all', 'All'], ['lesson_quiz', 'Quizzes'], ['module_test', 'Module Tests'], ['exam_prep', 'Exam Prep']].map(([key, label]) => (
          <button key={key} className={`admin-kb__category-btn ${filterType === key ? 'admin-kb__category-btn--active' : ''}`} onClick={() => setFilterType(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Attempts List */}
      {filtered.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty__icon">📊</div>
          <div className="admin-empty__title">No quiz attempts yet</div>
          <div className="admin-empty__desc">Take a quiz or exam prep test to see your results here.</div>
          <Link href="/admin/learn/exam-prep" className="admin-btn admin-btn--primary" style={{ marginTop: '1rem' }}>Start Exam Prep</Link>
        </div>
      ) : (
        <div className="quiz-history__list">
          {filtered.map((attempt) => {
            const badge = getTypeBadge(attempt.attempt_type, attempt.exam_category);
            const isExpanded = expandedId === attempt.id;
            const attemptDetails = details[attempt.id];

            return (
              <div key={attempt.id} className="quiz-history__attempt">
                <div className="quiz-history__attempt-header" onClick={() => loadDetails(attempt.id)}>
                  <div className="quiz-history__attempt-left">
                    <span className={`quiz-history__badge ${badge.className}`}>{badge.label}</span>
                    <span className="quiz-history__attempt-date">{formatDate(attempt.completed_at)}</span>
                    <span className="quiz-history__attempt-meta">
                      {attempt.correct_answers}/{attempt.total_questions} correct · {formatTime(attempt.time_spent_seconds)}
                    </span>
                  </div>
                  <div className="quiz-history__attempt-right">
                    <span className={`quiz-history__score ${attempt.score_percent >= 70 ? 'quiz-history__score--pass' : 'quiz-history__score--fail'}`}>
                      {attempt.score_percent}%
                    </span>
                    <span className={`quiz-history__pass-badge ${attempt.score_percent >= 70 ? 'quiz-history__pass-badge--pass' : 'quiz-history__pass-badge--fail'}`}>
                      {attempt.score_percent >= 70 ? 'PASS' : 'FAIL'}
                    </span>
                    <span className="quiz-history__expand">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expandable Detail */}
                {isExpanded && (
                  <div className="quiz-history__detail">
                    {loadingDetails === attempt.id && <p style={{ padding: '1rem', fontSize: '0.85rem', color: '#9CA3AF' }}>Loading details...</p>}
                    {attemptDetails && attemptDetails.length > 0 && (
                      <div className="quiz-history__questions">
                        {attemptDetails.map((d, i) => (
                          <div key={d.question_id} className={`quiz-history__question ${d.is_correct ? 'quiz-history__question--correct' : 'quiz-history__question--wrong'}`}>
                            <div className="quiz-history__question-header">
                              <span className="quiz-history__question-badge">
                                {d.is_correct ? '✓' : '✗'}
                              </span>
                              <span className="quiz-history__question-num">Q{i + 1}</span>
                            </div>
                            <p className="quiz-history__question-text">{d.question_text}</p>
                            <div className="quiz-history__answers">
                              <div className="quiz-history__answer">
                                <span className="quiz-history__answer-label">Your answer:</span>
                                <span className={d.is_correct ? 'quiz-history__answer--correct' : 'quiz-history__answer--wrong'}>
                                  {d.user_answer || '(blank)'}
                                </span>
                              </div>
                              {!d.is_correct && (
                                <div className="quiz-history__answer">
                                  <span className="quiz-history__answer-label">Correct:</span>
                                  <span className="quiz-history__answer--correct">{d.correct_answer}</span>
                                </div>
                              )}
                            </div>
                            {d.explanation && (
                              <p className="quiz-history__explanation">{d.explanation}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {attemptDetails && attemptDetails.length === 0 && (
                      <p style={{ padding: '1rem', fontSize: '0.85rem', color: '#9CA3AF' }}>No detailed answers available for this attempt.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
