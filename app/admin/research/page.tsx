// app/admin/research/page.tsx — Property Research project list
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { usePageError } from '../hooks/usePageError';
import type { ResearchProject, WorkflowStep } from '@/types/research';
import { WORKFLOW_STEPS } from '@/types/research';
import Tooltip from './components/Tooltip';
import AddressAutocomplete from '../components/AddressAutocomplete';

const STATUS_LABELS: Record<WorkflowStep, string> = {
  upload: 'Upload',
  configure: 'Configure',
  analyzing: 'Analyzing',
  review: 'Review',
  drawing: 'Drawing',
  verifying: 'Verifying',
  complete: 'Complete',
};

export default function ResearchListPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
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
  });

  const userRole = session?.user?.role || 'employee';

  // Admin-only guard — use useEffect so hooks are never called conditionally
  useEffect(() => {
    if (sessionStatus === 'authenticated' && userRole !== 'admin') {
      router.replace('/admin/dashboard');
    }
  }, [sessionStatus, userRole, router]);

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
    if (!newProject.parcel_id.trim() || creating) return;
    // Auto-generate project name from address or parcel ID if not provided
    const projectName = newProject.name.trim()
      || (newProject.property_address ? `${newProject.property_address}` : `Property ${newProject.parcel_id}`);
    setCreating(true);
    try {
      const res = await fetch('/api/admin/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newProject, name: projectName }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowCreate(false);
        setNewProject({ name: '', description: '', property_address: '', city: '', county: '', state: 'TX', zip: '', owner_name: '', parcel_id: '' });
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
  if (sessionStatus === 'authenticated' && userRole !== 'admin') return null;

  // Determine empty state message
  const hasActiveSearch = search.trim().length > 0;
  const hasActiveFilter = statusFilter !== 'all';

  return (
    <>
      <div className="research-page">
        {/* Header */}
        <div className="research-page__header">
          <h1 className="research-page__title">Property Research</h1>
          <div className="research-page__actions">
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
                style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '0 0.5rem', fontSize: '1.1rem' }}
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
          <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '0.85rem', marginTop: '1rem' }}>
            Showing {projects.length} of {total} projects
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {showCreate && (
        <div
          className="research-modal-overlay"
          onClick={() => setShowCreate(false)}
          onKeyDown={e => { if (e.key === 'Escape') setShowCreate(false); }}
          role="dialog"
          aria-modal="true"
          aria-label="New Research Project"
        >
          <div className="research-modal" onClick={e => e.stopPropagation()}>
            <h2 className="research-modal__title">New Research Project</h2>
            <form onSubmit={handleCreate}>
              {/* ── Property ID (Required) ── */}
              <div className="research-modal__field">
                <label className="research-modal__label">
                  <span className="job-form__label-row">
                    Property ID <span style={{ color: '#BD1218' }}>*</span>
                    <Tooltip text="The county appraisal district property ID. This is the primary identifier used to look up the exact parcel, retrieve deed/plat records, and center the GIS viewer. Find it on the county appraisal district website." position="right">
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
                  required
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
                  />
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

              <div className="research-modal__actions">
                <button type="button" className="research-modal__cancel" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="research-modal__submit" disabled={!newProject.parcel_id.trim() || creating}>
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
