// app/admin/projects/[id]/page.tsx — one project: its jobs, its money, its files.
//
// 2026-11-11 — a hub, like the job page: the project header (number, name, address, customer, jobs,
// quoted), five tiles (Files, Photos & videos, Financial, Status & history, Project info), and the
// jobs list right under them, because the jobs are what somebody comes back to a project for.
//
// This is the page the owner asked for: *"within the project we can create a new job. We would then
// be able to have multiple jobs within a project."* The primary action on it is therefore **New job
// in this project** — not an edit form. A container whose main affordance is editing the container
// is a container nobody puts anything in.
//
// Styles: `app/admin/styles/AdminProjects.css`. Not styled-jsx — `.pd__job` sits on a `<Link>`, and
// styled-jsx only scopes intrinsic elements, so that rule matched nothing at all.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useNewJobs } from '@/lib/admin/use-new-jobs';
import { usePageTitle } from '@/lib/admin/page-title';
import '@/app/admin/components/listing/Listing.css';
import { useParams, useRouter } from 'next/navigation';
import {
  FolderKanban, Plus, ArrowLeft, MapPin, User, Mail, Phone, Trash2, Briefcase, Check, Pencil,
  CalendarDays, Ruler, DollarSign, ChevronRight, Star, Upload, Folder, Camera, Activity, ClipboardList,
  type LucideIcon,
} from 'lucide-react';
import '../../components/hub/Hub.css';
import { formatDate, dueBubble } from '@/lib/admin/listing';
import { usePageError } from '../../hooks/usePageError';
import { STAGE_CONFIG, SURVEY_TYPES } from '../../components/jobs/JobCard';
import FolderExplorer from '../../components/files/FolderExplorer';
import UploadFilesDialog from '../../components/files/UploadFilesDialog';
import JobActivityFeed from '../../components/jobs/JobActivityFeed';
import ProjectMoneyPanel from '../../components/projects/ProjectMoneyPanel';
import {
  PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, projectLabel, type ProjectStatus,
} from '@/lib/projects/model';

interface Project {
  id: string; project_number: string | null; name: string; description: string | null;
  status: ProjectStatus;
  client_name: string | null; client_company: string | null; client_email: string | null; client_phone: string | null;
  address: string | null; city: string | null; state: string | null; zip: string | null; county: string | null;
  subdivision: string | null; lot_number: string | null; abstract_number: string | null; acreage: number | null;
  notes: string | null; is_archived: boolean; created_at: string;
}

interface Job {
  id: string; job_number: string; name: string; survey_type: string; stage: string;
  address: string | null; city: string | null; state: string | null; zip: string | null; county: string | null;
  subdivision: string | null; lot_number: string | null; abstract_number: string | null; acreage: number | null;
  property_id: string | null;
  deadline: string | null; created_at: string;
  quote_amount: number | null; final_amount: number | null; amount_paid: number | null;
  payment_status: string | null; is_priority: boolean; is_archived: boolean;
}

interface Rollup {
  jobs: number; active: number; archived: number;
  quoted: number; billable: number; paid: number; outstanding: number;
}

type ProjectViewKey = 'home' | 'files' | 'media' | 'financial' | 'status' | 'info';
const PROJECT_VIEWS: Array<{ key: Exclude<ProjectViewKey, 'home'>; label: string; Icon: LucideIcon; blurb: string }> = [
  { key: 'files', label: 'Files', Icon: Folder, blurb: 'Project documents and every job’s folders.' },
  { key: 'media', label: 'Photos & videos', Icon: Camera, blurb: 'Every picture and video across the project.' },
  { key: 'financial', label: 'Financial', Icon: DollarSign, blurb: 'Quoted, billed, paid and owed across the jobs.' },
  { key: 'status', label: 'Status & history', Icon: Activity, blurb: 'Where the project stands, and everything that happened.' },
  { key: 'info', label: 'Project info', Icon: ClipboardList, blurb: 'Client, description, notes — and editing the project.' },
];

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const newJobs = useNewJobs();
  const { reportPageError } = usePageError('ProjectDetailPage');
  const [error, setErrorText] = useState<string | null>(null);
  const setError = useCallback((m: string) => { setErrorText(m); reportPageError(m); }, [reportPageError]);

  const [project, setProject] = useState<Project | null>(null);
  // The bar says which project this is, not "Admin" (owner, 2026-09-10).
  usePageTitle(project ? projectLabel(project) : null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [rollup, setRollup] = useState<Rollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  // The Upload files pop-up (owner, 2026-09-15): any of this project's folders, or its jobs' folders.
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filesRefresh, setFilesRefresh] = useState(0);
  /** Project home, or the tile that is open — kept in `?tab=` so a reload or a link lands there. */
  const [view, setView] = useState<ProjectViewKey>('home');
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t && PROJECT_VIEWS.some((w) => w.key === t)) setView(t as ProjectViewKey);
  }, []);
  const openView = useCallback((next: ProjectViewKey) => {
    setView(next);
    const url = new URL(window.location.href);
    if (next === 'home') url.searchParams.delete('tab'); else url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url.href);
    window.scrollTo({ top: 0 });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/projects/${id}`);
    setLoading(false);
    if (!res.ok) {
      setError('Could not load that project.');
      return;
    }
    const data = await res.json();
    setProject(data.project);
    setJobs(data.jobs ?? []);
    setRollup(data.rollup ?? null);
  }, [id, setError]);

  useEffect(() => { void load(); }, [load]);

  // Record that this project was opened, so the Recent strip can rank by it. Fire-and-forget: a
  // recents list must never be able to fail somebody's attempt to open a project.
  useEffect(() => {
    void fetch(`/api/admin/projects/${id}/open`, { method: 'POST' }).catch(() => undefined);
  }, [id]);

  async function setStatus(status: ProjectStatus) {
    setSavingStatus(true);
    const res = await fetch(`/api/admin/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setSavingStatus(false);
    if (!res.ok) {
      setError('Could not change the status.');
      return;
    }
    void load();
  }

  async function remove() {
    if (!window.confirm(`Delete "${project?.name}"? Its jobs must be removed first.`)) return;
    const res = await fetch(`/api/admin/projects/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // The API refuses while live jobs remain and says how many — surfaced verbatim, because an
      // error that names the obstacle is one the person can act on.
      setError(body.error ?? 'Could not delete the project.');
      return;
    }
    router.push('/admin/projects');
  }

  if (loading) {
    return <div className="proj-page"><div className="proj-page__loading"><p>Loading project…</p></div></div>;
  }
  if (!project) {
    return (
      <div className="proj-page">
        <div className="proj-page__empty">
          <h2>Project not found</h2>
          <p>It may have been deleted.</p>
          <Link href="/admin/projects" className="proj-page__btn proj-page__btn--secondary">
            <ArrowLeft size={15} aria-hidden /> All Projects
          </Link>
        </div>
      </div>
    );
  }

  const hasClient = Boolean(project.client_company || project.client_name || project.client_email || project.client_phone);
  const label = projectLabel(project);
  const street = [project.address, project.city].filter(Boolean).join(', ');
  const locale = [project.state, project.zip].filter(Boolean).join(' ');
  const customer = project.client_company || project.client_name || null;
  const current = PROJECT_VIEWS.find((w) => w.key === view) ?? null;
  const tileMeta: Partial<Record<ProjectViewKey, string>> = {
    files: 'This project and all of its jobs',
    media: 'From every job in the project',
    financial: rollup ? `${money(rollup.paid)} paid of ${money(rollup.billable || rollup.quoted)}` : '',
    status: PROJECT_STATUS_LABELS[project.status],
    info: hasClient ? (customer ?? '') : 'No client details yet',
  };

  return (
    <div className="jh proj-page">
      {/* ── THE PROJECT HEADER ── */}
      <header className="jh__header" data-testid="project-header">
        <div className="jh__title-row">
          <div className="jh__title">
            {project.project_number && <span className="jh__number">{project.project_number}</span>}
            <h1 className="jh__name">{project.name}</h1>
          </div>
          <div className="jh__header-actions">
            {/* Upload, first and brightest (owner, 2026-09-15). */}
            <button
              type="button"
              className="jh__upload"
              onClick={() => setUploadOpen(true)}
              title="Upload files to this project or any of its jobs — you choose the folder for each file"
              data-testid="project-upload-files"
            >
              <Upload size={16} aria-hidden /> Upload files
            </button>
            {/* The point of the page. `?project=` prefills and preselects the picker on the job form. */}
            <Link href={`/admin/jobs/new?project=${project.id}`} className="jh__btn" data-testid="project-new-job">
              <Plus size={15} aria-hidden /> New job
            </Link>
          </div>
        </div>
        <dl className="jh__facts">
          <div className="jh__fact jh__fact--address">
            <dt><MapPin size={13} aria-hidden /> Address</dt>
            <dd>{street || locale ? <>{street}{street && locale ? ', ' : ''}{locale}</> : <span className="jh__muted">Each job carries its own address</span>}</dd>
          </div>
          <div className="jh__fact">
            <dt><User size={13} aria-hidden /> Customer</dt>
            <dd>
              {customer ?? <span className="jh__muted">—</span>}
              {project.client_company && project.client_name && <span className="jh__sub">{project.client_name}</span>}
              {project.client_phone && <a href={`tel:${project.client_phone}`} className="jh__fact-link"><Phone size={12} aria-hidden /> {project.client_phone}</a>}
            </dd>
          </div>
          <div className="jh__fact">
            <dt><Briefcase size={13} aria-hidden /> Jobs</dt>
            <dd>{jobs.length}{rollup && rollup.active !== jobs.length ? <span className="jh__sub">{rollup.active} active</span> : null}</dd>
          </div>
          <div className="jh__fact">
            <dt><DollarSign size={13} aria-hidden /> Quoted</dt>
            <dd className="jh__money">{rollup ? money(rollup.quoted) : '—'}</dd>
          </div>
        </dl>
      </header>

      {error && <div className="proj-page__error" role="alert">{error}</div>}

      <UploadFilesDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        rootId={`mnt:projects:${project.id}`}
        title={label}
        onUploaded={() => setFilesRefresh((n) => n + 1)}
      />

      {view === 'home' || !current ? (
        <div className="jh__home pd">
          <ul className="jh__tiles jh__tiles--five" aria-label="Project sections">
            {PROJECT_VIEWS.map((w) => (
              <li key={w.key}>
                <button type="button" className="jh__tile" onClick={() => openView(w.key)} data-testid={`project-widget-${w.key}`}>
                  <span className={`jh__tile-icon jh__tile-icon--${w.key}`} aria-hidden><w.Icon size={22} strokeWidth={1.9} /></span>
                  <span className="jh__tile-body">
                    <span className="jh__tile-name">{w.label}</span>
                    <span className="jh__tile-blurb">{w.blurb}</span>
                    {tileMeta[w.key] && <span className="jh__tile-meta">{tileMeta[w.key]}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* ── The jobs, which are the reason the project exists — always on project home ── */}
          <section className="pd__main" data-testid="project-jobs-section">
            <div className="pd__section-head">
              <h2><Briefcase size={16} aria-hidden /> Jobs<span className="pd__badge">{jobs.length}</span></h2>
            </div>
            {jobs.length === 0 ? (
              <div className="pd__empty" data-testid="project-jobs-empty">
                <p>No jobs in this project yet.</p>
                <p className="pd__empty-sub">
                  A project usually holds several — the boundary survey, then the topo, then the
                  staking. Each one inherits this project&rsquo;s client and carries its own address.
                </p>
                <Link href={`/admin/jobs/new?project=${project.id}`} className="proj-page__btn proj-page__btn--primary">
                  <Plus size={15} aria-hidden /> New job in this project
                </Link>
              </div>
            ) : (
              <ul className="pd__jobs" data-testid="project-jobs">
                {/* ── EACH JOB IN FULL (owner, 2026-09-10) ──────────────────────────────────────
                    "Each job should have its own quote and address and name and job number and all
                    of that." A row used to be number · name · stage · one figure. A card now carries
                    the property (the address is the JOB's — a project has none), the survey type and
                    acreage, the deadline with its due bubble, and the money in three figures. */}
                {jobs.map((j) => {
                  const stage = STAGE_CONFIG[j.stage] ?? { label: j.stage, color: 'var(--theme-fg-secondary, #6B7280)' };
                  const street = [j.address, j.city].filter(Boolean).join(', ');
                  const locale = [j.state, j.zip].filter(Boolean).join(' ');
                  const legal = [j.property_id ? `Property ID ${j.property_id}` : null, j.subdivision, j.lot_number ? `Lot ${j.lot_number}` : null, j.abstract_number ? `Abstract ${j.abstract_number}` : null].filter(Boolean).join(' · ');
                  const due = dueBubble(j.deadline);
                  const quoted = j.final_amount ?? j.quote_amount;
                  const paid = j.amount_paid ?? 0;
                  // The status the payments route writes: unpaid → partial → paid. "—" until a quote exists.
                  const payStatus = quoted != null ? (j.payment_status ?? (paid >= quoted && quoted > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid')) : null;
                  const PAY_LABEL: Record<string, string> = { paid: 'Paid', partial: 'Partially paid', unpaid: 'Unpaid' };
                  return (
                    <li key={j.id}>
                      <Link href={`/admin/jobs/${j.id}`} className={`pd__jobcard${j.is_archived ? ' pd__jobcard--archived' : ''}`} data-testid={`project-job-${j.id}`}>
                        <div className="pd__jobcard-head">
                          <span className="pd__jobcard-num">
                            {j.is_priority ? <Star size={12} className="pd__jobcard-priority" aria-label="Priority" /> : null}
                            {j.job_number}
                            {newJobs.jobIds.has(j.id) ? <span className="lst-bubble lst-bubble--new" data-testid="project-job-new">New</span> : null}
                          </span>
                          <span className="pd__jobcard-stage" style={{ background: `${stage.color}18`, color: stage.color }}>
                            {stage.label}
                          </span>
                          <ChevronRight size={16} className="pd__jobcard-go" aria-hidden />
                        </div>
                        <h3 className="pd__jobcard-name">{j.name}</h3>
                        <div className="pd__jobcard-facts">
                          <div className="pd__jobcard-fact pd__jobcard-fact--wide">
                            <span className="pd__jobcard-k"><MapPin size={12} aria-hidden /> Address</span>
                            <span className="pd__jobcard-v">
                              {street || <span className="pd__jobcard-muted">—</span>}
                              {locale ? <span className="pd__jobcard-sub"> {locale}</span> : null}
                              {j.county ? <span className="pd__jobcard-sub"> · {j.county} County</span> : null}
                              {legal ? <span className="pd__jobcard-legal">{legal}</span> : null}
                            </span>
                          </div>
                          <div className="pd__jobcard-fact">
                            <span className="pd__jobcard-k"><Ruler size={12} aria-hidden /> Survey</span>
                            <span className="pd__jobcard-v">
                              {SURVEY_TYPES[j.survey_type] ?? j.survey_type ?? <span className="pd__jobcard-muted">—</span>}
                              {j.acreage != null ? <span className="pd__jobcard-sub"> · {j.acreage} acres</span> : null}
                            </span>
                          </div>
                          <div className="pd__jobcard-fact">
                            <span className="pd__jobcard-k"><CalendarDays size={12} aria-hidden /> Deadline</span>
                            <span className="pd__jobcard-v">
                              {j.deadline ? formatDate(j.deadline) : <span className="pd__jobcard-muted">—</span>}
                              {due ? <span className={`lst-bubble lst-bubble--${due.tone}`}>{due.label}</span> : null}
                            </span>
                          </div>
                          <div className="pd__jobcard-money-row">
                          <div className="pd__jobcard-fact pd__jobcard-fact--money">
                            <span className="pd__jobcard-k"><DollarSign size={12} aria-hidden /> {j.final_amount != null ? 'Final amount' : 'Quote'}</span>
                            <span className="pd__jobcard-v pd__jobcard-money">{quoted != null ? money(quoted) : <span className="pd__jobcard-muted">—</span>}</span>
                          </div>
                          <div className="pd__jobcard-fact pd__jobcard-fact--money">
                            <span className="pd__jobcard-k">Payment</span>
                            <span className="pd__jobcard-v">
                              {payStatus ? (
                                <>
                                  <span className={`pd__jobcard-pay pd__jobcard-pay--${payStatus}`} data-testid="project-job-pay">{PAY_LABEL[payStatus] ?? payStatus}</span>
                                  {quoted != null && payStatus !== 'paid' ? <span className="pd__jobcard-sub"> {money(paid)} of {money(quoted)}</span> : null}
                                </>
                              ) : <span className="pd__jobcard-muted">—</span>}
                            </span>
                          </div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <section className="jh__open" aria-label={current.label}>
          <div className="jh__viewbar">
            <button type="button" className="jh__back" onClick={() => openView('home')} data-testid="project-home">
              <ArrowLeft size={16} aria-hidden /> Project home
            </button>
            <h2 className="jh__viewtitle"><current.Icon size={18} aria-hidden /> {current.label}</h2>
            <nav className="jh__switch" aria-label="Go to">
              {PROJECT_VIEWS.map((w) => (
                <button key={w.key} type="button" className={`jh__switch-btn${view === w.key ? ' jh__switch-btn--on' : ''}`} onClick={() => openView(w.key)} title={w.label} aria-label={w.label} aria-current={view === w.key ? 'page' : undefined}>
                  <w.Icon size={16} aria-hidden />
                </button>
              ))}
            </nav>
          </div>

          <div className="jh__view pd">
            {/* The project's files, in the standard structure (owner, 2026-09-10): project documents
                beside the job folders, each job holding Research / CAD / Photos / Videos / Documents. */}
            {view === 'files' && (
              <section className="pd__files" data-testid="project-files">
                <FolderExplorer
                  rootId={`mnt:projects:${project.id}`}
                  title={label}
                  refreshKey={filesRefresh}
                />
              </section>
            )}

            {view === 'media' && (
              <FolderExplorer rootId={`mnt:projects:${project.id}`} title="Photos & videos" layout="media" refreshKey={filesRefresh} />
            )}

            {/* The totals, plus recording a payment — including a partial one — against the project. */}
            {view === 'financial' && <ProjectMoneyPanel projectId={project.id} onChanged={load} />}

            {view === 'status' && (
              <div className="jh__stack">
                <section className="jh__card">
                  <h3 className="jh__card-title">Project status</h3>
                  <div className="pd__statusbar">
                    {PROJECT_STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={savingStatus}
                        onClick={() => setStatus(s)}
                        className={`pd__status${project.status === s ? ' is-on' : ''}`}
                        style={project.status === s
                          ? { background: `${PROJECT_STATUS_COLORS[s]}18`, color: PROJECT_STATUS_COLORS[s], borderColor: PROJECT_STATUS_COLORS[s] }
                          : undefined}
                        data-testid={`project-status-${s}`}
                      >
                        {project.status === s && <Check size={13} aria-hidden />} {PROJECT_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </section>
                {/* History (owner, 2026-10-11): every file added or changed and every edit, on the
                    project and all of its jobs. */}
                <section className="pd__history" data-testid="project-history">
                  <JobActivityFeed projectId={project.id} key={filesRefresh} />
                </section>
              </div>
            )}

            {view === 'info' && (
              <div className="jh__stack">
                <div className="pd__card">
                  <div className="jh__section-head">
                    <h3>Client</h3>
                    <Link href={`/admin/projects/${project.id}/edit`} className="jh__btn" data-testid="project-edit">
                      <Pencil size={14} aria-hidden /> Edit project
                    </Link>
                  </div>
                  {project.client_company && <p className="pd__line"><User size={13} aria-hidden /> {project.client_company}</p>}
                  {project.client_name && <p className="pd__line"><User size={13} aria-hidden /> {project.client_name}</p>}
                  {project.client_email && <p className="pd__line"><Mail size={13} aria-hidden /> <a href={`mailto:${project.client_email}`}>{project.client_email}</a></p>}
                  {project.client_phone && <p className="pd__line"><Phone size={13} aria-hidden /> <a href={`tel:${project.client_phone}`}>{project.client_phone}</a></p>}
                  {!hasClient && <p className="pd__note">No client details on this project.</p>}
                </div>
                <div className="pd__card"><h3>About</h3><p className="pd__line">{project.description || <span className="jh__muted">No description.</span>}</p></div>
                <div className="pd__card"><h3>Notes</h3><p className="pd__line">{project.notes || <span className="jh__muted">No notes.</span>}</p></div>
                <div className="jh__footer-actions">
                  <button type="button" className="jh__btn jh__btn--danger" onClick={remove} data-testid="project-delete">
                    <Trash2 size={14} aria-hidden /> Delete project
                  </button>
                </div>
                <p className="pd__note" style={{ textAlign: 'right' }}>A project can only be deleted once its jobs have been removed.</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
