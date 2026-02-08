// app/admin/learn/modules/page.tsx
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePageError } from '../../hooks/usePageError';

interface Module { id: string; title: string; description: string; difficulty: string; estimated_hours: number; order_index: number; status: string; lesson_count?: number; xp_reward?: number; is_fs_required?: boolean; }

export default function ModulesListPage() {
  const { safeFetch, safeAction } = usePageError('ModulesListPage');
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/learn/modules').then(r => r.json()).then(d => setModules(d.modules || [])).catch((err) => { console.error('ModulesListPage: failed to load modules', err); }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin-empty"><div className="admin-empty__icon">⏳</div><div className="admin-empty__title">Loading modules...</div></div>;

  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn" className="learn__back">← Back to Learning Hub</Link>
        <h2 className="learn__title">📚 Learning Modules</h2>
        <p className="learn__subtitle">Progressive courses. Each module has lessons with detailed topics, a quiz at the end of each lesson, and a comprehensive test at the end of each module.</p>
      </div>
      {modules.filter(m => m.status === 'published').length === 0 ? (
        <div className="admin-empty"><div className="admin-empty__icon">📚</div><div className="admin-empty__title">No modules yet</div><div className="admin-empty__desc">Modules will appear here once an admin creates them.</div></div>
      ) : (
        <div className="modules__grid">
          {modules.filter(m => m.status === 'published').sort((a, b) => a.order_index - b.order_index).map((mod) => (
            <Link key={mod.id} href={`/admin/learn/modules/${mod.id}`} className="modules__card">
              <div className="modules__card-header">
                <div className="modules__card-order">{mod.order_index}</div>
                <span className={`modules__card-difficulty modules__card-difficulty--${mod.difficulty}`}>{mod.difficulty}</span>
              </div>
              <h3 className="modules__card-title">{mod.title}</h3>
              <p className="modules__card-desc">{mod.description}</p>
              <div className="modules__card-meta">
                <span>&#x23F1; ~{mod.estimated_hours}h</span>
                {mod.lesson_count !== undefined && <span>&#x1F4D6; {mod.lesson_count} lessons</span>}
                {(mod.xp_reward || 0) > 0 && <span style={{ color: '#10B981', fontWeight: 700 }}>&#x2B50; {mod.xp_reward} XP</span>}
                {mod.is_fs_required && <span style={{ background: '#EFF6FF', color: '#1D3095', padding: '1px 6px', borderRadius: 4, fontSize: '.68rem', fontWeight: 700 }}>FS REQUIRED</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
