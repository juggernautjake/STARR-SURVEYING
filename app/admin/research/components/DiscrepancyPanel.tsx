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

  const loadDiscrepancies = useCallback(async () => {
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
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId, filterSeverity, filterStatus, onCountChange]);

  useEffect(() => {
    loadDiscrepancies();
  }, [loadDiscrepancies]);

  async function handleResolve(discrepancyId: string, status: ResolutionStatus, notes: string) {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/discrepancies/${discrepancyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_status: status, resolution_notes: notes }),
      });
      if (res.ok) {
        await loadDiscrepancies();
      }
    } catch { /* ignore */ }
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
