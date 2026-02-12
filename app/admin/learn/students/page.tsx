// app/admin/learn/students/page.tsx
'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Student {
  email: string;
  lessons_completed: number;
  quiz_count: number;
  avg_quiz_score: number;
  xp_balance: number;
  xp_total: number;
  modules_completed: number;
  last_active: string | null;
}

type SortKey = 'email' | 'lessons_completed' | 'quiz_count' | 'avg_quiz_score' | 'xp_total' | 'modules_completed' | 'last_active';

export default function StudentsPage() {
  const { data: session } = useSession();
  const role = session?.user?.role || 'employee';
  const canManage = role === 'admin' || role === 'teacher';

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('xp_total');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    fetch('/api/admin/learn/students')
      .then(r => r.json())
      .then(data => {
        setStudents(data.students || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load student data');
        setLoading(false);
      });
  }, [canManage]);

  if (!canManage) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">🔒</div>
        <h2 className="admin-empty__title">Access Restricted</h2>
        <p className="admin-empty__desc">Only teachers and admins can view student progress.</p>
      </div>
    );
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const filtered = students
    .filter(s => !search || s.email.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });

  // Aggregated stats
  const totalStudents = students.length;
  const avgCompletion = totalStudents > 0
    ? Math.round(students.reduce((s, st) => s + st.lessons_completed, 0) / totalStudents)
    : 0;
  const avgQuizScore = totalStudents > 0
    ? Math.round(students.reduce((s, st) => s + st.avg_quiz_score, 0) / totalStudents)
    : 0;
  const totalXP = students.reduce((s, st) => s + st.xp_total, 0);

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div style={{ padding: '0' }}>
      <div className="admin-learn__header">
        <h2 className="admin-learn__title">Student Progress</h2>
        <p className="admin-learn__subtitle">
          Monitor student learning activity, quiz scores, and achievements.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6B7280' }}>Loading student data...</div>
      ) : error ? (
        <div className="admin-login__error" style={{ maxWidth: 500, margin: '2rem auto' }}>{error}</div>
      ) : (
        <>
          {/* Stats cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="admin-card admin-card--accent-blue">
              <div className="admin-card__label">Total Students</div>
              <div className="admin-card__value">{totalStudents}</div>
            </div>
            <div className="admin-card admin-card--accent-green">
              <div className="admin-card__label">Avg Lessons Done</div>
              <div className="admin-card__value">{avgCompletion}</div>
            </div>
            <div className="admin-card admin-card--accent-amber">
              <div className="admin-card__label">Avg Quiz Score</div>
              <div className="admin-card__value">{avgQuizScore}%</div>
            </div>
            <div className="admin-card admin-card--accent-red">
              <div className="admin-card__label">Total XP Awarded</div>
              <div className="admin-card__value">{totalXP.toLocaleString()}</div>
            </div>
          </div>

          {/* Search */}
          <div style={{ marginBottom: '1rem' }}>
            <input
              type="text"
              placeholder="Search by email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', maxWidth: 400, padding: '.6rem .9rem',
                fontFamily: "'Inter',sans-serif", fontSize: '.88rem',
                border: '2px solid #E5E7EB', borderRadius: 8,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Student table */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>
              {search ? 'No students match your search.' : 'No student activity recorded yet.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse', fontFamily: "'Inter',sans-serif", fontSize: '.85rem',
              }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E5E7EB', textAlign: 'left' }}>
                    {([
                      ['email', 'Student'],
                      ['lessons_completed', 'Lessons'],
                      ['modules_completed', 'Modules'],
                      ['quiz_count', 'Quizzes'],
                      ['avg_quiz_score', 'Avg Score'],
                      ['xp_total', 'XP Earned'],
                      ['last_active', 'Last Active'],
                    ] as [SortKey, string][]).map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        style={{
                          padding: '.65rem .75rem', fontWeight: 600, color: '#374151',
                          cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                        }}
                      >
                        {label}{sortArrow(key)}
                      </th>
                    ))}
                    <th style={{ padding: '.65rem .75rem', fontWeight: 600, color: '#374151' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(student => (
                    <tr
                      key={student.email}
                      style={{ borderBottom: '1px solid #F3F4F6', transition: 'background .15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ padding: '.65rem .75rem', fontWeight: 500, color: '#0F1419' }}>
                        {student.email}
                      </td>
                      <td style={{ padding: '.65rem .75rem', color: '#374151' }}>{student.lessons_completed}</td>
                      <td style={{ padding: '.65rem .75rem', color: '#374151' }}>{student.modules_completed}</td>
                      <td style={{ padding: '.65rem .75rem', color: '#374151' }}>{student.quiz_count}</td>
                      <td style={{ padding: '.65rem .75rem' }}>
                        <span style={{
                          color: student.avg_quiz_score >= 80 ? '#059669' : student.avg_quiz_score >= 60 ? '#D97706' : '#DC2626',
                          fontWeight: 600,
                        }}>
                          {student.avg_quiz_score > 0 ? `${student.avg_quiz_score}%` : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '.65rem .75rem', color: '#374151', fontWeight: 500 }}>
                        {student.xp_total.toLocaleString()}
                      </td>
                      <td style={{ padding: '.65rem .75rem', color: '#9CA3AF', fontSize: '.8rem' }}>
                        {formatDate(student.last_active)}
                      </td>
                      <td style={{ padding: '.65rem .75rem' }}>
                        <Link
                          href={`/admin/learn/students/${encodeURIComponent(student.email)}`}
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
