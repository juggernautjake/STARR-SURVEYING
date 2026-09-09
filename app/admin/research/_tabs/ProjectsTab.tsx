// app/admin/research/_tabs/ProjectsTab.tsx — Research Projects, stacked (owner's drawing, 2026-09-09).
//
// "Research Page.pdf": the same frame as the Projects list — a search bar with a Search button, a
// Filter dropdown, "+ New Research Project" on the right, and the research projects stacked
// vertically — each card the project name with its research-status chip, the address in bold, and
// along the bottom the creation date on the left and the connected project on the right.
//
// The list part of this tab was a grid of cards with a row of eight stage chips; it is now the shared
// listing frame (`app/admin/components/listing`) with research-shaped cards. What stays: the worker
// status banner, the `?new=1` / `?new=1&job=<id>` deep links, and the error state as its OWN state
// rather than an empty list wearing red (E2).
'use client';
import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Microscope, Plus, Link2, ChevronRight } from 'lucide-react';
import { usePageError } from '../../hooks/usePageError';
import type { ResearchProject, WorkflowStep } from '@/types/research';
import WorkerStatusBanner from '../components/WorkerStatusBanner';
import NewResearchProjectModal from '../components/NewResearchProjectModal';
import { ErrorState } from '../components/ui';
import { SORT_OPTIONS, sortRows, paginate, formatDate, type SortKey } from '@/lib/admin/listing';
import { ListingSearch, ListingFilter, FilterGroup, FilterChip, ListingPager } from '../../components/listing/ListingControls';
import '../../components/listing/Listing.css';

const STATUS_LABELS: Record<WorkflowStep, string> = {
  upload: 'Upload',
  configure: 'Configure',
  analyzing: 'Analyzing',
  review: 'Review',
  drawing: 'Drawing',
  verifying: 'Verifying',
  complete: 'Complete',
};

const STATUS_TONE: Record<WorkflowStep, 'accent' | 'warn' | 'good' | 'muted'> = {
  upload: 'muted', configure: 'accent', analyzing: 'warn', review: 'warn', drawing: 'accent', verifying: 'accent', complete: 'good',
};

const STATUS_ORDER: WorkflowStep[] = ['upload', 'configure', 'analyzing', 'review', 'drawing', 'verifying', 'complete'];
/** Stages where a machine is working right now — the chip carries a pulsing dot. */
const LIVE_STATUSES = new Set<WorkflowStep>(['analyzing', 'drawing', 'verifying']);

/** The sort keys that mean something for research — there is no deadline here. */
const RESEARCH_SORTS = SORT_OPTIONS.filter((o) => o.key !== 'due_soonest');

export default function ProjectsTab() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { reportPageError } = usePageError('ResearchListPage');

  const [all, setAll] = useState<ResearchProject[]>([]);
  const [loading, setLoading] = useState(true);
  // The skeleton shows once; later reloads dim the rows on screen (.lst-list--refreshing).
  const [loadedOnce, setLoadedOnce] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | WorkflowStep>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const activeFilters = (statusFilter !== 'all' ? 1 : 0) + (sort !== 'newest' ? 1 : 0);
  const resetFilters = () => { setStatusFilter('all'); setSort('newest'); };

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

  // The whole list (the API pages at 200), so sorting and paging happen here like the Projects list.
  const loadProjects = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows: ResearchProject[] = [];
      for (let offset = 0; offset < 2000; offset += 200) {
        const params = new URLSearchParams({ limit: '200', offset: String(offset) });
        if (statusFilter !== 'all') params.set('status', statusFilter);
        if (applied.trim()) params.set('search', applied.trim());
        const res = await fetch(`/api/admin/research?${params}`);
        if (!res.ok) {
          setLoadError('Failed to load projects. Please try again.');
          setLoading(false);
          return;
        }
        const data = await res.json() as { projects?: ResearchProject[]; total?: number };
        rows.push(...(data.projects ?? []));
        if ((data.projects ?? []).length < 200 || rows.length >= (data.total ?? 0)) break;
      }
      setAll(rows);
      setLoadedOnce(true);
    } catch (err) {
      setLoadError('Unable to connect. Check your internet connection.');
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load projects' });
    }
    setLoading(false);
  }, [applied, statusFilter, reportPageError]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => {
    const t = setTimeout(() => setApplied(search), 400);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [applied, statusFilter, sort]);
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) { firstPage.current = false; return; }
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [page]);

  const sorted = useMemo(
    () => sortRows(all.map((p) => ({ ...p, updated_at: (p as { updated_at?: string | null }).updated_at ?? p.created_at })), sort),
    [all, sort],
  );
  const view = paginate(sorted, page);

  if (!session?.user) return null;
  if (sessionStatus === 'authenticated' && !canAccessResearch) return null;

  const filtering = Boolean(applied.trim() || activeFilters > 0);

  return (
    <>
      <div className="lst lst--research research-page" data-testid="research-list" ref={listRef}>
        {/* R2 — a dead research worker used to look like a slow page. Quiet when the engine is
            healthy; one sentence when it is not, plus what that means for a run started now. */}
        <WorkerStatusBanner />

        <header className="lst-head">
          <h1 className="lst-title">
            <Microscope size={22} className="lst-title__icon" aria-hidden="true" /> Research Projects
            {!loading && !loadError ? <span className="lst-count">{view.total} {view.total === 1 ? 'project' : 'projects'}</span> : null}
          </h1>
        </header>

        <ListingSearch
          value={search}
          onChange={setSearch}
          onSubmit={() => setApplied(search)}
          placeholder="Search research by name, address or county…"
          testId="research-search"
        />

        <div className="lst-toolbar">
          <ListingFilter active={activeFilters} onReset={resetFilters} testId="research-filter">
            <FilterGroup label="Research status">
              <FilterChip on={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</FilterChip>
              {STATUS_ORDER.map((s) => (
                <FilterChip key={s} on={statusFilter === s} onClick={() => setStatusFilter(s)}>{STATUS_LABELS[s]}</FilterChip>
              ))}
            </FilterGroup>
            <FilterGroup label="Sort by">
              {RESEARCH_SORTS.map((o) => (
                <FilterChip key={o.key} on={sort === o.key} onClick={() => setSort(o.key)}>{o.label}</FilterChip>
              ))}
            </FilterGroup>
          </ListingFilter>
          <div className="lst-toolbar__right">
            <button type="button" className="lst-new" onClick={() => setShowCreate(true)} data-testid="research-new">
              <Plus size={15} aria-hidden="true" /> New Research Project
            </button>
          </div>
        </div>

        {loading && !loadedOnce && (
          <ul className="lst-list" aria-busy="true" aria-label="Loading">
            {[1, 2, 3].map((i) => (
              <li key={i} className="lst-skel">
                <div className="lst-skel__bar lst-skel__bar--title" />
                <div className="lst-skel__bar lst-skel__bar--chip" />
                <div className="lst-skel__bar lst-skel__bar--w1" />
                <div className="lst-skel__bar lst-skel__bar--w2" />
                <div className="lst-skel__bar lst-skel__bar--w3" />
              </li>
            ))}
          </ul>
        )}

        {/* ── Error state ──────────────────────────────────────────────────────────────────────
            Its own state, not the empty-state markup wearing red: empty means the query WORKED and
            there is nothing to show; failed means we do not know. (Phase E2.) */}
        {!loading && loadError && (
          <ErrorState
            title="Your projects could not be loaded"
            message={loadError}
            onRetry={loadProjects}
          />
        )}

        {!loading && !loadError && view.total === 0 && (
          <div className="lst-empty" data-testid="research-empty">
            <Microscope size={28} aria-hidden="true" />
            <h2>{filtering ? 'No matching research projects' : 'No research projects yet'}</h2>
            <p>
              {filtering ? (
                <>
                  Try a different search, or{' '}
                  <button type="button" className="lst-empty__link" onClick={() => { setSearch(''); setApplied(''); resetFilters(); }}>clear the filters</button>.
                </>
              ) : 'Start with the address or the Property ID; the run finds the deeds, plats and maps.'}
            </p>
            {!filtering ? (
              <button type="button" className="lst-new" onClick={() => setShowCreate(true)}>
                <Plus size={15} aria-hidden="true" /> New Research Project
              </button>
            ) : null}
          </div>
        )}

        {(!loading || loadedOnce) && !loadError && view.total > 0 && (
          <>
            <ul className={`lst-list${loading ? ' lst-list--refreshing' : ''}`} data-testid="research-grid" key={`${page}-${sort}`} aria-busy={loading || undefined}>
              {view.rows.map((project, i) => {
                const linked = project.linked_project ?? null;
                const live = LIVE_STATUSES.has(project.status);
                return (
                  <li key={project.id} className="lst-list__item" style={{ '--i': i } as CSSProperties}>
                    <button
                      type="button"
                      className="lst-card"
                      onClick={() => router.push(`/admin/research/${project.id}`)}
                      data-testid={`research-card-${project.id}`}
                    >
                      <ChevronRight size={18} className="lst-card__go" aria-hidden="true" />
                      <div className="lst-card__head">
                        <h3 className="lst-card__name">{project.name}</h3>
                        <span className={`lst-status lst-status--${STATUS_TONE[project.status]}${live ? ' lst-status--live' : ''}`}>
                          {live ? <span className="lst-status__dot" aria-hidden="true" /> : null}
                          {STATUS_LABELS[project.status]}
                        </span>
                      </div>
                      <p className="lst-card__address">
                        {project.property_address || (project.parcel_id ? `Property ID ${project.parcel_id}` : 'No address on file')}
                        {project.county ? <span className="lst-card__address-sub"> · {project.county} County{project.state ? `, ${project.state}` : ''}</span> : null}
                      </p>
                      <div className="lst-card__foot">
                        <span className="lst-card__stat">Created <strong>{formatDate(project.created_at)}</strong></span>
                        {linked ? (
                          <span className="lst-card__link">
                            <Link2 size={13} aria-hidden="true" />
                            {[linked.project_number, linked.name].filter(Boolean).join(' — ')}
                          </span>
                        ) : (
                          <span className="lst-card__link lst-card__link--none">Not connected to a project</span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <ListingPager page={view.page} pages={view.pages} onPage={setPage} />
            {view.pages > 1 ? <p className="lst-showing">Showing {view.rows.length} of {view.total}</p> : null}
          </>
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
