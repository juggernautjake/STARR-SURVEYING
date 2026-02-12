// app/admin/learn/students/[studentEmail]/page.tsx
'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface ModuleCompletion {
  module_id: string;
  module_type: string;
  module_title: string;
  completed_at: string;
  xp_earned: number;
  is_current: boolean;
}

interface LessonCompletion {
  lesson_id: string;
  module_id: string;
  module_title: string;
  lesson_title: string;
  completed_at: string;
}

interface QuizAttempt {
  id: string;
  attempt_type: string;
  module_id: string | null;
  lesson_id: string | null;
  module_title: string;
  lesson_title: string;
  total_questions: number;
  correct_answers: number;
  score_percent: number;
  time_spent_seconds: number;
  completed_at: string;
}

interface XpTransaction {
  amount: number;
  transaction_type: string;
  description: string;
  created_at: string;
}

interface StudentData {
  email: string;
  modules: ModuleCompletion[];
  lessons: LessonCompletion[];
  quizzes: QuizAttempt[];
  xp: { current_balance: number; total_earned: number; total_spent: number };
  xp_history: XpTransaction[];
}

type Tab = 'overview' | 'quizzes' | 'xp';

export default function StudentDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const studentEmail = decodeURIComponent(params.studentEmail as string);
  const role = session?.user?.role || 'employee';
  const canManage = role === 'admin' || role === 'teacher';

  const [data, setData] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    if (!canManage || !studentEmail) return;
    fetch(`/api/admin/learn/students?email=${encodeURIComponent(studentEmail)}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('Failed to load student data'); setLoading(false); });
  }, [canManage, studentEmail]);

  if (!canManage) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">🔒</div>
        <h2 className="admin-empty__title">Access Restricted</h2>
      </div>
    );
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#6B7280' }}>Loading...</div>;
  if (error) return <div className="admin-login__error" style={{ maxWidth: 500, margin: '2rem auto' }}>{error}</div>;
  if (!data) return null;

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formatTime = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  const attemptTypeLabel: Record<string, string> = {
    lesson_quiz: 'Lesson Quiz',
    module_test: 'Module Test',
    exam_prep: 'Exam Prep',
    article_quiz: 'Article Quiz',
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Progress Overview' },
    { key: 'quizzes', label: `Quiz History (${data.quizzes.length})` },
    { key: 'xp', label: `XP History (${data.xp_history.length})` },
  ];

  return (
    <div style={{ padding: '0' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href="/admin/learn/students" style={{ fontFamily: "'Inter',sans-serif", fontSize: '.82rem', color: '#6B7280', textDecoration: 'none' }}>
          &larr; Back to Student List
        </Link>
        <h2 className="admin-learn__title" style={{ marginTop: '.5rem' }}>
          {studentEmail}
        </h2>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="admin-card admin-card--accent-green">
          <div className="admin-card__label">Lessons Completed</div>
          <div className="admin-card__value">{data.lessons.length}</div>
        </div>
        <div className="admin-card admin-card--accent-blue">
          <div className="admin-card__label">Modules Completed</div>
          <div className="admin-card__value">{data.modules.filter(m => m.is_current).length}</div>
        </div>
        <div className="admin-card admin-card--accent-amber">
          <div className="admin-card__label">Quizzes Taken</div>
          <div className="admin-card__value">{data.quizzes.length}</div>
          {data.quizzes.length > 0 && (
            <div className="admin-card__footer">
              Avg: {Math.round(data.quizzes.reduce((s, q) => s + Number(q.score_percent), 0) / data.quizzes.length)}%
            </div>
          )}
        </div>
        <div className="admin-card admin-card--accent-red">
          <div className="admin-card__label">XP Balance</div>
          <div className="admin-card__value">{data.xp.current_balance.toLocaleString()}</div>
          <div className="admin-card__footer">
            {data.xp.total_earned.toLocaleString()} earned total
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1.5rem', borderBottom: '2px solid #E5E7EB', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              fontFamily: "'Inter',sans-serif", fontSize: '.85rem', fontWeight: 600,
              padding: '.6rem 1rem', cursor: 'pointer', border: 'none', background: 'none',
              borderBottom: tab === t.key ? '3px solid #1D3095' : '3px solid transparent',
              color: tab === t.key ? '#1D3095' : '#6B7280',
              marginBottom: '-2px', transition: 'all .15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div>
          {/* Module Completions */}
          <h3 style={{ fontFamily: "'Sora',sans-serif", fontSize: '1rem', fontWeight: 700, color: '#0F1419', marginBottom: '.75rem' }}>
            Module Completions
          </h3>
          {data.modules.length === 0 ? (
            <p style={{ color: '#9CA3AF', fontSize: '.85rem', marginBottom: '1.5rem' }}>No modules completed yet.</p>
          ) : (
            <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Inter',sans-serif", fontSize: '.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E5E7EB', textAlign: 'left' }}>
                    <th style={thStyle}>Module</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>XP Earned</th>
                    <th style={thStyle}>Completed</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.modules.map((m, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={tdStyle}>{m.module_title}</td>
                      <td style={tdStyle}>{m.module_type}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>+{m.xp_earned}</td>
                      <td style={{ ...tdStyle, color: '#9CA3AF', fontSize: '.8rem' }}>{formatDate(m.completed_at)}</td>
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-block', padding: '.15rem .5rem', borderRadius: 12,
                          fontSize: '.72rem', fontWeight: 600,
                          background: m.is_current ? '#ECFDF5' : '#FEF3C7',
                          color: m.is_current ? '#065F46' : '#92400E',
                        }}>
                          {m.is_current ? 'Current' : 'Expired'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent Lesson Completions */}
          <h3 style={{ fontFamily: "'Sora',sans-serif", fontSize: '1rem', fontWeight: 700, color: '#0F1419', marginBottom: '.75rem' }}>
            Recent Lessons ({data.lessons.length} total)
          </h3>
          {data.lessons.length === 0 ? (
            <p style={{ color: '#9CA3AF', fontSize: '.85rem' }}>No lessons completed yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Inter',sans-serif", fontSize: '.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E5E7EB', textAlign: 'left' }}>
                    <th style={thStyle}>Lesson</th>
                    <th style={thStyle}>Module</th>
                    <th style={thStyle}>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lessons.slice(0, 30).map((l, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={tdStyle}>{l.lesson_title}</td>
                      <td style={{ ...tdStyle, color: '#6B7280' }}>{l.module_title || '—'}</td>
                      <td style={{ ...tdStyle, color: '#9CA3AF', fontSize: '.8rem' }}>{formatDate(l.completed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.lessons.length > 30 && (
                <p style={{ color: '#9CA3AF', fontSize: '.8rem', marginTop: '.5rem' }}>
                  Showing 30 of {data.lessons.length} lessons.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'quizzes' && (
        <div>
          {data.quizzes.length === 0 ? (
            <p style={{ color: '#9CA3AF', fontSize: '.85rem' }}>No quizzes taken yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Inter',sans-serif", fontSize: '.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E5E7EB', textAlign: 'left' }}>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Module / Lesson</th>
                    <th style={thStyle}>Score</th>
                    <th style={thStyle}>Questions</th>
                    <th style={thStyle}>Time</th>
                    <th style={thStyle}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.quizzes.map((q) => (
                    <tr key={q.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-block', padding: '.15rem .5rem', borderRadius: 12,
                          fontSize: '.72rem', fontWeight: 600,
                          background: '#EEF2FF', color: '#3730A3',
                        }}>
                          {attemptTypeLabel[q.attempt_type] || q.attempt_type}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 250 }}>
                        <div style={{ fontWeight: 500 }}>{q.module_title || '—'}</div>
                        {q.lesson_title && <div style={{ fontSize: '.78rem', color: '#9CA3AF' }}>{q.lesson_title}</div>}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          fontWeight: 700, fontSize: '.95rem',
                          color: Number(q.score_percent) >= 80 ? '#059669' : Number(q.score_percent) >= 60 ? '#D97706' : '#DC2626',
                        }}>
                          {q.score_percent}%
                        </span>
                      </td>
                      <td style={tdStyle}>{q.correct_answers}/{q.total_questions}</td>
                      <td style={{ ...tdStyle, color: '#6B7280' }}>{formatTime(q.time_spent_seconds)}</td>
                      <td style={{ ...tdStyle, color: '#9CA3AF', fontSize: '.8rem' }}>{formatDate(q.completed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'xp' && (
        <div>
          {data.xp_history.length === 0 ? (
            <p style={{ color: '#9CA3AF', fontSize: '.85rem' }}>No XP transactions yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Inter',sans-serif", fontSize: '.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E5E7EB', textAlign: 'left' }}>
                    <th style={thStyle}>Amount</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Description</th>
                    <th style={thStyle}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.xp_history.map((tx, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 700, color: tx.amount >= 0 ? '#059669' : '#DC2626' }}>
                          {tx.amount >= 0 ? '+' : ''}{tx.amount}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-block', padding: '.15rem .5rem', borderRadius: 12,
                          fontSize: '.72rem', fontWeight: 600,
                          background: '#F3F4F6', color: '#374151',
                        }}>
                          {tx.transaction_type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: '#374151' }}>{tx.description}</td>
                      <td style={{ ...tdStyle, color: '#9CA3AF', fontSize: '.8rem' }}>{formatDate(tx.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '.65rem .75rem', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '.65rem .75rem', color: '#374151' };
