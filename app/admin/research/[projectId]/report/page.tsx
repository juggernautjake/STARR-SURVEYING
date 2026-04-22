'use client';

// app/admin/research/[projectId]/report/page.tsx
// Mobile-optimized field report — designed for surveyors on-site with a phone.
// Shows the most critical field data: confidence score, boundary calls,
// monuments, and discrepancies in a big, readable card-based layout.

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BoundaryInfo {
  type?: string;
  callCount?: number;
  confidence?: number;
  verified?: boolean;
  bearingsAndDistances?: string[];
  monuments?: string[];
}

interface DiscrepancyItem {
  id?: string;
  field?: string;
  description?: string;
  severity?: string;
  resolved?: boolean;
}

interface ProjectData {
  id: string;
  property_address?: string;
  county?: string;
  state?: string;
  status?: string;
  confidence_score?: number;
  legal_description?: string;
  created_at?: string;
  updated_at?: string;
}

interface ResearchResult {
  confidenceScore?: number;
  boundary?: BoundaryInfo;
  discrepancyCount?: number;
  discrepancies?: DiscrepancyItem[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function confidenceColor(score: number): string {
  const pct = score > 1 ? score : score * 100;
  if (pct >= 80) return '#16a34a';
  if (pct >= 60) return '#d97706';
  return '#dc2626';
}

function confidenceLabel(score: number): string {
  const pct = score > 1 ? score : score * 100;
  if (pct >= 80) return 'High';
  if (pct >= 60) return 'Medium';
  return 'Low';
}

function formatPct(score: number): string {
  const pct = score > 1 ? Math.round(score) : Math.round(score * 100);
  return `${pct}%`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FieldCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      border: '1px solid #e5e7eb',
      padding: '20px 18px',
      marginBottom: 14,
    }}>
      <h2 style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: '#6b7280',
        marginBottom: 12,
        margin: '0 0 12px 0',
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function BigNumber({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{
        fontSize: 48,
        fontWeight: 800,
        lineHeight: 1,
        color: color ?? '#111827',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
      <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function SeverityPill({ severity }: { severity?: string }) {
  const s = (severity ?? '').toLowerCase();
  const bg = s === 'critical' || s === 'high' ? '#fee2e2'
    : s === 'medium' ? '#fef3c7'
    : '#f3f4f6';
  const fg = s === 'critical' || s === 'high' ? '#991b1b'
    : s === 'medium' ? '#92400e'
    : '#374151';
  return (
    <span style={{
      background: bg,
      color: fg,
      fontSize: 12,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 9999,
    }}>
      {severity ?? 'info'}
    </span>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function FieldReportPage() {
  const params = useParams();
  const projectId = params?.projectId as string | undefined;
  const { data: session, status: authStatus } = useSession();

  const [project, setProject] = useState<ProjectData | null>(null);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllCalls, setShowAllCalls] = useState(false);
  const [showAllMonuments, setShowAllMonuments] = useState(false);

  useEffect(() => {
    if (!projectId || authStatus === 'loading') return;
    if (authStatus === 'unauthenticated') {
      setError('Please sign in to view this report.');
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch(`/api/admin/research?id=${projectId}`);
        if (!res.ok) {
          setError(res.status === 404 ? 'Project not found.' : 'Failed to load report.');
          return;
        }
        const data = await res.json() as { project?: ProjectData; result?: ResearchResult };
        setProject(data.project ?? null);
        setResult(data.result ?? null);
      } catch {
        setError('Failed to load report.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId, authStatus]);

  if (loading || authStatus === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <p style={{ color: '#9ca3af', fontSize: 15 }}>Loading field report…</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', padding: '0 16px' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 15 }}>{error ?? 'Report not found.'}</p>
          {projectId && (
            <Link href={`/admin/research/${projectId}`} style={{ color: '#2563eb', fontSize: 14, marginTop: 12, display: 'block' }}>
              ← Back to project
            </Link>
          )}
        </div>
      </div>
    );
  }

  const confScore = result?.confidenceScore ?? project.confidence_score;
  const boundary = result?.boundary ?? null;
  const calls = boundary?.bearingsAndDistances ?? [];
  const monuments = boundary?.monuments ?? [];
  const discrepancies = result?.discrepancies ?? [];
  const discCount = result?.discrepancyCount ?? discrepancies.length;
  const callCount = boundary?.callCount ?? calls.length;
  const visibleCalls = showAllCalls ? calls : calls.slice(0, 5);
  const visibleMonuments = showAllMonuments ? monuments : monuments.slice(0, 6);

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', overflowX: 'hidden' }}>
      {/* Top nav */}
      <div style={{
        background: '#1e3a5f',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <Link
          href={`/admin/research/${projectId}`}
          style={{
            color: '#93c5fd',
            fontSize: 14,
            textDecoration: 'none',
            minWidth: 44,
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          ← Back
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: '#93c5fd', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>
            Field Report
          </p>
          <p style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.property_address ?? 'Property Report'}
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 14px 40px' }}>

        {/* Property info */}
        <FieldCard title="Property">
          <p style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 4px 0', wordBreak: 'break-word' }}>
            {project.property_address ?? '—'}
          </p>
          {(project.county || project.state) && (
            <p style={{ fontSize: 15, color: '#6b7280', margin: '0 0 8px 0' }}>
              {[project.county, project.state].filter(Boolean).join(', ')}
            </p>
          )}
          <span style={{
            display: 'inline-block',
            background: project.status === 'complete' ? '#dcfce7' : project.status === 'analyzing' ? '#dbeafe' : '#f3f4f6',
            color: project.status === 'complete' ? '#166534' : project.status === 'analyzing' ? '#1e40af' : '#374151',
            fontSize: 13,
            fontWeight: 600,
            padding: '4px 12px',
            borderRadius: 9999,
          }}>
            {(project.status ?? 'unknown').replace(/_/g, ' ')}
          </span>
        </FieldCard>

        {/* Confidence score */}
        {confScore !== undefined && (
          <FieldCard title="Confidence Score">
            <BigNumber
              value={formatPct(confScore)}
              label={`${confidenceLabel(confScore)} Confidence`}
              color={confidenceColor(confScore)}
            />
            {boundary?.verified && (
              <p style={{ textAlign: 'center', fontSize: 14, color: '#16a34a', marginTop: 8 }}>
                ✓ Boundary verified
              </p>
            )}
          </FieldCard>
        )}

        {/* Boundary calls */}
        {callCount > 0 && (
          <FieldCard title={`Boundary Calls (${callCount} total)`}>
            {calls.length === 0 ? (
              <p style={{ fontSize: 15, color: '#6b7280' }}>{callCount} calls on record</p>
            ) : (
              <>
                <ol style={{ margin: 0, padding: '0 0 0 20px' }}>
                  {visibleCalls.map((call, i) => (
                    <li key={i} style={{
                      fontSize: 15,
                      color: '#111827',
                      padding: '6px 0',
                      borderBottom: i < visibleCalls.length - 1 ? '1px solid #f3f4f6' : 'none',
                      fontFamily: 'monospace',
                      wordBreak: 'break-word',
                    }}>
                      {call}
                    </li>
                  ))}
                </ol>
                {calls.length > 5 && (
                  <button
                    onClick={() => setShowAllCalls(v => !v)}
                    style={{
                      marginTop: 10,
                      background: 'none',
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      padding: '8px 16px',
                      fontSize: 14,
                      color: '#2563eb',
                      cursor: 'pointer',
                      minHeight: 44,
                      width: '100%',
                    }}
                  >
                    {showAllCalls ? 'Show fewer' : `Show all ${calls.length} calls`}
                  </button>
                )}
              </>
            )}
          </FieldCard>
        )}

        {/* Monuments */}
        {monuments.length > 0 && (
          <FieldCard title={`Monuments (${monuments.length})`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {visibleMonuments.map((m, i) => (
                <span key={i} style={{
                  background: '#eff6ff',
                  color: '#1e40af',
                  fontSize: 14,
                  fontWeight: 500,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #bfdbfe',
                }}>
                  {m}
                </span>
              ))}
            </div>
            {monuments.length > 6 && (
              <button
                onClick={() => setShowAllMonuments(v => !v)}
                style={{
                  marginTop: 10,
                  background: 'none',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  padding: '8px 16px',
                  fontSize: 14,
                  color: '#2563eb',
                  cursor: 'pointer',
                  minHeight: 44,
                  width: '100%',
                }}
              >
                {showAllMonuments ? 'Show fewer' : `Show all ${monuments.length} monuments`}
              </button>
            )}
          </FieldCard>
        )}

        {/* Discrepancies */}
        {discCount > 0 && (
          <FieldCard title={`Discrepancies (${discCount})`}>
            {discrepancies.length === 0 ? (
              <p style={{ fontSize: 15, color: '#6b7280' }}>{discCount} discrepancies on record</p>
            ) : (
              <div>
                {discrepancies.map((d, i) => (
                  <div key={d.id ?? i} style={{
                    padding: '10px 0',
                    borderBottom: i < discrepancies.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <SeverityPill severity={d.severity} />
                      {d.resolved && (
                        <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Resolved</span>
                      )}
                      {d.field && (
                        <span style={{ fontSize: 13, color: '#6b7280' }}>{d.field}</span>
                      )}
                    </div>
                    {d.description && (
                      <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.5 }}>
                        {d.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </FieldCard>
        )}

        {/* Legal description */}
        {project.legal_description && (
          <FieldCard title="Legal Description">
            <p style={{ fontSize: 14, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0, wordBreak: 'break-word' }}>
              {project.legal_description}
            </p>
          </FieldCard>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 24, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
            Powered by <strong style={{ color: '#2563eb' }}>Starr Compass</strong> — Starr Surveying Company, Belton, TX
          </p>
          <Link
            href={`/admin/research/${projectId}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 12,
              background: '#1e3a5f',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              padding: '12px 24px',
              borderRadius: 12,
              textDecoration: 'none',
              minHeight: 44,
            }}
          >
            Open Full Project →
          </Link>
        </div>
      </div>
    </div>
  );
}
