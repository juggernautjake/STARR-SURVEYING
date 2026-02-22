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

  return (
    <div style={{
      background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.5rem',
      padding: '1rem 1.25rem', marginBottom: '1rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: expanded ? '0.75rem' : 0 }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#166534' }}>
          Analysis Results Summary
        </h3>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: '0.85rem' }}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {expanded && (
        <>
          {/* Quick stats row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
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
            <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: '#374151' }}>
              <strong>Point of Beginning:</strong> {summary.pobDescription}
            </div>
          )}

          {/* Boundary calls table */}
          {summary.calls.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.25rem' }}>
                Boundary Call Sequence ({summary.calls.length} calls)
              </div>
              <div style={{
                background: '#FFFFFF', border: '1px solid #D1D5DB', borderRadius: '0.375rem',
                maxHeight: 200, overflowY: 'auto', fontSize: '0.82rem',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', fontWeight: 600, color: '#6B7280' }}>#</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', fontWeight: 600, color: '#6B7280' }}>Bearing</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', fontWeight: 600, color: '#6B7280' }}>Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.calls.map((call, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '0.3rem 0.5rem', color: '#9CA3AF' }}>{call.seq}</td>
                        <td style={{ padding: '0.3rem 0.5rem', fontFamily: 'monospace' }}>{call.bearing || '—'}</td>
                        <td style={{ padding: '0.3rem 0.5rem', fontFamily: 'monospace' }}>{call.distance || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Monuments list */}
          {summary.monuments.length > 0 && (
            <div style={{ fontSize: '0.85rem', color: '#374151' }}>
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
      <span style={{ color: '#6B7280' }}>{label}: </span>
      <span style={{ fontWeight: 600, color: warn ? '#92400E' : '#111827' }}>{value}</span>
    </div>
  );
}
