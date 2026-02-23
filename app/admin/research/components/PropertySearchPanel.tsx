// app/admin/research/components/PropertySearchPanel.tsx
'use client';

import { useState } from 'react';
import type { PropertySearchResult, PropertySearchResponse, SearchSource } from '@/types/research';
import { DOCUMENT_TYPE_LABELS } from '@/types/research';

interface PropertySearchPanelProps {
  projectId: string;
  defaultAddress?: string;
  defaultCounty?: string;
  onImported?: () => void;
}

const SOURCE_LABELS: Record<SearchSource, { label: string; icon: string }> = {
  county_cad:      { label: 'County Appraisal District', icon: '🏛️' },
  county_clerk:    { label: 'County Clerk / Deed Search', icon: '📁' },
  fema:            { label: 'FEMA Flood Maps', icon: '🌊' },
  tnris:           { label: 'TNRIS', icon: '🗺️' },
  txdot:           { label: 'TxDOT ROW', icon: '🛣️' },
  usgs:            { label: 'USGS National Map', icon: '🏔️' },
  bell_county_gis: { label: 'Bell County GIS', icon: '📍' },
  texas_glo:       { label: 'Texas GLO', icon: '📜' },
  texas_rrc:       { label: 'Texas Railroad Commission', icon: '⛽' },
  city_records:    { label: 'City Records', icon: '🏙️' },
};

export default function PropertySearchPanel({
  projectId,
  defaultAddress,
  defaultCounty,
  onImported,
}: PropertySearchPanelProps) {
  const [address, setAddress] = useState(defaultAddress || '');
  const [county, setCounty] = useState(defaultCounty || '');
  const [parcelId, setParcelId] = useState('');
  const [ownerName, setOwnerName] = useState('');

  const [searching, setSearching] = useState(false);
  const [searchResponse, setSearchResponse] = useState<PropertySearchResponse | null>(null);
  const [searchError, setSearchError] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ count: number; mapNote?: string } | null>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAddressIssues, setShowAddressIssues] = useState(true);

  async function handleSearch() {
    if (searching) return;
    if (!address.trim() && !county.trim() && !parcelId.trim()) {
      setSearchError('Enter an address, county, or parcel ID to search.');
      return;
    }

    setSearching(true);
    setSearchError('');
    setSearchResponse(null);
    setSelected(new Set());
    setImportResult(null);
    setShowAddressIssues(true);

    try {
      const res = await fetch(`/api/admin/research/${projectId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address.trim() || undefined,
          county: county.trim() || undefined,
          parcel_id: parcelId.trim() || undefined,
          owner_name: ownerName.trim() || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json() as PropertySearchResponse;
        setSearchResponse(data);
      } else {
        const err = await res.json();
        setSearchError(err.error || 'Search failed');
      }
    } catch {
      setSearchError('Network error — please try again.');
    }

    setSearching(false);
  }

  function toggleResult(id: string) {
    setSelected((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (!searchResponse) return;
    const freeResults = searchResponse.results.filter((r: PropertySearchResult) => !r.has_cost);
    setSelected(new Set(freeResults.map((r: PropertySearchResult) => r.id)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function handleImport() {
    if (importing || selected.size === 0 || !searchResponse) return;
    setImporting(true);

    const selectedResults = searchResponse.results.filter((r: PropertySearchResult) => selected.has(r.id));

    try {
      const res = await fetch(`/api/admin/research/${projectId}/search`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: selectedResults.map((r: PropertySearchResult) => ({
            source: r.source,
            source_name: r.source_name,
            title: r.title,
            url: r.url,
            document_type: r.document_type,
            description: r.description,
          })),
          // Pass address so the route can trigger satellite/topo image capture
          address: address.trim() || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const mapNote = data.map_images_queued
          ? ' Satellite and topo map images are being captured in the background and will appear in Documents.'
          : '';
        setImportResult({ count: data.imported, mapNote });
        setSelected(new Set());
        onImported?.();
      } else {
        setSearchError('Failed to import selected documents. Please try again.');
      }
    } catch {
      setSearchError('Import failed. Check your internet connection and try again.');
    }

    setImporting(false);
  }

  function relevanceBar(score: number) {
    const pct = Math.round(score * 100);
    const color = pct >= 80 ? '#059669' : pct >= 60 ? '#F59E0B' : '#9CA3AF';
    return (
      <div className="research-search__relevance">
        <div className="research-search__relevance-bar">
          <div
            className="research-search__relevance-fill"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
        <span className="research-search__relevance-pct">{pct}%</span>
      </div>
    );
  }

  // Group results by source
  const groupedResults: Record<string, PropertySearchResult[]> = {};
  if (searchResponse) {
    for (const r of searchResponse.results) {
      if (!groupedResults[r.source]) groupedResults[r.source] = [];
      groupedResults[r.source].push(r);
    }
  }

  const hasAddressIssues = searchResponse?.address_issues && searchResponse.address_issues.length > 0;
  const specificCount = searchResponse?.results.filter((r: PropertySearchResult) => r.is_property_specific).length || 0;

  return (
    <div className="research-search">
      <div className="research-search__header">
        <h3 className="research-search__title">Property Record Search</h3>
        <p className="research-search__desc">
          Search Texas public records for property documents. The AI will analyze your address, identify potential issues, and search all relevant sources — Bell County GIS, county CAD, deed records, Texas GLO abstracts, FEMA, and more.
        </p>
      </div>

      {/* Search form */}
      <div className="research-search__form">
        <div className="research-search__field">
          <label className="research-search__label" htmlFor="ps-address">
            Property Address
          </label>
          <input
            id="ps-address"
            className="research-search__input"
            type="text"
            placeholder="e.g. 1234 Main St, Belton, TX 76513"
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
        </div>

        <div className="research-search__row">
          <div className="research-search__field research-search__field--half">
            <label className="research-search__label" htmlFor="ps-county">
              County
            </label>
            <input
              id="ps-county"
              className="research-search__input"
              type="text"
              placeholder="e.g. Bell"
              value={county}
              onChange={e => setCounty(e.target.value)}
            />
          </div>
          <div className="research-search__field research-search__field--half">
            <label className="research-search__label" htmlFor="ps-parcel">
              Parcel / Property ID
            </label>
            <input
              id="ps-parcel"
              className="research-search__input"
              type="text"
              placeholder="e.g. R12345"
              value={parcelId}
              onChange={e => setParcelId(e.target.value)}
            />
          </div>
        </div>

        {/* Advanced fields */}
        <button
          className="research-search__advanced-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
          type="button"
        >
          {showAdvanced ? '▾ Hide' : '▸ More'} search options
        </button>

        {showAdvanced && (
          <div className="research-search__field">
            <label className="research-search__label" htmlFor="ps-owner">
              Owner Name
            </label>
            <input
              id="ps-owner"
              className="research-search__input"
              type="text"
              placeholder="e.g. John Smith"
              value={ownerName}
              onChange={e => setOwnerName(e.target.value)}
            />
          </div>
        )}

        {searchError && (
          <div className="research-search__error">{searchError}</div>
        )}

        <div className="research-search__actions">
          <button
            className="research-page__new-btn"
            onClick={handleSearch}
            disabled={searching}
          >
            {searching ? 'Searching all sources...' : 'Search Public Records'}
          </button>
        </div>
      </div>

      {/* Search results */}
      {searchResponse && (
        <div className="research-search__results">

          {/* Address normalization alert */}
          {hasAddressIssues && showAddressIssues && (
            <div className="research-search__address-alert">
              <div className="research-search__address-alert-header">
                <span>⚠️ Address Review</span>
                {searchResponse.address_normalized && (
                  <span className="research-search__address-normalized">
                    Normalized: <strong>{searchResponse.address_normalized}</strong>
                  </span>
                )}
                <button
                  className="research-search__address-alert-dismiss"
                  onClick={() => setShowAddressIssues(false)}
                  type="button"
                  aria-label="Dismiss address alert"
                >✕</button>
              </div>
              <ul className="research-search__address-issues">
                {searchResponse.address_issues?.map((issue, i) => (
                  <li key={i} className="research-search__address-issue">⚠ {issue}</li>
                ))}
              </ul>
              {searchResponse.address_suggestions && searchResponse.address_suggestions.length > 0 && (
                <div className="research-search__address-suggestions">
                  <strong>Suggestions:</strong>
                  <ul>
                    {searchResponse.address_suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {searchResponse.address_variants && searchResponse.address_variants.length > 0 && (
                <div className="research-search__address-variants">
                  <strong>Try these address variants:</strong>
                  <div className="research-search__variant-list">
                    {searchResponse.address_variants.map((v, i) => (
                      <button
                        key={i}
                        className="research-search__variant-btn"
                        onClick={() => { setAddress(v); setShowAddressIssues(false); }}
                        type="button"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Source status chips */}
          <div className="research-search__sources">
            {searchResponse.sources_searched.map(s => {
              const info = SOURCE_LABELS[s.source] || { label: s.name, icon: '📎' };
              return (
                <div
                  key={s.source}
                  className={`research-search__source-chip research-search__source-chip--${s.status}`}
                >
                  <span>{info.icon}</span>
                  <span>{info.label}</span>
                  <span className="research-search__source-status">
                    {s.status === 'success' ? '✓' : s.status === 'error' ? '✗' : '—'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Location map preview — satellite thumbnail from USGS (no API key) */}
          {searchResponse.location_preview_url && (
            <div className="research-search__map-preview">
              <div className="research-search__map-preview-header">
                <span className="research-search__map-preview-label">📍 Geocoded Location Preview</span>
                {searchResponse.geocoded_lat && searchResponse.geocoded_lon && (
                  <span className="research-search__map-preview-coords">
                    {searchResponse.geocoded_lat.toFixed(5)}, {searchResponse.geocoded_lon.toFixed(5)}
                  </span>
                )}
                <span className="research-search__map-preview-note">
                  USGS satellite imagery — importing will also save full-resolution satellite &amp; topo images as project documents for AI analysis
                </span>
              </div>
              <img
                className="research-search__map-img"
                src={searchResponse.location_preview_url}
                alt="Satellite view of geocoded property location"
                loading="lazy"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}

          {/* Results header with select controls */}
          {searchResponse.results.length > 0 && (
            <div className="research-search__results-header">
              <span className="research-search__results-count">
                {searchResponse.total} result{searchResponse.total !== 1 ? 's' : ''} found
                {specificCount > 0 && (
                  <span className="research-search__specific-count">
                    {' '}— {specificCount} property-specific
                  </span>
                )}
              </span>
              <div className="research-search__select-controls">
                <button
                  className="research-search__select-btn"
                  onClick={selectAll}
                  type="button"
                >
                  Select all free
                </button>
                <button
                  className="research-search__select-btn"
                  onClick={deselectAll}
                  type="button"
                >
                  Deselect all
                </button>
              </div>
            </div>
          )}

          {/* Grouped results */}
          {Object.entries(groupedResults).map(([source, results]) => {
            const sourceInfo = SOURCE_LABELS[source as SearchSource] || { label: source, icon: '📎' };
            return (
              <div key={source} className="research-search__group">
                <div className="research-search__group-header">
                  <span className="research-search__group-icon">{sourceInfo.icon}</span>
                  <span className="research-search__group-title">{sourceInfo.label}</span>
                  <span className="research-search__group-count">{results.length}</span>
                </div>

                <div className="research-search__group-items">
                  {results.map(r => {
                    const isSelected = selected.has(r.id);
                    const docTypeInfo = DOCUMENT_TYPE_LABELS[r.document_type] || { label: r.document_type, icon: '📎' };

                    return (
                      <div
                        key={r.id}
                        className={`research-search__result ${isSelected ? 'research-search__result--selected' : ''}`}
                        onClick={() => toggleResult(r.id)}
                      >
                        <div className="research-search__result-check">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleResult(r.id)}
                            onClick={e => e.stopPropagation()}
                          />
                        </div>

                        <div className="research-search__result-body">
                          <div className="research-search__result-top">
                            <span className="research-search__result-type">
                              {docTypeInfo.icon} {docTypeInfo.label}
                            </span>
                            {r.is_property_specific && (
                              <span className="research-search__result-specific" title="This link is specifically targeted to your property">
                                ✅ Property-specific
                              </span>
                            )}
                            {r.has_cost && (
                              <span className="research-search__result-cost" title={r.cost_note}>
                                $ May have fees
                              </span>
                            )}
                          </div>

                          <div className="research-search__result-title">{r.title}</div>
                          <div className="research-search__result-desc">{r.description}</div>

                          <div className="research-search__result-footer">
                            {relevanceBar(r.relevance)}
                            <a
                              className="research-search__result-link"
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                            >
                              Open source &#8599;
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {searchResponse.results.length === 0 && (
            <div className="research-search__empty">
              No results found. Try a different address, county, or parcel ID.
              {searchResponse.address_variants && searchResponse.address_variants.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  Try one of these address variants:
                  <div className="research-search__variant-list" style={{ marginTop: '0.25rem' }}>
                    {searchResponse.address_variants.map((v, i) => (
                      <button key={i} className="research-search__variant-btn" onClick={() => setAddress(v)} type="button">{v}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Import bar */}
          {selected.size > 0 && (
            <div className="research-search__import-bar">
              <span className="research-search__import-count">
                {selected.size} document{selected.size !== 1 ? 's' : ''} selected
              </span>
              <button
                className="research-page__new-btn"
                onClick={handleImport}
                disabled={importing}
              >
                {importing ? 'Importing...' : 'Import Selected'}
              </button>
            </div>
          )}

          {/* Import success */}
          {importResult && (
            <div className="research-search__import-success">
              <p>✅ Successfully imported {importResult.count} document{importResult.count !== 1 ? 's' : ''} into your project.</p>
              {importResult.mapNote && (
                <p className="research-search__import-map-note">🛰️ {importResult.mapNote}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
