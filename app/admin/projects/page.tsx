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
import { FolderKanban, Plus, Search, Briefcase, MapPin, User } from 'lucide-react';
import { usePageError } from '../hooks/usePageError';
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
  rollup: Rollup;
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

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (search.trim()) params.set('search', search.trim());
    if (status !== 'all') params.set('status', status);
    if (archived) params.set('archived', 'true');
    const res = await fetch(`/api/admin/projects?${params}`);
    setLoading(false);
    if (!res.ok) {
      setError('Could not load projects.');
      return;
    }
    setErrorText(null);
    setProjects((await res.json()).projects ?? []);
  }, [search, status, archived, setError]);

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

      <div className="proj__controls">
        <div className="proj__search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects, clients, addresses…"
            aria-label="Search projects"
            data-testid="projects-search"
          />
        </div>
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
                  style={{ background: `${PROJECT_STATUS_COLORS[p.status]}18`, color: PROJECT_STATUS_COLORS[p.status] }}
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
