// app/admin/research/pipeline/page.tsx — Phase 11 Research Pipeline Dashboard
// Shows batch jobs, flood zone queries, and chain-of-title lookups.
// Allows creating new batch jobs and monitoring progress in real time.
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BatchJob {
  id?: string;
  batch_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  property_count: number;
  completed_count: number;
  failed_count: number;
  created_at: string;
  completed_at?: string | null;
}

interface BatchProperty {
  address: string;
  county: string;
  state: string;
}

const STATUS_LABELS: Record<BatchJob['status'], string> = {
  queued: '⏳ Queued',
  running: '🔄 Running',
  completed: '✅ Completed',
  failed: '❌ Failed',
  cancelled: '🚫 Cancelled',
};

const STATUS_COLORS: Record<BatchJob['status'], string> = {
  queued:    '#F59E0B',
  running:   '#3B82F6',
  completed: '#10B981',
  failed:    '#EF4444',
  cancelled: '#9CA3AF',
};

// ── Page Component ─────────────────────────────────────────────────────────────

export default function PipelineDashboardPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Batch creation form
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [batchRows, setBatchRows] = useState<BatchProperty[]>([
    { address: '', county: '', state: 'TX' },
  ]);
  const [batchCreating, setBatchCreating] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Selected job for detail view
  const [selectedJob, setSelectedJob] = useState<BatchJob | null>(null);

  const userRoles = (session?.user as { roles?: string[] })?.roles || ['employee'];
  const canAccessPipeline = userRoles.includes('admin') || userRoles.includes('developer') || userRoles.includes('researcher');

  useEffect(() => {
    if (sessionStatus === 'authenticated' && !canAccessPipeline) {
      router.replace('/admin/dashboard');
    }
  }, [sessionStatus, canAccessPipeline, router]);

  const loadBatchJobs = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/research/batch');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { jobs: BatchJob[] };
      setBatchJobs(data.jobs ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load batch jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === 'authenticated' && canAccessPipeline) {
      void loadBatchJobs();
    }
  }, [sessionStatus, canAccessPipeline, loadBatchJobs]);

  // Auto-refresh running jobs every 10 seconds
  useEffect(() => {
    const running = batchJobs.some(j => j.status === 'queued' || j.status === 'running');
    if (!running) return;
    const id = setInterval(() => void loadBatchJobs(), 10_000);
    return () => clearInterval(id);
  }, [batchJobs, loadBatchJobs]);

  function addBatchRow() {
    setBatchRows(r => [...r, { address: '', county: '', state: 'TX' }]);
  }

  function removeBatchRow(idx: number) {
    setBatchRows(r => r.filter((_, i) => i !== idx));
  }

  function updateBatchRow(idx: number, field: keyof BatchProperty, value: string) {
    setBatchRows(r => r.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  }

  async function submitBatch(e: React.FormEvent) {
    e.preventDefault();
    const properties = batchRows.filter(r => r.address.trim() && r.county.trim());
    if (properties.length === 0) {
      setBatchError('Add at least one property with address and county.');
      return;
    }
    setBatchCreating(true);
    setBatchError(null);
    try {
      const res = await fetch('/api/admin/research/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties }),
      });
      const data = await res.json() as { batchId?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setShowCreateBatch(false);
      setBatchRows([{ address: '', county: '', state: 'TX' }]);
      await loadBatchJobs();
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : 'Failed to create batch');
    } finally {
      setBatchCreating(false);
    }
  }

  async function refreshJob(batchId: string) {
    try {
      const res = await fetch(`/api/admin/research/batch/${batchId}`);
      if (!res.ok) return;
      const updated = await res.json() as BatchJob & { batchId?: string };
      const normalized: BatchJob = { ...updated, batch_id: updated.batchId ?? updated.batch_id };
      setBatchJobs(prev => prev.map(j => j.batch_id === batchId ? { ...j, ...normalized } : j));
      if (selectedJob?.batch_id === batchId) {
        setSelectedJob(j => j ? { ...j, ...normalized } : j);
      }
    } catch {
      // ignore
    }
  }

  if (sessionStatus === 'loading') {
    return <div className="research-pipeline__loading">Loading…</div>;
  }

  return (
    <div className="research-pipeline">
      <div className="research-pipeline__header">
        <div className="research-pipeline__breadcrumb">
          <Link href="/admin/research" className="research-pipeline__back">
            ← Research Projects
          </Link>
        </div>
        <h1 className="research-pipeline__title">🔄 Research Pipeline Dashboard</h1>
        <p className="research-pipeline__subtitle">
          Phase 11 — Batch processing, flood zone queries, chain-of-title lookups.
        </p>
        <button
          className="research-pipeline__create-btn"
          onClick={() => setShowCreateBatch(v => !v)}
        >
          {showCreateBatch ? 'Cancel' : '+ New Batch Job'}
        </button>
      </div>

      {/* Batch creation form */}
      {showCreateBatch && (
        <div className="research-pipeline__create-panel">
          <h2 className="research-pipeline__create-title">New Batch Research Job</h2>
          <p className="research-pipeline__create-desc">
            Research multiple properties at once. The worker will process each address using
            the full 10-phase pipeline. Results are available in each project&apos;s detail page.
          </p>
          <form onSubmit={(e) => void submitBatch(e)}>
            <div className="research-pipeline__batch-table">
              <div className="research-pipeline__batch-header">
                <span>Property Address</span>
                <span>County</span>
                <span>State</span>
                <span></span>
              </div>
              {batchRows.map((row, idx) => (
                <div key={idx} className="research-pipeline__batch-row">
                  <input
                    className="research-pipeline__input"
                    type="text"
                    placeholder="1234 Main St, City"
                    value={row.address}
                    onChange={e => updateBatchRow(idx, 'address', e.target.value)}
                    required
                  />
                  <input
                    className="research-pipeline__input"
                    type="text"
                    placeholder="Bell"
                    value={row.county}
                    onChange={e => updateBatchRow(idx, 'county', e.target.value)}
                    required
                  />
                  <input
                    className="research-pipeline__input research-pipeline__input--short"
                    type="text"
                    placeholder="TX"
                    value={row.state}
                    onChange={e => updateBatchRow(idx, 'state', e.target.value)}
                    maxLength={2}
                  />
                  <button
                    type="button"
                    className="research-pipeline__remove-btn"
                    onClick={() => removeBatchRow(idx)}
                    disabled={batchRows.length === 1}
                    title="Remove row"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="research-pipeline__batch-actions">
              <button type="button" className="research-pipeline__add-row-btn" onClick={addBatchRow}>
                + Add Property
              </button>
              <span className="research-pipeline__batch-count">
                {batchRows.filter(r => r.address && r.county).length} of {batchRows.length} ready
              </span>
              {batchError && <span className="research-pipeline__error">{batchError}</span>}
              <button type="submit" className="research-pipeline__submit-btn" disabled={batchCreating}>
                {batchCreating ? 'Submitting…' : 'Submit Batch'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Batch jobs list */}
      <div className="research-pipeline__section">
        <div className="research-pipeline__section-header">
          <h2 className="research-pipeline__section-title">Batch Jobs</h2>
          <button className="research-pipeline__refresh-btn" onClick={() => void loadBatchJobs()} disabled={loading}>
            {loading ? '⏳' : '↻ Refresh'}
          </button>
        </div>

        {loadError && (
          <div className="research-pipeline__error-banner">{loadError}</div>
        )}

        {!loading && batchJobs.length === 0 && (
          <div className="research-pipeline__empty">
            No batch jobs yet. Create one above to research multiple properties at once.
          </div>
        )}

        {batchJobs.length > 0 && (
          <div className="research-pipeline__jobs">
            {batchJobs.map(job => (
              <div
                key={job.batch_id}
                className={`research-pipeline__job-card ${selectedJob?.batch_id === job.batch_id ? 'research-pipeline__job-card--selected' : ''}`}
                onClick={() => setSelectedJob(prev => prev?.batch_id === job.batch_id ? null : job)}
              >
                <div className="research-pipeline__job-id">
                  <code>{job.batch_id.slice(0, 16)}…</code>
                </div>
                <div
                  className="research-pipeline__job-status"
                  style={{ color: STATUS_COLORS[job.status] }}
                >
                  {STATUS_LABELS[job.status]}
                </div>
                <div className="research-pipeline__job-progress">
                  {job.completed_count}/{job.property_count} properties
                  {job.failed_count > 0 && (
                    <span className="research-pipeline__job-failed"> ({job.failed_count} failed)</span>
                  )}
                </div>
                {(job.status === 'queued' || job.status === 'running') && (
                  <div className="research-pipeline__job-progress-bar">
                    <div
                      className="research-pipeline__job-progress-fill"
                      style={{ width: `${job.property_count > 0 ? (job.completed_count / job.property_count) * 100 : 0}%` }}
                    />
                  </div>
                )}
                <div className="research-pipeline__job-date">
                  {new Date(job.created_at).toLocaleDateString()}
                </div>
                <button
                  className="research-pipeline__refresh-job-btn"
                  onClick={e => { e.stopPropagation(); void refreshJob(job.batch_id); }}
                  title="Refresh status"
                >
                  ↻
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How-to section */}
      <div className="research-pipeline__section research-pipeline__section--info">
        <h2 className="research-pipeline__section-title">📚 Phase 11 Capabilities</h2>
        <div className="research-pipeline__info-grid">
          <div className="research-pipeline__info-card">
            <div className="research-pipeline__info-icon">🌊</div>
            <div className="research-pipeline__info-content">
              <strong>FEMA Flood Zone</strong>
              <p>
                Look up NFHL flood zone designation for any property. Available on each project&apos;s
                detail page under the Pipeline tab.
              </p>
            </div>
          </div>
          <div className="research-pipeline__info-card">
            <div className="research-pipeline__info-icon">⛓️</div>
            <div className="research-pipeline__info-content">
              <strong>Chain of Title</strong>
              <p>
                Automatically trace grantor/grantee history through county clerk records.
                Available on each project&apos;s detail page under the Pipeline tab.
              </p>
            </div>
          </div>
          <div className="research-pipeline__info-card">
            <div className="research-pipeline__info-icon">📦</div>
            <div className="research-pipeline__info-content">
              <strong>Batch Processing</strong>
              <p>
                Research up to 50 properties in a single job. Results are stored per-property
                and accessible via the research project list.
              </p>
            </div>
          </div>
          <div className="research-pipeline__info-card">
            <div className="research-pipeline__info-icon">🏛️</div>
            <div className="research-pipeline__info-content">
              <strong>County Clerk Registry</strong>
              <p>
                Automatic routing to Kofile, Henschen, iDocket, or TexasFile based on county.
                17 counties pre-configured; others fall back to TexasFile aggregator.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
