// app/admin/research/components/BriefingPanel.tsx
// Comprehensive plain-English survey briefing panel
'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

interface BoundaryLine {
  index: number;
  description: string;
  raw: string;
  confidence: number;
  has_discrepancy: boolean;
  monument_at_end: string | null;
}

interface Monument {
  description: string;
  type: string;
  condition: string;
  sequence_order: number | null;
  confidence: number;
  has_discrepancy: boolean;
}

interface Easement {
  description: string;
  type: string;
  width: number | null;
  purpose: string | null;
  grantee: string | null;
  source_doc: string;
}

interface OtherConsideration {
  category: string;
  description: string;
  source_doc: string;
}

interface DiscrepancySummary {
  total: number;
  open: number;
  critical: number;
  items: { title: string; severity: string; affects_boundary: boolean }[];
}

interface BriefingData {
  summary: string[];
  sections: {
    boundary_lines: BoundaryLine[];
    monuments: Monument[];
    easements: Easement[];
    utilities: { description: string; source_doc: string }[];
    other_considerations: OtherConsideration[];
    areas: { description: string; confidence: number }[];
    pob: string | null;
    legal_refs: { category: string; description: string }[];
    discrepancies: DiscrepancySummary;
  };
  meta: {
    data_point_count: number;
    document_count: number;
    generated_at: string;
  };
}

interface BriefingPanelProps {
  projectId: string;
  onClose?: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  setback: 'Setback',
  right_of_way: 'Right of Way',
  zoning: 'Zoning',
  flood_zone: 'Flood Zone',
  annotation: 'Note',
  other: 'Other',
};

const MONUMENT_TYPE_ICONS: Record<string, string> = {
  iron_rod: '⬤',
  iron_pipe: '⬤',
  concrete: '⬛',
  stone: '⬛',
  pk_nail: '▲',
  mag_nail: '▲',
  rebar: '⬤',
  unknown: '◇',
};

function monumentIcon(type: string): string {
  const key = Object.keys(MONUMENT_TYPE_ICONS).find(k => type.toLowerCase().includes(k.split('_')[0]));
  return key ? MONUMENT_TYPE_ICONS[key] : '◇';
}

function confidenceColor(score: number): string {
  if (score >= 80) return '#059669';
  if (score >= 60) return '#2563EB';
  if (score >= 40) return '#F59E0B';
  return '#EF4444';
}

// ── Component ────────────────────────────────────────────────────────────────

export default function BriefingPanel({ projectId, onClose }: BriefingPanelProps) {
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('summary');
  const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set());

  const loadBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/briefing`);
      if (res.ok) {
        const data = await res.json();
        setBriefing(data.briefing);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to load briefing');
      }
    } catch {
      setError('Unable to load briefing. Please check your connection.');
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadBriefing();
  }, [loadBriefing]);

  function toggleLine(idx: number) {
    setExpandedLines(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="research-briefing">
        <div className="research-briefing__header">
          <h2 className="research-briefing__title">Survey Briefing</h2>
          {onClose && <button className="research-briefing__close" onClick={onClose} aria-label="Close">×</button>}
        </div>
        <div className="research-briefing__loading">
          <div className="research-analyzing__spinner" style={{ marginBottom: '0.75rem' }} />
          <span style={{ color: '#6B7280', fontSize: '0.9rem' }}>Generating briefing…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="research-briefing">
        <div className="research-briefing__header">
          <h2 className="research-briefing__title">Survey Briefing</h2>
          {onClose && <button className="research-briefing__close" onClick={onClose} aria-label="Close">×</button>}
        </div>
        <div style={{ padding: '1rem', color: '#EF4444', fontSize: '0.9rem' }}>
          {error}
          <button onClick={loadBriefing} style={{ marginLeft: '1rem', color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!briefing) return null;

  const { sections, meta } = briefing;

  const tabs = [
    { key: 'summary', label: 'Summary', count: 0 },
    { key: 'boundary', label: 'Boundary', count: sections.boundary_lines.length },
    { key: 'markers', label: 'Corner Markers', count: sections.monuments.length },
    { key: 'easements', label: 'Easements', count: sections.easements.length },
    { key: 'other', label: 'Other', count: sections.utilities.length + sections.other_considerations.length },
    { key: 'issues', label: 'Issues', count: sections.discrepancies.open },
  ];

  return (
    <div className="research-briefing">
      {/* Header */}
      <div className="research-briefing__header">
        <div>
          <h2 className="research-briefing__title">📋 Survey Briefing</h2>
          <div className="research-briefing__meta">
            {meta.data_point_count} data points from {meta.document_count} document{meta.document_count !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={loadBriefing}
            className="research-briefing__refresh"
            title="Refresh briefing"
          >
            ↺ Refresh
          </button>
          {onClose && (
            <button className="research-briefing__close" onClick={onClose} aria-label="Close briefing">×</button>
          )}
        </div>
      </div>

      {/* Section tabs */}
      <div className="research-briefing__tabs">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`research-briefing__tab ${activeSection === tab.key ? 'research-briefing__tab--active' : ''}`}
            onClick={() => setActiveSection(tab.key)}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`research-briefing__tab-badge ${tab.key === 'issues' && sections.discrepancies.critical > 0 ? 'research-briefing__tab-badge--critical' : ''}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="research-briefing__body">

        {/* ── Summary Tab ─────────────────────────────────────────────── */}
        {activeSection === 'summary' && (
          <div className="research-briefing__section">
            <p style={{ color: '#6B7280', fontSize: '0.8rem', marginBottom: '1rem' }}>
              This briefing summarizes all surveying data extracted from the uploaded documents. Each section provides specific findings for quick reference.
            </p>
            <div className="research-briefing__summary-list">
              {briefing.summary.map((line, i) => {
                const isBullet = line.startsWith('  ');
                const isWarning = line.startsWith('⚠');
                return (
                  <div
                    key={i}
                    className={`research-briefing__summary-line ${isBullet ? 'research-briefing__summary-line--indent' : ''} ${isWarning ? 'research-briefing__summary-line--warn' : ''}`}
                  >
                    {line.trim()}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Boundary Lines Tab ──────────────────────────────────────── */}
        {activeSection === 'boundary' && (
          <div className="research-briefing__section">
            {sections.boundary_lines.length === 0 ? (
              <div className="research-briefing__empty">No boundary call data was extracted from the provided documents.</div>
            ) : (
              <>
                <p style={{ color: '#6B7280', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
                  These are the metes-and-bounds calls that define the property boundary, listed in sequence. Each call specifies a direction (bearing) and distance.
                </p>
                {sections.pob && (
                  <div className="research-briefing__pob">
                    <span style={{ fontWeight: 600 }}>Point of Beginning:</span> {sections.pob}
                  </div>
                )}
                <div className="research-briefing__call-list">
                  {sections.boundary_lines.map(line => (
                    <div
                      key={line.index}
                      className={`research-briefing__call ${line.has_discrepancy ? 'research-briefing__call--warn' : ''}`}
                    >
                      <div className="research-briefing__call-header" onClick={() => toggleLine(line.index)}>
                        <span className="research-briefing__call-num">Call {line.index}</span>
                        <span className="research-briefing__call-desc">{line.description}</span>
                        <span className="research-briefing__call-conf" style={{ color: confidenceColor(line.confidence) }}>
                          {Math.round(line.confidence)}%
                        </span>
                        {line.has_discrepancy && <span className="research-briefing__call-flag" title="Discrepancy flagged">⚠</span>}
                        <span className="research-briefing__call-toggle">{expandedLines.has(line.index) ? '▲' : '▼'}</span>
                      </div>
                      {expandedLines.has(line.index) && (
                        <div className="research-briefing__call-detail">
                          <div><span style={{ color: '#6B7280' }}>Raw:</span> {line.raw}</div>
                          {line.monument_at_end && (
                            <div><span style={{ color: '#6B7280' }}>Monument at end:</span> {line.monument_at_end}</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {sections.areas.length > 0 && (
                  <div className="research-briefing__area-box">
                    <strong>Area:</strong> {sections.areas.map(a => a.description).join(' / ')}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Corner Markers Tab ──────────────────────────────────────── */}
        {activeSection === 'markers' && (
          <div className="research-briefing__section">
            {sections.monuments.length === 0 ? (
              <div className="research-briefing__empty">No corner or boundary markers were specifically identified in the documents.</div>
            ) : (
              <>
                <p style={{ color: '#6B7280', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
                  Corner and boundary markers are physical monuments that mark the corners and lines of the survey. &ldquo;Found&rdquo; means an existing marker was located; &ldquo;Set&rdquo; means a new marker was placed.
                </p>
                <div className="research-briefing__monument-list">
                  {sections.monuments.map((mon, i) => (
                    <div
                      key={i}
                      className={`research-briefing__monument ${mon.has_discrepancy ? 'research-briefing__monument--warn' : ''}`}
                    >
                      <div className="research-briefing__monument-icon">
                        {monumentIcon(mon.type)}
                      </div>
                      <div className="research-briefing__monument-info">
                        <div className="research-briefing__monument-desc">{mon.description}</div>
                        <div className="research-briefing__monument-meta">
                          <span className={`research-briefing__monument-condition research-briefing__monument-condition--${mon.condition}`}>
                            {mon.condition === 'found' ? '✓ Found' : mon.condition === 'set' ? '+ Set' : mon.condition}
                          </span>
                          {mon.type && mon.type !== 'unknown' && (
                            <span style={{ color: '#6B7280', fontSize: '0.78rem' }}>{mon.type.replace(/_/g, ' ')}</span>
                          )}
                          {mon.sequence_order !== null && mon.sequence_order !== undefined && (
                            <span style={{ color: '#9CA3AF', fontSize: '0.75rem' }}>Point {mon.sequence_order}</span>
                          )}
                          <span style={{ color: confidenceColor(mon.confidence), fontSize: '0.75rem' }}>
                            {Math.round(mon.confidence)}% confidence
                          </span>
                          {mon.has_discrepancy && <span style={{ color: '#EF4444' }}>⚠ discrepancy</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Easements Tab ───────────────────────────────────────────── */}
        {activeSection === 'easements' && (
          <div className="research-briefing__section">
            {sections.easements.length === 0 ? (
              <div className="research-briefing__empty">No easements were identified in the provided documents.</div>
            ) : (
              <>
                <p style={{ color: '#6B7280', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
                  Easements grant specific rights to use a portion of the property for a defined purpose. They are typically recorded with the deed or in separate instruments.
                </p>
                <div className="research-briefing__easement-list">
                  {sections.easements.map((e, i) => (
                    <div key={i} className="research-briefing__easement">
                      <div className="research-briefing__easement-type">
                        🛤️ {e.type.replace(/_/g, ' ')}
                        {e.width !== null && <span style={{ marginLeft: '0.5rem', color: '#6B7280', fontWeight: 400 }}>({e.width} ft wide)</span>}
                      </div>
                      <div className="research-briefing__easement-desc">{e.description}</div>
                      <div className="research-briefing__easement-meta">
                        {e.purpose && <span>Purpose: {e.purpose}</span>}
                        {e.grantee && <span>Grantee: {e.grantee}</span>}
                        <span style={{ color: '#9CA3AF' }}>Source: {e.source_doc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Other Tab ───────────────────────────────────────────────── */}
        {activeSection === 'other' && (
          <div className="research-briefing__section">
            {sections.utilities.length === 0 && sections.other_considerations.length === 0 ? (
              <div className="research-briefing__empty">No utilities, setbacks, zoning, or other considerations were identified.</div>
            ) : (
              <>
                {sections.utilities.length > 0 && (
                  <>
                    <h3 className="research-briefing__sub-heading">⚡ Utilities</h3>
                    {sections.utilities.map((u, i) => (
                      <div key={i} className="research-briefing__other-item">
                        <div>{u.description}</div>
                        <div style={{ color: '#9CA3AF', fontSize: '0.78rem' }}>Source: {u.source_doc}</div>
                      </div>
                    ))}
                  </>
                )}
                {sections.other_considerations.length > 0 && (
                  <>
                    <h3 className="research-briefing__sub-heading" style={{ marginTop: '1rem' }}>📋 Other Considerations</h3>
                    {sections.other_considerations.map((o, i) => (
                      <div key={i} className="research-briefing__other-item">
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                          <span className="research-briefing__other-category">{CATEGORY_LABELS[o.category] || o.category}</span>
                          <span>{o.description}</span>
                        </div>
                        <div style={{ color: '#9CA3AF', fontSize: '0.78rem' }}>Source: {o.source_doc}</div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Issues Tab ──────────────────────────────────────────────── */}
        {activeSection === 'issues' && (
          <div className="research-briefing__section">
            {sections.discrepancies.open === 0 ? (
              <div className="research-briefing__empty">
                {sections.discrepancies.total > 0
                  ? `✓ All ${sections.discrepancies.total} discrepancies have been resolved.`
                  : '✓ No discrepancies were detected in the extracted data.'}
              </div>
            ) : (
              <>
                <div className="research-briefing__disc-summary">
                  <span><strong>{sections.discrepancies.open}</strong> open</span>
                  {sections.discrepancies.critical > 0 && (
                    <span style={{ color: '#EF4444' }}><strong>{sections.discrepancies.critical}</strong> critical</span>
                  )}
                  <span style={{ color: '#9CA3AF' }}>{sections.discrepancies.total} total</span>
                </div>
                <p style={{ color: '#6B7280', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
                  Review and resolve these discrepancies in the Review step before finalizing the drawing.
                </p>
                <div>
                  {sections.discrepancies.items.map((item, i) => (
                    <div key={i} className={`research-briefing__disc-item research-briefing__disc-item--${item.severity}`}>
                      <span className="research-briefing__disc-severity">{item.severity}</span>
                      <span>{item.title}</span>
                      {item.affects_boundary && <span className="research-briefing__disc-affects">boundary</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
