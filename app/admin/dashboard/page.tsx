// app/admin/dashboard/page.tsx
'use client';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { usePageError } from '../hooks/usePageError';

interface QuizAttempt {
  id: string;
  attempt_type: string;
  score_percent: number;
  completed_at: string;
  exam_category?: string;
}

interface ActivityItem {
  id: string;
  user_email: string;
  action_type: string;
  entity_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export default function AdminDashboardPage() {
  const { data: session } = useSession();
  const { safeFetch, safeAction, reportPageError } = usePageError('AdminDashboardPage');
  const [lessonsCompleted, setLessonsCompleted] = useState(0);
  const [totalLessons, setTotalLessons] = useState(0);
  const [recentQuizScore, setRecentQuizScore] = useState<number | null>(null);
  const [flashcardsDue, setFlashcardsDue] = useState(0);
  const [recentQuizzes, setRecentQuizzes] = useState<QuizAttempt[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const role = session?.user?.role || 'employee';
  const firstName = session?.user?.name?.split(' ')[0] || 'there';

  const loadData = useCallback(async () => {
    try {
      const [modulesRes, progressRes, quizzesRes] = await Promise.all([
        fetch('/api/admin/learn/modules'),
        fetch('/api/admin/learn/progress'),
        fetch('/api/admin/learn/quizzes?history=true&limit=5'),
      ]);

      if (modulesRes.ok) {
        const data = await modulesRes.json();
        const mods = data.modules || [];
        const total = mods.reduce((sum: number, m: any) => sum + (m.lesson_count || 0), 0);
        setTotalLessons(total);
      }

      if (progressRes.ok) {
        const data = await progressRes.json();
        setLessonsCompleted((data.progress || []).length);
      }

      if (quizzesRes.ok) {
        const data = await quizzesRes.json();
        const attempts = data.attempts || [];
        setRecentQuizzes(attempts);
        if (attempts.length > 0) setRecentQuizScore(attempts[0].score_percent);
      }

      // Flashcard due count
      try {
        const frRes = await fetch('/api/admin/learn/flashcards?due_count=true');
        if (frRes.ok) {
          const frData = await frRes.json();
          setFlashcardsDue(frData.due_count || 0);
        }
      } catch (err) {
        reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'flashcard due count' });
      }

      // Admin activity feed
      if (role === 'admin') {
        try {
          const actRes = await fetch('/api/admin/learn/activity?limit=10');
          if (actRes.ok) {
            const actData = await actRes.json();
            setActivityFeed(actData.activities || []);
          }
        } catch (err) {
          reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'activity feed' });
        }
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'dashboard data load' });
    }
    setLoading(false);
  }, [role]);

  useEffect(() => {
    if (session?.user) loadData();
  }, [session, loadData]);

  if (!session?.user) return null;

  const progressPercent = totalLessons > 0
    ? Math.round((lessonsCompleted / totalLessons) * 100)
    : 0;

  function formatAction(action: string): string {
    const map: Record<string, string> = {
      quiz_completed: 'Completed a quiz',
      lesson_completed: 'Completed a lesson',
      flashcard_reviewed: 'Reviewed flashcards',
      note_created: 'Created a note',
      module_started: 'Started a module',
      content_published: 'Published content',
    };
    return map[action] || action.replace(/_/g, ' ');
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <>
      <div className="admin-dashboard__welcome">
        <h2 className="admin-dashboard__welcome-title">Welcome back, {firstName}!</h2>
        <p className="admin-dashboard__welcome-sub">
          {role === 'admin'
            ? 'Full admin access to Starr Surveying operations hub.'
            : 'Access your education, jobs, finances, and schedule.'}
        </p>
      </div>

      {/* 4-Card Dashboard */}
      <div className="dashboard-cards">
        {/* My Education */}
        <Link href="/admin/learn" className="dashboard-card dashboard-card--education">
          <div className="dashboard-card__header">
            <span className="dashboard-card__icon">🎓</span>
            <span className="dashboard-card__badge">Education</span>
          </div>
          <h3 className="dashboard-card__title">My Education</h3>
          <div className="dashboard-card__metrics">
            <div className="dashboard-card__metric">
              <span className="dashboard-card__metric-value">
                {loading ? '...' : `${lessonsCompleted}/${totalLessons}`}
              </span>
              <span className="dashboard-card__metric-label">Lessons</span>
            </div>
            <div className="dashboard-card__metric">
              <span className="dashboard-card__metric-value">
                {loading ? '...' : recentQuizScore !== null ? `${recentQuizScore}%` : '--'}
              </span>
              <span className="dashboard-card__metric-label">Last Quiz</span>
            </div>
            <div className="dashboard-card__metric">
              <span className="dashboard-card__metric-value">
                {loading ? '...' : flashcardsDue}
              </span>
              <span className="dashboard-card__metric-label">Cards Due</span>
            </div>
          </div>
          {!loading && totalLessons > 0 && (
            <div className="dashboard-card__progress">
              <div className="dashboard-card__progress-bar">
                <div className="dashboard-card__progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>
              <span className="dashboard-card__progress-label">{progressPercent}% complete</span>
            </div>
          )}
          <span className="dashboard-card__link">View Learning Hub &rarr;</span>
        </Link>

        {/* My Jobs */}
        <Link href={role === 'admin' ? '/admin/jobs' : '/admin/my-jobs'} className="dashboard-card dashboard-card--jobs">
          <div className="dashboard-card__header">
            <span className="dashboard-card__icon">📋</span>
            <span className="dashboard-card__badge">Work</span>
          </div>
          <h3 className="dashboard-card__title">My Jobs</h3>
          <div className="dashboard-card__metrics">
            <div className="dashboard-card__metric">
              <span className="dashboard-card__metric-value">--</span>
              <span className="dashboard-card__metric-label">Active Jobs</span>
            </div>
            <div className="dashboard-card__metric">
              <span className="dashboard-card__metric-value">--</span>
              <span className="dashboard-card__metric-label">Hours This Week</span>
            </div>
          </div>
          <p className="dashboard-card__empty-note">Job tracking coming soon</p>
          <span className="dashboard-card__link">View Jobs &rarr;</span>
        </Link>

        {/* My Finances */}
        <Link href={role === 'admin' ? '/admin/payroll' : '/admin/my-pay'} className="dashboard-card dashboard-card--finances">
          <div className="dashboard-card__header">
            <span className="dashboard-card__icon">💰</span>
            <span className="dashboard-card__badge">Finances</span>
          </div>
          <h3 className="dashboard-card__title">My Finances</h3>
          <div className="dashboard-card__metrics">
            <div className="dashboard-card__metric">
              <span className="dashboard-card__metric-value">--</span>
              <span className="dashboard-card__metric-label">Hours This Period</span>
            </div>
            <div className="dashboard-card__metric">
              <span className="dashboard-card__metric-value">--</span>
              <span className="dashboard-card__metric-label">PTO Balance</span>
            </div>
          </div>
          <p className="dashboard-card__empty-note">Payroll tracking coming soon</p>
          <span className="dashboard-card__link">View Finances &rarr;</span>
        </Link>

        {/* My Schedule */}
        <Link href="/admin/schedule" className="dashboard-card dashboard-card--schedule">
          <div className="dashboard-card__header">
            <span className="dashboard-card__icon">📅</span>
            <span className="dashboard-card__badge">Schedule</span>
          </div>
          <h3 className="dashboard-card__title">My Schedule</h3>
          <div className="dashboard-card__metrics">
            <div className="dashboard-card__metric">
              <span className="dashboard-card__metric-value">--</span>
              <span className="dashboard-card__metric-label">Upcoming</span>
            </div>
            <div className="dashboard-card__metric">
              <span className="dashboard-card__metric-value">--</span>
              <span className="dashboard-card__metric-label">Time-Off</span>
            </div>
          </div>
          <p className="dashboard-card__empty-note">Scheduling coming soon</p>
          <span className="dashboard-card__link">View Schedule &rarr;</span>
        </Link>
      </div>

      {/* Recent Quiz Scores */}
      {recentQuizzes.length > 0 && (
        <div className="admin-dashboard__section">
          <h3 className="admin-dashboard__section-title">Recent Quiz Scores</h3>
          <div className="dashboard-quiz-history">
            {recentQuizzes.map((q) => (
              <div key={q.id} className="dashboard-quiz-item">
                <div className="dashboard-quiz-item__info">
                  <span className="dashboard-quiz-item__type">
                    {q.attempt_type === 'exam_prep' ? `${q.exam_category} Prep` :
                     q.attempt_type === 'module_test' ? 'Module Test' : 'Quiz'}
                  </span>
                  <span className="dashboard-quiz-item__date">{timeAgo(q.completed_at)}</span>
                </div>
                <span className={`dashboard-quiz-item__score ${q.score_percent >= 70 ? 'dashboard-quiz-item__score--pass' : 'dashboard-quiz-item__score--fail'}`}>
                  {q.score_percent}%
                </span>
              </div>
            ))}
          </div>
          <Link href="/admin/learn/quiz-history" className="dashboard-view-all">View All Results &rarr;</Link>
        </div>
      )}

      {/* Admin Activity Feed */}
      {role === 'admin' && activityFeed.length > 0 && (
        <div className="admin-dashboard__section">
          <h3 className="admin-dashboard__section-title">Recent Activity</h3>
          <div className="dashboard-activity-feed">
            {activityFeed.map((item) => (
              <div key={item.id} className="dashboard-activity-item">
                <div className="dashboard-activity-item__user">
                  {item.user_email.split('@')[0]}
                </div>
                <div className="dashboard-activity-item__action">
                  {formatAction(item.action_type)}
                </div>
                <div className="dashboard-activity-item__time">
                  {timeAgo(item.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="admin-dashboard__section">
        <h3 className="admin-dashboard__section-title">Quick Links</h3>
        <div className="admin-dashboard__quick-links">
          <Link href="/admin/learn" className="admin-dashboard__quick-link"><span>🎓</span>Learning Hub</Link>
          <Link href="/admin/learn/flashcards" className="admin-dashboard__quick-link"><span>🃏</span>Flashcards</Link>
          <Link href="/admin/learn/exam-prep" className="admin-dashboard__quick-link"><span>📝</span>Exam Prep</Link>
          <Link href="/admin/learn/quiz-history" className="admin-dashboard__quick-link"><span>📊</span>Quiz History</Link>
          <Link href="/admin/learn/knowledge-base" className="admin-dashboard__quick-link"><span>🔍</span>Knowledge Base</Link>
          <Link href="/admin/learn/fieldbook" className="admin-dashboard__quick-link"><span>📓</span>My Fieldbook</Link>
          {role === 'admin' && (
            <>
              <Link href="/admin/learn/manage" className="admin-dashboard__quick-link"><span>✏️</span>Manage Content</Link>
              <Link href="/admin/employees" className="admin-dashboard__quick-link"><span>👥</span>Employees</Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
