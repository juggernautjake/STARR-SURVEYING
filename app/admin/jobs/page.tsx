// app/admin/jobs/page.tsx — All Jobs (admin view)
'use client';
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { usePageError } from '../hooks/usePageError';
import Link from 'next/link';
import JobCard, { STAGE_CONFIG, SURVEY_TYPES } from '../components/jobs/JobCard';
import Tooltip from '../research/components/Tooltip';

const STAGE_TOOLTIPS: Record<string, string> = {
  quote: 'Jobs in the quoting phase. The client has made an inquiry and a price estimate is being prepared. Includes site assessment, scope review, and fee calculation.',
  research: 'Jobs in the research phase. Deed records, plat maps, previous surveys, and property history are being gathered and reviewed from county records and other sources.',
  fieldwork: 'Jobs where the field crew is actively collecting data. Includes GPS observations, total station measurements, monument searches, and property corner staking.',
  drawing: 'Jobs where the survey plat or map is being drafted in CAD. The field data is being processed and the final drawing is being prepared for the RPLS to review and sign.',
  legal: 'Jobs in legal review. The survey plat and legal description are being reviewed by the RPLS for accuracy before signing and sealing. May include title company coordination.',
  delivery: 'Jobs ready for delivery. The signed and sealed survey is being prepared for handoff to the client, title company, or other stakeholders.',
  completed: 'Completed jobs. All deliverables have been sent and the job is closed. Available for reference and historical research.',
  cancelled: 'Cancelled jobs. The survey was cancelled before completion, either by the client or due to other circumstances.',
  on_hold: 'Jobs temporarily on hold. Work has paused due to client request, weather, access issues, or pending information. Will resume when the hold is lifted.',
};

interface Job {
  id: string;
  job_number: string;
  name: string;
  stage: string;
  survey_type: string;
  acreage?: number;
  address?: string;
  client_name?: string;
  is_priority?: boolean;
  deadline?: string;
  lead_rpls_email?: string;
  created_at: string;
  job_team?: { user_email: string; user_name?: string; role: string }[];
  job_tags?: { tag: string }[];
}

// job-soft-delete Slice 1 — the delete/restore control that overlays
// the top-right corner of each job card / row. Absolutely positioned
// as a sibling of the card button so its click never bubbles into
// navigation.
const jobActionOverlayStyle: CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 6,
  zIndex: 2,
  padding: '2px 8px',
  borderRadius: 6,
  border: '1px solid #FCA5A5',
  background: 'rgba(255,255,255,0.92)',
  color: '#B42318',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1.6,
};

export default function AllJobsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const { safeFetch, safeAction, reportPageError } = usePageError('AllJobsPage');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [total, setTotal] = useState(0);
  // job-soft-delete Slice 1 — when true the list shows the trash
  // (soft-deleted jobs, recoverable for 30 days) instead of live jobs.
  const [showDeleted, setShowDeleted] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [searchTrigger, setSearchTrigger] = useState(0);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (showDeleted) {
        params.set('deleted', 'true');
      } else {
        if (stageFilter !== 'all') params.set('stage', stageFilter);
        if (search) params.set('search', search);
      }
      const res = await fetch(`/api/admin/jobs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load jobs' });
    }
    setLoading(false);
  }, [stageFilter, search, showDeleted, reportPageError]);

  useEffect(() => {
    void loadJobs();
    // searchTrigger is the explicit "Search" submit; loadJobs already
    // closes over search/stage/showDeleted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageFilter, searchTrigger, showDeleted, loadJobs]);

  // job-soft-delete Slice 1 — confirm-then-soft-delete. The job drops
  // out of the live list immediately + stays recoverable for 30 days.
  const handleDelete = useCallback(async (job: { id: string; name: string }) => {
    const ok = window.confirm(
      `Delete "${job.name}"?\n\n` +
      `It will be moved to the trash and stays recoverable for 30 days, ` +
      `then it's permanently removed. You can restore it any time before then ` +
      `from the "🗑 Deleted" view.`,
    );
    if (!ok) return;
    setBusyId(job.id);
    try {
      const res = await fetch(`/api/admin/jobs?id=${encodeURIComponent(job.id)}`, { method: 'DELETE' });
      if (res.ok) setJobs((cur) => cur.filter((j) => j.id !== job.id));
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'delete job' });
    } finally {
      setBusyId(null);
    }
  }, [reportPageError]);

  // job-soft-delete Slice 1 — restore clears the tombstone via PUT.
  const handleRestore = useCallback(async (job: { id: string; name: string }) => {
    setBusyId(job.id);
    try {
      const res = await fetch('/api/admin/jobs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, deleted_at: null }),
      });
      if (res.ok) setJobs((cur) => cur.filter((j) => j.id !== job.id));
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'restore job' });
    } finally {
      setBusyId(null);
    }
  }, [reportPageError]);

  // Role guard (middleware handles redirect, this prevents flash)
  const userRoles = session?.user?.roles || ['employee'];
  const canViewJobs = userRoles.includes('admin') || userRoles.includes('developer') || userRoles.includes('field_crew') || userRoles.includes('researcher') || userRoles.includes('tech_support');
  if (sessionStatus === 'authenticated' && !canViewJobs) {
    router.replace('/admin/dashboard');
    return null;
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchTrigger(prev => prev + 1);
  }

  if (!session?.user) return null;

  // Stage counts
  const stageCounts = jobs.reduce((acc: Record<string, number>, j) => {
    acc[j.stage] = (acc[j.stage] || 0) + 1;
    return acc;
  }, {});

  return (
    <>

      <div className="jobs-page">
        {/* Header */}
        <div className="jobs-page__header">
          <div className="jobs-page__header-left">
            <h2 className="jobs-page__title">All Jobs</h2>
            <span className="jobs-page__count">{total} total</span>
          </div>
          <div className="jobs-page__header-actions">
            <Tooltip text="Import historical surveys from a previous system. Supports single entry, bulk CSV upload, and file attachments for existing jobs." position="bottom">
              <Link href="/admin/jobs/import" className="jobs-page__btn jobs-page__btn--secondary">
                Import Legacy Jobs
              </Link>
            </Tooltip>
            <Tooltip text="Create a new survey job from scratch. Fill in property details, client information, and assignment to start the quote-to-delivery workflow." position="bottom">
              <Link href="/admin/jobs/new" className="jobs-page__btn jobs-page__btn--primary">
                + New Job
              </Link>
            </Tooltip>
          </div>
        </div>

        {/* Stage pipeline overview */}
        <div className="jobs-page__pipeline">
          {Object.entries(STAGE_CONFIG).filter(([k]) => !['cancelled', 'on_hold'].includes(k)).map(([key, config]) => (
            <Tooltip key={key} text={STAGE_TOOLTIPS[key] || ''} position="bottom" delay={500}>
              <button
                className={`jobs-page__pipeline-stage ${stageFilter === key ? 'jobs-page__pipeline-stage--active' : ''}`}
                onClick={() => setStageFilter(stageFilter === key ? 'all' : key)}
                style={{ '--stage-color': config.color } as React.CSSProperties}
              >
                <span className="jobs-page__pipeline-icon">{config.icon}</span>
                <span className="jobs-page__pipeline-label">{config.label}</span>
                <span className="jobs-page__pipeline-count">{stageCounts[key] || 0}</span>
              </button>
            </Tooltip>
          ))}
        </div>

        {/* Search & Controls */}
        <div className="jobs-page__controls">
          <form className="jobs-page__search-form" onSubmit={handleSearch}>
            <input
              className="jobs-page__search"
              placeholder="Search by name, job #, client, or address..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button className="jobs-page__search-btn" type="submit">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Search
            </button>
          </form>
          <div className="jobs-page__view-toggle">
            <button
              className={`jobs-page__view-btn ${viewMode === 'grid' ? 'jobs-page__view-btn--active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >⊞</button>
            <button
              className={`jobs-page__view-btn ${viewMode === 'list' ? 'jobs-page__view-btn--active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >☰</button>
          </div>
          {/* job-soft-delete Slice 1 — toggle between live jobs and the
              trash (soft-deleted, recoverable for 30 days). */}
          <button
            type="button"
            onClick={() => setShowDeleted((v) => !v)}
            title={showDeleted ? 'Back to active jobs' : 'View deleted jobs (recoverable for 30 days)'}
            style={{
              height: 38,
              boxSizing: 'border-box',
              padding: '0 14px',
              borderRadius: 8,
              border: showDeleted ? '1px solid #15803D' : '1px solid #E2E5EB',
              background: showDeleted ? '#15803D' : 'transparent',
              color: showDeleted ? '#FFFFFF' : 'inherit',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {showDeleted ? '← Active jobs' : '🗑 Deleted'}
          </button>
        </div>

        {/* Job Cards */}
        {loading ? (
          <div className="jobs-page__loading">
            <div className="jobs-page__grid">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="job-card job-card--skeleton">
                  <div className="job-card__skeleton-header" />
                  <div className="job-card__skeleton-title" />
                  <div className="job-card__skeleton-details" />
                </div>
              ))}
            </div>
          </div>
        ) : jobs.length === 0 ? (
          <div className="jobs-page__empty">
            <span className="jobs-page__empty-icon">📋</span>
            <h3>No jobs found</h3>
            <p>{search ? `No results for "${search}"` : 'Create your first job to get started'}</p>
            <Link href="/admin/jobs/new" className="jobs-page__btn jobs-page__btn--primary">+ New Job</Link>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'jobs-page__grid' : 'jobs-page__list'}>
            {jobs.map(job => (
              // job-soft-delete Slice 1 — wrap each item so the delete /
              // restore control overlays as a SIBLING of the card/row
              // button (never nested — avoids invalid button-in-button +
              // keeps the overlay click from bubbling into navigation).
              <div key={job.id} style={{ position: 'relative' }}>
                {viewMode === 'grid' ? (
                  <JobCard
                    job={job}
                    onClick={() => router.push(`/admin/jobs/${job.id}`)}
                  />
                ) : (
                  <button
                    className="jobs-page__list-item"
                    onClick={() => router.push(`/admin/jobs/${job.id}`)}
                  >
                    <span className="jobs-page__list-number">{job.job_number}</span>
                    <span className="jobs-page__list-name">{job.name}</span>
                    <span className="jobs-page__list-type">{SURVEY_TYPES[job.survey_type] || job.survey_type}</span>
                    <span className="jobs-page__list-client">{job.client_name || '—'}</span>
                    <span
                      className="jobs-page__list-stage"
                      style={{ color: STAGE_CONFIG[job.stage]?.color }}
                    >
                      {STAGE_CONFIG[job.stage]?.icon} {STAGE_CONFIG[job.stage]?.label}
                    </span>
                    <span className="jobs-page__list-date">{new Date(job.created_at).toLocaleDateString()}</span>
                  </button>
                )}
                {showDeleted ? (
                  <button
                    type="button"
                    onClick={() => void handleRestore(job)}
                    disabled={busyId === job.id}
                    title="Restore this job"
                    aria-label={`Restore ${job.name}`}
                    style={{ ...jobActionOverlayStyle, color: '#15803D', borderColor: '#86EFAC' }}
                  >
                    ↩ Restore
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleDelete(job)}
                    disabled={busyId === job.id}
                    title="Delete this job (recoverable for 30 days)"
                    aria-label={`Delete ${job.name}`}
                    style={jobActionOverlayStyle}
                  >
                    🗑
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
