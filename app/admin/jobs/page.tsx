// app/admin/jobs/page.tsx — All Jobs (admin view)
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { usePageError } from '../hooks/usePageError';
import Link from 'next/link';
import UnderConstruction from '../components/messaging/UnderConstruction';
import JobCard, { STAGE_CONFIG, SURVEY_TYPES } from '../components/jobs/JobCard';

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

  useEffect(() => { loadJobs(); }, [stageFilter]);

  // Admin-only page guard (middleware handles redirect, this prevents flash)
  const userRole = session?.user?.role || 'employee';
  if (sessionStatus === 'authenticated' && userRole !== 'admin') {
    router.replace('/admin/dashboard');
    return null;
  }

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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadJobs();
  }

  if (!session?.user) return null;

  // Stage counts
  const stageCounts = jobs.reduce((acc: Record<string, number>, j) => {
    acc[j.stage] = (acc[j.stage] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <UnderConstruction
        feature="Job Management"
        description="Track every survey job from quote to delivery. Manage crews, equipment, research, drawings, and payments all in one place."
      />

      <div className="jobs-page">
        {/* Header */}
        <div className="jobs-page__header">
          <div className="jobs-page__header-left">
            <h2 className="jobs-page__title">All Jobs</h2>
            <span className="jobs-page__count">{total} total</span>
          </div>
          <div className="jobs-page__header-actions">
            <Link href="/admin/jobs/import" className="jobs-page__btn jobs-page__btn--secondary">
              Import Legacy Jobs
            </Link>
            <Link href="/admin/jobs/new" className="jobs-page__btn jobs-page__btn--primary">
              + New Job
            </Link>
          </div>
        </div>

        {/* Stage pipeline overview */}
        <div className="jobs-page__pipeline">
          {Object.entries(STAGE_CONFIG).filter(([k]) => !['cancelled', 'on_hold'].includes(k)).map(([key, config]) => (
            <button
              key={key}
              className={`jobs-page__pipeline-stage ${stageFilter === key ? 'jobs-page__pipeline-stage--active' : ''}`}
              onClick={() => setStageFilter(stageFilter === key ? 'all' : key)}
              style={{ '--stage-color': config.color } as React.CSSProperties}
            >
              <span className="jobs-page__pipeline-icon">{config.icon}</span>
              <span className="jobs-page__pipeline-label">{config.label}</span>
              <span className="jobs-page__pipeline-count">{stageCounts[key] || 0}</span>
            </button>
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

      {/* Setup Guide */}
      <div className="msg-setup-guide">
        <h2 className="msg-setup-guide__title">Job Management — Development Guide</h2>

        <div className="msg-setup-guide__section">
          <h3>Database Setup</h3>
          <p className="msg-setup-guide__text">
            Job management tables (jobs, job_tags, job_team, job_equipment, job_files, job_research, job_stages_history,
            job_time_entries, job_payments, job_field_data, job_checklists, equipment_inventory) are created by
            database migrations. To re-seed data, run <code>./seeds/run_all.sh</code>.
          </p>
        </div>

        <div className="msg-setup-guide__section">
          <h3>Job Lifecycle Stages</h3>
          <ol className="msg-setup-guide__list">
            <li><strong>Quote</strong> — Client details, property info, survey type, quote amount</li>
            <li><strong>Research</strong> — Title search, deed records, previous surveys, field plan</li>
            <li><strong>Field Work</strong> — Crew assigned, equipment checked out, data collection, live data streaming</li>
            <li><strong>Drawing</strong> — CAD work, boundary calculations, plat creation</li>
            <li><strong>Legal</strong> — Legal descriptions, deed processing, recording</li>
            <li><strong>Delivery</strong> — Final package to client, final payment</li>
            <li><strong>Completed</strong> — Job archived, all files backed up</li>
          </ol>
        </div>

        <div className="msg-setup-guide__section">
          <h3>API Routes (9 endpoints)</h3>
          <ul className="msg-setup-guide__api-list">
            <li><code>GET/POST/PUT/DELETE /api/admin/jobs</code> — Core CRUD, search, filter by stage/my-jobs</li>
            <li><code>GET/POST /api/admin/jobs/stages</code> — Stage transitions with audit trail</li>
            <li><code>GET/POST/PUT/DELETE /api/admin/jobs/team</code> — Crew assignment with roles</li>
            <li><code>GET/POST/DELETE /api/admin/jobs/files</code> — File upload with auto-backup</li>
            <li><code>GET/POST/PUT/DELETE /api/admin/jobs/research</code> — Research documents by category</li>
            <li><code>GET/POST/PUT /api/admin/jobs/equipment</code> — Equipment checkout/return</li>
            <li><code>GET/POST/DELETE /api/admin/jobs/time</code> — Time entries with duration calc</li>
            <li><code>GET/POST /api/admin/jobs/payments</code> — Payment recording (admin only)</li>
            <li><code>GET/POST /api/admin/jobs/field-data</code> — Live field data points (batch support)</li>
            <li><code>GET/POST/PUT /api/admin/jobs/checklists</code> — Stage checklists with templates</li>
          </ul>
        </div>

        <div className="msg-setup-guide__section">
          <h3>Continuation Prompt</h3>
          <pre className="msg-setup-guide__prompt">{`Continue developing the job management system at /admin/jobs/. Current state: full database schema (12 tables), 9 API routes, 9 UI components, 7 pages with under-construction banners and setup guides.

COMPLETED GROUNDWORK:
- Database: jobs, job_tags, job_team, job_equipment, job_files, job_research, job_stages_history, job_time_entries, job_payments, job_field_data, job_checklists, equipment_inventory
- APIs: Core CRUD, stages, team, files (with auto-backup), research, equipment, time, payments, field-data, checklists (with templates)
- Components: JobCard, JobStageTimeline, JobTeamPanel, JobFileManager, JobEquipmentList, JobResearchPanel, JobChecklist, JobQuoteBuilder, JobTimeTracker
- Pages: All Jobs list, My Jobs, New Job form, Job Detail (tabbed), Research, Field Work, Files, Job Messages, Import Legacy Jobs

NEXT STEPS - PRIORITY ORDER:
1. Integrate Supabase Storage for real file uploads (replace base64 data URLs)
2. Connect job-specific messaging to the messaging system (create conversation linked to job)
3. Implement Trimble Connect API integration for live field data streaming
   - Trimble Connect SDK for file synchronization
   - Real-time point data from Trimble Access
   - Auto-import of .JXL, .DC, .RAW field data files
4. AutoCAD integration:
   - DWG/DXF file preview in browser (use Autodesk Forge/APS Viewer)
   - Drawing version tracking with diff comparison
   - Auto-generate drawing templates per survey type
5. Live field data dashboard:
   - Real-time map with collected points (use Leaflet or Mapbox)
   - WebSocket connection for instant data updates
   - Point cloud visualization
6. Advanced quote builder:
   - Quote templates per survey type
   - Line items with quantities and rates
   - PDF quote generation and email to client
   - E-signature for quote acceptance
7. Job scheduling/calendar:
   - Drag-and-drop crew scheduling
   - Equipment availability calendar
   - Weather integration for field work planning
8. Reporting:
   - Job profitability reports (time spent vs. quote)
   - Crew utilization dashboard
   - Equipment usage tracking
   - Monthly/quarterly revenue reports
9. Map integration:
   - Property boundary visualization on map
   - Satellite imagery overlay
   - GPS coordinate lookup from address
   - County/abstract boundary layers
10. Mobile-optimized field view:
    - Offline-capable field data entry
    - GPS position logging
    - Photo capture with auto-upload
    - Voice memo recording
11. Document generation:
    - Auto-generate legal descriptions from boundary data
    - Survey plat templates
    - Monument records forms
    - Final delivery package compilation
12. Client portal:
    - Client can view job status
    - Download completed survey documents
    - Make payments online
    - Request revisions`}</pre>
        </div>
      </div>
    </>
  );
}
