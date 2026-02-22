// app/admin/research/page.tsx — Property Research project list
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { usePageError } from '../hooks/usePageError';
import type { ResearchProject, WorkflowStep } from '@/types/research';
import { WORKFLOW_STEPS } from '@/types/research';

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
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    property_address: '',
    county: '',
    state: 'TX',
  });

  const userRole = (session?.user as any)?.role || 'employee';

  // Admin-only guard
  if (sessionStatus === 'authenticated' && userRole !== 'admin') {
    router.replace('/admin/dashboard');
    return null;
  }

  useEffect(() => { loadProjects(); }, [statusFilter]);

  async function loadProjects() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/admin/research?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load projects' });
    }
    setLoading(false);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadProjects();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newProject.name.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject),
      });
      if (res.ok) {
        const data = await res.json();
        setShowCreate(false);
        setNewProject({ name: '', description: '', property_address: '', county: '', state: 'TX' });
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

  return (
    <>
      <div className="research-page">
        {/* Header */}
        <div className="research-page__header">
          <h1 className="research-page__title">Property Research</h1>
          <div className="research-page__actions">
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
            <button type="submit" className="research-page__search-btn">Search</button>
          </form>
          <div className="research-page__status-filters">
            {['all', 'upload', 'configure', 'analyzing', 'review', 'drawing', 'verifying', 'complete'].map(s => (
              <button
                key={s}
                className={`research-page__status-chip ${statusFilter === s ? 'research-page__status-chip--active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'All' : STATUS_LABELS[s as WorkflowStep]}
              </button>
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

        {/* Empty state */}
        {!loading && projects.length === 0 && (
          <div className="research-page__empty">
            <div className="research-page__empty-icon">🔬</div>
            <div className="research-page__empty-title">No research projects yet</div>
            <div className="research-page__empty-text">
              Create your first AI-powered property research project to analyze deeds, plats, and survey documents.
            </div>
            <button className="research-page__new-btn" onClick={() => setShowCreate(true)}>
              + New Research Project
            </button>
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
        <div className="research-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="research-modal" onClick={e => e.stopPropagation()}>
            <h2 className="research-modal__title">New Research Project</h2>
            <form onSubmit={handleCreate}>
              <div className="research-modal__field">
                <label className="research-modal__label">Project Name *</label>
                <input
                  className="research-modal__input"
                  type="text"
                  placeholder="e.g., Smith Property Boundary Survey"
                  value={newProject.name}
                  onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))}
                  autoFocus
                  required
                />
              </div>
              <div className="research-modal__field">
                <label className="research-modal__label">Property Address</label>
                <input
                  className="research-modal__input"
                  type="text"
                  placeholder="1234 Main St, Belton, TX 76513"
                  value={newProject.property_address}
                  onChange={e => setNewProject(p => ({ ...p, property_address: e.target.value }))}
                />
              </div>
              <div className="research-modal__row">
                <div className="research-modal__field">
                  <label className="research-modal__label">County</label>
                  <input
                    className="research-modal__input"
                    type="text"
                    placeholder="Bell"
                    value={newProject.county}
                    onChange={e => setNewProject(p => ({ ...p, county: e.target.value }))}
                  />
                </div>
                <div className="research-modal__field">
                  <label className="research-modal__label">State</label>
                  <input
                    className="research-modal__input"
                    type="text"
                    placeholder="TX"
                    value={newProject.state}
                    onChange={e => setNewProject(p => ({ ...p, state: e.target.value }))}
                  />
                </div>
              </div>
              <div className="research-modal__field">
                <label className="research-modal__label">Description</label>
                <textarea
                  className="research-modal__textarea"
                  placeholder="Brief description of the research project..."
                  value={newProject.description}
                  onChange={e => setNewProject(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="research-modal__actions">
                <button type="button" className="research-modal__cancel" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="research-modal__submit" disabled={!newProject.name.trim() || creating}>
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
