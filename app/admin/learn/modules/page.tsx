// app/admin/learn/modules/page.tsx — Module listing with filters, search, status tracking, locking
'use client';
import Link from 'next/link';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import SmartSearch from '../components/SmartSearch';

interface EnrichedModule {
  id: string; title: string; description: string; difficulty: string;
  estimated_hours: number; order_index: number; status: string;
  tags?: string[]; is_fs_required?: boolean; is_academic?: boolean;
  acc_course_id?: string | null;
  // User progress fields
  user_status: string; total_lessons: number; completed_lessons: number;
  started_lessons: number; percentage: number; locked: boolean;
  lock_reason: string; is_assigned: boolean; is_enrolled: boolean;
  avg_quiz_score: number | null; quiz_attempts: number;
}

type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'completed' | 'due' | 'needs_refreshing' | 'enrolled' | 'past_due';
type DifficultyFilter = 'all' | 'beginner' | 'intermediate' | 'advanced';
type AvailFilter = 'all' | 'available' | 'unavailable';

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'not_started', label: 'Not Started' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'due', label: 'Due' },
  { key: 'needs_refreshing', label: 'Needs Refreshing' },
  { key: 'enrolled', label: 'Enrolled' },
  { key: 'past_due', label: 'Past Due' },
];

const DIFF_OPTIONS: { key: DifficultyFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' },
];

const AVAIL_OPTIONS: { key: AvailFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'unavailable', label: 'Unavailable' },
];

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  not_started:     { label: 'Not Started',      color: '#6B7280', bg: '#FFFFFF',    border: 'transparent' },
  in_progress:     { label: 'In Progress',      color: '#92400E', bg: '#FFFBEB',    border: '#F59E0B' },
  completed:       { label: 'Completed',         color: '#065F46', bg: '#ECFDF5',    border: '#10B981' },
  due:             { label: 'Due',               color: '#1E40AF', bg: '#EFF6FF',    border: '#3B82F6' },
  needs_refreshing:{ label: 'Needs Refreshing',  color: '#6D28D9', bg: '#F5F3FF',    border: '#8B5CF6' },
  enrolled:        { label: 'Enrolled',          color: '#1E40AF', bg: '#EFF6FF',    border: '#3B82F6' },
  past_due:        { label: 'Past Due',          color: '#991B1B', bg: '#FEF2F2',    border: '#EF4444' },
};

export default function ModulesListPage() {
  const [modules, setModules] = useState<EnrichedModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [diffFilter, setDiffFilter] = useState<DifficultyFilter>('all');
  const [availFilter, setAvailFilter] = useState<AvailFilter>('all');
  const [showAcademic, setShowAcademic] = useState(false);

  // Refresh function that can be called on mount, poll, and tab-focus
  const refreshRef = useRef(false); // prevent concurrent fetches
  const refreshModules = useCallback(async (silent = false) => {
    if (refreshRef.current) return;
    refreshRef.current = true;
    try {
      const res = await fetch('/api/admin/learn/user-progress');
      const d = await res.json();
      setModules(d.modules || []);
    } catch (err) {
      if (!silent) console.error('Failed to load modules', err);
    } finally {
      refreshRef.current = false;
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { refreshModules(); }, [refreshModules]);

  // Poll every 15 seconds so admin assignments appear quickly
  useEffect(() => {
    const interval = setInterval(() => refreshModules(true), 15_000);
    return () => clearInterval(interval);
  }, [refreshModules]);

  // Refetch immediately when student switches back to this tab
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshModules(true);
    };
    const onFocus = () => refreshModules(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshModules]);

  // Split modules into regular and academic
  const regularModules = useMemo(() => modules.filter(m => !m.is_academic), [modules]);
  const academicModules = useMemo(() => modules.filter(m => m.is_academic), [modules]);

  // Apply filters
  const filterModules = (list: EnrichedModule[]) => {
    let filtered = list;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q) ||
        (m.tags || []).some(t => t.toLowerCase().includes(q)) ||
        (m.acc_course_id || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(m => m.user_status === statusFilter);
    }
    if (diffFilter !== 'all') {
      filtered = filtered.filter(m => m.difficulty === diffFilter);
    }
    if (availFilter === 'available') {
      filtered = filtered.filter(m => !m.locked);
    } else if (availFilter === 'unavailable') {
      filtered = filtered.filter(m => m.locked);
    }
    return filtered.sort((a, b) => a.order_index - b.order_index);
  };

  const filteredRegular = useMemo(() => filterModules(regularModules), [regularModules, searchQuery, statusFilter, diffFilter, availFilter]);
  const filteredAcademic = useMemo(() => filterModules(academicModules), [academicModules, searchQuery, statusFilter, diffFilter, availFilter]);

  if (loading) return (
    <div className="admin-empty">
      <div className="admin-empty__icon">&#x23F3;</div>
      <div className="admin-empty__title">Loading modules...</div>
    </div>
  );

  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn" className="learn__back">&larr; Back to Learning Hub</Link>
        <h2 className="learn__title">Learning Modules</h2>
        <p className="learn__subtitle">
          Progressive courses with sequential progression. Complete lessons in order, pass quizzes, and master each module before advancing.
        </p>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <SmartSearch compact placeholder="Search modules, lessons, questions... (Ctrl+K)" />
      </div>

      {/* Search */}
      <div className="modules__search-bar">
        <input
          className="modules__search"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search modules by name, description, or tags..."
        />
      </div>

      {/* Filters */}
      <div className="modules__filters">
        <div className="modules__filter-group">
          <span className="modules__filter-label">Status:</span>
          {STATUS_OPTIONS.map(o => (
            <button key={o.key}
              className={`modules__filter-btn ${statusFilter === o.key ? 'modules__filter-btn--active' : ''}`}
              onClick={() => setStatusFilter(statusFilter === o.key ? 'all' : o.key)}
            >{o.label}</button>
          ))}
        </div>
        <div className="modules__filter-group">
          <span className="modules__filter-label">Difficulty:</span>
          {DIFF_OPTIONS.map(o => (
            <button key={o.key}
              className={`modules__filter-btn modules__filter-btn--diff ${diffFilter === o.key ? 'modules__filter-btn--active' : ''}`}
              onClick={() => setDiffFilter(diffFilter === o.key ? 'all' : o.key)}
            >{o.label}</button>
          ))}
        </div>
        <div className="modules__filter-group">
          <span className="modules__filter-label">Access:</span>
          {AVAIL_OPTIONS.map(o => (
            <button key={o.key}
              className={`modules__filter-btn ${availFilter === o.key ? 'modules__filter-btn--active' : ''}`}
              onClick={() => setAvailFilter(availFilter === o.key ? 'all' : o.key)}
            >{o.label}</button>
          ))}
        </div>
      </div>

      {/* Regular Modules */}
      {filteredRegular.length === 0 && filteredAcademic.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty__icon">&#x1F50D;</div>
          <div className="admin-empty__title">No modules match your filters</div>
          <div className="admin-empty__desc">Try adjusting your search or filter criteria.</div>
        </div>
      ) : (
        <>
          {filteredRegular.length > 0 && (
            <div className="modules__grid">
              {filteredRegular.map(mod => <ModuleCard key={mod.id} mod={mod} />)}
            </div>
          )}

          {/* Academic (ACC) Modules */}
          {academicModules.length > 0 && (
            <div className="modules__academic-section">
              <button
                className="modules__academic-toggle"
                onClick={() => setShowAcademic(!showAcademic)}
              >
                <span className="modules__academic-toggle-icon">{showAcademic ? '\u25BC' : '\u25B6'}</span>
                <span className="modules__academic-toggle-title">ACC Academic Courses</span>
                <span className="modules__academic-toggle-count">{academicModules.length} course{academicModules.length !== 1 ? 's' : ''}</span>
                <span className="modules__academic-toggle-hint">Requires enrollment to access</span>
              </button>
              {showAcademic && (
                filteredAcademic.length > 0 ? (
                  <div className="modules__grid">
                    {filteredAcademic.map(mod => <ModuleCard key={mod.id} mod={mod} />)}
                  </div>
                ) : (
                  <div className="admin-empty">
                    <div className="admin-empty__title">No academic modules match your filters</div>
                  </div>
                )
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ── Module Card Component ── */
function ModuleCard({ mod }: { mod: EnrichedModule }) {
  const meta = STATUS_META[mod.user_status] || STATUS_META.not_started;
  const isLocked = mod.locked;
  const [showTooltip, setShowTooltip] = useState(false);

  const cardStyle: React.CSSProperties = {
    background: meta.bg,
    borderColor: meta.border !== 'transparent' ? meta.border : undefined,
    borderWidth: meta.border !== 'transparent' ? '2px' : undefined,
    borderStyle: meta.border !== 'transparent' ? 'solid' : undefined,
    opacity: isLocked ? 0.6 : 1,
  };

  const inner = (
    <div
      className={`modules__card ${isLocked ? 'modules__card--locked' : ''}`}
      style={cardStyle}
      onMouseEnter={() => isLocked && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => isLocked && setShowTooltip(true)}
    >
      {/* Lock overlay */}
      {isLocked && (
        <div className="modules__card-lock">
          <span className="modules__card-lock-icon">&#x1F512;</span>
          {showTooltip && (
            <div className="modules__card-lock-tooltip">{mod.lock_reason}</div>
          )}
        </div>
      )}

      <div className="modules__card-header">
        <div className="modules__card-order">{mod.order_index}</div>
        <div className="modules__card-header-right">
          <span className={`modules__card-difficulty modules__card-difficulty--${mod.difficulty}`}>{mod.difficulty}</span>
          {mod.is_academic && <span className="modules__card-academic">ACC</span>}
        </div>
      </div>

      <h3 className="modules__card-title">{mod.title}</h3>

      {/* Status badge */}
      <div className="modules__card-status" style={{ color: meta.color, background: `${meta.color}15`, borderColor: meta.color }}>
        {meta.label}
      </div>

      {/* Progress bar */}
      {mod.total_lessons > 0 && mod.user_status !== 'not_started' && (
        <div className="modules__card-progress">
          <div className="modules__card-progress-bar">
            <div
              className="modules__card-progress-fill"
              style={{ width: `${mod.percentage}%`, background: meta.border !== 'transparent' ? meta.border : '#E5E7EB' }}
            />
          </div>
          <span className="modules__card-progress-text">{mod.percentage}%</span>
        </div>
      )}

      <p className="modules__card-desc">{mod.description}</p>

      <div className="modules__card-meta">
        <span>&#x23F1; ~{mod.estimated_hours}h</span>
        <span>&#x1F4D6; {mod.total_lessons} lesson{mod.total_lessons !== 1 ? 's' : ''}</span>
        {mod.completed_lessons > 0 && (
          <span style={{ color: '#10B981', fontWeight: 600 }}>&#x2705; {mod.completed_lessons}/{mod.total_lessons}</span>
        )}
        {mod.avg_quiz_score != null && (
          <span className={`quiz-avg-badge ${mod.avg_quiz_score >= 70 ? 'quiz-avg-badge--green' : mod.avg_quiz_score >= 40 ? 'quiz-avg-badge--yellow' : 'quiz-avg-badge--red'}`}>
            Avg: {mod.avg_quiz_score}%
          </span>
        )}
        {mod.is_fs_required && (
          <span className="modules__card-fs-badge">FS REQUIRED</span>
        )}
      </div>
    </div>
  );

  if (isLocked) return inner;

  return (
    <Link href={`/admin/learn/modules/${mod.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      {inner}
    </Link>
  );
}
