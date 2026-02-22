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
  county_cad:    { label: 'County Appraisal District', icon: '🏛️' },
  county_clerk:  { label: 'County Clerk', icon: '📁' },
  fema:          { label: 'FEMA Flood Maps', icon: '🌊' },
  tnris:         { label: 'TNRIS', icon: '🗺️' },
  txdot:         { label: 'TxDOT', icon: '🛣️' },
  usgs:          { label: 'USGS', icon: '🏔️' },
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
  const [importResult, setImportResult] = useState<{ count: number } | null>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);

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
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (!searchResponse) return;
    const freeResults = searchResponse.results.filter(r => !r.has_cost);
    setSelected(new Set(freeResults.map(r => r.id)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function handleImport() {
    if (importing || selected.size === 0 || !searchResponse) return;
    setImporting(true);

    const selectedResults = searchResponse.results.filter(r => selected.has(r.id));

    try {
      const res = await fetch(`/api/admin/research/${projectId}/search`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: selectedResults.map(r => ({
            source: r.source,
            source_name: r.source_name,
            title: r.title,
            url: r.url,
            document_type: r.document_type,
            description: r.description,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setImportResult({ count: data.imported });
        setSelected(new Set());
        onImported?.();
      }
    } catch { /* ignore */ }

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

  return (
    <div className="research-search">
      <div className="research-search__header">
        <h3 className="research-search__title">Property Record Search</h3>
        <p className="research-search__desc">
          Search Texas public records for property documents. Results link to free public sources — some county clerk records may have per-page fees.
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
            {searching ? 'Searching...' : 'Search Public Records'}
          </button>
        </div>
      </div>

      {/* Search results */}
      {searchResponse && (
        <div className="research-search__results">
          {/* Source status */}
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

          {/* Results header with select controls */}
          {searchResponse.results.length > 0 && (
            <div className="research-search__results-header">
              <span className="research-search__results-count">
                {searchResponse.total} result{searchResponse.total !== 1 ? 's' : ''} found
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
              No results found. Try a different address or county.
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
              Successfully imported {importResult.count} document{importResult.count !== 1 ? 's' : ''} into your project.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
