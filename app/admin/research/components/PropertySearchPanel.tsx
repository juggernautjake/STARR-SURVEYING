// app/admin/research/components/PropertySearchPanel.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import NextImage from 'next/image';
import type { PropertySearchResult, PropertySearchResponse, SearchSource } from '@/types/research';
import { DOCUMENT_TYPE_LABELS } from '@/types/research';
import Image from 'next/image';
import { PipelineProgressPanel, PipelineProgressStyles } from './PipelineProgressPanel';

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
  status: 'success' | 'fail' | 'skip' | 'partial';
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
  /** Latest updateStatus message, e.g. "Stage 2: Retrieving documents…" */
  message?: string;
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
  /** Human-readable failure reason for display in the UI. */
  failureReason?: string;
  /** Full master report text from Stage 6 (only present on successful completion). */
  masterReportText?: string;
}

interface PropertySearchPanelProps {
  projectId: string;
  defaultAddress?: string;
  defaultCounty?: string;
  defaultParcelId?: string;
  onImported?: () => void;
  /**
   * When provided the "Initiate Research & Analysis" button calls this callback
   * (passing current form values) instead of running the search inline.
   * Used by Stage 1 so clicking the button navigates to Stage 2.
   */
  onNavigateAway?: (params: { address: string; county: string; parcelId: string; ownerName: string }) => void;
  /**
   * When true, the search-results section (source chips, online-resource links,
   * location map, pipeline progress panel) is hidden.  Only the input form and
   * button are rendered.  Used by Stage 1 so no links appear there.
   */
  hideResultsAndProgress?: boolean;
  /**
   * When true, automatically fires "Initiate Research & Analysis" on mount.
   * Used by Stage 2 so research begins the moment the node is entered.
   */
  autoStart?: boolean;
  /**
   * When true, always hides the address/county/parcel form inputs and research
   * button regardless of whether autoStart is set.  Used by Stage 2 so the
   * property information form never appears during the research run.
   */
  alwaysHideForm?: boolean;
  /**
   * Fires when the deep research pipeline finishes (status: success | partial | failed).
   * Does NOT fire for lite-pipeline runs.
   */
  onPipelineComplete?: (status: string) => void;
  /**
   * Fires the moment any pipeline (deep or lite) starts running.
   * Used by Stage 2 to hide the introductory title and description text.
   */
  onPipelineStart?: () => void;
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

// ── Bell County Auto-Detection ──────────────────────────────────────────────
// Keep in sync with worker/src/counties/router.ts BELL_COUNTY_CITIES

const BELL_COUNTY_CITIES_LOWER = [
  'belton', 'killeen', 'temple', 'harker heights', 'nolanville', 'salado',
  'holland', 'rogers', 'troy', 'moody', 'bartlett', 'little river-academy',
  'little river academy', 'copperas cove', 'morgans point resort', 'moffat',
  'pendleton', 'eddy', 'heidenheimer', 'academy', 'prairie dell',
];

const BELL_COUNTY_ZIPS = new Set([
  '76501', '76502', '76503', '76504', '76505', '76506', '76507', '76508',
  '76513', '76517', '76520', '76522', '76523', '76524', '76525', '76526',
  '76527', '76528', '76530', '76534', '76537', '76538', '76539',
  '76540', '76541', '76542', '76543', '76544', '76545', '76546', '76547',
  '76548', '76549', '76554', '76557', '76561', '76569', '76570', '76571',
]);

function detectBellCountyFromAddress(address: string): boolean {
  if (!address) return false;
  const lower = address.toLowerCase();
  if (/\bbell\s+county\b/.test(lower)) return true;
  for (const city of BELL_COUNTY_CITIES_LOWER) {
    const escaped = city.replace(/-/g, '[-\\s]?');
    if (new RegExp(`\\b${escaped}\\b`).test(lower)) return true;
  }
  const zipMatches = address.match(/\b(\d{5})(?:-\d{4})?\b/g);
  if (zipMatches) {
    for (const zip of zipMatches) {
      if (BELL_COUNTY_ZIPS.has(zip.slice(0, 5))) return true;
    }
  }
  return false;
}
// ── End Bell County Auto-Detection ─────────────────────────────────────────

export default function PropertySearchPanel({
  projectId,
  defaultAddress,
  defaultCounty,
  defaultParcelId,
  onImported,
  onNavigateAway,
  hideResultsAndProgress,
  autoStart,
  alwaysHideForm,
  onPipelineComplete,
  onPipelineStart,
}: PropertySearchPanelProps) {
  const [address, setAddress] = useState(defaultAddress || '');
  const [county, setCounty] = useState(defaultCounty || '');
  // Track whether the county was auto-populated (so we can clear it if address changes)
  const [countyAutoDetected, setCountyAutoDetected] = useState(false);
  const [parcelId, setParcelId] = useState(defaultParcelId || '');
  const [ownerName, setOwnerName] = useState('');

  const [searching, setSearching] = useState(false);
  const [searchResponse, setSearchResponse] = useState<PropertySearchResponse | null>(null);
  const [searchError, setSearchError] = useState('');
  const [mapImgError, setMapImgError] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ count: number; newCount?: number; alreadyExistedCount?: number; mapNote?: string } | null>(null);

  const [showAddressIssues, setShowAddressIssues] = useState(true);
  const [resourcesOpen, setResourcesOpen] = useState(true);

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
  const [pipelineStallMinutes, setPipelineStallMinutes] = useState(0);
  // showPipelineLog moved to PipelineProgressPanel (internal state)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // How many consecutive 404 responses we've received — we only give up after 5
  // consecutive misses so a brief worker restart doesn't kill the poll.
  const consecutive404CountRef = useRef(0);
  // Timestamp when the current polling run started — used to compute stall warnings.
  const pollStartTimeRef = useRef<number>(0);

  // Auto-start: fire handleInitiateResearch once on mount when autoStart is true.
  // We use a ref so navigating back to Stage 2 doesn't re-fire the auto-start.
  const autoStartFiredRef = useRef(false);
  // Keep a stable ref to handleInitiateResearch so the effect closure stays fresh.
  const handleInitiateResearchRef = useRef<(() => void) | null>(null);

  const stopLitePolling = useCallback(() => {
    if (liteRef.current) { clearInterval(liteRef.current); liteRef.current = null; }
  }, []);

  // Clean up lite polling interval on unmount to prevent memory leaks
  useEffect(() => () => stopLitePolling(), [stopLitePolling]);

  // When autoStart is true, trigger research once after the first render so
  // the default form values (address / county / parcelId) have been applied.
  useEffect(() => {
    if (!autoStart || autoStartFiredRef.current) return;
    autoStartFiredRef.current = true;
    // handleInitiateResearchRef is assigned synchronously on every render (see below),
    // so it is guaranteed to be non-null here.
    if (handleInitiateResearchRef.current) {
      handleInitiateResearchRef.current();
    }
  // Only run on mount; handleInitiateResearchRef is kept fresh below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    onPipelineStart?.();
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
    // If a parent supplied onNavigateAway, delegate navigation to them and stop here.
    // Stage 2 will re-mount this component with autoStart=true and run the research there.
    if (onNavigateAway) {
      onNavigateAway({ address, county, parcelId, ownerName });
      return;
    }

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
    setMapImgError(false);
    setSelected(new Set());
    setImportResult(null);
    setShowAddressIssues(true);
    setResourcesOpen(true);
    setLiteSummary(null);
    setPipelineResult(null);
    setPipelineStatus(null);

    // Phase 1: Public records search (discovers and displays website links).
    // When autoStart is true (Stage 2), all found results are automatically imported.
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
        // In Stage 2 mode (autoStart=true), silently import all found resources
        // into the project so they are immediately available for the pipeline.
        if (autoStart && data.results.length > 0) {
          importAllResults(data.results);
        }
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
        setPipelineStallMinutes(0);
        consecutive404CountRef.current = 0;
        pollStartTimeRef.current = Date.now();
        onPipelineStart?.();
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

  // Keep the ref in sync with the latest version of handleInitiateResearch so
  // the autoStart useEffect always calls the current closure.
  handleInitiateResearchRef.current = handleInitiateResearch;

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
          consecutive404CountRef.current += 1;
          // Only give up after 5 consecutive 404s — a transient worker restart
          // or in-flight deployment can cause a brief 404 that should be retried.
          if (consecutive404CountRef.current >= 5) {
            setPipelineStatus('not_found');
            stopPolling();
          }
        }
        // For all other non-OK responses keep polling (same as network errors).
        return;
      }
      // Successful response — reset the 404 counter.
      consecutive404CountRef.current = 0;

      // Update stall-warning display (elapsed minutes since polling started).
      const elapsedMs = Date.now() - pollStartTimeRef.current;
      const elapsedMin = Math.floor(elapsedMs / 60_000);
      setPipelineStallMinutes(elapsedMin);

      const data = await res.json() as PipelineStatusResponse;
      setPipelineResult(data);

      if (data.status === 'running') {
        setPipelineStatus('running');
      } else {
        // Pipeline finished.  County-specific pipelines return 'complete' while
        // the generic pipeline returns 'success', 'partial', or 'failed'.
        // Normalise 'complete' → 'success' so downstream status checks are uniform.
        const normalised = data.status === 'complete' ? 'success'
          : (data.status || 'failed');
        setPipelineStatus(normalised);
        setPipelineRunning(false);
        setPipelineStallMinutes(0);
        stopPolling();
        onImported?.();
        onPipelineComplete?.(normalised);
      }
    } catch {
      // Network error — keep polling
    }
  }, [projectId, stopPolling, onImported, onPipelineComplete]);

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

  /** Silently import all results without user selection — used in Stage 2 (autoStart) mode. */
  async function importAllResults(results: PropertySearchResult[]) {
    if (!results.length) return;
    try {
      const res = await fetch(`/api/admin/research/${projectId}/search`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: results.map((r: PropertySearchResult) => ({
            source: r.source,
            source_name: r.source_name,
            title: r.title,
            url: r.url,
            document_type: r.document_type,
            description: r.description,
          })),
          address: address.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const mapNote = data.map_images_queued
          ? ' Satellite and topo map images are being captured in the background and will appear in Documents.'
          : '';
        setImportResult({
          count: data.imported,
          newCount: data.new_count,
          alreadyExistedCount: data.already_existed_count,
          mapNote,
        });
        onImported?.();
      } else {
        // Non-fatal: log the failure but don't block the pipeline run
        console.warn('[PropertySearchPanel] Auto-import returned non-OK status', res.status);
      }
    } catch (err) {
      // Non-fatal: the pipeline can still run without the import records
      console.warn('[PropertySearchPanel] Auto-import network error', err);
    }
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
        setImportResult({
          count: data.imported,
          newCount: data.new_count,
          alreadyExistedCount: data.already_existed_count,
          mapNote,
        });
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

  // Research stage mode: either autoStart=true (arrived from Stage 1) or alwaysHideForm=true
  // (forced by page.tsx when in Stage 2).  In this mode: hide the form inputs and the
  // research button (already set from Stage 1), suppress the redundant loading animation
  // (PipelineProgressPanel handles it), and never show search results here
  // (they go to Stage 3 Review instead).
  const isStage2Mode = autoStart === true || alwaysHideForm === true;
  const isPipelineDone = pipelineStatus === 'success' || pipelineStatus === 'partial' || pipelineStatus === 'failed';

  // Show search results only when not in Stage 2 mode, the pipeline is idle,
  // and results are available.  In Stage 2 mode all source results go to the
  // Review stage, so we never show them here.
  const shouldShowSearchResults =
    !hideResultsAndProgress &&
    !isStage2Mode &&
    !!searchResponse &&
    !pipelineRunning &&
    !liteRunning;

  function researchButtonLabel(): string {
    if (pipelineRunning) {
      const stage = pipelineResult?.currentStage;
      return `⏳ Researching${stage ? ` — ${stage}` : '…'}`;
    }
    if (liteRunning) return `⏳ ${liteStage || 'Researching…'}`;
    if (searching) return '⏳ Searching public records…';
    if (isStage2Mode && isPipelineDone) return '🔄 Re-run Research & Analysis';
    return '🔍 Initiate Research & Analysis';
  }

  return (
    <div className="research-search">
      {/* Header — hidden in Stage 2 mode since page.tsx already provides a title */}
      {!isStage2Mode && (
        <div className="research-search__header">
          <h3 className="research-search__title">
            {hideResultsAndProgress ? 'Property Information' : 'Research & Analysis'}
          </h3>
          <p className="research-search__desc">
            {hideResultsAndProgress
              ? <>Enter the property details below, then click <strong>Initiate Research &amp; Analysis</strong> to begin. You can also upload deeds, plats, and field notes using the panel above.</>
              : <>The AI is searching all public records, navigating county CAD and deed/records office websites, capturing screenshots of relevant documents, and extracting all available property information — including bearings, coordinates, acreage, and legal descriptions.</>
            }
          </p>
        </div>
      )}

      {/* Search form — hidden in Stage 2 (values were set in Stage 1) */}
      {!isStage2Mode && (
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
              onChange={e => {
                const val = e.target.value;
                setAddress(val);
                // Auto-detect Bell County from address when county is blank or was auto-filled
                if (!county.trim() || countyAutoDetected) {
                  if (detectBellCountyFromAddress(val)) {
                    setCounty('Bell');
                    setCountyAutoDetected(true);
                  } else if (countyAutoDetected) {
                    // Clear the auto-detected county if address no longer matches
                    setCounty('');
                    setCountyAutoDetected(false);
                  }
                }
              }}
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
                onChange={e => {
                  setCounty(e.target.value);
                  // If user manually edits county, stop auto-detecting
                  setCountyAutoDetected(false);
                }}
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

          {/* ── Research loading animation (not shown in Stage 2 — PipelineProgressPanel handles it) ── */}
          {!hideResultsAndProgress && (searching || liteRunning || pipelineRunning) && (
            <div className="research-search__loading">
              <div className="research-search__loading-spinner" />
              <div className="research-search__loading-title">Research In Progress</div>
              <div className="research-search__loading-subtitle">
                {pipelineRunning && pipelineResult?.message
                  ? pipelineResult.message.replace(/^Stage\s*\d+(?:\.\d+)?:\s*/i, '')
                  : pipelineRunning && pipelineResult?.currentStage
                  ? pipelineResult.currentStage
                  : liteRunning && liteStage
                  ? liteStage
                  : 'Gathering property data…'}
              </div>
              <div className="research-search__loading-steps">
                <div className={`research-search__loading-step${searching ? ' research-search__loading-step--active' : ' research-search__loading-step--done'}`}>
                  <span className="research-search__loading-step__dot" />
                  {searching
                    ? 'Searching county CAD, deed records, FEMA, TNRIS…'
                    : 'Public records search complete'}
                </div>
                <div className={`research-search__loading-step${liteRunning || pipelineRunning ? ' research-search__loading-step--active' : ''}`}>
                  <span className="research-search__loading-step__dot" />
                  {pipelineRunning
                    ? (pipelineResult?.message
                        ? pipelineResult.message
                        : 'Navigating county records sites, extracting data…')
                    : liteRunning
                    ? (liteStage || 'Analyzing property data…')
                    : 'Awaiting pipeline start…'}
                </div>
              </div>
              {/* Stall warning — shown after 45+ minutes to reassure user the run is continuing */}
              {pipelineRunning && pipelineStallMinutes >= 45 && (
                <div style={{ marginTop: '0.5rem', padding: '0.4rem 0.6rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: '0.78rem', color: '#92400e' }}>
                  ⏳ Still running ({pipelineStallMinutes} min elapsed) — complex properties with many documents take longer. The run will complete on its own.
                </div>
              )}
            </div>
          )}

          {/* ── Research pipeline results (deep or lite) ── */}
          {!hideResultsAndProgress && (liteSummary || pipelineStatus) && (
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


              {/* Deep pipeline results — animated stage tracker */}
              {pipelineStatus && (
                <>
                  <PipelineProgressStyles />
                  <PipelineProgressPanel
                    status={pipelineStatus}
                    message={pipelineResult?.message}
                    currentStage={pipelineResult?.currentStage}
                    result={pipelineResult?.result}
                    documents={pipelineResult?.documents}
                    log={pipelineResult?.log}
                    failureReason={pipelineResult?.failureReason}
                    masterReportText={pipelineResult?.masterReportText}
                    onLoadLogs={async () => {
                      try {
                        const res = await fetch(`/api/admin/research/${projectId}/logs`);
                        if (!res.ok) return null;
                        const data = await res.json() as { log?: PipelineLogEntry[] };
                        return data.log ?? null;
                      } catch {
                        return null;
                      }
                    }}
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Stage 2 mode: full-width pipeline progress + post-run controls ──────
           When autoStart=true (arrived from Stage 1), we skip the form entirely and
           show the PipelineProgressPanel as the primary content.  Search results
           (location map, online resources) are deferred until the run completes. */}
      {isStage2Mode && (
        <div className="research-search__stage2">

          {/* Errors (e.g. county missing) */}
          {(searchError || liteError || pipelineError) && (
            <div className="research-search__error" style={{ marginBottom: '0.75rem' }}>
              {searchError || liteError || pipelineError}
            </div>
          )}

          {/* Stall warning */}
          {pipelineRunning && pipelineStallMinutes >= 45 && (
            <div style={{ marginBottom: '0.75rem', padding: '0.4rem 0.6rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: '0.78rem', color: '#92400e' }}>
              ⏳ Still running ({pipelineStallMinutes} min elapsed) — complex properties with many documents take longer.
            </div>
          )}

          {/* Lite pipeline summary (when lite fallback ran) */}
          {liteSummary && !liteRunning && (
            <div style={{ marginBottom: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
              {liteSummary.links_found !== undefined && (
                <div style={{ background: '#F0FDF4', padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #D1FAE5', fontSize: '0.8rem' }}>
                  <strong>{liteSummary.links_found}</strong> links found
                </div>
              )}
              {liteSummary.documents_imported !== undefined && (
                <div style={{ background: '#F0FDF4', padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #D1FAE5', fontSize: '0.8rem' }}>
                  <strong>{liteSummary.documents_imported}</strong> documents
                </div>
              )}
              {liteSummary.confidence_score !== undefined && (
                <div style={{ background: '#F0FDF4', padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #D1FAE5', fontSize: '0.8rem' }}>
                  <strong>{liteSummary.confidence_score}%</strong> confidence
                </div>
              )}
            </div>
          )}

          {/* PipelineProgressPanel — the primary animated progress + log display */}
          {pipelineStatus && (
            <>
              <PipelineProgressStyles />
              <PipelineProgressPanel
                status={pipelineStatus}
                message={pipelineResult?.message}
                currentStage={pipelineResult?.currentStage}
                result={pipelineResult?.result}
                documents={pipelineResult?.documents}
                log={pipelineResult?.log}
                failureReason={pipelineResult?.failureReason}
                masterReportText={pipelineResult?.masterReportText}
                hideCompletionDetails={isStage2Mode}
                onLoadLogs={async () => {
                  try {
                    const res = await fetch(`/api/admin/research/${projectId}/logs`);
                    if (!res.ok) return null;
                    const data = await res.json() as { log?: PipelineLogEntry[] };
                    return data.log ?? null;
                  } catch {
                    return null;
                  }
                }}
              />
            </>
          )}

          {/* Lite pipeline liveRunning fallback spinner */}
          {liteRunning && !pipelineStatus && (
            <div className="research-search__loading">
              <div className="research-search__loading-spinner" />
              <div className="research-search__loading-title">Research In Progress</div>
              <div className="research-search__loading-subtitle">{liteStage || 'Analyzing property data…'}</div>
            </div>
          )}

          {/* Re-run button — shown after completion so user can redo research */}
          {isPipelineDone && (
            <div style={{ marginTop: '0.75rem' }}>
              <button
                className="research-page__new-btn"
                onClick={handleInitiateResearch}
                disabled={pipelineRunning || searching || liteRunning}
                style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem', background: 'none', border: '1px solid #D1D5DB', color: '#374151', borderRadius: '0.375rem', cursor: 'pointer' }}
              >
                🔄 Re-run Research
              </button>
            </div>
          )}
        </div>
      )}

      {/* Search results — source chips, location map, online resources.
          In Stage 2 mode: only shown after the pipeline is done so they don't
          appear mid-run and clutter the progress view.
          In non-Stage 2 mode: also hidden while a pipeline is running, so the
          Online Resources panel doesn't clutter the progress animation.        */}
      {shouldShowSearchResults && (
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
              {!mapImgError && (
                <NextImage
                  className="research-search__map-img"
                  src={searchResponse.location_preview_url}
                  alt="Satellite view of geocoded property location"
                  width={0}
                  height={0}
                  sizes="100vw"
                  unoptimized
                  onError={() => setMapImgError(true)}
                />
              )}
            </div>
          )}

          {/* Collapsible Online Resources */}
          {searchResponse.results.length > 0 ? (
            <div className="research-search__resources-collapsible">
              {/* Toggle header */}
              <div
                className="research-search__resources-toggle-header"
                onClick={() => setResourcesOpen(prev => !prev)}
                role="button"
                aria-expanded={resourcesOpen}
              >
                <span className="research-search__resources-toggle-title">
                  🌐 Online Resources
                </span>
                <span className="research-search__results-count">
                  {searchResponse.total} result{searchResponse.total !== 1 ? 's' : ''}
                  {specificCount > 0 && (
                    <span className="research-search__specific-count">
                      {' '}— {specificCount} property-specific
                    </span>
                  )}
                </span>
                <div className="research-search__select-controls" onClick={e => e.stopPropagation()}>
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
                <span className="research-search__toggle-chevron" aria-hidden="true">
                  {resourcesOpen ? '▲' : '▼'}
                </span>
              </div>

              {/* Collapsible body */}
              {resourcesOpen && (
                <div className="research-search__resources-body">
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
                </div>
              )}
            </div>
          ) : (
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
              <p>
                ✅ Successfully imported {importResult.count} document{importResult.count !== 1 ? 's' : ''} into your project.
                {importResult.alreadyExistedCount != null && importResult.alreadyExistedCount > 0 && (
                  <span className="research-search__import-existing-note">
                    {' '}({importResult.newCount} new, {importResult.alreadyExistedCount} already existed)
                  </span>
                )}
              </p>
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
