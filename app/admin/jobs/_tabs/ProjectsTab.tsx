// app/admin/projects/page.tsx — All Projects.
//
// Owner, 2026-08-19: *"create new projects, and then within the project we can create a new job."*
//
// A project is the container the firm works in: one client, one parcel, several jobs over months.
// Styles live in `app/admin/styles/AdminProjects.css` rather than in a styled-jsx block, for two
// reasons that both bit this page: a class on a `<Link>` never receives styled-jsx's scope hash, and
// borrowing `jobs-page__*` from AdminJobs.css silently loaded nothing outside the /admin/jobs tree.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { chipInk } from '@/lib/admin/color-alpha';
import { FolderKanban, Plus, Search, Briefcase, MapPin, User, Clock, SlidersHorizontal } from 'lucide-react';
import { usePageError } from '../../hooks/usePageError';
import {
  PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, type ProjectStatus,
} from '@/lib/projects/model';

interface Rollup {
  jobs: number; active: number; archived: number;
  quoted: number; billable: number; paid: number; outstanding: number;
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
  updated_at: string;
  /** The latest of: created, the project or any job edited, and last opened. */
  last_touched_at?: string;
  opened_by_me_at?: string | null;
  rollup: Rollup;
}

/** "3 days ago" beats a date on a recents strip: the question is how stale it is, not which day. */
function ago(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const money = (n: number) =>
  n === 0 ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function ProjectsPage() {
  const router = useRouter();
  const { reportPageError } = usePageError('ProjectsPage');
  const [error, setErrorText] = useState<string | null>(null);
  const setError = useCallback((m: string) => { setErrorText(m); reportPageError(m); }, [reportPageError]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | ProjectStatus>('all');
  const [archived, setArchived] = useState(false);
  // Owner, 2026-08-19: search "by date or range of time … or by who was assigned to it".
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [assignee, setAssignee] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [recents, setRecents] = useState<Project[]>([]);

  const filtering = Boolean(search.trim() || from || to || assignee.trim() || status !== 'all' || archived);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (search.trim()) params.set('search', search.trim());
    if (status !== 'all') params.set('status', status);
    if (archived) params.set('archived', 'true');
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (assignee.trim()) params.set('assignee', assignee.trim());
    const res = await fetch(`/api/admin/projects?${params}`);
    setLoading(false);
    if (!res.ok) {
      setError('Could not load projects.');
      return;
    }
    setErrorText(null);
    setProjects((await res.json()).projects ?? []);
  }, [search, status, archived, from, to, assignee, setError]);

  // The five most recently touched, loaded once. Deliberately NOT re-fetched as the filters change:
  // "recent" is a fixed shortcut back to what you were doing, and a strip that reshuffled while you
  // typed a search would stop being that.
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/projects?recent=true&limit=5');
      if (res.ok) setRecents((await res.json()).projects ?? []);
    })().catch(() => undefined);
  }, []);

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="proj-page">
      <div className="proj-page__header">
        <div className="proj-page__header-left">
          <h1 className="proj-page__title">
            <FolderKanban size={20} aria-hidden /> Projects
          </h1>
          <span className="proj-page__count">
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </span>
        </div>
        <div className="proj-page__header-actions">
          <Link href="/admin/jobs" className="proj-page__btn proj-page__btn--secondary">
            <Briefcase size={15} aria-hidden /> All Jobs
          </Link>
          <Link href="/admin/projects/new" className="proj-page__btn proj-page__btn--primary" data-testid="projects-new">
            <Plus size={15} aria-hidden /> New Project
          </Link>
        </div>
      </div>

      {/* ── RECENT (2026-08-19) ───────────────────────────────────────────────────────────────────
          Owner: *"a section for recent projects that shows the 5 most recent projects that have
          been opened/created/worked on."*

          Ranked by the latest of those three, which needed a new fact: opening a project changes
          nothing, so it was written down nowhere. Hidden while a filter is active — a "recent"
          shortcut sitting above filtered results is two answers to two different questions stacked
          on top of each other. */}
      {recents.length > 0 && !filtering && (
        <section className="proj__recent" data-testid="projects-recent">
          <h2 className="proj__recent-title"><Clock size={14} aria-hidden /> Recent</h2>
          <div className="proj__recent-row">
            {recents.map((r) => (
              <button
                key={r.id}
                type="button"
                className="proj__recent-card"
                onClick={() => router.push(`/admin/projects/${r.id}`)}
                data-testid={`project-recent-${r.id}`}
              >
                <span className="proj__recent-num">{r.project_number ?? '—'}</span>
                <span className="proj__recent-name">{r.name}</span>
                <span className="proj__recent-meta">
                  {r.client_company || r.client_name || '—'} · {ago(r.last_touched_at ?? r.updated_at)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="proj__controls">
        <div className="proj__search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, client, address, county…"
            aria-label="Search projects"
            data-testid="projects-search"
          />
        </div>
        <button
          type="button"
          className={`proj__chip${showFilters || from || to || assignee ? ' is-on' : ''}`}
          onClick={() => setShowFilters((v) => !v)}
          data-testid="projects-filters-toggle"
        >
          <SlidersHorizontal size={13} aria-hidden /> Date &amp; people
        </button>
        <div className="proj__filters">
          <button type="button" className={`proj__chip${status === 'all' ? ' is-on' : ''}`} onClick={() => setStatus('all')}>
            All
          </button>
          {PROJECT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`proj__chip${status === s ? ' is-on' : ''}`}
              onClick={() => setStatus(s)}
            >
              {PROJECT_STATUS_LABELS[s]}
            </button>
          ))}
          <label className="proj__archived">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            Archived
          </label>
        </div>
      </div>

      {showFilters && (
        <div className="proj__advanced" data-testid="projects-advanced-filters">
          <label className="proj__adv-field">
            <span>Active from</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="projects-from" />
          </label>
          <label className="proj__adv-field">
            <span>to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="projects-to" />
          </label>
          <label className="proj__adv-field proj__adv-field--wide">
            <span>Assigned to</span>
            <input
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="Name or email of a crew member"
              data-testid="projects-assignee"
            />
          </label>
          {(from || to || assignee) && (
            <button
              type="button"
              className="proj__chip"
              onClick={() => { setFrom(''); setTo(''); setAssignee(''); }}
              data-testid="projects-clear-filters"
            >
              Clear
            </button>
          )}
          <p className="proj__adv-note">
            {/* Said out loud because the alternative behaviours are both defensible, and somebody
                searching January for a project created then would otherwise think it was lost. */}
            A date range matches projects <strong>created</strong> in it or <strong>worked on</strong> during it.
            &ldquo;Assigned to&rdquo; finds projects with a job that person is on.
          </p>
        </div>
      )}

      {error && <div className="proj-page__error" role="alert">{error}</div>}

      {loading && <div className="proj-page__loading"><p>Loading projects…</p></div>}

      {!loading && projects.length === 0 && (
        <div className="proj-page__empty" data-testid="projects-empty">
          <FolderKanban size={30} aria-hidden />
          <h2>{search || status !== 'all' || archived ? 'Nothing matches that' : 'No projects yet'}</h2>
          <p>
            A project holds the jobs for one client on one parcel — the boundary survey, the topo,
            the staking. Create one, then add jobs inside it.
          </p>
          <Link href="/admin/projects/new" className="proj-page__btn proj-page__btn--primary">
            <Plus size={15} aria-hidden /> New Project
          </Link>
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="proj__grid" data-testid="projects-grid">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className="proj__card"
              onClick={() => router.push(`/admin/projects/${p.id}`)}
              data-testid={`project-card-${p.id}`}
            >
              <div className="proj__card-head">
                <span className="proj__number">{p.project_number ?? '—'}</span>
                <span
                  className="proj__status"
                  style={{ background: `${PROJECT_STATUS_COLORS[p.status]}18`, color: chipInk(PROJECT_STATUS_COLORS[p.status]) }}
                >
                  {PROJECT_STATUS_LABELS[p.status]}
                </span>
              </div>
              <h3 className="proj__name">{p.name}</h3>

              {(p.client_name || p.client_company) && (
                <p className="proj__meta"><User size={13} aria-hidden /> {p.client_company || p.client_name}</p>
              )}
              {(p.address || p.city || p.county) && (
                <p className="proj__meta">
                  <MapPin size={13} aria-hidden /> {[p.address, p.city, p.county && `${p.county} Co.`].filter(Boolean).join(', ')}
                </p>
              )}

              {/* The count is the point of the container: a project with 4 jobs is the thing the
                  firm could not previously see at all. */}
              <div className="proj__stats">
                <span className="proj__stat">
                  <strong>{p.rollup.jobs}</strong> job{p.rollup.jobs === 1 ? '' : 's'}
                </span>
                <span className="proj__stat"><strong>{money(p.rollup.billable)}</strong> billable</span>
                {p.rollup.outstanding > 0 && (
                  <span className="proj__stat proj__stat--owed"><strong>{money(p.rollup.outstanding)}</strong> owed</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
