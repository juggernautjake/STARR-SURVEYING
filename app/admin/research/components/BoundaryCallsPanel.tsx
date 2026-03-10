// app/admin/research/components/BoundaryCallsPanel.tsx — Fetch boundary calls from county CAD
'use client';

import { useCallback, useState } from 'react';
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
  const [address, setAddress]     = useState(defaultAddress  || '');
  const [county, setCounty]       = useState(defaultCounty   || '');
  const [parcelId, setParcelId]   = useState(defaultParcelId || '');
  const [ownerName, setOwnerName] = useState('');

  const [fetching, setFetching]         = useState(false);
  const [result,   setResult]           = useState<BoundaryFetchResult | null>(null);
  const [error,    setError]            = useState('');
  const [stepLog,  setStepLog]          = useState<string[]>([]);
  const [showLog,  setShowLog]          = useState(false);
  const [copied,   setCopied]           = useState(false);
  const [logCopied, setLogCopied]       = useState(false);
  const [browserLogCopied, setBrowserLogCopied] = useState(false);

  const handleCopyStepLog = useCallback(() => {
    if (stepLog.length === 0) return;
    const text = stepLog.map((s, i) => `${i + 1}. ${s}`).join('\n');
    navigator.clipboard.writeText(text)
      .then(() => { setLogCopied(true); setTimeout(() => setLogCopied(false), 2000); })
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setLogCopied(true);
        setTimeout(() => setLogCopied(false), 2000);
      });
  }, [stepLog]);

  const handleCopyBrowserLog = useCallback((steps: string[]) => {
    if (steps.length === 0) return;
    const text = steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
    navigator.clipboard.writeText(text)
      .then(() => { setBrowserLogCopied(true); setTimeout(() => setBrowserLogCopied(false), 2000); })
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setBrowserLogCopied(true);
        setTimeout(() => setBrowserLogCopied(false), 2000);
      });
  }, []);

  async function handleFetch() {
    if (fetching) return;
    if (!address.trim() && !parcelId.trim() && !ownerName.trim()) {
      setError('Enter a property address, parcel/property ID, or owner name to search.');
      return;
    }

    setFetching(true);
    setError('');
    setResult(null);
    setStepLog([]);
    setCopied(false);

    try {
      const res = await fetch(`/api/admin/research/${projectId}/boundary-calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address:    address.trim()    || undefined,
          county:     county.trim()     || undefined,
          parcel_id:  parcelId.trim()   || undefined,
          owner_name: ownerName.trim()  || undefined,
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

  const [browserFetching, setBrowserFetching] = useState(false);
  const [browserResult, setBrowserResult]     = useState<{
    propertyId: string | null;
    legalDescription: string | null;
    ownerName: string | null;
    deedReference: string | null;
    documentCount: number;
    steps: string[];
  } | null>(null);
  const [browserError,  setBrowserError]      = useState('');
  const [showBrowserLog, setShowBrowserLog]   = useState(false);

  async function handleBrowserFetch() {
    if (browserFetching) return;
    if (!address.trim() && !parcelId.trim()) {
      setBrowserError('Enter a property address or parcel ID to run live browser research.');
      return;
    }

    setBrowserFetching(true);
    setBrowserError('');
    setBrowserResult(null);

    try {
      const res = await fetch(`/api/admin/research/${projectId}/browser-fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          county:     county.trim()    || undefined,
          propertyId: parcelId.trim()  || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setBrowserResult(data);
        if (data.documentCount > 0) onImported?.();
      } else {
        const err = await res.json();
        setBrowserError(err.error || 'Browser research failed. Make sure Playwright is installed on the server.');
      }
    } catch {
      setBrowserError('Network error — please check your connection and try again.');
    }

    setBrowserFetching(false);
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
              placeholder="e.g. 29079 or R-12345"
              value={parcelId}
              onChange={e => setParcelId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFetch()}
            />
          </div>
        </div>
        <div className="research-boundary__field">
          <label className="research-boundary__label" htmlFor="bc-owner">
            Owner Name <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(optional — improves lookup)</span>
          </label>
          <input
            id="bc-owner"
            className="research-search__input"
            type="text"
            placeholder="e.g. SMITH, JOHN or IQBAL, ANSAR"
            value={ownerName}
            onChange={e => setOwnerName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFetch()}
          />
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
          <button
            style={{
              marginLeft: '0.65rem',
              background: browserFetching ? '#F3F4F6' : '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '0.375rem',
              padding: '0.45rem 1rem',
              cursor: browserFetching ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              color: '#1D4ED8',
              fontWeight: 600,
              opacity: browserFetching ? 0.6 : 1,
            }}
            onClick={handleBrowserFetch}
            disabled={browserFetching}
            title="Open a real browser, search the county CAD portal and deed records, and screenshot everything"
          >
            {browserFetching ? '🌐 Searching live websites…' : '🌐 Live Browser Search'}
          </button>
          {(fetching || browserFetching) && (
            <span style={{ color: '#6B7280', fontSize: '0.82rem', marginLeft: '0.75rem' }}>
              {browserFetching
                ? 'Navigating county websites, filling forms, and screenshotting results — may take 1–3 min'
                : 'Searching county CAD and parsing legal description — please wait up to 2–3 min'}
            </span>
          )}
        </div>

        {browserError && (
          <div className="research-search__error" style={{ marginTop: '0.5rem' }}>{browserError}</div>
        )}

        {/* Browser research result summary */}
        {browserResult && (
          <div style={{ marginTop: '0.75rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
            <div style={{ fontWeight: 700, color: '#166534', marginBottom: '0.35rem' }}>🌐 Live Browser Research Complete</div>
            <div style={{ fontSize: '0.85rem', color: '#166534' }}>
              {browserResult.propertyId && <div>🔑 Property ID found: <strong>{browserResult.propertyId}</strong></div>}
              {browserResult.ownerName   && <div>👤 Owner: {browserResult.ownerName}</div>}
              {browserResult.deedReference && <div>📋 Deed reference: {browserResult.deedReference}</div>}
              <div>📸 {browserResult.documentCount} screenshot document{browserResult.documentCount !== 1 ? 's' : ''} saved to project</div>
              {browserResult.legalDescription && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ fontWeight: 600 }}>Legal Description (extracted):</div>
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.82rem', background: '#DCFCE7', padding: '0.5rem', borderRadius: '0.25rem', marginTop: '0.25rem', maxHeight: 200, overflowY: 'auto' }}>{browserResult.legalDescription}</pre>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: '#15803D', cursor: 'pointer', fontSize: '0.78rem', padding: 0 }}
                onClick={() => setShowBrowserLog(v => !v)}
              >
                {showBrowserLog ? '▾ Hide' : '▸ Show'} browser search log ({browserResult.steps.length} steps)
              </button>
              <button
                type="button"
                style={{ background: 'none', border: '1px solid #BBF7D0', borderRadius: '4px', color: '#15803D', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, padding: '0.1rem 0.45rem' }}
                onClick={() => handleCopyBrowserLog(browserResult.steps)}
                title="Copy all browser log steps to clipboard"
              >
                {browserLogCopied ? '✓ Copied' : '⎘ Copy all'}
              </button>
            </div>
            {showBrowserLog && (
              <ol style={{ margin: '0.4rem 0 0 1.2rem', padding: 0, fontSize: '0.75rem', color: '#374151' }}>
                {browserResult.steps.map((s, i) => <li key={i} style={{ marginBottom: '0.15rem' }}>{s}</li>)}
              </ol>
            )}
          </div>
        )}
      </div>

      {/* Step log toggle */}
      {stepLog.length > 0 && (
        <div className="research-boundary__log-toggle">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
              onClick={() => setShowLog(v => !v)}
            >
              {showLog ? '▾ Hide' : '▸ Show'} search log ({stepLog.length} steps)
            </button>
            <button
              type="button"
              style={{ background: 'none', border: '1px solid #D1D5DB', borderRadius: '4px', color: '#374151', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, padding: '0.1rem 0.45rem' }}
              onClick={handleCopyStepLog}
              title="Copy all search log entries to clipboard"
            >
              {logCopied ? '✓ Copied' : '⎘ Copy all'}
            </button>
          </div>
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

          {/* ── Property ID Unlock Banner ────────────────────────────────────── */}
          {result.property_id ? (
            <div className="research-boundary__id-banner">
              <div className="research-boundary__id-banner-left">
                <span className="research-boundary__id-label">🔑 Property ID</span>
                <span className="research-boundary__id-value" id="bc-prop-id-display">{result.property_id}</span>
                <button
                  type="button"
                  className="research-boundary__id-copy"
                  title="Copy property ID to clipboard"
                  onClick={() => {
                    navigator.clipboard.writeText(result.property_id!)
                      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
                      .catch(() => {
                        // Fallback: select the ID text if clipboard API is unavailable
                        const el = document.getElementById('bc-prop-id-display');
                        if (el) {
                          const range = document.createRange();
                          range.selectNode(el);
                          window.getSelection()?.removeAllRanges();
                          window.getSelection()?.addRange(range);
                        }
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      });
                  }}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="research-boundary__id-links">
                {result.cad_property_url && (
                  <a
                    href={result.cad_property_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="research-boundary__id-link research-boundary__id-link--cad"
                    title="Open property record on the county CAD e-search portal"
                  >
                    🏛️ View on CAD e-Search ↗
                  </a>
                )}
                {result.deed_search_url && (
                  <a
                    href={result.deed_search_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="research-boundary__id-link research-boundary__id-link--deeds"
                    title="Search county clerk deed records by this property ID"
                  >
                    📜 Search Deeds by ID ↗
                  </a>
                )}
              </div>
              <p className="research-boundary__id-tip">
                Use <strong>Search Deeds by ID</strong> to find every recorded deed and plat for this property on the county clerk portal. Select <em>Search Index + Full Text</em> for best results.
              </p>
            </div>
          ) : result.deed_search_url && (
            /* No property ID found — still offer an address-based deed search */
            <div className="research-boundary__id-banner research-boundary__id-banner--fallback">
              <div className="research-boundary__id-banner-left">
                <span className="research-boundary__id-label">📜 Deed &amp; Record Search</span>
                <span className="research-boundary__id-banner-hint">Property ID not found — search by address instead</span>
              </div>
              <div className="research-boundary__id-links">
                {result.source_url && (
                  <a
                    href={result.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="research-boundary__id-link research-boundary__id-link--cad"
                    title="Open the county CAD portal to search manually"
                  >
                    🏛️ Search CAD Manually ↗
                  </a>
                )}
                <a
                  href={result.deed_search_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="research-boundary__id-link research-boundary__id-link--deeds"
                  title="Search county clerk records by street address"
                >
                  📜 Search Deeds by Address ↗
                </a>
              </div>
              <p className="research-boundary__id-tip">
                The automatic property lookup did not return a match. Use <strong>Search Deeds by Address</strong> to open the county clerk portal pre-loaded with this address — you can browse recorded deeds, plats, and instruments directly and upload them above for AI analysis.
              </p>
            </div>
          )}

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
