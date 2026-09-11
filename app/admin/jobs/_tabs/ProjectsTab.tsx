// app/admin/jobs/_tabs/ProjectsTab.tsx — All Projects, stacked (owner's drawing, 2026-09-09).
//
// "Projects Listing Page.pdf": a search bar with a Search button, a Filter dropdown, and the projects
// stacked vertically — each card the project name with its status chip, the customer, the creation
// date, the deadline, the address(es), then "0/3 jobs complete", "$0 / $1,000 paid" and the project
// ID along the bottom; "‹ 1 of 16 ›" underneath.
//
// Decisions from the same conversation: the chip is the PROJECT status (active / on hold / complete
// / cancelled — set by a person, not derived); the deadline is the nearest open JOB deadline, since
// a project has none of its own; ten cards a page. The recents strip and the assignee search from
// 2026-08-19 are gone — "keep it simple" — the date range survives inside the Filter dropdown.
//
// Styles come from `app/admin/components/listing/Listing.css`, imported by the controls this page
// shares with the Research list, so the two read as siblings.
'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderKanban, Plus, ChevronRight } from 'lucide-react';
import { usePageError } from '../../hooks/usePageError';
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/projects/model';
import { SORT_OPTIONS, sortRows, paginate, formatDate, money, isOverdue, dueBubble, type SortKey } from '@/lib/admin/listing';
import { useNewJobs } from '@/lib/admin/use-new-jobs';
import { ListingSearch, ListingFilter, FilterGroup, FilterChip, ListingPager } from '../../components/listing/ListingControls';

interface Rollup {
  jobs: number; active: number; archived: number;
  quoted: number; billable: number; paid: number; outstanding: number;
  completed: number; next_deadline: string | null;
}
interface Project {
  id: string;
  project_number: string | null;
  name: string;
  status: ProjectStatus;
  client_name: string | null;
  client_company: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  is_priority: boolean;
  created_at: string;
  updated_at: string;
  job_addresses?: string[];
  rollup: Rollup;
}

const STATUS_TONE: Record<ProjectStatus, 'accent' | 'warn' | 'good' | 'muted'> = {
  active: 'accent', on_hold: 'warn', complete: 'good', cancelled: 'muted',
};

/** The project's own site line, then any job site that differs from it. */
/** The addresses on a card are the JOBS' — a project has none of its own (owner, 2026-09-10):
 *  "we might have a project that has multiple properties with different addresses." */
function addressLines(p: Project): string[] {
  const seen = new Set<string>();
  return (p.job_addresses ?? []).filter((a) => {
    const k = a.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export default function ProjectsPage() {
  const router = useRouter();
  // NEW beside Created when the project holds a job this person has not opened (owner, 2026-09-10).
  const newJobs = useNewJobs();
  const { reportPageError } = usePageError('ProjectsPage');

  const [all, setAll] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  // The skeleton shows once. A later reload (a filter, a search) dims the rows that are already on
  // screen instead — see .lst-list--refreshing.
  const [loadedOnce, setLoadedOnce] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [status, setStatus] = useState<'all' | ProjectStatus>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [archived, setArchived] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const activeFilters = (status !== 'all' ? 1 : 0) + (sort !== 'newest' ? 1 : 0) + (archived ? 1 : 0) + (from || to ? 1 : 0);
  const resetFilters = () => { setStatus('all'); setSort('newest'); setArchived(false); setFrom(''); setTo(''); };

  // The whole list, so sorting by a job-derived deadline and paging both happen here. The API caps
  // a request at 200; the firm has a few dozen projects, and the loop keeps this honest past that.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows: Project[] = [];
      for (let offset = 0; offset < 2000; offset += 200) {
        const params = new URLSearchParams({ limit: '200', offset: String(offset) });
        if (applied.trim()) params.set('search', applied.trim());
        if (status !== 'all') params.set('status', status);
        if (archived) params.set('archived', 'true');
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        const res = await fetch(`/api/admin/projects?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json() as { projects?: Project[]; total?: number };
        rows.push(...(body.projects ?? []));
        if ((body.projects ?? []).length < 200 || rows.length >= (body.total ?? 0)) break;
      }
      setAll(rows);
      setLoadedOnce(true);
    } catch (err) {
      const msg = 'Could not load projects.';
      setError(msg);
      reportPageError(err instanceof Error ? err : new Error(msg), { element: 'load projects' });
    } finally {
      setLoading(false);
    }
  }, [applied, status, archived, from, to, reportPageError]);

  useEffect(() => { void load(); }, [load]);
  // Typing searches too, after a pause — the Search button is for people who expect one.
  useEffect(() => {
    const t = setTimeout(() => setApplied(search), 400);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [applied, status, sort, archived, from, to]);
  // A page change glides the list back to its top; the cards then rise in again (the `key`).
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) { firstPage.current = false; return; }
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [page]);

  const sorted = useMemo(
    () => sortRows(all.map((p) => ({ ...p, due: p.rollup.next_deadline })), sort),
    [all, sort],
  );
  const view = paginate(sorted, page);
  const filtering = Boolean(applied.trim() || activeFilters > 0);

  return (
    <div className="lst lst--projects" data-testid="projects-list" ref={listRef}>
      <header className="lst-head">
        <h1 className="lst-title">
          <FolderKanban size={22} className="lst-title__icon" aria-hidden="true" /> Projects
          {!loading ? <span className="lst-count">{view.total} {view.total === 1 ? 'project' : 'projects'}</span> : null}
        </h1>
        {/* The portal's tab header already carries "New project"; a second one here was a twin. */}
      </header>

      <ListingSearch
        value={search}
        onChange={setSearch}
        onSubmit={() => setApplied(search)}
        placeholder="Search projects by name, customer, address, county or number…"
        testId="projects-search"
      />

      <div className="lst-toolbar">
        <ListingFilter active={activeFilters} onReset={resetFilters} testId="projects-filter">
          <FilterGroup label="Status">
            <FilterChip on={status === 'all'} onClick={() => setStatus('all')}>All</FilterChip>
            {PROJECT_STATUSES.map((s) => (
              <FilterChip key={s} on={status === s} onClick={() => setStatus(s)}>{PROJECT_STATUS_LABELS[s]}</FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup label="Sort by">
            {SORT_OPTIONS.map((o) => (
              <FilterChip key={o.key} on={sort === o.key} onClick={() => setSort(o.key)}>{o.label}</FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup label="Created or worked on between">
            <label className="lst-date">from <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="lst-date">to <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </FilterGroup>
          <FilterGroup label="Show">
            <label className="lst-check">
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
              Archived projects instead of live ones
            </label>
          </FilterGroup>
        </ListingFilter>
        <div className="lst-toolbar__right">
          <Link href="/admin/jobs?tab=jobs" className="lst-chip">All jobs</Link>
        </div>
      </div>

      {error ? (
        <div className="lst-empty" role="alert">
          <h2>Projects could not be loaded</h2>
          <p>{error}</p>
          <button type="button" className="lst-empty__link" onClick={() => void load()}>Try again</button>
        </div>
      ) : null}

      {loading && !loadedOnce ? (
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
        ) : null}

      {!loading && !error && view.total === 0 ? (
        <div className="lst-empty" data-testid="projects-empty">
          <FolderKanban size={28} aria-hidden="true" />
          <h2>{filtering ? 'Nothing matches that' : 'No projects yet'}</h2>
          <p>
            {filtering
              ? 'Try a different search, or '
              : 'A project holds the jobs for one client on one parcel — the boundary survey, the topo, the staking. '}
            {filtering ? (
              <button type="button" className="lst-empty__link" onClick={() => { setSearch(''); setApplied(''); resetFilters(); }}>clear the filters</button>
            ) : null}
            {filtering ? '.' : ''}
          </p>
          {!filtering ? (
            <Link href="/admin/projects/new" className="lst-new lst-new--brand"><Plus size={15} aria-hidden="true" /> New Project</Link>
          ) : null}
        </div>
      ) : null}

      {(!loading || loadedOnce) && !error && view.total > 0 ? (
        <>
          <ul className={`lst-list${loading ? ' lst-list--refreshing' : ''}`} data-testid="projects-grid" key={`${page}-${sort}`} aria-busy={loading || undefined}>
            {view.rows.map((p, i) => {
              const lines = addressLines(p);
              const due = p.rollup.next_deadline;
              const overdue = isOverdue(due);
              const dueTag = dueBubble(due);
              const isNew = newJobs.projectIds.has(p.id);
              return (
                <li key={p.id} className="lst-list__item" style={{ '--i': i } as CSSProperties}>
                  <button
                    type="button"
                    className="lst-card"
                    onClick={() => router.push(`/admin/projects/${p.id}`)}
                    data-testid={`project-card-${p.id}`}
                  >
                    <ChevronRight size={18} className="lst-card__go" aria-hidden="true" />
                    <div className="lst-card__head">
                      <h3 className="lst-card__name">{p.name}</h3>
                      <span className={`lst-status lst-status--${STATUS_TONE[p.status]}`}>{PROJECT_STATUS_LABELS[p.status]}</span>
                    </div>
                    <div className="lst-card__lines lst-card__lines--grid">
                      <div className="lst-card__line">
                        <span className="lst-card__k">Customer</span>
                        <span className="lst-card__v lst-card__v--strong">{p.client_company || p.client_name || '—'}</span>
                      </div>
                      <div className="lst-card__line">
                        <span className="lst-card__k">Created</span>
                        <span className="lst-card__v">
                          {formatDate(p.created_at)}
                          {isNew ? <span className="lst-bubble lst-bubble--new" data-testid="project-new">New</span> : null}
                        </span>
                      </div>
                      <div className="lst-card__line">
                        <span className="lst-card__k">Deadline</span>
                        <span className={`lst-card__v${overdue ? ' lst-card__v--overdue' : ''}`}>
                          {due ? formatDate(due) : p.rollup.jobs > 0 && p.rollup.completed === p.rollup.jobs ? 'All jobs complete' : 'No deadline set'}
                          {dueTag ? <span className={`lst-bubble lst-bubble--${dueTag.tone}`} data-testid="project-due">{dueTag.label}</span> : null}
                        </span>
                      </div>
                      <div className="lst-card__line">
                        <span className="lst-card__k">{lines.length > 1 ? 'Addresses' : 'Address'}</span>
                        <span className="lst-card__v lst-card__v--addresses">
                          {lines.length > 0
                            ? lines.map((l) => <span key={l} className="lst-card__address-line">{l}</span>)
                            : <span className="lst-card__address-sub">No job addresses yet</span>}
                        </span>
                      </div>
                    </div>
                    <div className="lst-card__foot">
                      <span className={`lst-card__stat${p.rollup.jobs > 0 && p.rollup.completed === p.rollup.jobs ? ' lst-card__stat--good' : ''}`}>
                        <strong>{p.rollup.completed}/{p.rollup.jobs}</strong> jobs complete
                      </span>
                      <span className={`lst-card__stat${p.rollup.outstanding > 0 ? ' lst-card__stat--owed' : p.rollup.billable > 0 ? ' lst-card__stat--good' : ''}`}>
                        <strong>{money(p.rollup.paid)} / {money(p.rollup.quoted)}</strong> paid
                      </span>
                      <span className="lst-card__id">{p.project_number ?? '—'}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <ListingPager page={view.page} pages={view.pages} onPage={setPage} />
          {view.pages > 1 ? <p className="lst-showing">Showing {view.rows.length} of {view.total}</p> : null}
        </>
      ) : null}
    </div>
  );
}
