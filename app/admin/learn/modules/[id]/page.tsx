// app/admin/learn/modules/[id]/page.tsx — Module detail with lesson locking, status, and admin management
'use client';
import Link from 'next/link';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import SmartSearch from '../../components/SmartSearch';

// Use session role instead of hardcoded email list

interface EnrichedLesson {
  id: string; title: string; order_index: number; estimated_minutes: number;
  status: string; started_at?: string; completed_at?: string;
  quiz_unlocked: boolean; content_interactions: Record<string, boolean>;
  total_interactions: number; completed_interactions: number;
  locked: boolean; lock_reason: string; is_assigned: boolean;
  avg_quiz_score: number | null; quiz_attempts: number;
}
interface ModuleDetail {
  id: string; title: string; description: string; difficulty: string;
  estimated_hours: number; xp_reward?: number; is_fs_required?: boolean;
}

const LESSON_STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  not_started:  { label: 'Not Started',  color: '#6B7280', bg: '#FFFFFF',  border: 'transparent' },
  in_progress:  { label: 'In Progress',  color: '#92400E', bg: '#FFFBEB',  border: '#F59E0B' },
  completed:    { label: 'Completed',    color: '#065F46', bg: '#ECFDF5',  border: '#10B981' },
};

export default function ModuleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = session?.user?.role || 'employee';
  const canManage = userRole === 'admin' || userRole === 'teacher';
  const moduleId = params.id as string;
  const [mod, setMod] = useState<ModuleDetail | null>(null);
  const [lessons, setLessons] = useState<EnrichedLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [publishStatuses, setPublishStatuses] = useState<Record<string, string>>({});

  async function toggleLessonStatus(lessonId: string) {
    const currentPublishStatus = publishStatuses[lessonId] || 'published';
    const newStatus = currentPublishStatus === 'published' ? 'draft' : 'published';
    try {
      const res = await fetch('/api/admin/learn/lessons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lessonId, status: newStatus }),
      });
      if (res.ok) {
        setPublishStatuses(prev => ({ ...prev, [lessonId]: newStatus }));
      }
    } catch (err) { console.error('Failed to toggle lesson status', err); }
  }

  async function deleteLesson(lessonId: string) {
    try {
      const res = await fetch(`/api/admin/learn/lessons?id=${lessonId}`, { method: 'DELETE' });
      if (res.ok) {
        setLessons(prev => prev.filter(l => l.id !== lessonId));
        setDeleteConfirm(null);
      }
    } catch (err) { console.error('Failed to delete lesson', err); }
  }

  // Refresh function reusable for mount, poll, and tab-focus
  const refreshRef = useRef(false);
  const refreshData = useCallback(async (silent = false) => {
    if (refreshRef.current) return;
    refreshRef.current = true;
    try {
      const [modData, progressData, lessonData] = await Promise.all([
        fetch(`/api/admin/learn/modules?id=${moduleId}`).then(r => r.json()),
        fetch(`/api/admin/learn/user-progress?module_id=${moduleId}`).then(r => r.json()),
        fetch(`/api/admin/learn/lessons?module_id=${moduleId}`).then(r => r.json()),
      ]);
      setMod(modData.module || null);
      setLessons(progressData.lessons || []);
      const statusMap: Record<string, string> = {};
      (lessonData.lessons || lessonData || []).forEach((l: { id: string; status?: string }) => {
        statusMap[l.id] = l.status || 'published';
      });
      setPublishStatuses(statusMap);
    } catch (err) {
      if (!silent) console.error('Failed to load', err);
    } finally {
      refreshRef.current = false;
      setLoading(false);
    }
  }, [moduleId]);

  // Initial load
  useEffect(() => { refreshData(); }, [refreshData]);

  // Poll every 15 seconds so admin assignments/unlocks appear quickly
  useEffect(() => {
    const interval = setInterval(() => refreshData(true), 15_000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // Refetch immediately when student switches back to this tab
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshData(true);
    };
    const onFocus = () => refreshData(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshData]);

  async function seedContent() {
    setSeeding(true);
    setSeedMsg('');
    try {
      const res = await fetch('/api/admin/learn/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSeedMsg('Content seeded! Reloading...');
        const [modData, progressData, lessonData] = await Promise.all([
          fetch(`/api/admin/learn/modules?id=${moduleId}`).then(r => r.json()),
          fetch(`/api/admin/learn/user-progress?module_id=${moduleId}`).then(r => r.json()),
          fetch(`/api/admin/learn/lessons?module_id=${moduleId}`).then(r => r.json()),
        ]);
        setMod(modData.module || null);
        setLessons(progressData.lessons || []);
        const statusMap: Record<string, string> = {};
        (lessonData.lessons || lessonData || []).forEach((l: { id: string; status?: string }) => {
          statusMap[l.id] = l.status || 'published';
        });
        setPublishStatuses(statusMap);
        setSeedMsg('');
      } else {
        setSeedMsg(data.error || 'Failed to seed content');
      }
    } catch {
      setSeedMsg('Network error');
    }
    setSeeding(false);
  }

  // Calculate module completion
  const completedCount = lessons.filter(l => l.status === 'completed').length;
  const totalCount = lessons.length;
  const allComplete = totalCount > 0 && completedCount === totalCount;

  // Compute module-level avg quiz score from lesson quiz attempts
  const lessonsWithQuiz = lessons.filter(l => l.avg_quiz_score != null);
  const moduleAvgQuiz = lessonsWithQuiz.length > 0
    ? Math.round(lessonsWithQuiz.reduce((sum, l) => sum + (l.avg_quiz_score || 0), 0) / lessonsWithQuiz.length)
    : null;

  if (loading) return <div className="admin-empty"><div className="admin-empty__icon">&#x23F3;</div><div className="admin-empty__title">Loading...</div></div>;
  if (!mod) return <div className="admin-empty"><div className="admin-empty__icon">&#x274C;</div><div className="admin-empty__title">Module not found</div><button onClick={() => router.back()} className="admin-btn admin-btn--ghost admin-btn--sm">&larr; Go Back</button></div>;

  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn/modules" className="learn__back">&larr; Back to Modules</Link>
        <h2 className="learn__title">{mod.title}</h2>
        <p className="learn__subtitle">{mod.description}</p>
        <div className="module-detail__meta">
          <span>Difficulty: {mod.difficulty}</span>
          <span>&#x23F1; ~{mod.estimated_hours}h</span>
          <span>&#x1F4D6; {totalCount} lessons</span>
          {completedCount > 0 && <span style={{ color: '#10B981', fontWeight: 700 }}>&#x2705; {completedCount}/{totalCount} complete</span>}
          {moduleAvgQuiz != null && (
            <span className={`quiz-avg-badge ${moduleAvgQuiz >= 70 ? 'quiz-avg-badge--green' : moduleAvgQuiz >= 40 ? 'quiz-avg-badge--yellow' : 'quiz-avg-badge--red'}`}>
              Avg Quiz: {moduleAvgQuiz}%
            </span>
          )}
          {mod.is_fs_required && <span className="modules__card-fs-badge">FS Exam Required</span>}
        </div>

        {/* Module progress bar */}
        {totalCount > 0 && (
          <div className="modules__card-progress" style={{ marginTop: '0.75rem', maxWidth: '400px' }}>
            <div className="modules__card-progress-bar">
              <div className="modules__card-progress-fill" style={{ width: `${Math.round((completedCount / totalCount) * 100)}%`, background: allComplete ? '#10B981' : '#F59E0B' }} />
            </div>
            <span className="modules__card-progress-text">{Math.round((completedCount / totalCount) * 100)}%</span>
          </div>
        )}
      </div>

      {/* Smart Search */}
      <div style={{ marginBottom: '1rem' }}>
        <SmartSearch compact onSelect={(result: any) => {
          if (result.builderUrl) router.push(result.builderUrl);
          else if (result.url) router.push(result.url);
        }} placeholder="Search content... (Ctrl+K)" />
      </div>

      {/* Admin: Lesson Management Cards */}
      {canManage && lessons.length > 0 && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#FAFBFF', border: '1px solid #E5E7EB', borderRadius: '10px' }}>
          <h3 style={{ fontFamily: 'Sora,sans-serif', fontSize: '.92rem', fontWeight: 700, color: '#1D3095', marginBottom: '.75rem' }}>Manage Lessons</h3>
          <div style={{ display: 'grid', gap: '.5rem' }}>
            {lessons.sort((a, b) => a.order_index - b.order_index).map(lesson => (
              <div key={lesson.id} className="module-lesson-card">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '.88rem', color: '#0F1419' }}>{lesson.order_index}. {lesson.title}</div>
                  <div style={{ fontSize: '.72rem', color: '#6B7280' }}>~{lesson.estimated_minutes} min</div>
                </div>
                <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center', flexShrink: 0 }}>
                  <Link href={`/admin/learn/manage/lesson-builder/${lesson.id}`} className="admin-btn admin-btn--primary admin-btn--sm">Edit</Link>
                  <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => toggleLessonStatus(lesson.id)}>
                    {(publishStatuses[lesson.id] || 'published') === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                  {deleteConfirm === lesson.id ? (
                    <div style={{ display: 'flex', gap: '.25rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '.72rem', color: '#DC2626', fontWeight: 600 }}>Delete?</span>
                      <button className="admin-btn admin-btn--sm" style={{ color: '#DC2626', borderColor: '#DC2626' }} onClick={() => deleteLesson(lesson.id)}>Yes</button>
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setDeleteConfirm(null)}>No</button>
                    </div>
                  ) : (
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" style={{ color: '#DC2626' }} onClick={() => setDeleteConfirm(lesson.id)}>Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lessons.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty__icon">&#x1F4D6;</div>
          <div className="admin-empty__title">No lessons yet</div>
          <div className="admin-empty__desc">{canManage ? 'This module doesn\'t have any lessons.' : 'Content is being prepared for this module.'}</div>
          {canManage && (
            <button className="admin-btn admin-btn--primary" onClick={seedContent} disabled={seeding} style={{ marginTop: '1rem' }}>
              {seeding ? 'Populating...' : 'Populate Introductory Content'}
            </button>
          )}
          {seedMsg && <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: seedMsg.includes('error') || seedMsg.includes('Failed') ? '#EF4444' : '#10B981' }}>{seedMsg}</p>}
        </div>
      ) : (
        <div className="lesson-list">
          {lessons.sort((a, b) => a.order_index - b.order_index).map((lesson) => (
            <LessonRow key={lesson.id} lesson={lesson} moduleId={moduleId} />
          ))}
        </div>
      )}

      {/* Module Test */}
      {lessons.length > 0 && (
        <div className="module-test-section" style={{ marginTop: '2rem', padding: '1.5rem', background: allComplete ? '#ECFDF5' : '#FFF', border: `2px solid ${allComplete ? '#10B981' : '#E5E7EB'}`, borderRadius: '10px', textAlign: 'center' }}>
          <h3 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.1rem', fontWeight: 600, color: '#0F1419', marginBottom: '.5rem' }}>Module Test</h3>
          {allComplete ? (
            <>
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '.85rem', color: '#065F46', marginBottom: '1rem' }}>All lessons complete! You can now take the module test.</p>
              <Link href={`/admin/learn/modules/${moduleId}/test`} className="admin-btn admin-btn--primary">Take Module Test</Link>
            </>
          ) : (
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '.85rem', color: '#6B7280' }}>Complete all {totalCount} lessons to unlock the module test. ({completedCount}/{totalCount} done)</p>
          )}
        </div>
      )}
    </>
  );
}

/* ── Lesson Row Component ── */
function LessonRow({ lesson, moduleId }: { lesson: EnrichedLesson; moduleId: string }) {
  const meta = LESSON_STATUS[lesson.status] || LESSON_STATUS.not_started;
  const isLocked = lesson.locked;
  const [showTip, setShowTip] = useState(false);

  const rowStyle: React.CSSProperties = {
    background: meta.bg,
    borderLeftColor: meta.border !== 'transparent' ? meta.border : '#E5E7EB',
    borderLeftWidth: '4px',
    borderLeftStyle: 'solid',
    opacity: isLocked ? 0.55 : 1,
    cursor: isLocked ? 'default' : 'pointer',
    position: 'relative',
  };

  const content = (
    <div
      className={`lesson-item ${isLocked ? 'lesson-item--locked' : ''}`}
      style={rowStyle}
      onMouseEnter={() => isLocked && setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      onClick={() => isLocked && setShowTip(true)}
    >
      <div className="lesson-item__number" style={
        lesson.status === 'completed' ? { background: '#10B981', color: '#FFF' } :
        lesson.status === 'in_progress' ? { background: '#F59E0B', color: '#FFF' } : {}
      }>
        {isLocked ? '\u{1F512}' : lesson.status === 'completed' ? '\u2713' : lesson.order_index}
      </div>

      <div className="lesson-item__content">
        <div className="lesson-item__title">{lesson.title}</div>
        <div className="lesson-item__desc">
          ~{lesson.estimated_minutes} min
          {lesson.status !== 'not_started' && (
            <span className="lesson-item__status-badge" style={{ color: meta.color, background: `${meta.color}15`, borderColor: meta.color }}>
              {meta.label}
            </span>
          )}
          {lesson.is_assigned && (
            <span className="lesson-item__status-badge" style={{ color: '#991B1B', background: '#FEF2F2', borderColor: '#EF4444' }}>
              Assigned
            </span>
          )}
          {lesson.avg_quiz_score != null && (
            <span className={`quiz-avg-badge ${lesson.avg_quiz_score >= 70 ? 'quiz-avg-badge--green' : lesson.avg_quiz_score >= 40 ? 'quiz-avg-badge--yellow' : 'quiz-avg-badge--red'}`}>
              Avg: {lesson.avg_quiz_score}%
            </span>
          )}
        </div>
        {/* Content interaction progress */}
        {lesson.total_interactions > 0 && lesson.status !== 'not_started' && !isLocked && (
          <div className="lesson-item__interactions">
            {lesson.completed_interactions}/{lesson.total_interactions} content items reviewed
            {lesson.quiz_unlocked && <span style={{ color: '#10B981', fontWeight: 600 }}> &mdash; Quiz Unlocked</span>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
        {!isLocked && <span className="lesson-item__arrow">&rarr;</span>}
      </div>

      {/* Lock tooltip */}
      {isLocked && showTip && (
        <div className="lesson-item__lock-tooltip">{lesson.lock_reason}</div>
      )}
    </div>
  );

  if (isLocked) return content;

  return (
    <Link href={`/admin/learn/modules/${moduleId}/${lesson.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      {content}
    </Link>
  );
}
