// app/admin/research/components/DiscrepancyPanel.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import DiscrepancyCard from './DiscrepancyCard';
import type { Discrepancy, DiscrepancySeverity, ResolutionStatus } from '@/types/research';
import { SEVERITY_CONFIG } from '@/types/research';

interface DiscrepancyPanelProps {
  projectId: string;
  onCountChange?: (total: number, resolved: number) => void;
}

export default function DiscrepancyPanel({ projectId, onCountChange }: DiscrepancyPanelProps) {
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    by_severity: Record<string, number>;
    open_count: number;
    resolved_count: number;
  }>({ total: 0, by_severity: {}, open_count: 0, resolved_count: 0 });
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  // Labels for the source documents in each conflict (plan R20). Without these the sources are
  // rendered as UUIDs, which is barely better than not rendering them at all.
  const [documentLabels, setDocumentLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/research/${projectId}/documents`);
        if (!res.ok) return;
        const data = await res.json();
        const labels: Record<string, string> = {};
        for (const doc of (data.documents ?? []) as Array<{
          id: string; document_label?: string | null; recording_info?: string | null;
          recorded_date?: string | null; document_type?: string | null; original_filename?: string | null;
        }>) {
          // What a surveyor would call it: "1968 warranty deed (Instr. 2019-12345)".
          const year = doc.recorded_date?.slice(0, 4);
          const kind = doc.document_type?.replace(/_/g, ' ');
          labels[doc.id] =
            doc.document_label
            || [year, kind].filter(Boolean).join(' ')
            || doc.recording_info
            || doc.original_filename
            || 'an unnamed document';
        }
        if (!cancelled) setDocumentLabels(labels);
      } catch { /* labels are an enhancement; the conflict still renders without them */ }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const loadDiscrepancies = useCallback(async () => {
    setError(null);
    try {
      let url = `/api/admin/research/${projectId}/discrepancies`;
      const params: string[] = [];
      if (filterSeverity !== 'all') params.push(`severity=${filterSeverity}`);
      if (filterStatus !== 'all') params.push(`status=${filterStatus}`);
      if (params.length) url += `?${params.join('&')}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setDiscrepancies(data.discrepancies || []);
        setSummary(data.summary || { total: 0, by_severity: {}, open_count: 0, resolved_count: 0 });
        onCountChange?.(data.summary?.total || 0, data.summary?.resolved_count || 0);
      } else {
        setError('Failed to load discrepancies. Please try again.');
      }
    } catch {
      setError('Unable to connect. Check your internet connection.');
    }
    setLoading(false);
  }, [projectId, filterSeverity, filterStatus, onCountChange]);

  useEffect(() => {
    loadDiscrepancies();
  }, [loadDiscrepancies]);

  async function handleResolve(discrepancyId: string, status: ResolutionStatus, notes: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/discrepancies/${discrepancyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_status: status, resolution_notes: notes }),
      });
      if (res.ok) {
        await loadDiscrepancies();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to update discrepancy. Please try again.');
      }
    } catch {
      setError('Unable to save changes. Check your internet connection.');
    }
  }

  // Severity order for display (most severe first)
  const severityOrder: DiscrepancySeverity[] = ['error', 'contradiction', 'discrepancy', 'uncertain', 'unclear', 'info'];

  if (loading) {
    return (
      <div className="research-review__loading">
        <div className="research-card__skeleton-line research-card__skeleton-line--long" />
        <div className="research-card__skeleton-line research-card__skeleton-line--medium" />
      </div>
    );
  }

  if (summary.total === 0) {
    return (
      <div className="research-review__empty">
        No discrepancies found — all extracted data is consistent across documents.
      </div>
    );
  }

  return (
    <div className="research-disc-panel">
      {/* Error banner */}
      {error && (
        <div className="research-disc-panel__error" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontWeight: 'bold' }}>&times;</button>
        </div>
      )}

      {/* Summary bar */}
      <div className="research-disc-panel__summary">
        <span className="research-disc-panel__summary-total">
          {summary.total} discrepanc{summary.total === 1 ? 'y' : 'ies'}
        </span>
        <span className="research-disc-panel__summary-sep">&middot;</span>
        <span className="research-disc-panel__summary-open">
          {summary.open_count} open
        </span>
        <span className="research-disc-panel__summary-sep">&middot;</span>
        <span className="research-disc-panel__summary-resolved">
          {summary.resolved_count} resolved
        </span>
      </div>

      {/* Severity filter chips */}
      <div className="research-disc-panel__filters">
        <button
          className={`research-disc-panel__filter ${filterSeverity === 'all' ? 'research-disc-panel__filter--active' : ''}`}
          onClick={() => setFilterSeverity('all')}
        >
          All
        </button>
        {severityOrder.map(sev => {
          const count = summary.by_severity[sev] || 0;
          if (count === 0) return null;
          const cfg = SEVERITY_CONFIG[sev];
          return (
            <button
              key={sev}
              className={`research-disc-panel__filter ${filterSeverity === sev ? 'research-disc-panel__filter--active' : ''}`}
              onClick={() => setFilterSeverity(sev)}
              style={filterSeverity === sev ? { background: cfg.color, borderColor: cfg.color, color: '#fff' } : {}}
            >
              {cfg.icon} {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Status filter */}
      <div className="research-disc-panel__status-filter">
        <button
          className={`research-disc-panel__status-btn ${filterStatus === 'all' ? 'research-disc-panel__status-btn--active' : ''}`}
          onClick={() => setFilterStatus('all')}
        >
          All
        </button>
        <button
          className={`research-disc-panel__status-btn ${filterStatus === 'open' ? 'research-disc-panel__status-btn--active' : ''}`}
          onClick={() => setFilterStatus('open')}
        >
          Open
        </button>
        <button
          className={`research-disc-panel__status-btn ${filterStatus === 'resolved' ? 'research-disc-panel__status-btn--active' : ''}`}
          onClick={() => setFilterStatus('resolved')}
        >
          Resolved
        </button>
      </div>

      {/* Discrepancy cards */}
      <div className="research-disc-panel__list">
        {discrepancies.map(d => (
          <DiscrepancyCard
            key={d.id}
            discrepancy={d}
            onResolve={handleResolve}
            documentLabels={documentLabels}
          />
        ))}
        {discrepancies.length === 0 && (
          <div className="research-review__empty">
            No discrepancies match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
