// app/admin/research/components/PropertySearchPanel.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { PropertySearchResult, PropertySearchResponse, SearchSource } from '@/types/research';
import { DOCUMENT_TYPE_LABELS } from '@/types/research';

// Pipeline response types (from worker)
interface PipelineDocument {
  ref?: { documentType?: string; url?: string };
  hasText?: boolean;
  hasImage?: boolean;
  hasOcr?: boolean;
  extractedData?: {
    type?: string;
    callCount?: number;
    confidence?: number;
    verified?: boolean;
  } | null;
}

interface PipelineLogEntry {
  layer: string;
  source: string;
  method: string;
  input: string;
  status: string;
  duration_ms: number;
  dataPointsFound: number;
  error?: string;
  details?: string;
  timestamp?: string;
  steps?: string[];
}

interface PipelineStatusResponse {
  projectId: string;
  status: string;
  currentStage?: string;
  result?: {
    propertyId?: string;
    ownerName?: string;
    legalDescription?: string;
    acreage?: string | number;
    documentCount?: number;
    duration_ms?: number;
    boundary?: {
      type?: string;
      callCount?: number;
      confidence?: number;
      verified?: boolean;
    } | null;
    searchDiagnostics?: Record<string, unknown>;
  };
  documents?: PipelineDocument[];
  log?: PipelineLogEntry[];
}

interface PropertySearchPanelProps {
  projectId: string;
  defaultAddress?: string;
  defaultCounty?: string;
  defaultParcelId?: string;
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
  texas_file:      { label: 'TexasFile Deed Search', icon: '📋' },
};

export default function PropertySearchPanel({
  projectId,
  defaultAddress,
  defaultCounty,
  defaultParcelId,
  onImported,
}: PropertySearchPanelProps) {
  const [address, setAddress] = useState(defaultAddress || '');
  const [county, setCounty] = useState(defaultCounty || '');
  const [parcelId, setParcelId] = useState(defaultParcelId || '');
  const [ownerName, setOwnerName] = useState('');

  const [searching, setSearching] = useState(false);
  const [searchResponse, setSearchResponse] = useState<PropertySearchResponse | null>(null);
  const [searchError, setSearchError] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ count: number; mapNote?: string } | null>(null);

  const [showAddressIssues, setShowAddressIssues] = useState(true);

  // Lite pipeline state
  const [liteRunning, setLiteRunning] = useState(false);
  const [liteStage, setLiteStage] = useState<string | null>(null);
  const [liteError, setLiteError] = useState('');
  const [liteSummary, setLiteSummary] = useState<{
    links_found?: number;
    map_images_captured?: number;
    documents_imported?: number;
    documents_analyzed?: number;
    data_points_extracted?: number;
    discrepancies_found?: number;
    confidence_score?: number;
    owner_name?: string;
    legal_description?: string;
    acreage?: string;
    flood_zone?: string;
  } | null>(null);
  const liteRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Deep research pipeline state
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
  const [pipelineResult, setPipelineResult] = useState<PipelineStatusResponse | null>(null);
  const [pipelineError, setPipelineError] = useState('');
  const [showPipelineLog, setShowPipelineLog] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopLitePolling = useCallback(() => {
    if (liteRef.current) { clearInterval(liteRef.current); liteRef.current = null; }
  }, []);

  // Clean up lite polling interval on unmount to prevent memory leaks
  useEffect(() => () => stopLitePolling(), [stopLitePolling]);

  const pollLiteStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/lite-pipeline`);
      if (!res.ok) return;
      const data = await res.json() as { status: string; stage?: string; error?: string; summary?: typeof liteSummary };
      setLiteStage(data.stage || null);
      if (data.status === 'running') {
        setLiteRunning(true);
      } else {
        setLiteRunning(false);
        stopLitePolling();
        if (data.summary) setLiteSummary(data.summary);
        if (data.error) setLiteError(data.error);
        else onImported?.();
      }
    } catch { /* keep polling */ }
  }, [projectId, stopLitePolling, onImported]);

  async function startLitePipeline() {
    setLiteRunning(true);
    setLiteStage('Starting…');
    try {
      const res = await fetch(`/api/admin/research/${projectId}/lite-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address.trim() || undefined,
          county: county.trim() || undefined,
          owner_name: ownerName.trim() || undefined,
          parcel_id: parcelId.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setLiteError(err.error || 'Research failed');
        setLiteRunning(false);
        return;
      }
      stopLitePolling();
      liteRef.current = setInterval(pollLiteStatus, 4_000);
    } catch {
      setLiteError('Network error starting research.');
      setLiteRunning(false);
    }
  }

  // Unified handler: runs public records search and deep/lite pipeline simultaneously.
  async function handleInitiateResearch() {
    const anyRunning = liteRunning || searching || pipelineRunning;
    if (anyRunning) return;
    if (!address.trim() && !county.trim() && !parcelId.trim()) {
      setSearchError('Enter a property address, county, or parcel ID to start research.');
      return;
    }

    // Clear previous results
    setSearchError('');
    setLiteError('');
    setPipelineError('');
    setSearchResponse(null);
    setSelected(new Set());
    setImportResult(null);
    setShowAddressIssues(true);
    setLiteSummary(null);
    setPipelineResult(null);
    setPipelineStatus(null);

    // Phase 1: Public records search (discovers and displays website links)
    setSearching(true);
    fetch(`/api/admin/research/${projectId}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: address.trim() || undefined,
        county: county.trim() || undefined,
        parcel_id: parcelId.trim() || undefined,
        owner_name: ownerName.trim() || undefined,
      }),
    }).then(async res => {
      if (res.ok) {
        const data = await res.json() as PropertySearchResponse;
        setSearchResponse(data);
      } else {
        const err = await res.json() as { error?: string };
        setSearchError(err.error || 'Records search failed');
      }
      setSearching(false);
    }).catch(() => {
      setSearchError('Network error searching public records.');
      setSearching(false);
    });

    // Phase 2: Try deep research pipeline (navigates CAD/deed sites, takes screenshots, extracts data).
    // Falls back to lite pipeline automatically when no worker is configured.
    try {
      const res = await fetch(`/api/admin/research/${projectId}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address.trim() || undefined,
          county: county.trim() || undefined,
          propertyId: parcelId.trim() || undefined,
          ownerName: ownerName.trim() || undefined,
        }),
      });

      if (res.status === 503) {
        // Worker not configured — fall back to lite pipeline
        await startLitePipeline();
      } else if (res.ok) {
        setPipelineRunning(true);
        setPipelineStatus('running');
        stopPolling();
        pollRef.current = setInterval(pollPipelineStatus, 5_000);
      } else {
        const err = await res.json() as { error?: string };
        // If county missing, show specific error; otherwise fall back to lite
        if (res.status === 400 && err.error?.toLowerCase().includes('county')) {
          setPipelineError(err.error || 'County is required for deep research.');
        } else {
          await startLitePipeline();
        }
      }
    } catch {
      // Network error — fall back to lite pipeline
      await startLitePipeline();
    }
  }

  // Deep research pipeline state - NOTE: declared in state section above, not duplicated here

  // ── Deep Research Pipeline ──────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollPipelineStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/pipeline`);
      if (!res.ok) {
        if (res.status === 404) {
          setPipelineStatus('not_found');
          stopPolling();
        }
        return;
      }
      const data = await res.json() as PipelineStatusResponse;
      setPipelineResult(data);

      if (data.status === 'running') {
        setPipelineStatus('running');
      } else {
        // Pipeline finished (success, partial, or failed)
        setPipelineStatus(data.status);
        setPipelineRunning(false);
        stopPolling();
        onImported?.();
      }
    } catch {
      // Network error — keep polling
    }
  }, [projectId, stopPolling, onImported]);

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
    setSelected(new Set(searchResponse.results.map((r: PropertySearchResult) => r.id)));
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

  function researchButtonLabel(): string {
    if (pipelineRunning) {
      const stage = pipelineResult?.currentStage;
      return `⏳ Researching${stage ? ` — ${stage}` : '…'}`;
    }
    if (liteRunning) return `⏳ ${liteStage || 'Researching…'}`;
    if (searching) return '⏳ Searching public records…';
    return '🔍 Initiate Research & Analysis';
  }

  return (
    <div className="research-search">
      <div className="research-search__header">
        <h3 className="research-search__title">Research & Analysis</h3>
        <p className="research-search__desc">
          Enter the property details below and click <strong>Initiate Research &amp; Analysis</strong>. The AI will search all public records, navigate county CAD and deed/records office websites, capture screenshots of relevant documents, extract all available property information — including bearings, coordinates, acreage, and legal descriptions — and log any discrepancies found.
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
            onKeyDown={e => e.key === 'Enter' && handleInitiateResearch()}
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

        {(searchError || liteError || pipelineError) && (
          <div className="research-search__error">
            {searchError || liteError || pipelineError}
          </div>
        )}

        {/* ── Single Research Button ── */}
        <div className="research-search__actions">
          <button
            className="research-page__new-btn"
            onClick={handleInitiateResearch}
            disabled={liteRunning || searching || pipelineRunning}
            style={{ width: '100%', padding: '0.65rem 1.5rem', fontSize: '1rem' }}
          >
            {researchButtonLabel()}
          </button>
        </div>

        {/* ── Unified status banner (visible while any pipeline is running) ── */}
        {(searching || liteRunning || pipelineRunning) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem', padding: '0.6rem 0.85rem', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8 }}>
            {searching && (
              <div style={{ fontSize: '0.82rem', color: '#1D4ED8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#3B82F6', animation: 'pulse 1.5s infinite' }} />
                Searching county CAD, deed records, FEMA, TNRIS and more…
              </div>
            )}
            {liteRunning && liteStage && (
              <div style={{ fontSize: '0.82rem', color: '#065F46', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#059669', animation: 'pulse 1.5s infinite' }} />
                {liteStage}
              </div>
            )}
            {pipelineRunning && (
              <div style={{ fontSize: '0.82rem', color: '#5B21B6', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#7C3AED', animation: 'pulse 1.5s infinite' }} />
                Navigating county CAD and deed records, extracting data…
                {pipelineResult?.currentStage && ` (${pipelineResult.currentStage})`}
              </div>
            )}
          </div>
        )}

        {/* ── Research pipeline results (deep or lite) ── */}
        {(liteSummary || pipelineStatus) && (
          <div style={{ marginTop: '0.75rem' }}>

            {/* Lite pipeline summary */}
            {liteSummary && !liteRunning && (
              <>
                <div style={{ marginBottom: '0.4rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
                  {liteSummary.links_found !== undefined && (
                    <div style={{ background: '#F0FDF4', padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #D1FAE5', fontSize: '0.8rem' }}>
                      <strong>{liteSummary.links_found}</strong> record links found
                    </div>
                  )}
                  {liteSummary.documents_imported !== undefined && (
                    <div style={{ background: '#F0FDF4', padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #D1FAE5', fontSize: '0.8rem' }}>
                      <strong>{liteSummary.documents_imported}</strong> documents imported
                    </div>
                  )}
                  {liteSummary.data_points_extracted !== undefined && (
                    <div style={{ background: '#F0FDF4', padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #D1FAE5', fontSize: '0.8rem' }}>
                      <strong>{liteSummary.data_points_extracted}</strong> data points extracted
                    </div>
                  )}
                  {liteSummary.discrepancies_found !== undefined && liteSummary.discrepancies_found > 0 && (
                    <div style={{ background: '#FEF3C7', padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #FDE68A', fontSize: '0.8rem' }}>
                      ⚠ <strong>{liteSummary.discrepancies_found}</strong> discrepancies found
                    </div>
                  )}
                  {liteSummary.confidence_score !== undefined && (
                    <div style={{ background: '#F0FDF4', padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #D1FAE5', fontSize: '0.8rem' }}>
                      <strong>{liteSummary.confidence_score}%</strong> confidence
                    </div>
                  )}
                  {liteSummary.acreage && (
                    <div style={{ background: '#F0FDF4', padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #D1FAE5', fontSize: '0.8rem' }}>
                      Area: <strong>{liteSummary.acreage}</strong>
                    </div>
                  )}
                  {liteSummary.flood_zone && (
                    <div style={{ background: '#F0FDF4', padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #D1FAE5', fontSize: '0.8rem' }}>
                      Flood Zone: <strong>{liteSummary.flood_zone}</strong>
                    </div>
                  )}
                </div>
                {liteSummary.owner_name && (
                  <div style={{ padding: '0.4rem 0.6rem', background: '#F0FDF4', borderRadius: 6, border: '1px solid #D1FAE5', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                    <strong>Owner:</strong> {liteSummary.owner_name}
                  </div>
                )}
                {liteSummary.legal_description && (
                  <div style={{ padding: '0.5rem 0.75rem', background: '#F0FDF4', borderRadius: 6, border: '1px solid #D1FAE5', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                    <strong>Legal Description: </strong>
                    {liteSummary.legal_description.length > 300
                      ? liteSummary.legal_description.slice(0, 300) + '...'
                      : liteSummary.legal_description}
                  </div>
                )}
                <div style={{ fontSize: '0.78rem', color: '#065F46', fontWeight: 600 }}>
                  ✓ Research complete — review the Extracted Data and Survey Plan tabs above.
                </div>
              </>
            )}

            {/* Deep pipeline results */}
            {pipelineStatus && (
              <div className={`research-search__pipeline research-search__pipeline--${pipelineStatus}`}>
                <div className="research-search__pipeline-header">
                  <span className="research-search__pipeline-icon">
                    {pipelineStatus === 'running' || pipelineStatus === 'starting' ? '...' : pipelineStatus === 'success' || pipelineStatus === 'partial' ? 'OK' : '!!'}
                  </span>
                  <span className="research-search__pipeline-title">
                    {pipelineStatus === 'starting' && 'Starting research…'}
                    {pipelineStatus === 'running' && `Research running${pipelineResult?.currentStage ? ` — ${pipelineResult.currentStage}` : ''}…`}
                    {pipelineStatus === 'success' && 'Research complete'}
                    {pipelineStatus === 'partial' && 'Research complete (partial results)'}
                    {pipelineStatus === 'failed' && 'Research failed'}
                  </span>
                </div>

                {/* Results summary */}
                {pipelineResult?.result && (
                  <div className="research-search__pipeline-results">
                    {pipelineResult.result.propertyId && (
                      <div className="research-search__pipeline-field">
                        <strong>Property ID:</strong> {pipelineResult.result.propertyId}
                      </div>
                    )}
                    {pipelineResult.result.ownerName && (
                      <div className="research-search__pipeline-field">
                        <strong>Owner:</strong> {pipelineResult.result.ownerName}
                      </div>
                    )}
                    {pipelineResult.result.legalDescription && (
                      <div className="research-search__pipeline-field">
                        <strong>Legal Description:</strong>
                        <span className="research-search__pipeline-legal">
                          {pipelineResult.result.legalDescription.length > 200
                            ? pipelineResult.result.legalDescription.substring(0, 200) + '...'
                            : pipelineResult.result.legalDescription}
                        </span>
                      </div>
                    )}
                    {pipelineResult.result.acreage && (
                      <div className="research-search__pipeline-field">
                        <strong>Acreage:</strong> {pipelineResult.result.acreage}
                      </div>
                    )}
                    {pipelineResult.result.documentCount !== undefined && pipelineResult.result.documentCount > 0 && (
                      <div className="research-search__pipeline-field">
                        <strong>Documents found:</strong> {pipelineResult.result.documentCount}
                      </div>
                    )}
                    {pipelineResult.result.boundary && (
                      <div className="research-search__pipeline-field">
                        <strong>Boundary:</strong> {pipelineResult.result.boundary.type}
                        {' '}({pipelineResult.result.boundary.callCount} calls,{' '}
                        confidence: {Math.round((pipelineResult.result.boundary.confidence ?? 0) * 100)}%
                        {pipelineResult.result.boundary.verified ? ' — Verified ✓' : ''})
                      </div>
                    )}
                    {pipelineResult.result.duration_ms && (
                      <div className="research-search__pipeline-field">
                        <strong>Duration:</strong> {(pipelineResult.result.duration_ms / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                )}

                {/* Document list */}
                {pipelineResult?.documents && pipelineResult.documents.length > 0 && (
                  <div className="research-search__pipeline-docs">
                    <strong>Documents captured:</strong>
                    <div className="research-search__pipeline-doc-list">
                      {pipelineResult.documents.map((doc: PipelineDocument, i: number) => (
                        <div key={i} className="research-search__pipeline-doc">
                          <span className="research-search__pipeline-doc-type">{doc.ref?.documentType || 'Document'}</span>
                          {doc.hasText && <span className="research-search__pipeline-doc-tag">Text</span>}
                          {doc.hasImage && <span className="research-search__pipeline-doc-tag">Image</span>}
                          {doc.hasOcr && <span className="research-search__pipeline-doc-tag">OCR</span>}
                          {doc.extractedData && (
                            <span className="research-search__pipeline-doc-tag research-search__pipeline-doc-tag--extracted">
                              {doc.extractedData.type} ({Math.round((doc.extractedData.confidence ?? 0) * 100)}%)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pipeline Audit Log */}
                {pipelineResult?.log && pipelineResult.log.length > 0 && (
                  <div className="research-search__pipeline-log-section">
                    <button
                      className="research-search__advanced-toggle"
                      onClick={() => setShowPipelineLog(!showPipelineLog)}
                      type="button"
                    >
                      {showPipelineLog ? '-- Hide' : '++ Show'} Pipeline Log ({pipelineResult.log.length} entries)
                    </button>

                    {showPipelineLog && (
                      <div className="research-search__pipeline-log">
                        {pipelineResult.log.map((entry: PipelineLogEntry, i: number) => (
                          <div
                            key={i}
                            className={`research-search__pipeline-log-entry research-search__pipeline-log-entry--${entry.status}`}
                          >
                            <div className="research-search__pipeline-log-header">
                              <span className="research-search__pipeline-log-badge">{entry.layer}</span>
                              <span className="research-search__pipeline-log-source">{entry.source}</span>
                              <span className="research-search__pipeline-log-method">{entry.method}</span>
                              <span className={`research-search__pipeline-log-status research-search__pipeline-log-status--${entry.status}`}>
                                {entry.status}
                              </span>
                              {entry.duration_ms > 0 && (
                                <span className="research-search__pipeline-log-duration">{(entry.duration_ms / 1000).toFixed(1)}s</span>
                              )}
                            </div>
                            {entry.input && (
                              <div className="research-search__pipeline-log-input">Input: {entry.input}</div>
                            )}
                            {entry.details && (
                              <div className="research-search__pipeline-log-details">{entry.details}</div>
                            )}
                            {entry.error && (
                              <div className="research-search__pipeline-log-error">Error: {entry.error}</div>
                            )}
                            {entry.dataPointsFound > 0 && (
                              <div className="research-search__pipeline-log-data">Data points: {entry.dataPointsFound}</div>
                            )}
                            {entry.steps && entry.steps.length > 0 && (
                              <div className="research-search__pipeline-log-steps">
                                {entry.steps.map((step: string, j: number) => (
                                  <div key={j} className="research-search__pipeline-log-step">{step}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
                  Select all
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
