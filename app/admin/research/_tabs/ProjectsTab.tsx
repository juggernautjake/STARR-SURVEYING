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
import AddressAutocomplete from '../../components/AddressAutocomplete';
import { checkCounty } from '@/lib/research/county-input';
import CountyNote, { countyDescribedBy, isCountyInvalid } from '../components/CountyNote';
import { checkScope } from '@/lib/research/scope';
import ScopeNotice from '../components/ScopeNotice';
import JobLinkPicker, { type JobSummary } from '../components/JobLinkPicker';
import { Accordion, ErrorState } from '../components/ui';
import { composeAddress, splitStreetLine, splitFullAddress } from '@/lib/research/property-address';
// The SAME upload path the project page uses — signed URL straight to storage, a 50 MB cap, and
// per-file errors that do not stop the other files. Writing a second uploader here would have meant
// two size limits, two validation lists and two ways to fail.
import {
  uploadDocuments, validateFiles, formatFileSize, ACCEPT_ATTRIBUTE,
} from '../components/upload-documents';

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
  const [creating, setCreating] = useState(false);
  // Named, not just linked — see the note in JobLinkPicker. Set from the deep link, and by the
  // picker itself when somebody chooses one by hand.
  const [createLinkedJob, setCreateLinkedJob] = useState<JobSummary | null>(null);
  /* Set when we prefilled from a job that had no county on it. Measured 2026-08-31: FOUR of six
     jobs in this database have an empty or null county, so this is the common arrival, not an
     edge case worth skipping. */
  const [jobHadNoCounty, setJobHadNoCounty] = useState(false);
  /** Documents the operator already has, attached before the first run rather than after it. */
  const [intakeFiles, setIntakeFiles] = useState<File[]>([]);
  const [intakeFileErrors, setIntakeFileErrors] = useState<string[]>([]);
  /** Set when the project was created but its documents were not. Holds the navigation open — see
   *  `handleCreate`. */
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    property_address: '',
    // ── THE STREET, IN THE PARTS THE COUNTY ASKS FOR (seed 624) ────────────────────────────────
    //
    // `property_address` was the only street field, and the server flattened it together with the
    // city, state and ZIP into one string. The worker then tried to take it back apart — measured
    // on 2026-09-02, all THREE of its parsers failed on the format this app produced, because it
    // joined the state and ZIP with a comma (`TX, 76501`) and every one of them expects a space.
    // The street name they came away with was "MAIN ST, TEMPLE, TX, 76501", and that is what went
    // into the county appraisal district's street-name search box.
    //
    // Bell CAD's form wants `StreetNumber:123` and `MAIN` as two indexed fields. So does everyone
    // else's. These now travel that way from here to the search.
    street_number: '',
    street_name: '',
    unit: '',
    city: '',
    county: '',
    state: 'TX',
    zip: '',
    owner_name: '',
    parcel_id: '',
    /** Operator context, given to the AI. Distinct from `description`, which is the project's own
     *  blurb — though the server falls back to `description` for projects that only send that. */
    intake_notes: '',
  // Spend gate (seed 620). ON by default so behaviour matches every existing project;
    // the toggle below makes the choice explicit rather than inherited from a column default.
    allow_paid_documents: true,
    // J1/J2 — declared here so it is part of the state's TYPE and therefore part of the POST
    // body. Setting it only in the updater compiles (a spread does not trigger excess-property
    // checks) and then silently never reaches the server.
    job_id: null as string | null,
  });

  /** A run needs SOME way to find the parcel — an address or a CAD id. Either is enough;
   *  neither is not. Declared here so the submit handler and the button agree on one rule
   *  rather than each testing its own condition and drifting apart. */
  const hasIdentifier = Boolean(
    newProject.parcel_id.trim() || newProject.street_name.trim() || newProject.property_address.trim(),
  );

  /** The one-line address, composed from the parts for display and for the project name.
   *  Composed by the SAME function the server uses, so the card and the run can never disagree
   *  about which property this is. */
  const composedAddress = composeAddress({
    streetNumber: newProject.street_number,
    streetName: newProject.street_name,
    unit: newProject.unit,
    city: newProject.city,
    state: newProject.state,
    zip: newProject.zip,
  });

  /** County is the ROUTING KEY — it chooses the clerk portal, and Bell (Kofile, free) and a
   *  TexasFile county are different amounts of money. Checked against the 254-county list we
   *  already ship, as advice rather than a gate; see lib/research/county-input.ts. */
  const countyCheck = checkCounty(newProject.county);

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
  // `?new=1&job=<id>` opens the form already filled in from the job and already linked to it.
  //
  // The point is not saving keystrokes. It is that the address, county and state on a job have
  // already been checked by somebody — so the scope verdict the form shows is about a real
  // property rather than about what was typed, and the link that J1 made possible gets made by
  // default rather than remembered later.
  //
  // A failed lookup is silent: the modal still opens, empty, and somebody fills it in. Refusing to
  // open the form because a job could not be fetched would be a worse answer than an empty form.
  useEffect(() => {
    const jobId = searchParams?.get('job');
    if (!jobId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/jobs?id=${jobId}`);
        if (!res.ok) return;
        const { job } = await res.json() as {
          job?: { id: string; job_number?: string | null; name?: string | null;
                  address?: string | null; city?: string | null; state?: string | null;
                  zip?: string | null; county?: string | null };
        };
        if (cancelled || !job) return;
        setShowCreate(true);
        setNewProject(p => ({
          ...p,
          // The job's own values win over whatever is in the blank form, but an EMPTY field on the
          // job must not blank a default — `state` starts as 'TX' and a job with no state should
          // leave it there rather than clear it.
          name: job.name?.trim() || job.address?.trim() || p.name,
          property_address: job.address?.trim() || p.property_address,
          city: job.city?.trim() || p.city,
          county: job.county?.trim() || p.county,
          state: job.state?.trim() || p.state,
          zip: job.zip?.trim() || p.zip,
          job_id: job.id,
        }));
        setCreateLinkedJob(job);
        setJobHadNoCounty(!job.county?.trim());
      } catch { /* the modal still opens; somebody fills it in */ }
    })();
    return () => { cancelled = true; };
  }, [searchParams]);

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    // Either identifier will do. Requiring the CAD id sent people to the appraisal district
    // website before they could start a run they already had the address for — and the server
    // never required it (`parcel_id?.trim() || null`).
    if (!hasIdentifier || creating) return;
    // Auto-generate project name from address or parcel ID if not provided. Composed from the
    // parts, so a project created by typing the fields is named the same as one created from a
    // Places suggestion.
    const projectName = newProject.name.trim()
      || composedAddress
      || newProject.property_address.trim()
      || `Property ${newProject.parcel_id.trim()}`;
    setCreating(true);
    try {
      // Store the canonical spelling when we recognise the county. Routing matches on the name,
      // so "bell county" and "Bell" must not become two different things in the table — and the
      // operator should not have to guess which spelling we chose. An unrecognised value is sent
      // through untouched: the warning has already been shown, and silently rewriting something we
      // do not understand is worse than passing it on.
      const county = countyCheck.kind === 'ok' ? countyCheck.canonical : newProject.county;
      const res = await fetch('/api/admin/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newProject, county, name: projectName }),
      });
      if (res.ok) {
        const data = await res.json();

        // ── ATTACH THE OPERATOR'S OWN DOCUMENTS ────────────────────────────────────────────
        //
        // After the insert, because a document row needs a project to belong to. Deliberately NOT
        // fatal: the project exists and is usable, and destroying it because one PDF would not
        // upload would be a worse outcome than a project whose attachments need re-adding. What is
        // not acceptable is silence — an operator who attached four files and was shown nothing
        // would reasonably believe the run received them.
        let uploadFailed = false;
        setCreatedProjectId(data.project.id);
        if (intakeFiles.length > 0) {
          try {
            const outcome = await uploadDocuments(data.project.id, intakeFiles);
            if (outcome.errors.length > 0) {
              uploadFailed = true;
              // Named files, not a count. "2 files failed" sends somebody to compare two lists.
              setUploadWarning(
                `The project was created. ${outcome.errors.length} of your ${intakeFiles.length} ` +
                `document(s) did not upload and are NOT part of this project — ` +
                `${outcome.errors.join('; ')}. Add them from the project page before starting a run.`,
              );
            }
          } catch (err) {
            uploadFailed = true;
            setUploadWarning(
              `The project was created, but none of your ${intakeFiles.length} document(s) uploaded ` +
              `(${err instanceof Error ? err.message : String(err)}). Add them from the project page ` +
              `before starting a run.`,
            );
          }
        }

        // ── A FAILED UPLOAD HOLDS THE NAVIGATION ────────────────────────────────────────────
        //
        // Routing straight to the project page would render the warning for the length of one
        // frame and then unmount it. The operator would arrive at a project missing the documents
        // they attached, with nothing on screen having said so — and would start a run believing
        // the AI had them.
        //
        // On success it navigates as before. Nothing to read means nothing to stop for.
        if (uploadFailed) {
          setCreating(false);
          return;
        }

        setShowCreate(false);
        setNewProject({
          name: '', description: '', property_address: '',
          street_number: '', street_name: '', unit: '',
          city: '', county: '', state: 'TX', zip: '', owner_name: '', parcel_id: '',
          intake_notes: '', allow_paid_documents: true, job_id: null,
        });
        setIntakeFiles([]);
        setIntakeFileErrors([]);
      setJobHadNoCounty(false);
        router.push(`/admin/research/${data.project.id}`);
      } else {
        const err = await res.json();
        reportPageError(new Error(err.error || 'Failed to create project'), { element: 'create project' });
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'create project' });
    }
    setCreating(false);
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

      {/* Create Project Modal */}
      {showCreate && (
        // ── CLOSING IS DELIBERATE ONLY ──────────────────────────────────────────────────────
        // The overlay used to close on any click. Everything in this form is typed by hand —
        // the address, the county, the notes — and a stray click on the dimmed area threw all
        // of it away with no confirmation and no undo. A dismissal that costs five minutes of
        // typing must be something you MEANT to do, so it now takes the × or Cancel.
        //
        // Escape still works. It is a deliberate keypress rather than a slip, and a dialog you
        // cannot dismiss from the keyboard is a trap for anyone not using a mouse.
        <div
          className="research-modal-overlay"
          onKeyDown={e => { if (e.key === 'Escape') setShowCreate(false); }}
          role="dialog"
          aria-modal="true"
          aria-label="New Research Project"
        >
          <div className="research-modal">
            <div className="research-modal__header">
              <h2 className="research-modal__title">New Research Project</h2>
              <button
                type="button"
                className="research-modal__close"
                onClick={() => setShowCreate(false)}
                aria-label="Close"
                title="Close without saving"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreate}>
              {/* ── Property ID (optional — an address identifies a parcel too) ──────────────
                  It was `required` here and NEVER required on the server, which stores
                  `parcel_id?.trim() || null`. So the only thing the asterisk did was send you
                  to the appraisal district website before you could start a run you already
                  had the address for. What a run genuinely needs is SOME way to find the
                  parcel; an address is one, a CAD id is a better one. The form now asks for
                  at least one and says which. */}
              <div className="research-modal__field">
                <label className="research-modal__label">
                  <span className="job-form__label-row">
                    Property ID <span style={{ opacity: 0.6, fontWeight: 400 }}>(optional)</span>
                    <Tooltip text="The county appraisal district property ID. Optional — an address works too, and the run resolves the parcel from it. Supplying both is best: the ID pins the exact parcel where an address is ambiguous, and it centres the GIS viewer. Find it on the county appraisal district site." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input
                  className="research-modal__input"
                  type="text"
                  placeholder="Property ID"
                  value={newProject.parcel_id}
                  onChange={e => setNewProject(p => ({ ...p, parcel_id: e.target.value }))}
                  autoFocus
                />
              </div>

              {/* ── QUICK FILL ──────────────────────────────────────────────────────────────
                  Demoted from "the address field" to a convenience that FILLS the real fields
                  below. Two reasons, and the second is the one that matters:

                  1. Google Places is refusing this key right now — the Places API is not enabled
                     on the Cloud project, so `REQUEST_DENIED` comes back on every keystroke and
                     the component says so. If suggestions were the only way in, the form would be
                     unusable until somebody clicks a button in a console.

                  2. Even when it works, a selected suggestion was flattened into one string and
                     the parts thrown away. Filling the separate fields means the operator can SEE
                     what was understood, and correct it — a Places result for a rural parcel is
                     frequently the road, not the property. */}
              <div className="research-modal__field">
                <label className="research-modal__label">
                  <span className="job-form__label-row">
                    Quick fill from an address search
                    <Tooltip text="Optional shortcut. Pick a suggestion and it fills the street, city, county, state and ZIP fields below, which you can then correct. Everything here can be typed by hand instead — the fields below are what the run actually uses." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <AddressAutocomplete
                  value={newProject.property_address}
                  onChange={val => setNewProject(p => ({ ...p, property_address: val }))}
                  onSelect={details => setNewProject(p => {
                    // Split the chosen line into the parts the county search needs. Same helper the
                    // server uses, so a suggestion and a hand-typed address end up identical.
                    const street = splitStreetLine(details.address || '');
                    return {
                      ...p,
                      property_address: details.address || p.property_address,
                      street_number: street.streetNumber || p.street_number,
                      street_name: street.streetName || p.street_name,
                      unit: street.unit || p.unit,
                      city: details.city || p.city,
                      county: details.county || p.county,
                      state: details.state || p.state,
                      zip: details.zip || p.zip,
                    };
                  })}
                  className="research-modal__input"
                  placeholder="Start typing an address to fill the fields below"
                  biasTexas={true}
                />
              </div>

              {/* ── Street number + street name ─────────────────────────────────────────────
                  Separate because that is how every county appraisal district indexes them, and
                  because keeping them separate is the whole fix: nothing downstream has to guess
                  where the number ends and the name begins. */}
              <div className="research-modal__row">
                <div className="research-modal__field" style={{ flex: '0 0 30%' }}>
                  <label className="research-modal__label" htmlFor="np-street-number">
                    <span className="job-form__label-row">
                      Street number
                      <Tooltip text="The house or site number on its own — 3779. Leave blank for a rural parcel that has none; the street name alone is a valid search." position="right">
                        <span className="job-form__info-icon">?</span>
                      </Tooltip>
                    </span>
                  </label>
                  <input
                    id="np-street-number"
                    className="research-modal__input"
                    type="text"
                    inputMode="numeric"
                    placeholder="3779"
                    value={newProject.street_number}
                    onChange={e => setNewProject(p => ({ ...p, street_number: e.target.value }))}
                  />
                </div>
                <div className="research-modal__field">
                  <label className="research-modal__label" htmlFor="np-street-name">
                    <span className="job-form__label-row">
                      Street name
                      <Tooltip text="The road only — 'W FM 436', 'MAIN ST'. No city, state or ZIP: those have their own fields, and including them here is what made past searches fail." position="right">
                        <span className="job-form__info-icon">?</span>
                      </Tooltip>
                    </span>
                  </label>
                  <input
                    id="np-street-name"
                    className="research-modal__input"
                    type="text"
                    placeholder="W FM 436"
                    value={newProject.street_name}
                    onChange={e => setNewProject(p => ({ ...p, street_name: e.target.value }))}
                    // A typed-in city here is the exact failure this redesign removes, so it is
                    // worth catching at the keyboard rather than twenty minutes into a run.
                    onBlur={e => {
                      const v = e.target.value;
                      if (!v.includes(',')) return;
                      // Everything the paste contained goes to the field that owns it, rather than
                      // the city and ZIP being quietly dropped. Existing values win: this is a
                      // rescue, not an overwrite.
                      const a = splitFullAddress(v);
                      setNewProject(p => ({
                        ...p,
                        street_number: p.street_number || a.streetNumber,
                        street_name: a.streetName,
                        unit: p.unit || a.unit,
                        city: p.city || a.city,
                        state: p.state || a.state,
                        zip: p.zip || a.zip,
                      }));
                    }}
                  />
                </div>
              </div>

              {/* What the run will actually search for, spelled out. An operator who can see the
                  composed line before starting can catch a wrong field in a second, instead of
                  reading "no appraisal record found" half an hour later. */}
              {composedAddress && (
                <div className="research-modal__hint" role="status">
                  Searching for: <strong>{composedAddress}</strong>
                </div>
              )}


              {/* ── County + State ── */}
              <div className="research-modal__row">
                <div className="research-modal__field">
                  <label className="research-modal__label">
                    <span className="job-form__label-row">
                      County
                      <Tooltip text="The county where the property is located. Used to search county-specific deed records, plat maps, and appraisal data." position="right">
                        <span className="job-form__info-icon">?</span>
                      </Tooltip>
                    </span>
                  </label>
                  <input
                    className="research-modal__input"
                    type="text"
                    placeholder="County"
                    value={newProject.county}
                    onChange={e => setNewProject(p => ({ ...p, county: e.target.value }))}
                    aria-invalid={isCountyInvalid(countyCheck)}
                    aria-describedby={countyDescribedBy(countyCheck, 'county-check')}
                  />
                  {/* One component, two forms. The batch form asks the same question N times, so
                      copying this block would have put the check in two places and then twelve. */}
                  <CountyNote
                    check={countyCheck}
                    id="county-check"
                    typed={newProject.county}
                    onPick={s => setNewProject(p => ({ ...p, county: s }))}
                  />

                  {/* ── THE ONE FIELD THE JOB COULD NOT FILL IN ────────────────────────────────
                      CountyNote says nothing about an empty county, and that is right for a form
                      somebody is still typing into: a blank field is not a mistake yet.

                      Arriving from a job is a different situation. Everything else got filled in,
                      so the form LOOKS complete, and the one field that decides which clerk gets
                      searched — and therefore whether the run costs anything — is the one that
                      silently did not. Without this, the next signal is the run button refusing on
                      the project page, a screen away from the field that fixes it.

                      Deliberately NOT inferred from the city. Buda is in Hays County and this form
                      could say so, but a wrong county routes to the wrong clerk and returns a
                      confident report about somebody else's land — far worse than a blank field.
                      Ask; do not guess.

                      It clears the moment anything is typed, so it cannot nag. */}
                  {jobHadNoCounty && !newProject.county.trim() && (
                    <div className="research-prefill-note" role="status">
                      This job has no county on it, so it could not be filled in. Research is routed
                      by county — add it here.
                    </div>
                  )}
                </div>

                {/* ── PAID DOCUMENTS ───────────────────────────────────────────────────────────
                    Placed immediately after County on purpose: the county is what decides whether
                    this run costs anything. Bell, Coryell, Milam, Lampasas and Bosque route to free
                    clerk adapters; everywhere else falls through to TexasFile at roughly $1-3 a
                    document. Asking the question next to the field that answers it. */}
                <div className="research-modal__field research-modal__field--full">
                  <label
                    className="research-modal__label"
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={newProject.allow_paid_documents}
                      onChange={e => setNewProject(p => ({ ...p, allow_paid_documents: e.target.checked }))}
                      style={{ marginTop: 3, flexShrink: 0, width: 16, height: 16, cursor: 'pointer' }}
                      data-testid="allow-paid-documents"
                    />
                    <span>
                      <span style={{ fontWeight: 600 }}>Allow paid documents</span>
                      <span style={{ display: 'block', fontWeight: 400, fontSize: 12.5, opacity: 0.75, marginTop: 3, lineHeight: 1.45 }}>
                        {newProject.allow_paid_documents
                          ? 'This run may buy deeds and plats where the county has no free portal — about $1–3 each, capped at $2.00 per run.'
                          : 'Free county sources only. The run still completes; anything behind a paywall is skipped, and the report will say so rather than reporting it as missing from the record.'}
                      </span>
                    </span>
                  </label>
                </div>
                <div className="research-modal__field">
                  <label className="research-modal__label">State</label>
                  <input
                    className="research-modal__input"
                    type="text"
                    placeholder="State"
                    value={newProject.state}
                    onChange={e => setNewProject(p => ({ ...p, state: e.target.value }))}
                  />
                </div>
              </div>

              {/* ── OPTIONAL DETAILS ─────────────────────────────────────────────────────
                  The modal asked for twelve fields when the required path is three. City, ZIP,
                  owner and notes are all genuinely useful and none of them BLOCKS a run, so
                  they sit behind a disclosure rather than in front of it.

                  The summary keeps a closed section informative: it counts what is filled, so
                  folding this away never hides the fact that something is in there. And the
                  Accordion HIDES rather than unmounts, so a half-typed note survives a
                  collapse — losing typed text to a fold is the same defect as losing it to a
                  stray click on the overlay. */}
              <Accordion
                title="Optional details"
                summary={[
                  newProject.city && "city",
                  newProject.zip && "ZIP",
                  newProject.owner_name && "owner",
                  newProject.name && "name",
                  newProject.description && "notes",
                ].filter(Boolean).join(", ") || "none set"}
              >
              {/* ── City + ZIP ── */}
              <div className="research-modal__row">
                <div className="research-modal__field">
                  <label className="research-modal__label">City</label>
                  <input
                    className="research-modal__input"
                    type="text"
                    placeholder="City"
                    value={newProject.city}
                    onChange={e => setNewProject(p => ({ ...p, city: e.target.value }))}
                  />
                </div>
                <div className="research-modal__field">
                  <label className="research-modal__label">ZIP</label>
                  <input
                    className="research-modal__input"
                    type="text"
                    inputMode="numeric"
                    placeholder="ZIP"
                    value={newProject.zip}
                    onChange={e => setNewProject(p => ({ ...p, zip: e.target.value }))}
                  />
                </div>
              </div>
              {/* ── Unit ────────────────────────────────────────────────────────────────────
                  Down here rather than beside the street because it is the one address part
                  deliberately EXCLUDED from the county search: appraisal records are keyed to the
                  parcel, not the apartment, and a suite number in the search box turns a match
                  into a miss. It is kept for the report and the file, not for the lookup. */}
              <div className="research-modal__field">
                <label className="research-modal__label">
                  <span className="job-form__label-row">
                    Unit / Suite / Lot
                    <Tooltip text="Recorded on the project and shown in the report, but left out of appraisal-district searches on purpose — those are indexed by parcel, and a suite number makes an otherwise good search return nothing." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input
                  className="research-modal__input"
                  type="text"
                  placeholder="Suite 200"
                  value={newProject.unit}
                  onChange={e => setNewProject(p => ({ ...p, unit: e.target.value }))}
                />
              </div>
              {/* ── Owner Name ── */}
              <div className="research-modal__field">
                <label className="research-modal__label">
                  <span className="job-form__label-row">
                    Owner Name
                    <Tooltip text="Current property owner name as recorded on the appraisal district. Helps cross-reference deed records and verify the correct property." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input
                  className="research-modal__input"
                  type="text"
                  placeholder="Owner name"
                  value={newProject.owner_name}
                  onChange={e => setNewProject(p => ({ ...p, owner_name: e.target.value }))}
                />
              </div>

              {/* ── Project Name ── */}
              <div className="research-modal__field">
                <label className="research-modal__label">
                  <span className="job-form__label-row">
                    Project Name
                    <Tooltip text="A descriptive name for this research project. If left blank, it will be auto-generated from the address or property ID." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input
                  className="research-modal__input"
                  type="text"
                  placeholder="Auto-generated if blank"
                  value={newProject.name}
                  onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))}
                />
              </div>

              {/* ── Notes / Instructions ── */}
              <div className="research-modal__field">
                <label className="research-modal__label">
                  <span className="job-form__label-row">
                    Notes / Instructions
                    <Tooltip text="Include any specific documents to look for, known issues, special instructions, or areas of concern. These notes are included in the AI analysis context and will be considered alongside all extracted data." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <textarea
                  className="research-modal__textarea"
                  placeholder="e.g. Verify east boundary — neighbor disputes fence line. Look for easements/ROW along FM 436."
                  value={newProject.description}
                  onChange={e => setNewProject(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                />
                {/* ── THIS TOOLTIP WAS TELLING THE TRUTH ABOUT SOMETHING THAT DID NOT HAPPEN ──
                    "These notes are included in the AI analysis context" has been on this field
                    since it was built. The server stored them as `analysis_metadata.user_notes`,
                    and a grep across app/, lib/ and worker/src on 2026-09-02 found NOTHING that
                    read that key. The notes went into the database and stopped.

                    Seed 624 gives them a column, and the pipeline route now prepends them to
                    `operatorNotes` — the channel that already reaches the AI briefing. The
                    sentence below is here so the claim is visible and therefore falsifiable. */}
                <p className="research-modal__hint" style={{ marginTop: 6 }}>
                  Sent to the AI with the run, alongside anything you attach below.
                </p>
              </div>

              {/* ── DOCUMENTS AT INTAKE ─────────────────────────────────────────────────────
                  An operator holding the old survey, the deed or the seller's plat had nowhere to
                  put it until after the project existed and the first run had already gone out
                  without it. The same component the re-run dialog uses, so the size caps, the
                  rejection messages and the read path are one implementation rather than two. */}
              <div className="research-modal__field">
                <label className="research-modal__label">
                  <span className="job-form__label-row">
                    Documents you already have
                    <Tooltip text="Deeds, plats, prior surveys, title commitments. They are attached to the project and given to the run, so the AI reads them alongside anything it finds itself." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <input
                  className="research-modal__input"
                  type="file"
                  multiple
                  accept={ACCEPT_ATTRIBUTE}
                  onChange={e => {
                    const picked = Array.from(e.target.files ?? []);
                    // Validated at the KEYBOARD, not after the project exists. A 60 MB TIFF
                    // rejected here costs a re-pick; rejected after create, it costs a project
                    // that silently has fewer documents than the operator believes.
                    const { valid, errors } = validateFiles(picked);
                    setIntakeFiles(valid);
                    setIntakeFileErrors(errors);
                  }}
                />
                {intakeFiles.length > 0 && (
                  <ul className="research-modal__hint" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {intakeFiles.map(f => (
                      <li key={f.name}>{f.name} <span style={{ opacity: 0.7 }}>({formatFileSize(f.size)})</span></li>
                    ))}
                  </ul>
                )}
                {intakeFileErrors.map(err => (
                  <p key={err} className="research-modal__hint" role="alert" style={{ marginTop: 6 }}>{err}</p>
                ))}
              </div>
              </Accordion>

              {/* A disabled button with no explanation is its own bug — it reads as broken
                  rather than as unmet. Say what is missing, and only while it is missing. */}
              {!hasIdentifier && (
                <div className="research-modal__hint" role="status">
                  Enter a street name or a Property ID — either one identifies the parcel.
                </div>
              )}

              {/* The project exists and its documents do not. `role="alert"` because this is the
                  one outcome an operator must not walk past. */}
              {uploadWarning && (
                <div className="research-modal__hint" role="alert" style={{ fontWeight: 500 }}>
                  {uploadWarning}
                  {createdProjectId && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="research-modal__link-btn"
                        onClick={() => { setShowCreate(false); router.push(`/admin/research/${createdProjectId}`); }}
                      >
                        Open the project
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ── AND THE JOB, IF THERE IS ONE (Phase J2) ──────────────────────────────────
                  Pre-filled and pre-selected when you arrive from a job (`?new=1&job=<id>`), and
                  settable by hand otherwise. Making the link at creation beats remembering to make
                  it later, which is what "research nobody billed for" looks like from the inside. */}
              <div className="research-modal__field">
                <JobLinkPicker
                  id="create-project-job"
                  value={newProject.job_id}
                  linked={createLinkedJob}
                  onChange={jobId => setNewProject(p => ({ ...p, job_id: jobId }))}
                  disabled={creating}
                />
              </div>

              {/* ── SCOPE, BEFORE THE PROJECT EXISTS (Phase S3) ─────────────────────────────────
                  Shown here and NOT enforced here, deliberately. Creating a record for a property
                  we cannot research is a reasonable thing to do — you may want it on file, or you
                  may be about to correct the state. What is refused is the RUN, on the button that
                  starts one and again in the API.

                  Finding out at creation rather than three screens later is the whole value: the
                  county field already warns about spelling, and this is the same courtesy for the
                  question that decides whether the pipeline can do anything at all. */}
              <ScopeNotice scope={checkScope(newProject.state, newProject.county)} id="scope-create" />

              <div className="research-modal__actions">
                <button type="button" className="research-modal__cancel" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="research-modal__submit"
                  disabled={!hasIdentifier || creating}
                  title={hasIdentifier ? undefined : 'Enter an address or a Property ID first'}
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
