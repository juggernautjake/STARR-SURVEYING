// app/admin/research/components/DocumentDeepAnalysisPanel.tsx
// Deep AI analysis panel for legal descriptions and plats.
// Shows a "Deep Analyze" button per document; displays comprehensive structured results.
'use client';

import { useState } from 'react';
import type {
  ResearchDocument,
  DeepDocumentAnalysis,
  LegalDescriptionAnalysis,
  PlatAnalysis,
  DeepAnalysisCall,
} from '@/types/research';

interface DocumentDeepAnalysisPanelProps {
  projectId: string;
  documents: ResearchDocument[];
}

export default function DocumentDeepAnalysisPanel({
  projectId,
  documents,
}: DocumentDeepAnalysisPanelProps) {
  const [analyzing, setAnalyzing] = useState<string | null>(null); // docId being analyzed
  const [results, setResults]     = useState<Record<string, DeepDocumentAnalysis>>({});
  const [errors,  setErrors]      = useState<Record<string, string>>({});
  const [expanded, setExpanded]   = useState<string | null>(null);

  // Only show documents that have extracted text and are relevant types
  const analyzableTypes = new Set([
    'deed', 'legal_description', 'metes_and_bounds', 'county_record',
    'appraisal_record', 'plat', 'subdivision_plat', 'survey',
    'title_commitment', 'easement', 'field_notes', 'other',
  ]);

  const analyzableDocs = documents.filter(d =>
    d.extracted_text &&
    d.extracted_text.trim().length > 20 &&
    d.processing_status !== 'pending' &&
    d.processing_status !== 'extracting' &&
    analyzableTypes.has(d.document_type ?? 'other')
  );

  if (analyzableDocs.length === 0) return null;

  async function handleAnalyze(docId: string) {
    if (analyzing) return;
    setAnalyzing(docId);
    setErrors(prev => { const n = { ...prev }; delete n[docId]; return n; });

    try {
      const res = await fetch(
        `/api/admin/research/${projectId}/documents/${docId}/deep-analyze`,
        { method: 'POST' },
      );
      if (res.ok) {
        const data = await res.json() as DeepDocumentAnalysis;
        setResults(prev => ({ ...prev, [docId]: data }));
        setExpanded(docId);
      } else {
        const err = await res.json();
        setErrors(prev => ({ ...prev, [docId]: err.error || 'Analysis failed.' }));
      }
    } catch {
      setErrors(prev => ({ ...prev, [docId]: 'Network error — please try again.' }));
    }
    setAnalyzing(null);
  }

  return (
    <div className="research-deep-analysis">
      <div className="research-deep-analysis__header">
        <h3 className="research-deep-analysis__title">Deep Document Analysis</h3>
        <p className="research-deep-analysis__desc">
          Run a comprehensive AI analysis on legal descriptions and plats to extract every
          detail: boundary calls, monuments, easements, setbacks, adjoiner info, lot layout, and more.
        </p>
      </div>

      <div className="research-deep-analysis__list">
        {analyzableDocs.map(doc => {
          const result  = results[doc.id];
          const err     = errors[doc.id];
          const isOpen  = expanded === doc.id;
          const isThisAnalyzing = analyzing === doc.id;

          return (
            <div key={doc.id} className="research-deep-analysis__item">
              <div className="research-deep-analysis__item-header">
                <div className="research-deep-analysis__item-meta">
                  <span className="research-deep-analysis__doc-type">
                    {docTypeIcon(doc.document_type)} {docTypeLabel(doc.document_type)}
                  </span>
                  <span className="research-deep-analysis__doc-name">
                    {doc.document_label || doc.original_filename || 'Untitled Document'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {result && (
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#2563EB', cursor: 'pointer', fontSize: '0.82rem', padding: '0.25rem 0.5rem' }}
                      onClick={() => setExpanded(isOpen ? null : doc.id)}
                    >
                      {isOpen ? '▾ Hide' : '▸ View'} Analysis
                    </button>
                  )}
                  <button
                    type="button"
                    className="research-page__new-btn"
                    style={{ padding: '0.35rem 0.9rem', fontSize: '0.82rem' }}
                    disabled={!!analyzing}
                    onClick={() => handleAnalyze(doc.id)}
                  >
                    {isThisAnalyzing ? '⏳ Analyzing…' : result ? '↻ Re-Analyze' : '🔬 Deep Analyze'}
                  </button>
                </div>
              </div>

              {isThisAnalyzing && (
                <p style={{ color: '#6B7280', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>
                  AI is reading the full document — this may take 30–90 seconds…
                </p>
              )}

              {err && (
                <p style={{ color: '#DC2626', fontSize: '0.82rem', margin: '0.25rem 0 0 0' }}>{err}</p>
              )}

              {result && isOpen && (
                <div className="research-deep-analysis__result">
                  {result.analysis_type === 'legal_description' && result.legal_description && (
                    <LegalDescriptionView data={result.legal_description} />
                  )}
                  {result.analysis_type === 'plat' && result.plat && (
                    <PlatView data={result.plat} />
                  )}
                  {result.error && (
                    <p style={{ color: '#DC2626', fontSize: '0.85rem' }}>Error: {result.error}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Legal Description View ─────────────────────────────────────────────────────

function LegalDescriptionView({ data }: { data: LegalDescriptionAnalysis }) {
  return (
    <div className="research-deep-analysis__legal">
      {/* Score */}
      {data.completeness_score != null && (
        <div className="research-deep-analysis__score">
          Completeness: <strong>{data.completeness_score}%</strong>
        </div>
      )}

      {/* Identification */}
      {data.identification && (
        <Section title="Identification">
          <FieldGrid fields={[
            ['Survey / Abstract', [data.identification.survey_name, data.identification.abstract_number].filter(Boolean).join(' · ')],
            ['County / State',    [data.identification.county, data.identification.state].filter(Boolean).join(', ')],
            ['City',              data.identification.city],
            ['Grantor',           data.identification.grantor],
            ['Grantee',           data.identification.grantee],
            ['Instrument #',      data.identification.instrument_number],
            ['Recorded',          data.identification.recording_date],
            ['Vol / Page',        [data.identification.volume && `Vol. ${data.identification.volume}`, data.identification.page && `Pg. ${data.identification.page}`].filter(Boolean).join(' ')],
          ]} />
        </Section>
      )}

      {/* Tract */}
      {data.tract && (
        <Section title="Tract">
          <FieldGrid fields={[
            ['Type',        data.tract.type],
            ['Acreage',     data.tract.stated_acreage != null ? `${data.tract.stated_acreage} ac` : null],
            ['Sq Ft',       data.tract.stated_sqft != null ? `${data.tract.stated_sqft.toLocaleString()} sf` : null],
            ['Lot / Block', [data.tract.lot && `Lot ${data.tract.lot}`, data.tract.block && `Block ${data.tract.block}`].filter(Boolean).join(', ')],
            ['Subdivision', data.tract.subdivision_name],
            ['Plat Ref',    data.tract.plat_reference],
          ]} />
        </Section>
      )}

      {/* POB */}
      {data.point_of_beginning?.description && (
        <Section title="Point of Beginning">
          <p style={{ fontStyle: 'italic', fontSize: '0.88rem', margin: 0 }}>
            {data.point_of_beginning.description}
          </p>
          {(data.point_of_beginning.monument_type || data.point_of_beginning.monument_condition) && (
            <p style={{ fontSize: '0.82rem', color: '#6B7280', margin: '0.25rem 0 0 0' }}>
              Monument: {[data.point_of_beginning.monument_type, data.point_of_beginning.monument_condition].filter(Boolean).join(', ')}
            </p>
          )}
        </Section>
      )}

      {/* Boundary calls */}
      {data.calls && data.calls.length > 0 && (
        <Section title={`Boundary Calls (${data.calls.length})`}>
          <CallsTable calls={data.calls} />
        </Section>
      )}

      {/* Closure */}
      {data.closure && (
        <Section title="Closure">
          <p style={{ fontSize: '0.88rem', margin: 0 }}>{data.closure}</p>
        </Section>
      )}

      {/* Monuments */}
      {data.monuments && data.monuments.length > 0 && (
        <Section title="Monuments">
          <ul className="research-deep-analysis__list-items">
            {data.monuments.map((m, i) => (
              <li key={i}>{m.description}{m.location ? ` — ${m.location}` : ''}{m.condition ? ` (${m.condition})` : ''}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Adjoiners */}
      {data.adjoiners && data.adjoiners.length > 0 && (
        <Section title="Adjoiners">
          <ul className="research-deep-analysis__list-items">
            {data.adjoiners.map((a, i) => (
              <li key={i}>{a.description}{a.direction ? ` (${a.direction})` : ''}{a.deed_reference ? ` — ${a.deed_reference}` : ''}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Easements */}
      {data.easements && data.easements.length > 0 && (
        <Section title="Easements">
          {data.easements.map((e, i) => (
            <div key={i} style={{ marginBottom: '0.25rem', fontSize: '0.85rem' }}>
              <strong>{e.type}</strong>{e.width_ft ? ` — ${e.width_ft} ft wide` : ''}{e.description ? `: ${e.description}` : ''}
            </div>
          ))}
        </Section>
      )}

      {/* Setbacks */}
      {data.setbacks && data.setbacks.length > 0 && (
        <Section title="Setbacks / Building Lines">
          <FieldGrid fields={data.setbacks.map(s => [s.type, s.distance_ft != null ? `${s.distance_ft} ft` : s.description || null])} />
        </Section>
      )}

      {/* Deed references */}
      {data.deed_references && data.deed_references.length > 0 && (
        <Section title="Deed References">
          {data.deed_references.map((d, i) => (
            <div key={i} style={{ fontSize: '0.85rem', marginBottom: '0.2rem' }}>
              {[d.volume && `Vol. ${d.volume}`, d.page && `Pg. ${d.page}`, d.instrument && `Inst. ${d.instrument}`, d.county && `${d.county} Co.`, d.description].filter(Boolean).join(' · ')}
            </div>
          ))}
        </Section>
      )}

      {/* Surveyor */}
      {data.surveyor_info && (data.surveyor_info.rpls_name || data.surveyor_info.company) && (
        <Section title="Surveyor">
          <FieldGrid fields={[
            ['Company',     data.surveyor_info.company],
            ['RPLS',        [data.surveyor_info.rpls_name, data.surveyor_info.rpls_number && `#${data.surveyor_info.rpls_number}`].filter(Boolean).join(' ')],
            ['Survey Date', data.surveyor_info.survey_date],
          ]} />
        </Section>
      )}

      {/* Exceptions */}
      {data.exceptions_reservations && data.exceptions_reservations.length > 0 && (
        <Section title="Exceptions & Reservations">
          <ul className="research-deep-analysis__list-items">
            {data.exceptions_reservations.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </Section>
      )}

      {/* Notes */}
      {data.notes && (
        <Section title="Notes">
          <p style={{ fontSize: '0.85rem', color: '#6B7280', margin: 0 }}>{data.notes}</p>
        </Section>
      )}
    </div>
  );
}

// ── Plat View ──────────────────────────────────────────────────────────────────

function PlatView({ data }: { data: PlatAnalysis }) {
  return (
    <div className="research-deep-analysis__plat">
      {data.completeness_score != null && (
        <div className="research-deep-analysis__score">
          Completeness: <strong>{data.completeness_score}%</strong>
        </div>
      )}

      <Section title="Identification">
        <FieldGrid fields={[
          ['Plat Name',   data.name],
          ['Type',        data.plat_type],
          ['Replat Of',   data.replat_of],
          ['County',      data.county],
          ['City',        data.city],
          ['Instrument',  data.instrument_number],
          ['Vol / Page',  [data.volume && `Vol. ${data.volume}`, data.page && `Pg. ${data.page}`].filter(Boolean).join(' ')],
          ['Recorded',    data.recording_date],
          ['Scale',       data.scale],
        ]} />
      </Section>

      {data.surveyor && (data.surveyor.rpls_name || data.surveyor.company) && (
        <Section title="Surveyor">
          <FieldGrid fields={[
            ['Company',   data.surveyor.company],
            ['RPLS',      [data.surveyor.rpls_name, data.surveyor.rpls_number && `#${data.surveyor.rpls_number}`].filter(Boolean).join(' ')],
            ['Date',      data.surveyor.survey_date],
          ]} />
        </Section>
      )}

      <Section title="Area Summary">
        <FieldGrid fields={[
          ['Total Area',   data.total_area_acres != null ? `${data.total_area_acres} ac` : null],
          ['ROW Dedicated', data.row_dedication_acres != null ? `${data.row_dedication_acres} ac` : null],
          ['Net Area',     data.net_area_acres != null ? `${data.net_area_acres} ac` : null],
        ]} />
      </Section>

      {data.building_setback_lines && (
        <Section title="Building Setback Lines">
          <FieldGrid fields={[
            ['Front',       data.building_setback_lines.front_ft != null ? `${data.building_setback_lines.front_ft} ft` : null],
            ['Side',        data.building_setback_lines.side_ft != null ? `${data.building_setback_lines.side_ft} ft` : null],
            ['Rear',        data.building_setback_lines.rear_ft != null ? `${data.building_setback_lines.rear_ft} ft` : null],
            ['Corner Side', data.building_setback_lines.corner_side_ft != null ? `${data.building_setback_lines.corner_side_ft} ft` : null],
          ]} />
          {data.building_setback_lines.notes && (
            <p style={{ fontSize: '0.82rem', color: '#6B7280', margin: '0.25rem 0 0 0' }}>{data.building_setback_lines.notes}</p>
          )}
        </Section>
      )}

      {data.streets && data.streets.length > 0 && (
        <Section title="Streets / ROW">
          {data.streets.map((s, i) => (
            <div key={i} style={{ fontSize: '0.85rem', marginBottom: '0.2rem' }}>
              <strong>{s.name || '(unnamed)'}</strong>
              {s.row_width_ft ? ` — ${s.row_width_ft} ft ROW` : ''}
              {s.type ? ` (${s.type})` : ''}
            </div>
          ))}
        </Section>
      )}

      {data.easements && data.easements.length > 0 && (
        <Section title="Easements">
          {data.easements.map((e, i) => (
            <div key={i} style={{ fontSize: '0.85rem', marginBottom: '0.2rem' }}>
              <strong>{e.type}</strong>{e.width_ft ? ` — ${e.width_ft} ft` : ''}{e.location ? ` · ${e.location}` : ''}
            </div>
          ))}
        </Section>
      )}

      {data.perimeter_calls && data.perimeter_calls.length > 0 && (
        <Section title={`Perimeter Calls (${data.perimeter_calls.length})`}>
          <CallsTable calls={data.perimeter_calls} />
        </Section>
      )}

      {data.lots && data.lots.length > 0 && (
        <Section title={`Lots (${data.lots.length})`}>
          <div className="research-boundary__table-wrap">
            <table className="research-boundary__table">
              <thead>
                <tr><th>Lot</th><th>Block</th><th>Frontage</th><th>Depth</th><th>Area</th></tr>
              </thead>
              <tbody>
                {data.lots.map((lot, i) => (
                  <tr key={i}>
                    <td>{lot.lot}</td>
                    <td>{lot.block ?? '—'}</td>
                    <td>{lot.frontage_ft != null ? `${lot.frontage_ft} ft` : '—'}</td>
                    <td>{lot.depth_ft != null ? `${lot.depth_ft} ft` : '—'}</td>
                    <td>{lot.area_sqft != null ? `${lot.area_sqft.toLocaleString()} sf` : lot.area_acres != null ? `${lot.area_acres} ac` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {data.flood_zone?.zone && (
        <Section title="Flood Zone">
          <FieldGrid fields={[
            ['Zone',       data.flood_zone.zone],
            ['FIRM Panel', data.flood_zone.firm_panel],
            ['FIRM Date',  data.flood_zone.firm_date],
          ]} />
        </Section>
      )}

      {data.restrictions && data.restrictions.length > 0 && (
        <Section title="Deed Restrictions">
          <ul className="research-deep-analysis__list-items">
            {data.restrictions.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Section>
      )}

      {data.notes && (
        <Section title="Notes">
          <p style={{ fontSize: '0.85rem', color: '#6B7280', margin: 0 }}>{data.notes}</p>
        </Section>
      )}
    </div>
  );
}

// ── Shared Sub-Components ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="research-deep-analysis__section">
      <h5 className="research-deep-analysis__section-title">{title}</h5>
      {children}
    </div>
  );
}

function FieldGrid({ fields }: { fields: Array<[string, string | null | undefined]> }) {
  const visible = fields.filter(([, v]) => v != null && v !== '');
  if (visible.length === 0) return null;
  return (
    <div className="research-boundary__detail-grid">
      {visible.map(([label, value]) => (
        <div key={label} className="research-boundary__detail-row">
          <span className="research-boundary__detail-label">{label}</span>
          <span className="research-boundary__detail-value">{value}</span>
        </div>
      ))}
    </div>
  );
}

function CallsTable({ calls }: { calls: DeepAnalysisCall[] }) {
  return (
    <div className="research-boundary__table-wrap">
      <table className="research-boundary__table">
        <thead>
          <tr><th>#</th><th>Type</th><th>Bearing</th><th>Distance</th><th>Monument / Note</th></tr>
        </thead>
        <tbody>
          {calls.map((call, i) => (
            <tr key={i} className={call.type === 'curve' ? 'research-boundary__row--curve' : ''}>
              <td className="research-boundary__td-seq">{call.sequence}</td>
              <td className="research-boundary__td-type">
                {call.type === 'curve' ? (
                  <span title={`R=${call.radius ?? '?'} Δ=${call.delta_angle ?? '?'} ${call.curve_direction ?? ''}`}>⌒ curve</span>
                ) : 'line'}
              </td>
              <td className="research-boundary__td-bearing">
                {call.type === 'curve'
                  ? (call.chord_bearing ? `Chord: ${call.chord_bearing}` : '—')
                  : (call.bearing ?? '—')}
              </td>
              <td className="research-boundary__td-dist">
                {call.type === 'curve'
                  ? (call.arc_length ? `Arc ${call.arc_length.toFixed(2)} ft` : call.chord_distance ? `Chord ${call.chord_distance.toFixed(2)} ft` : '—')
                  : (call.distance != null ? `${call.distance.toFixed(2)} ${call.distance_unit === 'feet' ? 'ft' : (call.distance_unit ?? 'ft')}` : '—')}
              </td>
              <td style={{ fontSize: '0.8rem', color: '#6B7280', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={call.monument_at_end ?? call.adjoiner ?? undefined}>
                {call.monument_at_end ?? call.adjoiner ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function docTypeLabel(type: string | null | undefined): string {
  const labels: Record<string, string> = {
    deed: 'Deed', legal_description: 'Legal Description', metes_and_bounds: 'Metes & Bounds',
    plat: 'Plat', subdivision_plat: 'Subdivision Plat', survey: 'Survey',
    county_record: 'County Record', appraisal_record: 'Appraisal Record',
    title_commitment: 'Title Commitment', easement: 'Easement',
    field_notes: 'Field Notes', other: 'Document',
  };
  return labels[type ?? 'other'] ?? 'Document';
}

function docTypeIcon(type: string | null | undefined): string {
  const icons: Record<string, string> = {
    deed: '📜', legal_description: '⚖️', metes_and_bounds: '📏',
    plat: '🗺️', subdivision_plat: '🏘️', survey: '📐',
    county_record: '🏛️', appraisal_record: '💰',
    title_commitment: '📋', easement: '🛤️', field_notes: '📓', other: '📄',
  };
  return icons[type ?? 'other'] ?? '📄';
}
