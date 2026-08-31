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
import { WORKFLOW_STEPS } from '@/types/research';
import Tooltip from '../components/Tooltip';
import WorkerStatusBanner from '../components/WorkerStatusBanner';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import { checkCounty } from '@/lib/research/county-input';
import CountyNote, { countyDescribedBy, isCountyInvalid } from '../components/CountyNote';
import { Accordion } from '../components/ui';

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
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    property_address: '',
    city: '',
    county: '',
    state: 'TX',
    zip: '',
    owner_name: '',
    parcel_id: '',
  // Spend gate (seed 620). ON by default so behaviour matches every existing project;
    // the toggle below makes the choice explicit rather than inherited from a column default.
    allow_paid_documents: true,
  });

  /** A run needs SOME way to find the parcel — an address or a CAD id. Either is enough;
   *  neither is not. Declared here so the submit handler and the button agree on one rule
   *  rather than each testing its own condition and drifting apart. */
  const hasIdentifier = Boolean(
    newProject.parcel_id.trim() || newProject.property_address.trim(),
  );

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
    // Auto-generate project name from address or parcel ID if not provided
    const projectName = newProject.name.trim()
      || (newProject.property_address.trim() || `Property ${newProject.parcel_id.trim()}`);
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
        setShowCreate(false);
        setNewProject({ name: '', description: '', property_address: '', city: '', county: '', state: 'TX', zip: '', owner_name: '', parcel_id: '', allow_paid_documents: true });
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

  function getStepNumber(status: WorkflowStep): number {
    const step = WORKFLOW_STEPS.find(s => s.key === status);
    return step?.number || 1;
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
            <button
              className="research-page__new-btn"
              style={{ background: '#0F766E' }}
              onClick={() => router.push('/admin/research/coverage')}
              title="Texas county clerk adapter coverage"
            >
              Coverage
            </button>
            <button
              className="research-page__new-btn"
              style={{ background: '#7C3AED' }}
              onClick={() => router.push('/admin/research/testing')}
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

        {/* Error state */}
        {!loading && loadError && (
          <div className="research-page__empty">
            <div className="research-page__empty-title" style={{ color: '#DC2626' }}>{loadError}</div>
            <button className="research-page__new-btn" onClick={loadProjects} style={{ marginTop: '1rem' }}>
              Retry
            </button>
          </div>
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
                    Step {getStepNumber(project.status)} of 7
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

              {/* ── Property Address ── */}
              <div className="research-modal__field">
                <label className="research-modal__label">
                  <span className="job-form__label-row">
                    Property Address
                    <Tooltip text="Start typing to see address suggestions. Selecting an address will auto-fill city, county, state, and ZIP. Used alongside the Property ID for cross-referencing records." position="right">
                      <span className="job-form__info-icon">?</span>
                    </Tooltip>
                  </span>
                </label>
                <AddressAutocomplete
                  value={newProject.property_address}
                  onChange={val => setNewProject(p => ({ ...p, property_address: val }))}
                  onSelect={details => setNewProject(p => ({
                    ...p,
                    property_address: details.address || p.property_address,
                    city: details.city || p.city,
                    county: details.county || p.county,
                    state: details.state || p.state,
                    zip: details.zip || p.zip,
                  }))}
                  className="research-modal__input"
                  placeholder="Property address"
                  biasTexas={true}
                />
              </div>


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
                    placeholder="ZIP"
                    value={newProject.zip}
                    onChange={e => setNewProject(p => ({ ...p, zip: e.target.value }))}
                  />
                </div>
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
              </div>
              </Accordion>

              {/* A disabled button with no explanation is its own bug — it reads as broken
                  rather than as unmet. Say what is missing, and only while it is missing. */}
              {!hasIdentifier && (
                <div className="research-modal__hint" role="status">
                  Enter a property address or a Property ID — either one identifies the parcel.
                </div>
              )}

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
