// app/admin/learn/modules/[id]/page.tsx
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePageError } from '../../../hooks/usePageError';

interface Lesson { id: string; title: string; description: string; order_index: number; estimated_minutes: number; xp_reward?: number; }
interface ModuleDetail { id: string; title: string; description: string; difficulty: string; estimated_hours: number; xp_reward?: number; is_fs_required?: boolean; }

export default function ModuleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const moduleId = params.id as string;
  const { safeFetch, safeAction } = usePageError('ModuleDetailPage');
  const [mod, setMod] = useState<ModuleDetail | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/learn/modules?id=${moduleId}`).then(r => r.json()),
      fetch(`/api/admin/learn/lessons?module_id=${moduleId}`).then(r => r.json()),
    ]).then(([modData, lesData]) => {
      setMod(modData.module || null);
      setLessons(lesData.lessons?.length ? lesData.lessons : (modData.lessons || []));
    }).catch((err) => { console.error('ModuleDetailPage: failed to load module data', err); }).finally(() => setLoading(false));
  }, [moduleId]);

  async function seedContent() {
    setSeeding(true);
    setSeedMsg('');
    try {
      const res = await fetch('/api/admin/learn/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSeedMsg('Content seeded! Reloading...');
        const [modData, lesData] = await Promise.all([
          fetch(`/api/admin/learn/modules?id=${moduleId}`).then(r => r.json()),
          fetch(`/api/admin/learn/lessons?module_id=${moduleId}`).then(r => r.json()),
        ]);
        setMod(modData.module || null);
        setLessons(lesData.lessons?.length ? lesData.lessons : (modData.lessons || []));
        setSeedMsg('');
      } else {
        setSeedMsg(data.error || 'Failed to seed content');
      }
    } catch (err) {
      console.error('ModuleDetailPage: seed content failed', err);
      setSeedMsg('Network error');
    }
    setSeeding(false);
  }

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
          <span>&#x1F4D6; {lessons.length} lessons</span>
          {(mod.xp_reward || 0) > 0 && <span style={{ color: '#10B981', fontWeight: 700 }}>&#x2B50; {mod.xp_reward} XP</span>}
          {mod.is_fs_required && <span style={{ background: '#EFF6FF', color: '#1D3095', padding: '2px 8px', borderRadius: 4, fontSize: '.75rem', fontWeight: 700 }}>FS Exam Required</span>}
        </div>
      </div>

      {lessons.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty__icon">&#x1F4D6;</div>
          <div className="admin-empty__title">No lessons yet</div>
          <div className="admin-empty__desc">This module doesn&apos;t have any lessons. You can populate it with introductory content.</div>
          <button
            className="admin-btn admin-btn--primary"
            onClick={seedContent}
            disabled={seeding}
            style={{ marginTop: '1rem' }}
          >
            {seeding ? 'Populating...' : 'Populate Introductory Content'}
          </button>
          {seedMsg && <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: seedMsg.includes('error') || seedMsg.includes('Failed') ? '#EF4444' : '#10B981' }}>{seedMsg}</p>}
        </div>
      ) : (
        <div>
          {lessons.sort((a, b) => a.order_index - b.order_index).map((lesson) => (
            <Link key={lesson.id} href={`/admin/learn/modules/${moduleId}/${lesson.id}`} className="lesson-item">
              <div className="lesson-item__number">{lesson.order_index}</div>
              <div className="lesson-item__content">
                <div className="lesson-item__title">{lesson.title}</div>
                <div className="lesson-item__desc">
                  {lesson.description || `~${lesson.estimated_minutes} min`}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                {(lesson.xp_reward || 0) > 0 && (
                  <span style={{ fontSize: '.75rem', fontWeight: 700, color: '#10B981', whiteSpace: 'nowrap' }}>&#x2B50; {lesson.xp_reward} XP</span>
                )}
                <span className="lesson-item__arrow">&rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Module Test link */}
      {lessons.length > 0 && (
        <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#FFF', border: '2px solid #E5E7EB', borderRadius: '10px', textAlign: 'center' }}>
          <h3 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.1rem', fontWeight: 600, color: '#0F1419', marginBottom: '.5rem' }}>&#x1F4DD; Module Test</h3>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '.85rem', color: '#6B7280', marginBottom: '1rem' }}>Complete all lessons, then test your knowledge with a randomized module test.</p>
          <Link href={`/admin/learn/modules/${moduleId}/test`} className="admin-btn admin-btn--primary">Take Module Test</Link>
        </div>
      )}
    </>
  );
}
