// app/admin/jobs/page.tsx — All Jobs (admin view)
'use client';
import { useState, useEffect } from 'react';
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

  const [searchTrigger, setSearchTrigger] = useState(0);

  useEffect(() => {
    async function loadJobs() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (stageFilter !== 'all') params.set('stage', stageFilter);
        if (search) params.set('search', search);
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
    }
    loadJobs();
  }, [stageFilter, searchTrigger, search, reportPageError]);

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
              viewMode === 'grid' ? (
                <JobCard
                  key={job.id}
                  job={job}
                  onClick={() => router.push(`/admin/jobs/${job.id}`)}
                />
              ) : (
                <button
                  key={job.id}
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
              )
            ))}
          </div>
        )}
      </div>
    </>
  );
}
