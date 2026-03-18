// app/admin/research/components/AnalysisSummary.tsx — Condensed analysis results shown after analysis completes
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ExtractedDataPoint, DataCategory } from '@/types/research';

interface AnalysisSummaryProps {
  projectId: string;
  stats: { data_point_count: number; discrepancy_count: number; resolved_count: number };
}

interface SummaryData {
  callCount: number;
  bearingCount: number;
  distanceCount: number;
  monumentCount: number;
  curveCount: number;
  areaValues: string[];
  pobDescription: string | null;
  easementCount: number;
  otherCount: number;
  calls: Array<{ seq: number; display: string; bearing?: string; distance?: string }>;
  monuments: Array<{ display: string; type?: string; condition?: string }>;
}

const EMPTY_SUMMARY: SummaryData = {
  callCount: 0, bearingCount: 0, distanceCount: 0, monumentCount: 0,
  curveCount: 0, areaValues: [], pobDescription: null, easementCount: 0,
  otherCount: 0, calls: [], monuments: [],
};

export default function AnalysisSummary({ projectId, stats }: AnalysisSummaryProps) {
  const [summary, setSummary] = useState<SummaryData>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/data-points`);
      if (!res.ok) return;
      const data = await res.json();
      const grouped: Record<string, ExtractedDataPoint[]> = data.grouped || {};

      const calls = (grouped.call || [])
        .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))
        .map(dp => {
          const nv = dp.normalized_value as Record<string, unknown> | null;
          const bearing = nv?.bearing as Record<string, unknown> | undefined;
          const distance = nv?.distance as Record<string, unknown> | undefined;
          return {
            seq: dp.sequence_order ?? 0,
            display: dp.display_value || dp.raw_value,
            bearing: bearing?.raw_text as string | undefined,
            distance: distance ? `${distance.value} ${distance.unit || 'ft'}` : undefined,
          };
        });

      const monuments = (grouped.monument || []).map(dp => {
        const nv = dp.normalized_value as Record<string, unknown> | null;
        return {
          display: dp.display_value || dp.raw_value,
          type: nv?.type as string | undefined,
          condition: nv?.condition as string | undefined,
        };
      });

      const areaValues = (grouped.area || []).map(dp => dp.display_value || dp.raw_value);
      const pobDps = grouped.point_of_beginning || [];

      setSummary({
        callCount: (grouped.call || []).length,
        bearingCount: (grouped.bearing || []).length,
        distanceCount: (grouped.distance || []).length,
        monumentCount: (grouped.monument || []).length,
        curveCount: (grouped.curve_data || []).length,
        areaValues,
        pobDescription: pobDps.length > 0 ? (pobDps[0].display_value || pobDps[0].raw_value) : null,
        easementCount: (grouped.easement || []).length,
        otherCount: Object.entries(grouped)
          .filter(([cat]) => !['call', 'bearing', 'distance', 'monument', 'curve_data', 'area', 'point_of_beginning', 'easement'].includes(cat))
          .reduce((sum, [, pts]) => sum + pts.length, 0),
        calls,
        monuments,
      });
    } catch { /* non-critical */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  if (loading) return null;

  const hasData = summary.callCount > 0 || summary.monumentCount > 0 || stats.data_point_count > 0;

  return (
    <div className="research-analysis-summary">
      <div className="research-analysis-summary__header">
        <h3 className="research-analysis-summary__title">
          Analysis Results Summary
        </h3>
        <button
          onClick={() => setExpanded(!expanded)}
          className="research-analysis-summary__toggle"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {expanded && (
        <>
          {!hasData && (
            <div className="research-analysis-summary__empty">
              No boundary calls or monuments were extracted. The analysis may need different document types.
            </div>
          )}

          {/* Quick stats row */}
          <div className="research-analysis-summary__chips">
            <StatChip label="Boundary Calls" value={summary.callCount} />
            <StatChip label="Monuments" value={summary.monumentCount} />
            <StatChip label="Curves" value={summary.curveCount} />
            <StatChip label="Easements" value={summary.easementCount} />
            {summary.areaValues.length > 0 && (
              <StatChip label="Area" value={summary.areaValues[0]} />
            )}
            {stats.discrepancy_count > 0 && (
              <StatChip label="Discrepancies" value={stats.discrepancy_count} warn />
            )}
          </div>

          {/* POB */}
          {summary.pobDescription && (
            <div className="research-analysis-summary__pob">
              <strong>Point of Beginning:</strong> {summary.pobDescription}
            </div>
          )}

          {/* Boundary calls table */}
          {summary.calls.length > 0 && (
            <div className="research-analysis-summary__section">
              <div className="research-analysis-summary__section-title">
                Boundary Call Sequence ({summary.calls.length} calls)
              </div>
              <div className="research-analysis-summary__table-wrap">
                <table className="research-analysis-summary__table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Bearing</th>
                      <th>Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.calls.map((call, i) => (
                      <tr key={i}>
                        <td style={{ color: '#4B5563', fontWeight: 500 }}>{call.seq}</td>
                        <td style={{ fontFamily: 'monospace', color: '#111827' }}>{call.bearing || '\u2014'}</td>
                        <td style={{ fontFamily: 'monospace', color: '#111827' }}>{call.distance || '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Monuments list */}
          {summary.monuments.length > 0 && (
            <div className="research-analysis-summary__monuments">
              <strong>Monuments:</strong>{' '}
              {summary.monuments.map((m, i) => (
                <span key={i}>
                  {i > 0 && ' | '}
                  {m.display}
                  {m.condition && <span style={{ color: m.condition === 'found' ? '#059669' : '#F59E0B', fontSize: '0.8rem' }}> ({m.condition})</span>}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatChip({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div style={{
      background: warn ? '#FEF3C7' : '#FFFFFF',
      border: `1px solid ${warn ? '#FDE68A' : '#D1D5DB'}`,
      borderRadius: '0.375rem',
      padding: '0.35rem 0.75rem',
      fontSize: '0.82rem',
    }}>
      <span style={{ color: '#374151' }}>{label}: </span>
      <span style={{ fontWeight: 600, color: warn ? '#92400E' : '#111827' }}>{value}</span>
    </div>
  );
}
