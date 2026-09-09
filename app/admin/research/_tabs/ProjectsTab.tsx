// app/admin/research/_tabs/ProjectsTab.tsx — a tab of the Research portal.
//
// C11b / P13 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
// Was `/admin/research/page.tsx, the projects list`; the old route stays and forwards.
//
// This one was the PORTAL's own page rather than a page beneath it, so it is a directory deeper
// than it used to be and four relative imports moved with it. The six tabs beside it came from
// directories at this same depth and paid nothing.
// app/admin/research/page.tsx — Property Research project list
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';
import type { ResearchProject, WorkflowStep } from '@/types/research';
import { PIPELINE_STAGES, workflowStepToStage } from '@/types/research';
import Tooltip from '../components/Tooltip';
import WorkerStatusBanner from '../components/WorkerStatusBanner';
import NewResearchProjectModal from '../components/NewResearchProjectModal';
import { ErrorState } from '../components/ui';

const STATUS_LABELS: Record<WorkflowStep, string> = {
  upload: 'Upload',
  configure: 'Configure',
  analyzing: 'Analyzing',
  review: 'Review',
  drawing: 'Drawing',
  verifying: 'Verifying',
  complete: 'Complete',
};

export default function ProjectsTab() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { reportPageError } = usePageError('ResearchListPage');

  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const userRoles = session?.user?.roles || ['employee'];
  const canAccessResearch = userRoles.includes('admin') || userRoles.includes('developer') || userRoles.includes('researcher') || userRoles.includes('drawer') || userRoles.includes('field_crew') || userRoles.includes('tech_support');

  // Role guard — use useEffect so hooks are never called conditionally
  useEffect(() => {
    if (sessionStatus === 'authenticated' && !canAccessResearch) {
      router.replace('/admin/me');
    }
  }, [sessionStatus, canAccessResearch, router]);

  // R5 — findability: the command-palette "Start research" action deep-links
  // here with ?new=1 to open the create modal straight away.
  useEffect(() => {
    if (searchParams?.get('new') === '1') setShowCreate(true);
  }, [searchParams]);

  // ── STARTING RESEARCH FROM A JOB (Phase J2) ─────────────────────────────────────────────────
  //
  // `?new=1&job=<id>` opens the form already filled in from the job and already linked to it. The
  // lookup itself lives in NewResearchProjectModal (2026-09-09); this tab only opens the modal.
  const jobIdFromLink = searchParams?.get('job') ?? null;
  useEffect(() => {
    if (jobIdFromLink) setShowCreate(true);
  }, [jobIdFromLink]);

  // Debounced search: auto-reload 400ms after typing stops
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/admin/research?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
        setTotal(data.total || 0);
      } else {
        setLoadError('Failed to load projects. Please try again.');
      }
    } catch (err) {
      setLoadError('Unable to connect. Check your internet connection.');
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load projects' });
    }
    setLoading(false);
  }, [search, statusFilter, reportPageError]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      loadProjects();
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search, statusFilter, loadProjects]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadProjects();
  }

  // ── ONE NUMBERING SYSTEM (U3-D) ────────────────────────────────────────────────────────────
  //
  // This card said "Step 1 of 7" and the project page's stepper said "Stage 1 of 4", about the
  // same project, on two screens somebody moves between in one click. Seven is the count of DB
  // statuses; four is the count of stages a person actually works through, and `PIPELINE_STAGES`
  // in types/research.ts is already the mapping between them.
  //
  // The stages are what the pipeline stepper draws and what the operator is told they are on, so
  // the card follows the stepper rather than the other way round. Derived from the same constant,
  // so a fifth stage moves both.
  function stageNumber(status: WorkflowStep): number {
    const stage = workflowStepToStage(status);
    return Math.max(1, PIPELINE_STAGES.findIndex(s => s.key === stage) + 1);
  }

  if (!session?.user) return null;
  if (sessionStatus === 'authenticated' && !canAccessResearch) return null;

  // Determine empty state message
  const hasActiveSearch = search.trim().length > 0;
  const hasActiveFilter = statusFilter !== 'all';

  return (
    <>
      <div className="research-page">
        {/* R2 — a dead research worker used to look like a slow page. Quiet when the engine is
            healthy; one sentence when it is not, plus what that means for a run started now. */}
        <WorkerStatusBanner />

        {/* Header */}
        <div className="research-page__header">
          <h1 className="research-page__title">Property Research</h1>
          <div className="research-page__actions">
            {/* Secondary, not three primaries in three colours — see the note on
                .research-page__secondary-btn. Both of these also exist as portal tabs directly
                above; they stay because they are the two a researcher reaches for from here. */}
            <button
              className="research-page__secondary-btn"
              onClick={() => router.push('/admin/research/coverage')}
              title="Which Texas counties we have clerk adapters for"
            >
              Coverage
            </button>
            <button
              className="research-page__secondary-btn"
              onClick={() => router.push('/admin/research/testing')}
              title="Run a single scraper or adapter by hand"
            >
              Testing Lab
            </button>
            <button className="research-page__new-btn" onClick={() => setShowCreate(true)}>
              + New Research Project
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="research-page__controls">
          <form className="research-page__search" onSubmit={handleSearch}>
            <input
              type="text"
              className="research-page__search-input"
              placeholder="Search by name, address, or county..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="research-page__search-clear"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                style={{ background: 'none', border: 'none', color: 'var(--theme-fg-muted, #9CA3AF)', cursor: 'pointer', padding: '0 0.5rem', fontSize: '1.1rem' }}
              >
                &times;
              </button>
            )}
          </form>
          <div className="research-page__status-filters">
            {[
              { key: 'all', tip: 'Show all research projects regardless of their current workflow stage.' },
              { key: 'upload', tip: 'Projects in the document upload phase. Deed records, plats, and other source documents are being added for AI analysis.' },
              { key: 'configure', tip: 'Projects being configured for analysis. Select which data categories to extract and choose an analysis template.' },
              { key: 'analyzing', tip: 'Projects currently being analyzed by AI. Documents are being processed to extract bearings, distances, monuments, and other survey data.' },
              { key: 'review', tip: 'Projects with completed analysis ready for review. Extracted data points and discrepancies between documents can be inspected and verified.' },
              { key: 'drawing', tip: 'Projects in the drawing generation phase. AI is creating survey plat drawings from the extracted data with proper geometry and annotations.' },
              { key: 'verifying', tip: 'Projects where the AI-generated drawing is being compared against source documents to verify accuracy and flag any discrepancies.' },
              { key: 'complete', tip: 'Completed research projects. All documents have been analyzed, drawings generated, and verification completed.' },
            ].map(s => (
              <Tooltip key={s.key} text={s.tip} position="bottom" delay={500}>
                <button
                  className={`research-page__status-chip ${statusFilter === s.key ? 'research-page__status-chip--active' : ''}`}
                  onClick={() => setStatusFilter(s.key)}
                >
                  {s.key === 'all' ? 'All' : STATUS_LABELS[s.key as WorkflowStep]}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="research-page__grid">
            {[1, 2, 3].map(i => (
              <div key={i} className="research-card research-card--skeleton">
                <div className="research-card__skeleton-line research-card__skeleton-line--medium" />
                <div className="research-card__skeleton-line research-card__skeleton-line--long" />
                <div className="research-card__skeleton-line research-card__skeleton-line--short" />
              </div>
            ))}
          </div>
        )}

        {/* ── Error state ──────────────────────────────────────────────────────────────────────
            Was the EMPTY-state markup with an inline `#DC2626` on the title, so a failed request
            rendered as an empty list wearing red. Those are different answers to "where are my
            projects": empty means the query WORKED and there is nothing to show; failed means we
            do not know. Telling somebody they have no projects when the request never returned is
            worse than telling them nothing. (Phase E2.) */}
        {!loading && loadError && (
          <ErrorState
            title="Your projects could not be loaded"
            message={loadError}
            onRetry={loadProjects}
          />
        )}

        {/* Empty state — contextual messaging */}
        {!loading && !loadError && projects.length === 0 && (
          <div className="research-page__empty">
            {hasActiveSearch || hasActiveFilter ? (
              <>
                <div className="research-page__empty-title">No matching projects</div>
                <div className="research-page__empty-text">
                  {hasActiveSearch && <>No projects match &ldquo;{search}&rdquo;. </>}
                  {hasActiveFilter && <>Try changing the status filter or </>}
                  {!hasActiveFilter && <>Try a different search term or </>}
                  <button
                    style={{ background: 'none', border: 'none', color: '#2563EB', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 'inherit' }}
                    onClick={() => { setSearch(''); setStatusFilter('all'); }}
                  >
                    clear all filters
                  </button>.
                </div>
              </>
            ) : (
              <>
                <div className="research-page__empty-icon">&#128300;</div>
                <div className="research-page__empty-title">No research projects yet</div>
                <div className="research-page__empty-text">
                  Create your first AI-powered property research project to analyze deeds, plats, and survey documents.
                </div>
                <button className="research-page__new-btn" onClick={() => setShowCreate(true)}>
                  + New Research Project
                </button>
              </>
            )}
          </div>
        )}

        {/* Project cards */}
        {!loading && projects.length > 0 && (
          <div className="research-page__grid">
            {projects.map(project => (
              <div
                key={project.id}
                className="research-card"
                onClick={() => router.push(`/admin/research/${project.id}`)}
              >
                <div className="research-card__header">
                  <h3 className="research-card__name">{project.name}</h3>
                  <span className={`research-card__status research-card__status--${project.status}`}>
                    {STATUS_LABELS[project.status]}
                  </span>
                </div>
                {project.property_address && (
                  <div className="research-card__address">
                    {project.property_address}
                    {project.county && `, ${project.county} County`}
                    {project.state && `, ${project.state}`}
                  </div>
                )}
                {project.description && (
                  <div className="research-card__address" style={{ marginBottom: 0 }}>
                    {project.description.length > 100 ? project.description.slice(0, 100) + '...' : project.description}
                  </div>
                )}
                <div className="research-card__meta">
                  <span className="research-card__meta-item">
                    Stage {stageNumber(project.status)} of {PIPELINE_STAGES.length} — {STATUS_LABELS[project.status]}
                  </span>
                </div>
                <div className="research-card__date">
                  Created {new Date(project.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && total > 0 && (
          <div style={{ textAlign: 'center', color: 'var(--theme-fg-muted, #9CA3AF)', fontSize: '0.85rem', marginTop: '1rem' }}>
            Showing {projects.length} of {total} projects
          </div>
        )}
      </div>

      {/* The intake form — six sections from the owner's 2026-09-09 drawing. It creates the
          project, uploads the files and navigates; this tab only decides whether it is open. */}
      <NewResearchProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        jobIdFromLink={jobIdFromLink}
      />
    </>
  );
}
