// app/admin/research/components/BoundaryCallsPanel.tsx — Fetch boundary calls from county CAD
'use client';

import { useState } from 'react';
import type { BoundaryFetchResult, ParsedBoundaryCall } from '@/types/research';

interface BoundaryCallsPanelProps {
  projectId: string;
  defaultAddress?: string;
  defaultCounty?: string;
  defaultParcelId?: string;
  onImported?: () => void;
}

export default function BoundaryCallsPanel({
  projectId,
  defaultAddress,
  defaultCounty,
  defaultParcelId,
  onImported,
}: BoundaryCallsPanelProps) {
  const [address, setAddress]   = useState(defaultAddress  || '');
  const [county, setCounty]     = useState(defaultCounty   || '');
  const [parcelId, setParcelId] = useState(defaultParcelId || '');

  const [fetching, setFetching]   = useState(false);
  const [result,   setResult]     = useState<BoundaryFetchResult | null>(null);
  const [error,    setError]      = useState('');
  const [stepLog,  setStepLog]    = useState<string[]>([]);
  const [showLog,  setShowLog]    = useState(false);

  async function handleFetch() {
    if (fetching) return;
    if (!address.trim() && !parcelId.trim()) {
      setError('Enter a property address or parcel/property ID to search.');
      return;
    }

    setFetching(true);
    setError('');
    setResult(null);
    setStepLog([]);

    try {
      const res = await fetch(`/api/admin/research/${projectId}/boundary-calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address:   address.trim()   || undefined,
          county:    county.trim()    || undefined,
          parcel_id: parcelId.trim()  || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json() as BoundaryFetchResult;
        setResult(data);
        setStepLog(data.search_steps || []);
        if (data.legal_description) onImported?.();
      } else {
        const err = await res.json();
        setError(err.error || 'Fetch failed. Please try again.');
      }
    } catch {
      setError('Network error — please check your connection and try again.');
    }

    setFetching(false);
  }

  function formatBearing(call: ParsedBoundaryCall): string {
    if (call.type === 'curve') {
      return call.chord_bearing ? `Chord: ${call.chord_bearing}` : '(curve)';
    }
    return call.bearing || '—';
  }

  function formatDistance(call: ParsedBoundaryCall): string {
    if (call.type === 'curve') {
      if (call.arc_length) return `Arc ${call.arc_length.toFixed(2)} ft`;
      if (call.chord_distance) return `Chord ${call.chord_distance.toFixed(2)} ft`;
      return '—';
    }
    if (call.distance == null) return '—';
    const unit = call.distance_unit || 'ft';
    return `${call.distance.toFixed(2)} ${unit === 'feet' ? 'ft' : unit}`;
  }

  const hasCalls = result?.boundary_calls && result.boundary_calls.length > 0;

  return (
    <div className="research-boundary">
      <div className="research-boundary__header">
        <h3 className="research-boundary__title">Boundary Calls — County CAD Lookup</h3>
        <p className="research-boundary__desc">
          Retrieve the legal description and metes-and-bounds boundary calls directly from the county
          appraisal district. Enter the property address or parcel ID. The AI will parse every boundary
          call into a structured table. This may take up to 2–3 minutes.
        </p>
      </div>

      {/* Search form */}
      <div className="research-boundary__form">
        <div className="research-boundary__field">
          <label className="research-boundary__label" htmlFor="bc-address">Property Address</label>
          <input
            id="bc-address"
            className="research-search__input"
            type="text"
            placeholder="e.g. 2512 South 5th Street, Temple, TX 76504"
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFetch()}
          />
        </div>
        <div className="research-boundary__row">
          <div className="research-boundary__field research-boundary__field--half">
            <label className="research-boundary__label" htmlFor="bc-county">County</label>
            <input
              id="bc-county"
              className="research-search__input"
              type="text"
              placeholder="e.g. Bell"
              value={county}
              onChange={e => setCounty(e.target.value)}
            />
          </div>
          <div className="research-boundary__field research-boundary__field--half">
            <label className="research-boundary__label" htmlFor="bc-parcel">
              Parcel / Property ID
            </label>
            <input
              id="bc-parcel"
              className="research-search__input"
              type="text"
              placeholder="e.g. 47234 or R-12345"
              value={parcelId}
              onChange={e => setParcelId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFetch()}
            />
          </div>
        </div>

        {error && <div className="research-search__error">{error}</div>}

        <div className="research-search__actions">
          <button
            className="research-page__new-btn"
            onClick={handleFetch}
            disabled={fetching}
          >
            {fetching ? '⏳ Retrieving boundary data…' : '🔍 Fetch Boundary Calls'}
          </button>
          {fetching && (
            <span style={{ color: '#6B7280', fontSize: '0.82rem', marginLeft: '0.75rem' }}>
              Searching county CAD and parsing legal description — please wait up to 2–3 min
            </span>
          )}
        </div>
      </div>

      {/* Step log toggle */}
      {stepLog.length > 0 && (
        <div className="research-boundary__log-toggle">
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
            onClick={() => setShowLog(v => !v)}
          >
            {showLog ? '▾ Hide' : '▸ Show'} search log ({stepLog.length} steps)
          </button>
          {showLog && (
            <ol className="research-boundary__log">
              {stepLog.map((s, i) => <li key={i} className="research-boundary__log-item">{s}</li>)}
            </ol>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="research-boundary__results">

          {/* Source + property header */}
          <div className="research-boundary__source">
            <span className="research-boundary__source-name">{result.source_name}</span>
            {result.source_url && (
              <a
                href={result.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="research-boundary__source-link"
              >
                Open in CAD ↗
              </a>
            )}
          </div>

          {!result.success && result.error && (
            <div className="research-search__error" style={{ marginBottom: '1rem' }}>
              {result.error}
            </div>
          )}

          {/* Property details */}
          {result.property && (
            <div className="research-boundary__property">
              <h4 className="research-boundary__section-title">Property Details</h4>
              <div className="research-boundary__detail-grid">
                {result.property.owner_name      && <PropertyRow label="Owner"        value={result.property.owner_name} />}
                {result.property.property_address && <PropertyRow label="Address"      value={result.property.property_address} />}
                {result.property_id               && <PropertyRow label="Property ID"  value={result.property_id} />}
                {result.property.acreage != null  && <PropertyRow label="Acreage"      value={`${result.property.acreage} ac`} />}
                {result.property.land_use         && <PropertyRow label="Land Use"     value={result.property.land_use} />}
                {result.property.subdivision      && <PropertyRow label="Subdivision"  value={result.property.subdivision} />}
                {result.property.lot_block        && <PropertyRow label="Lot/Block"    value={result.property.lot_block} />}
                {result.property.deed_reference   && <PropertyRow label="Deed Ref"     value={result.property.deed_reference} />}
                {result.property.abstract         && <PropertyRow label="Abstract"     value={result.property.abstract} />}
                {result.stated_acreage != null && result.property.acreage == null && (
                  <PropertyRow label="Stated Acres" value={`${result.stated_acreage} ac`} />
                )}
                {result.property.total_value != null && (
                  <PropertyRow label="Total Value" value={`$${result.property.total_value.toLocaleString()}`} />
                )}
              </div>
            </div>
          )}

          {/* Legal description */}
          {result.legal_description && (
            <details className="research-boundary__legal-desc">
              <summary className="research-boundary__legal-desc-summary">
                Legal Description ({result.legal_description.length} chars)
                {result.legal_description && (
                  <span style={{ color: '#059669', marginLeft: '0.5rem', fontWeight: 600, fontSize: '0.78rem' }}>
                    ✓ Saved to project documents
                  </span>
                )}
              </summary>
              <pre className="research-boundary__legal-desc-text">{result.legal_description}</pre>
            </details>
          )}

          {/* Point of beginning */}
          {result.point_of_beginning && (
            <div className="research-boundary__pob">
              <span className="research-boundary__section-title">Point of Beginning: </span>
              <span className="research-boundary__pob-text">{result.point_of_beginning}</span>
            </div>
          )}

          {/* Boundary calls table */}
          {hasCalls && (
            <div className="research-boundary__calls">
              <h4 className="research-boundary__section-title">
                Boundary Calls
                <span className="research-boundary__call-count">
                  {result.boundary_calls!.length} call{result.boundary_calls!.length !== 1 ? 's' : ''}
                  {result.stated_acreage ? ` · ${result.stated_acreage} ac stated` : ''}
                </span>
              </h4>
              <div className="research-boundary__table-wrap">
                <table className="research-boundary__table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Type</th>
                      <th>Bearing</th>
                      <th>Distance</th>
                      <th>Raw Text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.boundary_calls!.map(call => (
                      <tr key={call.sequence} className={call.type === 'curve' ? 'research-boundary__row--curve' : ''}>
                        <td className="research-boundary__td-seq">{call.sequence}</td>
                        <td className="research-boundary__td-type">
                          {call.type === 'curve' ? (
                            <span title={`R=${call.radius ?? '?'} Δ=${call.delta_angle ?? '?'} ${call.curve_direction ?? ''}`}>
                              ⌒ curve
                            </span>
                          ) : 'line'}
                        </td>
                        <td className="research-boundary__td-bearing">{formatBearing(call)}</td>
                        <td className="research-boundary__td-dist">{formatDistance(call)}</td>
                        <td className="research-boundary__td-raw" title={call.raw_text}>
                          {call.raw_text
                            ? (call.raw_text.length > 80
                                ? call.raw_text.slice(0, 80) + '…'
                                : call.raw_text)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!hasCalls && result.success === false && (
            <div style={{ color: '#9CA3AF', fontSize: '0.88rem', marginTop: '0.5rem' }}>
              No boundary calls could be parsed from the legal description. The legal description may
              be a lot/block reference or may not contain metes-and-bounds text.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="research-boundary__detail-row">
      <span className="research-boundary__detail-label">{label}</span>
      <span className="research-boundary__detail-value">{value}</span>
    </div>
  );
}
