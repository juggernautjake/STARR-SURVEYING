// app/admin/learn/roadmap/page.tsx — Roadmap with sequential module locking
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ModuleProgress {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  order_index: number;
  total_lessons: number;
  completed_lessons: number;
  percentage: number;
  user_status?: string;
  locked?: boolean;
  lock_reason?: string;
  is_academic?: boolean;
  is_assigned?: boolean;
}

interface Milestone {
  id: string;
  title: string;
  description: string;
  milestone_type: string;
  part_number: number | null;
  icon: string;
  color: string;
  order_index: number;
  achieved: boolean;
  achieved_at: string | null;
}

interface OverallProgress {
  total_modules: number;
  completed_modules: number;
  total_lessons: number;
  completed_lessons: number;
  percentage: number;
}

interface RoadmapData {
  modules: ModuleProgress[];
  milestones: Milestone[];
  overall_progress: OverallProgress;
}

const STATUS_COLORS: Record<string, { color: string; bg: string; border: string; label: string }> = {
  not_started:     { color: '#6B7280', bg: '#FFFFFF',  border: 'transparent', label: 'Not Started' },
  in_progress:     { color: '#92400E', bg: '#FFFBEB',  border: '#F59E0B', label: 'In Progress' },
  completed:       { color: '#065F46', bg: '#ECFDF5',  border: '#10B981', label: 'Completed' },
  due:             { color: '#1E40AF', bg: '#EFF6FF',  border: '#3B82F6', label: 'Due' },
  needs_refreshing:{ color: '#6D28D9', bg: '#F5F3FF',  border: '#8B5CF6', label: 'Needs Refreshing' },
  assigned:        { color: '#991B1B', bg: '#FEF2F2',  border: '#EF4444', label: 'Assigned' },
};

const PARTS = [
  { num: 1, title: 'Part I — Foundations of Land Surveying', range: [1, 3] },
  { num: 2, title: 'Part II — Field Surveying Techniques', range: [4, 6] },
  { num: 3, title: 'Part III — Coordinate Systems & Computations', range: [7, 9] },
  { num: 4, title: 'Part IV — Modern Survey Technology', range: [10, 12] },
  { num: 5, title: 'Part V — Boundary & Legal Surveying', range: [13, 16] },
  { num: 6, title: 'Part VI — Subdivision, Planning & Construction', range: [17, 19] },
  { num: 7, title: 'Part VII — Specialized Surveying', range: [20, 22] },
  { num: 8, title: 'Part VIII — Professional Practice', range: [23, 24] },
  { num: 9, title: 'Part IX — Exam Preparation', range: [25, 28] },
];

export default function RoadmapPage() {
  const [data, setData] = useState<RoadmapData | null>(null);
  const [enrichedModules, setEnrichedModules] = useState<ModuleProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedParts, setExpandedParts] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      // Fetch both roadmap data and user progress (for locking info)
      const [roadmapRes, progressRes] = await Promise.all([
        fetch('/api/admin/learn/roadmap'),
        fetch('/api/admin/learn/user-progress'),
      ]);

      if (roadmapRes.ok) {
        const roadmapJson = await roadmapRes.json();
        setData(roadmapJson);

        // Merge locking/status info from user-progress
        if (progressRes.ok) {
          const progressJson = await progressRes.json();
          const progressMap = new Map(
            (progressJson.modules || []).map((m: any) => [m.id, m])
          );

          const merged = (roadmapJson.modules || []).map((mod: ModuleProgress) => {
            const progress = progressMap.get(mod.id) as any;
            if (progress) {
              return {
                ...mod,
                user_status: progress.user_status || 'not_started',
                locked: progress.locked || false,
                lock_reason: progress.lock_reason || '',
                is_academic: progress.is_academic || false,
                is_assigned: progress.is_assigned || false,
              };
            }
            return { ...mod, user_status: 'not_started', locked: false, lock_reason: '' };
          });
          setEnrichedModules(merged);
        } else {
          setEnrichedModules(roadmapJson.modules || []);
        }
      }
    } catch (err) {
      console.error('RoadmapPage: failed to fetch', err);
    }
    setLoading(false);
  }

  const togglePart = (num: number) => {
    setExpandedParts(prev => ({ ...prev, [num]: !prev[num] }));
  };

  if (loading) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">&#x23F3;</div>
        <div className="admin-empty__title">Loading your roadmap...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="admin-empty">
        <div className="admin-empty__icon">&#x1F5FA;</div>
        <div className="admin-empty__title">Roadmap unavailable</div>
        <div className="admin-empty__desc">Could not load curriculum data. Make sure the curriculum has been set up.</div>
      </div>
    );
  }

  const { milestones, overall_progress } = data;
  const modules = enrichedModules.length > 0 ? enrichedModules : data.modules;

  const partMilestones = milestones.filter(m => m.milestone_type === 'part_complete');
  const examMilestones = milestones.filter(m => m.milestone_type === 'exam_ready');
  const certMilestones = milestones.filter(m => m.milestone_type === 'certification');

  return (
    <>
      <div className="learn__header">
        <Link href="/admin/learn" className="learn__back">&larr; Back to Learning Hub</Link>
        <h2 className="learn__title">&#x1F5FA; Learning Roadmap</h2>
        <p className="learn__subtitle">
          Track your progress through the complete Texas Land Surveying curriculum &mdash; 28 modules from foundations to RPLS exam prep.
        </p>
      </div>

      {/* Overall Progress Bar */}
      <div className="roadmap__overall">
        <div className="roadmap__overall-header">
          <span className="roadmap__overall-label">Overall Progress</span>
          <span className="roadmap__overall-stats">
            {overall_progress.completed_lessons} / {overall_progress.total_lessons} lessons
            {' \u00B7 '}
            {overall_progress.completed_modules} / {overall_progress.total_modules} modules complete
          </span>
        </div>
        <div className="roadmap__progress-bar">
          <div className="roadmap__progress-fill" style={{ width: `${overall_progress.percentage}%` }} />
        </div>
        <div className="roadmap__overall-pct">{overall_progress.percentage}%</div>
      </div>

      {/* Exam Readiness Cards */}
      {examMilestones.length > 0 && (
        <div className="roadmap__exam-cards">
          {examMilestones.map(m => (
            <div
              key={m.id}
              className={`roadmap__exam-card ${m.achieved ? 'roadmap__exam-card--achieved' : ''}`}
              style={{ borderColor: m.color }}
            >
              <span className="roadmap__exam-icon">{m.icon}</span>
              <div className="roadmap__exam-info">
                <div className="roadmap__exam-title">{m.title}</div>
                <div className="roadmap__exam-desc">{m.description}</div>
                {m.achieved && m.achieved_at && (
                  <div className="roadmap__exam-achieved">Achieved {new Date(m.achieved_at).toLocaleDateString()}</div>
                )}
              </div>
              <div className={`roadmap__exam-status ${m.achieved ? 'roadmap__exam-status--done' : ''}`}>
                {m.achieved ? '&#x2705;' : '&#x1F512;'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Parts with Modules */}
      <div className="roadmap__parts">
        {PARTS.map(part => {
          const partModules = modules.filter(
            m => m.order_index >= part.range[0] && m.order_index <= part.range[1]
          );
          if (partModules.length === 0) return null;

          const partTotalLessons = partModules.reduce((sum, m) => sum + m.total_lessons, 0);
          const partCompletedLessons = partModules.reduce((sum, m) => sum + m.completed_lessons, 0);
          const partPct = partTotalLessons > 0 ? Math.round((partCompletedLessons / partTotalLessons) * 100) : 0;
          const partComplete = partPct === 100;
          const partMilestone = partMilestones.find(m => m.part_number === part.num);
          const isExpanded = expandedParts[part.num] === true;

          return (
            <div key={part.num} className={`roadmap__part ${partComplete ? 'roadmap__part--complete' : ''}`}>
              <div
                className="roadmap__part-header"
                onClick={() => togglePart(part.num)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') togglePart(part.num); }}
              >
                <div className="roadmap__part-left">
                  <span className={`roadmap__part-chevron ${isExpanded ? 'roadmap__part-chevron--open' : ''}`}>&#x276F;</span>
                  <span className="roadmap__part-icon">{partMilestone?.icon || '\u{1F4D8}'}</span>
                  <div>
                    <div className="roadmap__part-title">{part.title}</div>
                    <div className="roadmap__part-meta">
                      {partModules.length} modules &middot; {partCompletedLessons}/{partTotalLessons} lessons
                    </div>
                  </div>
                </div>
                <div className="roadmap__part-right">
                  <div className="roadmap__part-bar-wrap">
                    <div className="roadmap__part-bar">
                      <div
                        className="roadmap__part-bar-fill"
                        style={{
                          width: `${partPct}%`,
                          backgroundColor: partMilestone?.color || '#1D3095',
                        }}
                      />
                    </div>
                    <span className="roadmap__part-pct">{partPct}%</span>
                  </div>
                  {partComplete && <span className="roadmap__part-check">&#x2705;</span>}
                </div>
              </div>

              {isExpanded && (
                <div className="roadmap__part-modules">
                  {partModules.map(mod => (
                    <RoadmapModuleRow key={mod.id} mod={mod} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Certification Milestones */}
      {certMilestones.length > 0 && (
        <div className="roadmap__certs">
          <h3 className="roadmap__certs-title">Certifications &amp; Achievements</h3>
          <div className="roadmap__certs-grid">
            {certMilestones.map(m => (
              <div
                key={m.id}
                className={`roadmap__cert ${m.achieved ? 'roadmap__cert--achieved' : ''}`}
              >
                <span className="roadmap__cert-icon">{m.icon}</span>
                <div className="roadmap__cert-title">{m.title}</div>
                <div className="roadmap__cert-desc">{m.description}</div>
                {m.achieved ? (
                  <div className="roadmap__cert-badge roadmap__cert-badge--done">Achieved</div>
                ) : (
                  <div className="roadmap__cert-badge">Locked</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ── Roadmap Module Row with locking ── */
function RoadmapModuleRow({ mod }: { mod: ModuleProgress }) {
  const isLocked = mod.locked || false;
  const modComplete = mod.percentage === 100;
  const status = mod.user_status || 'not_started';
  const meta = STATUS_COLORS[status] || STATUS_COLORS.not_started;
  const [showTip, setShowTip] = useState(false);

  const rowStyle: React.CSSProperties = {
    opacity: isLocked ? 0.5 : 1,
    cursor: isLocked ? 'default' : 'pointer',
    position: 'relative' as const,
  };

  const content = (
    <div
      className={`roadmap__module ${modComplete ? 'roadmap__module--complete' : ''} ${isLocked ? 'roadmap__module--locked' : ''}`}
      style={rowStyle}
      onMouseEnter={() => isLocked && setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      onClick={() => isLocked && setShowTip(true)}
    >
      <div className="roadmap__module-left">
        <span className="roadmap__module-num" style={
          isLocked ? { background: '#9CA3AF' } :
          modComplete ? { background: '#10B981' } :
          status === 'in_progress' ? { background: '#F59E0B' } :
          status === 'assigned' ? { background: '#EF4444' } :
          status === 'due' ? { background: '#3B82F6' } :
          status === 'needs_refreshing' ? { background: '#8B5CF6' } : {}
        }>
          {isLocked ? '&#x1F512;' : modComplete ? '&#x2713;' : mod.order_index}
        </span>
        <div>
          <div className="roadmap__module-title">{mod.title}</div>
          <div className="roadmap__module-meta">
            {mod.completed_lessons}/{mod.total_lessons} lessons
            <span className={`roadmap__module-diff roadmap__module-diff--${mod.difficulty}`}>
              {mod.difficulty}
            </span>
            {status !== 'not_started' && !isLocked && (
              <span className="roadmap__module-status-tag" style={{ color: meta.color, background: `${meta.color}15`, border: `1px solid ${meta.color}30`, padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.68rem', fontWeight: 600 }}>
                {meta.label}
              </span>
            )}
            {mod.is_academic && (
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1D3095', background: '#EFF6FF', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>ACC</span>
            )}
          </div>
        </div>
      </div>
      <div className="roadmap__module-right">
        {!isLocked && (
          <>
            <div className="roadmap__module-bar">
              <div
                className="roadmap__module-bar-fill"
                style={{
                  width: `${mod.percentage}%`,
                  background: modComplete ? '#10B981' : meta.border !== 'transparent' ? meta.border : '#1D3095',
                }}
              />
            </div>
            <span className="roadmap__module-pct">{mod.percentage}%</span>
          </>
        )}
        {isLocked && <span style={{ fontSize: '0.85rem', color: '#9CA3AF' }}>&#x1F512;</span>}
      </div>

      {/* Lock tooltip */}
      {isLocked && showTip && mod.lock_reason && (
        <div className="roadmap__module-lock-tooltip">{mod.lock_reason}</div>
      )}
    </div>
  );

  if (isLocked) return content;

  return (
    <Link href={`/admin/learn/modules/${mod.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      {content}
    </Link>
  );
}
