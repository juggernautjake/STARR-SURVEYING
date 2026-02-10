// app/admin/learn/modules/[id]/page.tsx — Module detail with lesson locking and status
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface EnrichedLesson {
  id: string; title: string; order_index: number; estimated_minutes: number;
  status: string; started_at?: string; completed_at?: string;
  quiz_unlocked: boolean; content_interactions: Record<string, boolean>;
  total_interactions: number; completed_interactions: number;
  locked: boolean; lock_reason: string; is_assigned: boolean;
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
  const moduleId = params.id as string;
  const [mod, setMod] = useState<ModuleDetail | null>(null);
  const [lessons, setLessons] = useState<EnrichedLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/learn/modules?id=${moduleId}`).then(r => r.json()),
      fetch(`/api/admin/learn/user-progress?module_id=${moduleId}`).then(r => r.json()),
    ]).then(([modData, progressData]) => {
      setMod(modData.module || null);
      setLessons(progressData.lessons || []);
    }).catch(err => console.error('Failed to load', err))
    .finally(() => setLoading(false));
  }, [moduleId]);

  async function seedContent() {
    setSeeding(true);
    setSeedMsg('');
    try {
      const res = await fetch('/api/admin/learn/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSeedMsg('Content seeded! Reloading...');
        const [modData, progressData] = await Promise.all([
          fetch(`/api/admin/learn/modules?id=${moduleId}`).then(r => r.json()),
          fetch(`/api/admin/learn/user-progress?module_id=${moduleId}`).then(r => r.json()),
        ]);
        setMod(modData.module || null);
        setLessons(progressData.lessons || []);
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

  if (loading) return <div className="admin-empty"><div className="admin-empty__icon">&#x23F3;</div><div className="admin-empty__title">Loading...</div></div>;
  if (!mod) return <div className="admin-empty"><div className="admin-empty__icon">&#x274C;</div><div className="admin-empty__title">Module not found</div><button onClick={() => router.back()} className="admin-btn admin-btn--ghost admin-btn--sm">&larr; Go Back</button></div>;

  return (
    <>
      <div className="learn__header">
        <button onClick={() => router.back()} className="learn__back" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>&larr; Back</button>
        <h2 className="learn__title">{mod.title}</h2>
        <p className="learn__subtitle">{mod.description}</p>
        <div className="module-detail__meta">
          <span>Difficulty: {mod.difficulty}</span>
          <span>&#x23F1; ~{mod.estimated_hours}h</span>
          <span>&#x1F4D6; {totalCount} lessons</span>
          {completedCount > 0 && <span style={{ color: '#10B981', fontWeight: 700 }}>&#x2705; {completedCount}/{totalCount} complete</span>}
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

      {lessons.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty__icon">&#x1F4D6;</div>
          <div className="admin-empty__title">No lessons yet</div>
          <div className="admin-empty__desc">This module doesn&apos;t have any lessons.</div>
          <button className="admin-btn admin-btn--primary" onClick={seedContent} disabled={seeding} style={{ marginTop: '1rem' }}>
            {seeding ? 'Populating...' : 'Populate Introductory Content'}
          </button>
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
