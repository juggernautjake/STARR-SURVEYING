// app/admin/learn/modules/[id]/page.tsx
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Lesson { id: string; title: string; description: string; order_index: number; estimated_minutes: number; }
interface ModuleDetail { id: string; title: string; description: string; difficulty: string; estimated_hours: number; }

export default function ModuleDetailPage() {
  const params = useParams();
  const moduleId = params.id as string;
  const [mod, setMod] = useState<ModuleDetail | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/learn/modules?id=${moduleId}`).then(r => r.json()),
      fetch(`/api/admin/learn/lessons?moduleId=${moduleId}`).then(r => r.json()),
    ]).then(([modData, lesData]) => {
      setMod(modData.module || null);
      setLessons(lesData.lessons || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [moduleId]);

  if (loading) return <div className="admin-empty"><div className="admin-empty__icon">⏳</div><div className="admin-empty__title">Loading...</div></div>;
  if (!mod) return <div className="admin-empty"><div className="admin-empty__icon">❌</div><div className="admin-empty__title">Module not found</div><Link href="/admin/learn/modules" className="admin-btn admin-btn--ghost admin-btn--sm">← Back</Link></div>;

  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn/modules" className="learn__back">← Back to Modules</Link>
        <h2 className="learn__title">{mod.title}</h2>
        <p className="learn__subtitle">{mod.description}</p>
        <div className="module-detail__meta">
          <span>Difficulty: {mod.difficulty}</span>
          <span>⏱ ~{mod.estimated_hours}h</span>
          <span>📖 {lessons.length} lessons</span>
        </div>
      </div>

      {lessons.length === 0 ? (
        <div className="admin-empty"><div className="admin-empty__icon">📖</div><div className="admin-empty__title">No lessons yet</div></div>
      ) : (
        <div>
          {lessons.sort((a, b) => a.order_index - b.order_index).map((lesson) => (
            <Link key={lesson.id} href={`/admin/learn/modules/${moduleId}/${lesson.id}`} className="lesson-item">
              <div className="lesson-item__number">{lesson.order_index}</div>
              <div className="lesson-item__content">
                <div className="lesson-item__title">{lesson.title}</div>
                <div className="lesson-item__desc">{lesson.description || `~${lesson.estimated_minutes} min`}</div>
              </div>
              <span className="lesson-item__arrow">→</span>
            </Link>
          ))}
        </div>
      )}

      {/* Module Test link */}
      {lessons.length > 0 && (
        <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#FFF', border: '2px solid #E5E7EB', borderRadius: '10px', textAlign: 'center' }}>
          <h3 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.1rem', fontWeight: 600, color: '#0F1419', marginBottom: '.5rem' }}>📝 Module Test</h3>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '.85rem', color: '#6B7280', marginBottom: '1rem' }}>Complete all lessons, then test your knowledge with a randomized module test.</p>
          <Link href={`/admin/learn/modules/${moduleId}/test`} className="admin-btn admin-btn--primary">Take Module Test</Link>
        </div>
      )}
    </>
  );
}
