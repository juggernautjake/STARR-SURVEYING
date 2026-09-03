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
import { assessRunReadiness } from '@/lib/research/run-readiness';
import ScopeNotice from '../components/ScopeNotice';
import JobLinkPicker, { type JobSummary } from '../components/JobLinkPicker';
// `Accordion` was dropped with the "Optional details" disclosure — see the note on the form.
import { ErrorState } from '../components/ui';
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
    // ── A DEED WE ALREADY HAVE (seed 625) ──────────────────────────────────────────────────────
    //
    // The worker has accepted `instrumentNumber` since it was written, and the Bell orchestrator
    // SEEDS its deed-following cascade from it (orchestrator.ts:142). Nothing had ever handed it
    // one — no column, no field, and the route that starts a run never mentioned it. The cascade
    // has begun from nothing in every run ever made.
    instrument_number: '',
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
  /** Whether a RUN would be possible with what has been typed so far — the same function the run
   *  button and the API both call, so the three can never disagree about what "enough" means. */
  const readiness = assessRunReadiness({
    county: newProject.county,
    state: newProject.state,
    parcelId: newProject.parcel_id,
    instrumentNumber: newProject.instrument_number,
    streetNumber: newProject.street_number,
    streetName: newProject.street_name,
    city: newProject.city,
    zip: newProject.zip,
    ownerName: newProject.owner_name,
    documentCount: intakeFiles.length,
  });

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
          instrument_number: '', intake_notes: '', allow_paid_documents: true, job_id: null,
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
          <div className="research-modal research-modal--wide">
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
            <form onSubmit={handleCreate} className="research-modal__form">
              {/* ── EVERY FIELD IS VISIBLE ────────────────────────────────────────────────────
                  This form used to put City, ZIP, owner, project name and notes behind an
                  "Optional details" disclosure. The reasoning was that the required path is short
                  and the rest is optional — but "optional" and "hidden" are different claims, and
                  the second one was wrong here: City and ZIP change which parcel the search finds,
                  the owner name is what the clerk grantor/grantee search runs on, and the notes are
                  the only thing that reaches the AI about what the operator already knows.

                  Folding them away made the form look finished when it was nearly empty. Everything
                  is on screen now, grouped by the question it answers, so what is worth filling in
                  is visible without a click. */}

              {/* ══ WHERE IS THE PROPERTY ══════════════════════════════════════════════════ */}
              <fieldset className="research-modal__section">
                <legend className="research-modal__section-title">Where is it?</legend>
                <p className="research-modal__section-hint">
                  The street name or a Property ID is enough to start. County decides which clerk
                  and appraisal district get searched.
                </p>

                {/* Optional shortcut, and clearly labelled as one — Google Places is refusing this
                    key until the Places API is enabled on the Cloud project, so the fields below
                    have to stand on their own. Even when it works, a suggestion for a rural parcel
                    is frequently the road rather than the property, which is why it FILLS the
                    fields instead of replacing them. */}
                <div className="research-modal__field">
                  <label className="research-modal__label" htmlFor="np-quickfill">
                    <span className="job-form__label-row">
                      Quick fill from an address search
                      <span className="research-modal__optional">optional</span>
                      <Tooltip text="A shortcut, not a requirement. Pick a suggestion and it fills the fields below, which you can then correct. If suggestions are unavailable, type into the fields directly — they are what the run actually uses." position="right">
                        <span className="job-form__info-icon">?</span>
                      </Tooltip>
                    </span>
                  </label>
                  <AddressAutocomplete
                    id="np-quickfill"
                    value={newProject.property_address}
                    onChange={val => setNewProject(p => ({ ...p, property_address: val }))}
                    onSelect={details => setNewProject(p => {
                      // Same helper the server uses, so a suggestion and a hand-typed address end
                      // up as identical rows.
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
                    placeholder="Start typing an address…"
                    biasTexas={true}
                  />
                </div>

                {/* Number and name apart, because that is how every county appraisal district
                    indexes them — Bell CAD's form wants `StreetNumber:3779` and `W FM 436` as two
                    separate values. Keeping them separate here is what stopped the worker having to
                    guess where the number ended and the name began. */}
                <div className="research-modal__row research-modal__row--street">
                  <div className="research-modal__field">
                    <label className="research-modal__label" htmlFor="np-street-number">Number</label>
                    <input
                      id="np-street-number"
                      className="research-modal__input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="3779"
                      value={newProject.street_number}
                      onChange={e => setNewProject(p => ({ ...p, street_number: e.target.value }))}
                    />
                  </div>
                  <div className="research-modal__field">
                    <label className="research-modal__label" htmlFor="np-street-name">
                      <span className="job-form__label-row">
                        Street name
                        <Tooltip text="The road only — 'W FM 436', 'MAIN ST'. No city, state or ZIP: those have their own fields below, and including them here is what made past searches come back empty." position="right">
                          <span className="job-form__info-icon">?</span>
                        </Tooltip>
                      </span>
                    </label>
                    <input
                      id="np-street-name"
                      className="research-modal__input"
                      type="text"
                      autoComplete="off"
                      placeholder="W FM 436"
                      value={newProject.street_name}
                      onChange={e => setNewProject(p => ({ ...p, street_name: e.target.value }))}
                      // Pasting a whole address in here is the mistake this layout exists to
                      // prevent, and people will do it because every other address box in the
                      // world accepts one. Rather than silently keeping a third of it, everything
                      // the paste contained goes to the field that owns it.
                      onBlur={e => {
                        const v = e.target.value;
                        if (!v.includes(',')) return;
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
                  <div className="research-modal__field">
                    <label className="research-modal__label" htmlFor="np-unit">
                      <span className="job-form__label-row">
                        Unit
                        <Tooltip text="Suite, apartment or lot. Recorded on the project and shown in the report, but deliberately left OUT of appraisal-district searches — those are indexed by parcel, and a suite number turns a good search into an empty one." position="right">
                          <span className="job-form__info-icon">?</span>
                        </Tooltip>
                      </span>
                    </label>
                    <input
                      id="np-unit"
                      className="research-modal__input"
                      type="text"
                      autoComplete="off"
                      placeholder="Ste 200"
                      value={newProject.unit}
                      onChange={e => setNewProject(p => ({ ...p, unit: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="research-modal__row research-modal__row--citystatezip">
                  <div className="research-modal__field">
                    <label className="research-modal__label" htmlFor="np-city">City</label>
                    <input
                      id="np-city"
                      className="research-modal__input"
                      type="text"
                      autoComplete="off"
                      placeholder="Belton"
                      value={newProject.city}
                      onChange={e => setNewProject(p => ({ ...p, city: e.target.value }))}
                    />
                  </div>
                  <div className="research-modal__field">
                    <label className="research-modal__label" htmlFor="np-state">State</label>
                    <input
                      id="np-state"
                      className="research-modal__input"
                      type="text"
                      autoComplete="off"
                      maxLength={2}
                      placeholder="TX"
                      value={newProject.state}
                      onChange={e => setNewProject(p => ({ ...p, state: e.target.value.toUpperCase() }))}
                    />
                  </div>
                  <div className="research-modal__field">
                    <label className="research-modal__label" htmlFor="np-zip">ZIP</label>
                    <input
                      id="np-zip"
                      className="research-modal__input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={10}
                      placeholder="76513"
                      value={newProject.zip}
                      onChange={e => setNewProject(p => ({ ...p, zip: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="research-modal__field">
                  <label className="research-modal__label" htmlFor="np-county">
                    <span className="job-form__label-row">
                      County <span className="research-modal__required">required to run</span>
                      <Tooltip text="The routing key. It chooses which clerk portal and appraisal district are searched, and it decides whether the run costs anything — Bell and the other Kofile counties are free, elsewhere falls through to TexasFile at roughly $1-3 a document." position="right">
                        <span className="job-form__info-icon">?</span>
                      </Tooltip>
                    </span>
                  </label>
                  <input
                    id="np-county"
                    className="research-modal__input"
                    type="text"
                    autoComplete="off"
                    placeholder="Bell"
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
                      silently did not.

                      Deliberately NOT inferred from the city. Buda is in Hays County and this form
                      could say so, but a wrong county routes to the wrong clerk and returns a
                      confident report about somebody else's land — far worse than a blank field.
                      Ask; do not guess. */}
                  {jobHadNoCounty && !newProject.county.trim() && (
                    <div className="research-prefill-note" role="status">
                      This job has no county on it, so it could not be filled in. Research is routed
                      by county — add it here.
                    </div>
                  )}
                </div>

                {/* What the run will actually search for, spelled out before it starts. An operator
                    who can read this line catches a wrong field in a second instead of reading
                    "no appraisal record found" half an hour later. */}
                {composedAddress && (
                  <p className="research-modal__preview" role="status">
                    <span className="research-modal__preview-label">Searching for</span>
                    <strong>{composedAddress}</strong>
                  </p>
                )}
              </fieldset>

              {/* ══ WHAT ELSE IS ALREADY KNOWN ═════════════════════════════════════════════ */}
              <fieldset className="research-modal__section">
                <legend className="research-modal__section-title">What do you already know?</legend>
                <p className="research-modal__section-hint">
                  None of these are required, and every one of them makes the run faster and more
                  certain. A Property ID pins the exact parcel; an instrument number gives the deed
                  search a document to start from; an owner name is what the county clerk index is
                  searched on.
                </p>

                <div className="research-modal__row">
                  <div className="research-modal__field">
                    <label className="research-modal__label" htmlFor="np-parcel">
                      <span className="job-form__label-row">
                        Property ID
                        <Tooltip text="The county appraisal district's account number. The single strongest input there is — it identifies one parcel exactly, where an address can be ambiguous, and it centres the GIS viewer. Find it on the county appraisal district site." position="right">
                          <span className="job-form__info-icon">?</span>
                        </Tooltip>
                      </span>
                    </label>
                    <input
                      id="np-parcel"
                      className="research-modal__input"
                      type="text"
                      autoComplete="off"
                      placeholder="42156"
                      value={newProject.parcel_id}
                      onChange={e => setNewProject(p => ({ ...p, parcel_id: e.target.value }))}
                      autoFocus
                    />
                  </div>

                  {/* ── NEW, AND OVERDUE (seed 625) ────────────────────────────────────────
                      The worker has accepted an instrument number since it was written, and the
                      Bell orchestrator SEEDS its deed-following cascade with it. Nothing had ever
                      handed it one: there was no column, no field, and the route that starts a run
                      did not mention it. The cascade has begun from nothing in every run ever made.

                      Typing it into the notes does not count. That reaches the AI as prose and
                      never reaches the cascade, which reads a field. */}
                  <div className="research-modal__field">
                    <label className="research-modal__label" htmlFor="np-instrument">
                      <span className="job-form__label-row">
                        Instrument number
                        <Tooltip text="A deed or instrument number you already have — '2019-12345', or a volume and page like 'Vol 2466 Pg 385'. The deed search starts from this document instead of having to find one first, which is the fastest route into a chain of title. Type it exactly as the county writes it." position="right">
                          <span className="job-form__info-icon">?</span>
                        </Tooltip>
                      </span>
                    </label>
                    <input
                      id="np-instrument"
                      className="research-modal__input"
                      type="text"
                      autoComplete="off"
                      placeholder="2022074210"
                      value={newProject.instrument_number}
                      onChange={e => setNewProject(p => ({ ...p, instrument_number: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="research-modal__field">
                  <label className="research-modal__label" htmlFor="np-owner">
                    <span className="job-form__label-row">
                      Owner name
                      <Tooltip text="As recorded at the appraisal district — 'GOODNIGHT, W GENE ETUX'. The clerk index is searched by grantor AND grantee under this name, which is how deeds conveying the property are found." position="right">
                        <span className="job-form__info-icon">?</span>
                      </Tooltip>
                    </span>
                  </label>
                  <input
                    id="np-owner"
                    className="research-modal__input"
                    type="text"
                    autoComplete="off"
                    placeholder="SMITH, JOHN ETUX MARY"
                    value={newProject.owner_name}
                    onChange={e => setNewProject(p => ({ ...p, owner_name: e.target.value }))}
                  />
                </div>
              </fieldset>

              {/* ══ THE PROJECT ITSELF ═════════════════════════════════════════════════════ */}
              <fieldset className="research-modal__section">
                <legend className="research-modal__section-title">This project</legend>

                <div className="research-modal__field">
                  <label className="research-modal__label" htmlFor="np-name">
                    <span className="job-form__label-row">
                      Project name
                      <span className="research-modal__optional">auto-named if blank</span>
                    </span>
                  </label>
                  <input
                    id="np-name"
                    className="research-modal__input"
                    type="text"
                    autoComplete="off"
                    placeholder={composedAddress || 'Named from the address or Property ID'}
                    value={newProject.name}
                    onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))}
                  />
                </div>

                <div className="research-modal__field">
                  <label className="research-modal__label" htmlFor="np-notes">
                    <span className="job-form__label-row">
                      Notes for the research
                      <Tooltip text="What you know that no record will say. Specific documents to look for, a disputed line, a discrepancy you expect. This is given to the AI with the run, alongside anything you attach below." position="right">
                        <span className="job-form__info-icon">?</span>
                      </Tooltip>
                    </span>
                  </label>
                  <textarea
                    id="np-notes"
                    className="research-modal__textarea"
                    placeholder="e.g. Verify the east boundary — the neighbour disputes the fence line. Seller says 2.3 acres. Look for easements or ROW along FM 436."
                    value={newProject.description}
                    onChange={e => setNewProject(p => ({ ...p, description: e.target.value }))}
                    rows={3}
                  />
                  {/* This claim used to be in the tooltip and was FALSE — the notes were stored as
                      `analysis_metadata.user_notes` and read by nothing at all. Seed 624 gave them
                      a column and the pipeline route now puts them on `operatorNotes`, the channel
                      that reaches the briefing. Said in the open so the claim stays falsifiable. */}
                  <p className="research-modal__field-note">
                    Sent to the AI with the run.
                  </p>
                </div>

                {/* ── DOCUMENTS AT INTAKE ───────────────────────────────────────────────────
                    Somebody holding the deed, the old survey or the seller's plat had nowhere to
                    put it until after the project existed and the first run had already gone out
                    without it. Uses the project page's own signed-URL uploader, so there is one
                    size cap and one validation list rather than two that drift. */}
                <div className="research-modal__field">
                  <label className="research-modal__label" htmlFor="np-files">
                    <span className="job-form__label-row">
                      Documents and images
                      <Tooltip text="Deeds, plats, prior surveys, title commitments, photographs. They are attached to the project and given to the run, so the AI reads them alongside anything it finds itself. Up to 50 MB each." position="right">
                        <span className="job-form__info-icon">?</span>
                      </Tooltip>
                    </span>
                  </label>
                  <input
                    id="np-files"
                    className="research-modal__file"
                    type="file"
                    multiple
                    accept={ACCEPT_ATTRIBUTE}
                    onChange={e => {
                      const picked = Array.from(e.target.files ?? []);
                      // Validated at the keyboard. A 60 MB TIFF rejected here costs a re-pick;
                      // rejected after create, it costs a project that silently holds fewer
                      // documents than the operator believes it does.
                      const { valid, errors } = validateFiles(picked);
                      setIntakeFiles(valid);
                      setIntakeFileErrors(errors);
                    }}
                  />
                  {intakeFiles.length > 0 && (
                    <ul className="research-modal__filelist">
                      {intakeFiles.map(f => (
                        <li key={f.name}>
                          <span className="research-modal__filename">{f.name}</span>
                          <span className="research-modal__filesize">{formatFileSize(f.size)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {intakeFileErrors.map(err => (
                    <p key={err} className="research-modal__hint" role="alert">{err}</p>
                  ))}
                </div>

                {/* ── AND THE JOB, IF THERE IS ONE (Phase J2) ────────────────────────────────
                    Pre-filled and pre-selected when you arrive from a job (`?new=1&job=<id>`), and
                    settable by hand otherwise. Making the link at creation beats remembering to
                    make it later, which is what "research nobody billed for" looks like from the
                    inside. */}
                <div className="research-modal__field">
                  <JobLinkPicker
                    id="create-project-job"
                    value={newProject.job_id}
                    linked={createLinkedJob}
                    onChange={jobId => setNewProject(p => ({ ...p, job_id: jobId }))}
                    disabled={creating}
                  />
                </div>
              </fieldset>

              {/* ══ WHAT THIS WILL COST ════════════════════════════════════════════════════
                  Its own section rather than buried beside County, because it is the only choice
                  on this form that spends money. */}
              <fieldset className="research-modal__section">
                <legend className="research-modal__section-title">Spending</legend>
                <label className="research-modal__checkbox">
                  <input
                    type="checkbox"
                    checked={newProject.allow_paid_documents}
                    onChange={e => setNewProject(p => ({ ...p, allow_paid_documents: e.target.checked }))}
                    data-testid="allow-paid-documents"
                  />
                  <span>
                    <span className="research-modal__checkbox-title">Allow paid documents</span>
                    <span className="research-modal__checkbox-hint">
                      {newProject.allow_paid_documents
                        ? 'This run may buy deeds and plats where the county has no free portal — about $1–3 each, capped at $2.00 per run.'
                        : 'Free county sources only. The run still completes; anything behind a paywall is skipped, and the report says so rather than reporting it as missing from the record.'}
                    </span>
                  </span>
                </label>

                {/* ── SCOPE, BEFORE THE PROJECT EXISTS (Phase S3) ─────────────────────────────
                    Shown here and NOT enforced here, deliberately. Creating a record for a property
                    we cannot research is a reasonable thing to do — you may want it on file, or you
                    may be about to correct the state. What is refused is the RUN, on the button
                    that starts one and again in the API.

                    Finding out at creation rather than three screens later is the whole value. */}
                <ScopeNotice scope={checkScope(newProject.state, newProject.county)} id="scope-create" />
              </fieldset>

              {/* ── CAN THIS ACTUALLY BE RESEARCHED? ──────────────────────────────────────────
                  Shown, and deliberately NOT enforced here. Creating a record for a property that
                  cannot be researched yet is a perfectly reasonable thing to do — you may want it
                  on file, or you may be about to go and find the Property ID. What is refused is
                  the RUN, on the button that starts one and again in the API.

                  The value of saying it here is that the fields are in front of you. Learning on
                  the project page that the county was never filled in means going back for it. */}
              <div className={readiness.canRun ? "research-readiness research-readiness--ok" : "research-readiness"} role="status">
                <p className="research-readiness__headline">{readiness.headline}</p>
                {!readiness.canRun && (
                  <>
                    <p className="research-readiness__have">
                      <span className="research-readiness__label">So far</span> {readiness.have.join(", ")}.
                    </p>
                    <p className="research-readiness__label">Any one of these would let the run start</p>
                    <ul className="research-readiness__list">
                      {readiness.whatWouldWork.map(w => <li key={w}>{w}</li>)}
                    </ul>
                    <p className="research-readiness__footnote">
                      You can still create the project now and add the rest later.
                    </p>
                  </>
                )}
                {readiness.canRun && readiness.caution && (
                  <p className="research-readiness__caution">{readiness.caution}</p>
                )}
              </div>
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
