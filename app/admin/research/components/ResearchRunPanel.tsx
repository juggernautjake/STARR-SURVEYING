/**
 * ResearchRunPanel — Stage 2 of the Research Pipeline
 *
 * Shows exactly two elements during and after a pipeline run:
 *   1. A full-width progress indicator (spinner → checkmark on completion)
 *   2. A full-width raw log viewer with auto-scroll and filter bar
 *
 * On successful completion a "Continue to Review →" button appears.
 * A "← Back to Property Information" button is always visible.
 *
 * Nothing else is shown — no address form, no document pills,
 * no result card, no search results.
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PipelineLogEntry {
  layer: string;
  source: string;
  method: string;
  input?: string;
  status: 'success' | 'fail' | 'skip' | 'partial' | 'warn';
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
  message?: string;
  startedAt?: string;
  result?: {
    propertyId?: string;
    ownerName?: string;
    legalDescription?: string;
    acreage?: string | number;
    documentCount?: number;
    duration_ms?: number;
    boundary?: { type?: string; callCount?: number; confidence?: number; verified?: boolean } | null;
    finalSummary?: string;
  };
  documents?: Array<{
    ref?: { documentType?: string; instrumentNumber?: string | null; source?: string };
    hasText?: boolean;
    hasImage?: boolean;
    hasOcr?: boolean;
    extractedData?: { type?: string; confidence?: number } | null;
  }>;
  log?: PipelineLogEntry[];
  failureReason?: string;
}

export interface ResearchRunPanelProps {
  projectId: string;
  /** Pre-filled address from Stage 1 */
  address?: string;
  /** Pre-filled county from Stage 1 */
  county?: string;
  /** Pre-filled parcel ID from Stage 1 */
  parcelId?: string;
  /** Pre-filled owner name from Stage 1 */
  ownerName?: string;
  /**
   * When true (default), fires the pipeline POST automatically on mount.
   * Set to true when arriving from Stage 1 via "Initiate Research & Analysis".
   * Set to false to delay the start until the caller triggers it explicitly
   * (reserved for future manual-trigger use-cases).
   */
  autoStart?: boolean;
  /** Called when the pipeline run starts (first status update received) */
  onPipelineStart?: () => void;
  /** Called when the pipeline run ends with its final status */
  onPipelineComplete?: (status: string) => void;
  /** "← Back to Property Information" button handler */
  onBack?: () => void;
  /** "Continue to Review →" button handler (shown on completion) */
  onContinueToReview?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Worker pipeline stage names derived from the message field */
const MICRO_STAGES = [
  { id: 'compiling',        label: 'Compiling Resources',        stageNums: [0, 1] },
  { id: 'validating',       label: 'Validating Information',      stageNums: [1] },
  { id: 'analyzing',        label: 'Analyzing Resources',         stageNums: [2] },
  { id: 'extracting',       label: 'Extracting Data',             stageNums: [3] },
  { id: 'compiling_data',   label: 'Compiling Data',              stageNums: [3] },
  { id: 'validating_data',  label: 'Validating Data',             stageNums: [3, 4] },
  { id: 'resource_summary', label: 'Building Resource Summary',   stageNums: [5] },
  { id: 'final_summary',    label: 'Building Final Summary',      stageNums: [6] },
] as const;

type MicroStageId = (typeof MICRO_STAGES)[number]['id'];

type LogFilter = 'all' | 'errors' | 'warn' | 'info';

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferMicroStage(message: string | undefined, status: string | null, docCount: number): MicroStageId {
  if (!status || status === 'starting') return 'compiling';
  if (status === 'success' || status === 'partial' || status === 'complete') return 'final_summary';
  if (!message) return 'compiling';
  const lower = message.toLowerCase();
  if (/stage\s*0/i.test(message) || /stage\s*1/i.test(message) || /normaliz/i.test(lower) || /searching.*cad/i.test(lower)) return 'compiling';
  if (/stage\s*2/i.test(message) || /retrieving/i.test(lower)) return docCount > 0 ? 'validating' : 'compiling';
  if (/stage\s*3/i.test(message) || /extract/i.test(lower) || /claude/i.test(lower)) {
    if (/validat/i.test(lower)) return 'validating_data';
    if (/summar/i.test(lower)) return 'resource_summary';
    if (/compil/i.test(lower)) return 'compiling_data';
    return 'extracting';
  }
  if (/stage\s*3\.5/i.test(message) || /reconcil/i.test(lower)) return 'validating_data';
  if (/stage\s*4/i.test(message) || /valid/i.test(lower) || /quality/i.test(lower)) return 'validating_data';
  return 'analyzing';
}

function statusIcon(status: string) {
  switch (status) {
    case 'success': return '✓';
    case 'fail':    return '✕';
    case 'skip':    return '−';
    case 'partial': return '~';
    case 'warn':    return '⚠';
    default:        return '·';
  }
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return ''; }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="rrp__spinner" aria-hidden="true">
      <span />
    </div>
  );
}

function LogEntryRow({ entry }: { entry: PipelineLogEntry }) {
  const [open, setOpen] = useState(false);
  // Inline-text entries: info, warn, error messages AND handshake phase messages
  const isInlineMsg = entry.source === 'info' || entry.source === 'warn' || entry.source === 'error' || entry.source === 'handshake';
  const inlineText = isInlineMsg
    ? (entry.details ?? entry.error ?? entry.method ?? '')
      .replace(/^\[Worker→Frontend\]\s*/i, '') // Strip worker→frontend prefix for cleaner display
    : null;
  const hasExtra = !!(entry.error || entry.input || (entry.steps?.length) || (!isInlineMsg && entry.details));
  const ts = entry.timestamp ? formatTimestamp(entry.timestamp) : null;
  const icon = statusIcon(entry.status);
  // For handshake entries, show the phase as the layer label
  const displayLayer = entry.source === 'handshake'
    ? (entry.method || entry.layer || 'Pipeline')
    : entry.layer;

  return (
    <div className={`rrp__log-entry rrp__log-entry--${entry.status}`}>
      <div
        className="rrp__log-row"
        onClick={() => hasExtra && setOpen(o => !o)}
        style={{ cursor: hasExtra ? 'pointer' : 'default' }}
      >
        <span className={`rrp__log-status rrp__log-status--${entry.status}`}>{icon}</span>
        {ts && <span className="rrp__log-ts">{ts}</span>}
        <span className="rrp__log-layer">{displayLayer}</span>
        {!isInlineMsg && <span className="rrp__log-source">{entry.source}</span>}
        <span className="rrp__log-method">
          {isInlineMsg ? inlineText : entry.method}
        </span>
        {entry.dataPointsFound > 0 && (
          <span className="rrp__log-pts">{entry.dataPointsFound} pt{entry.dataPointsFound !== 1 ? 's' : ''}</span>
        )}
        {entry.duration_ms > 0 && !isInlineMsg && (
          <span className="rrp__log-dur">{(entry.duration_ms / 1000).toFixed(2)}s</span>
        )}
        {hasExtra && <span className="rrp__log-expand">{open ? '▲' : '▼'}</span>}
      </div>
      {open && hasExtra && (
        <div className="rrp__log-detail">
          {entry.input && <div className="rrp__log-detail-row"><b>Input:</b> <code>{entry.input}</code></div>}
          {!isInlineMsg && entry.details && <div className="rrp__log-detail-row"><b>Details:</b> {entry.details}</div>}
          {entry.error && <div className="rrp__log-detail-row rrp__log-detail-row--error"><b>Error:</b> {entry.error}</div>}
          {entry.steps?.map((s, i) => (
            <div key={i} className="rrp__log-detail-row rrp__log-detail-row--step">↳ {s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ResearchRunPanel({
  projectId,
  address,
  county,
  parcelId,
  ownerName,
  autoStart,
  onPipelineStart,
  onPipelineComplete,
  onBack,
  onContinueToReview,
}: ResearchRunPanelProps) {
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
  const [currentMicroStage, setCurrentMicroStage] = useState<MicroStageId>('compiling');
  const [currentMessage, setCurrentMessage] = useState('Starting research pipeline…');
  const [logs, setLogs] = useState<PipelineLogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [allCopied, setAllCopied] = useState(false);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [logCollapsed, setLogCollapsed] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStartFiredRef = useRef(false);
  const logScrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const consecutive404Ref = useRef(0);
  const docCountRef = useRef(0);
  const prevMicroStageRef = useRef<MicroStageId | null>(null);

  // Elapsed timer — tracks total time since pipeline started
  const startTimeRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start elapsed timer as soon as pipeline begins (including 'starting' phase)
  useEffect(() => {
    const isActive = pipelineStatus === 'running' || pipelineStatus === 'starting';
    if (isActive && !elapsedTimerRef.current) {
      // Reset timer for new runs — if startTimeRef is stale from a previous run, refresh it
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
        setElapsedSeconds(0);
      }
      elapsedTimerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    }
    // Stop timer when pipeline finishes
    if (pipelineStatus && !isActive && elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    return () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    };
  }, [pipelineStatus]);

  // Track whether the user has scrolled up in the log viewer (pause auto-scroll)
  function handleLogScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    userScrolledUpRef.current = !atBottom;
  }

  // Auto-scroll when new log entries arrive
  useEffect(() => {
    if (!userScrolledUpRef.current && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [logs]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── Cancel Pipeline ─────────────────────────────────────────────────────
  const cancelPipeline = useCallback(async () => {
    setCancelling(true);
    setShowCancelConfirm(false);
    console.log(`[ResearchRunPanel] ${projectId}: sending cancel request`);

    try {
      const res = await fetch(`/api/admin/research/${projectId}/pipeline`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        console.log(`[ResearchRunPanel] ${projectId}: pipeline cancel confirmed`);
        stopPolling();
        setPipelineStatus('failed');
        setFailureReason('Pipeline cancelled by user.');
        setCancelling(false);
        onPipelineComplete?.('failed');
      } else {
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        console.warn(`[ResearchRunPanel] ${projectId}: cancel failed HTTP ${res.status} — ${data.error ?? 'unknown'}`);
        setCancelling(false);
      }
    } catch (err) {
      console.error(`[ResearchRunPanel] ${projectId}: cancel network error —`, err instanceof Error ? err.message : String(err));
      setCancelling(false);
    }
  }, [projectId, stopPolling, onPipelineComplete]);

  const isRunning = pipelineStatus === 'running' || pipelineStatus === 'starting';
  const isDone    = pipelineStatus === 'success' || pipelineStatus === 'partial' ||
                    pipelineStatus === 'failed'  || pipelineStatus === 'complete';
  const isSuccess = pipelineStatus === 'success' || pipelineStatus === 'partial' ||
                    pipelineStatus === 'complete';

  // ── Polling ────────────────────────────────────────────────────────────────

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/pipeline`, {
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status === 404) {
        consecutive404Ref.current++;
        console.debug(`[ResearchRunPanel] ${projectId}: poll 404 (${consecutive404Ref.current}/5)`);
        if (consecutive404Ref.current >= 5) {
          console.warn(`[ResearchRunPanel] ${projectId}: 5 consecutive 404s — stopping poll`);
          stopPolling();
        }
        return;
      }
      consecutive404Ref.current = 0;

      if (!res.ok) {
        console.warn(`[ResearchRunPanel] ${projectId}: poll HTTP ${res.status}`);
        return;
      }

      const data = await res.json() as PipelineStatusResponse;

      // Normalize 'complete' to 'success'
      const normalizedStatus = data.status === 'complete' ? 'success' : data.status;
      setPipelineStatus(normalizedStatus);

      const newLogCount = data.log?.length ?? 0;
      if (data.log) setLogs(data.log);

      const docCount = data.documents?.length ?? data.result?.documentCount ?? 0;
      docCountRef.current = docCount;

      const stage = inferMicroStage(data.message, normalizedStatus, docCount);
      setCurrentMicroStage(stage);

      // Log only when new entries arrive (not every 3s poll)
      if (newLogCount > 0) {
        console.log(
          `[ResearchRunPanel] ${projectId}: +${newLogCount} log(s), stage="${stage}"`,
        );
      }

      // Track stage transitions for micro-stage display
      if (prevMicroStageRef.current !== stage) {
        prevMicroStageRef.current = stage;
      }

      // Update the current message
      if (data.message) {
        setCurrentMessage(data.message);
      } else if (data.status === 'starting') {
        setCurrentMessage('Starting research pipeline…');
      }

      if (normalizedStatus !== 'running' && normalizedStatus !== 'starting') {
        console.log(
          `[ResearchRunPanel] ${projectId}: pipeline DONE status=${normalizedStatus} logs=${newLogCount} failureReason=${data.failureReason ?? 'none'}`,
        );
        stopPolling();
        if (data.failureReason) setFailureReason(data.failureReason);
        onPipelineComplete?.(normalizedStatus);
      }
    } catch (err) {
      console.warn(`[ResearchRunPanel] ${projectId}: poll error —`, err instanceof Error ? err.message : String(err));
    }
  }, [projectId, stopPolling, onPipelineComplete]);

  // ── Pipeline Start ─────────────────────────────────────────────────────────

  const startPipeline = useCallback(async () => {
    if (started) return;
    setStarted(true);
    setCurrentMessage('Starting research pipeline…');
    setPipelineStatus('starting');
    prevMicroStageRef.current = null;
    // Reset elapsed timer for a fresh run
    startTimeRef.current = Date.now();
    setElapsedSeconds(0);

    const payload = {
      address: address?.trim() || undefined,
      county: county?.trim() || undefined,
      propertyId: parcelId?.trim() || undefined,
      ownerName: ownerName?.trim() || undefined,
    };

    console.log(
      `[ResearchRunPanel] ${projectId}: POST /pipeline — address="${payload.address ?? ''}" county="${payload.county ?? ''}" propertyId="${payload.propertyId ?? ''}"`,
    );

    try {
      const res = await fetch(`/api/admin/research/${projectId}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await res.json().catch(() => ({})); // consume response body
        console.log(
          `[ResearchRunPanel] ${projectId} → Backend: pipeline start confirmed — worker accepted request`,
        );
        setPipelineStatus('running');
        onPipelineStart?.();
        stopPolling();
        pollRef.current = setInterval(pollStatus, 3_000);
        // Fire first poll immediately
        pollStatus();
      } else if (res.status === 409) {
        // Already running — start polling to pick up existing run
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        console.log(
          `[ResearchRunPanel] ${projectId}: pipeline already running (409) startedAt=${data.startedAt ?? 'unknown'} — resuming poll`,
        );
        setPipelineStatus('running');
        onPipelineStart?.();
        stopPolling();
        pollRef.current = setInterval(pollStatus, 3_000);
        pollStatus();
      } else if (res.status === 503) {
        // Worker unavailable — fall back to lite pipeline
        const errData = await res.json().catch(() => ({})) as Record<string, unknown>;
        console.warn(
          `[ResearchRunPanel] ${projectId}: worker unavailable (503) — falling back to lite pipeline. error=${errData.error ?? 'none'}`,
        );
        setCurrentMessage('Full research worker unavailable. Falling back to lite pipeline…');
        const liteRes = await fetch(`/api/admin/research/${projectId}/lite-pipeline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: address?.trim() || undefined,
            county: county?.trim() || undefined,
            owner_name: ownerName?.trim() || undefined,
            parcel_id: parcelId?.trim() || undefined,
          }),
        });
        if (liteRes.ok) {
          console.log(`[ResearchRunPanel] ${projectId}: lite-pipeline started OK`);
          setPipelineStatus('running');
          onPipelineStart?.();
          stopPolling();
          pollRef.current = setInterval(async () => {
            try {
              const r = await fetch(`/api/admin/research/${projectId}/lite-pipeline`);
              if (!r.ok) return;
              const d = await r.json() as { status: string };
              const ns = d.status === 'complete' ? 'success' : d.status;
              setPipelineStatus(ns);
              if (ns !== 'running') {
                console.log(`[ResearchRunPanel] ${projectId}: lite-pipeline done status=${ns}`);
                stopPolling();
                onPipelineComplete?.(ns);
              }
            } catch (err) {
              console.warn(`[ResearchRunPanel] ${projectId}: lite-pipeline poll error —`, err instanceof Error ? err.message : String(err));
            }
          }, 4_000);
        } else {
          const liteErr = await liteRes.json().catch(() => ({})) as Record<string, unknown>;
          console.error(
            `[ResearchRunPanel] ${projectId}: lite-pipeline POST failed HTTP ${liteRes.status} — ${liteErr.error ?? 'unknown error'}`,
          );
          setPipelineStatus('failed');
          setFailureReason('Research worker is not available. Please go back and try again.');
          onPipelineComplete?.('failed');
        }
      } else {
        const err = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        console.error(
          `[ResearchRunPanel] ${projectId}: POST pipeline failed HTTP ${res.status} — ${err.error ?? 'unknown'}`,
        );
        setPipelineStatus('failed');
        setFailureReason(err.error || 'Failed to start research pipeline.');
        onPipelineComplete?.('failed');
      }
    } catch (err) {
      console.error(
        `[ResearchRunPanel] ${projectId}: network error starting pipeline —`,
        err instanceof Error ? err.message : String(err),
      );
      setPipelineStatus('failed');
      setFailureReason('Network error. Check your connection and try again.');
      onPipelineComplete?.('failed');
    }
  }, [started, projectId, address, county, parcelId, ownerName, onPipelineStart, onPipelineComplete, pollStatus, stopPolling]);

  // Kick off the pipeline once on mount. We use a ref to track whether
  // startPipeline has already been called so strict-mode double-mount
  // and re-renders cannot trigger a second POST.
  const startPipelineRef = useRef(startPipeline);
  useEffect(() => { startPipelineRef.current = startPipeline; }, [startPipeline]);

  // On mount: either auto-start (coming from Stage 1 "Initiate Research") or
  // check if a pipeline is already running (page refresh during active run).
  // NEVER auto-start on a bare page refresh — only when autoStart is explicitly true.
  const mountCheckDoneRef = useRef(false);
  useEffect(() => {
    if (mountCheckDoneRef.current) return;
    mountCheckDoneRef.current = true;

    if (autoStart === true && !autoStartFiredRef.current) {
      // User clicked "Initiate Research & Analysis" from Stage 1
      autoStartFiredRef.current = true;
      startPipelineRef.current();
    } else if (!autoStartFiredRef.current) {
      // Page refresh or navigated back — check if a run is active on the worker.
      // If so, resume polling. If not, stay idle (don't start a new run).
      (async () => {
        try {
          const res = await fetch(`/api/admin/research/${projectId}/pipeline`, {
            signal: AbortSignal.timeout(10_000),
          });
          if (res.ok) {
            const data = await res.json() as PipelineStatusResponse;
            const ns = data.status === 'complete' ? 'success' : data.status;
            // Compute the real start time from the API response (worker sends startedAt)
            const apiStartedAt = data.startedAt ? new Date(data.startedAt).getTime() : null;
            const docCount = data.documents?.length ?? data.result?.documentCount ?? 0;

            if (ns === 'running' || ns === 'starting') {
              // Pipeline is actively running — resume polling
              console.log(`[ResearchRunPanel] ${projectId}: page refresh detected active pipeline — resuming poll`);
              setPipelineStatus(ns);
              setStarted(true);
              startTimeRef.current = apiStartedAt && !isNaN(apiStartedAt) ? apiStartedAt : Date.now();
              if (data.log) setLogs(data.log);
              if (data.message) setCurrentMessage(data.message);
              setCurrentMicroStage(inferMicroStage(data.message, ns, docCount));
              docCountRef.current = docCount;
              pollRef.current = setInterval(pollStatus, 3_000);
            } else if (ns === 'success' || ns === 'partial') {
              // Pipeline completed — show final state
              console.log(`[ResearchRunPanel] ${projectId}: page refresh — pipeline already complete`);
              setPipelineStatus(ns);
              setStarted(true);
              if (apiStartedAt && !isNaN(apiStartedAt)) {
                startTimeRef.current = apiStartedAt;
                const elapsed = data.result?.duration_ms
                  ? Math.floor(data.result.duration_ms / 1000)
                  : Math.floor((Date.now() - apiStartedAt) / 1000);
                setElapsedSeconds(elapsed);
              }
              if (data.log) setLogs(data.log);
              if (data.message) setCurrentMessage(data.message);
              setCurrentMicroStage(inferMicroStage(data.message, ns, docCount));
              docCountRef.current = docCount;
            } else if (ns === 'failed') {
              // Pipeline failed — show failed state
              console.log(`[ResearchRunPanel] ${projectId}: page refresh — pipeline failed`);
              setPipelineStatus('failed');
              setStarted(true);
              if (data.log) setLogs(data.log);
              if (data.failureReason) setFailureReason(data.failureReason);
              if (data.message) setCurrentMessage(data.message);
              setCurrentMicroStage(inferMicroStage(data.message, 'failed', docCount));
            }
            // If 404 or other — pipeline doesn't exist, stay idle
          }
          // If network error or 404 — stay in idle state (pipelineStatus = null)
        } catch {
          // Silently stay idle — no active pipeline
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Log Filtering ──────────────────────────────────────────────────────────

  // Exclude generic [Pipeline Phase] handshake entries — these are repetitive
  // phase-transition confirmations ("Phase 1", "Enrich", etc.) that don't show
  // actual work and were the source of the "Technical Logs" noise complaint.
  // Pipeline Lifecycle handshakes (start/complete/fail) ARE kept since they're
  // meaningful milestones.  All other worker log entries are shown.
  const visibleLogs = logs.filter(entry =>
    !(entry.source === 'handshake' && entry.layer === '[Pipeline Phase]'),
  );

  const filteredLogs = visibleLogs.filter(entry => {
    if (logFilter === 'all') return true;
    if (logFilter === 'errors') return entry.status === 'fail' || entry.source === 'error';
    if (logFilter === 'warn') return entry.status === 'fail' || entry.status === 'warn' || entry.source === 'warn' || entry.source === 'error';
    // "Info" shows everything that isn't an error/warning — includes info, handshake, success, partial, skip
    if (logFilter === 'info') return entry.source === 'info' || entry.source === 'handshake' || entry.status === 'success' || entry.status === 'partial' || entry.status === 'skip';
    return true;
  });

  // ── Copy All Logs ──────────────────────────────────────────────────────────

  function handleCopyLogs() {
    const text = logs.map(e => {
      const ts = e.timestamp ? formatTimestamp(e.timestamp) : '';
      const icon = statusIcon(e.status);
      let line = `${ts} ${icon} [${e.layer}] ${e.source} | ${e.method} | ${e.status} | ${e.duration_ms}ms | ${e.dataPointsFound} pts`;
      if (e.error) line += ` | ERROR: ${e.error}`;
      if (e.details) line += ` | ${e.details}`;
      return line;
    }).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 2000);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 2000);
    });
  }

  // ── Current Stage Label ────────────────────────────────────────────────────

  const stageDef = MICRO_STAGES.find(s => s.id === currentMicroStage) ?? MICRO_STAGES[0];

  // Whether the component is in an idle state (no pipeline started, or page refreshed with no active run)
  const isIdle = pipelineStatus === null && !started;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Back button — always visible at top-left ── */}
      {onBack && (
        <button
          className="rrp__back-topleft"
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            background: 'none',
            border: '1px solid #D1D5DB',
            borderRadius: '0.375rem',
            padding: '0.4rem 0.85rem',
            fontSize: '0.85rem',
            fontWeight: 500,
            color: '#374151',
            cursor: 'pointer',
            marginBottom: '1rem',
          }}
        >
          ← Back to Property Information
        </button>
      )}

      {/* ── Idle State: no pipeline running, waiting for user action ── */}
      {isIdle && (
        <div className="rrp__progress rrp__progress--idle" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '3rem 2rem',
          background: '#F9FAFB',
          border: '1px solid #E5E7EB',
          borderRadius: '0.75rem',
          textAlign: 'center',
          gap: '0.75rem',
        }}>
          <div style={{ fontSize: '2.5rem' }}>🔬</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1F2937' }}>No Active Research</div>
          <div style={{ fontSize: '0.88rem', color: '#4B5563', maxWidth: '28rem', lineHeight: 1.5 }}>
            No research pipeline is currently running for this project.
            Go back to Property Information and click &quot;Initiate Research &amp; Analysis&quot; to start.
          </div>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                marginTop: '0.75rem',
                background: '#1D4ED8',
                color: '#fff',
                border: 'none',
                borderRadius: '0.375rem',
                padding: '0.5rem 1.25rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ← Go to Property Information
            </button>
          )}
        </div>
      )}

      {/* ── Element 1: Progress Indicator (only when pipeline has started) ── */}
      {!isIdle && (<>
      <div className={`rrp__progress${isDone ? (isSuccess ? ' rrp__progress--success' : ' rrp__progress--failed') : ' rrp__progress--running'}`}>
        {/* Top-left stop button — always visible while running */}
        {isRunning && !cancelling && (
          <button
            className="rrp__stop-topleft"
            onClick={() => setShowCancelConfirm(true)}
            aria-label="Stop research and analysis"
          >
            <span className="rrp__stop-icon" aria-hidden="true" />
            Stop Research and Analysis
          </button>
        )}
        {cancelling && (
          <div className="rrp__stop-topleft rrp__stop-topleft--cancelling" aria-live="polite">
            Stopping…
          </div>
        )}

        {/* Spinner or checkmark */}
        <div className="rrp__progress-icon">
          {!isDone && <Spinner />}
          {isDone && isSuccess && <span className="rrp__checkmark" aria-label="Research complete">✓</span>}
          {isDone && !isSuccess && <span className="rrp__failmark" aria-label="Research failed">✕</span>}
        </div>

        {/* Status text */}
        <div className="rrp__progress-status">
          {!isDone && <span className="rrp__progress-headline">Research in Progress</span>}
          {isDone && isSuccess && <span className="rrp__progress-headline rrp__progress-headline--done">Research Complete</span>}
          {isDone && !isSuccess && <span className="rrp__progress-headline rrp__progress-headline--failed">Research Failed</span>}
        </div>

        {/* Elapsed timer */}
        <div className="rrp__progress-timer" style={{
          fontSize: '1.1rem',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: isDone ? (isSuccess ? '#059669' : '#DC2626') : '#2563EB',
          margin: '0.25rem 0',
        }}>
          {Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:{(elapsedSeconds % 60).toString().padStart(2, '0')}
          <span style={{ fontSize: '0.75rem', fontWeight: 400, marginLeft: '0.35rem', color: '#6B7280' }}>elapsed</span>
        </div>

        {/* Current micro-stage */}
        <div className="rrp__progress-stage">{stageDef.label}</div>

        {/* Current message with animated ellipsis */}
        {!isDone && (
          <div className="rrp__progress-msg">
            {currentMessage}
            <span className="rrp__ellipsis" aria-hidden="true">
              <span>.</span><span>.</span><span>.</span>
            </span>
          </div>
        )}

        {/* Stop Pipeline button — visible while running */}
        {isRunning && !cancelling && (
          <button
            className="rrp__stop-btn"
            onClick={() => setShowCancelConfirm(true)}
          >
            <span className="rrp__stop-icon" aria-hidden="true" />
            Stop Research and Analysis
          </button>
        )}
        {cancelling && (
          <div className="rrp__cancel-status">Cancelling pipeline…</div>
        )}

        {/* Cancel confirmation dialog */}
        {showCancelConfirm && (
          <div className="rrp__confirm-overlay" onClick={() => setShowCancelConfirm(false)}>
            <div className="rrp__confirm-dialog" onClick={e => e.stopPropagation()}>
              <div className="rrp__confirm-title">Stop Research Pipeline?</div>
              <p className="rrp__confirm-text">
                This will cancel the running research. Any partial results collected so far will be lost.
                You can restart the research later from the property information page.
              </p>
              <div className="rrp__confirm-actions">
                <button
                  className="rrp__confirm-cancel"
                  onClick={() => setShowCancelConfirm(false)}
                >
                  Keep Running
                </button>
                <button
                  className="rrp__confirm-stop"
                  onClick={cancelPipeline}
                >
                  Yes, Stop Research
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Failure reason */}
        {isDone && !isSuccess && failureReason && (
          <div className="rrp__progress-failure">{failureReason}</div>
        )}

        {/* Continue to Review button on success */}
        {isDone && isSuccess && (
          <button
            className="rrp__continue-btn"
            onClick={onContinueToReview}
          >
            Continue to Review →
          </button>
        )}
      </div>

      {/* ── Element 2: Unified Pipeline Activity Log ── */}
      {/* Replaces the separate "Live Activity" + "Technical Logs" pair.        */}
      {/* [Pipeline Phase] handshake entries are excluded (see visibleLogs).    */}
      {/* All other worker log entries — Stage1-6, OCR, AI, completion checks  */}
      {/* — are shown in chronological order.                                   */}
      <div className={`rrp__logviewer${logCollapsed ? ' rrp__logviewer--collapsed' : ''}`}>
        <div className="rrp__logviewer-header" onClick={() => setLogCollapsed(c => !c)} style={{ cursor: 'pointer' }}>
          <div className="rrp__logviewer-header-left">
            <span className="rrp__logviewer-title">
              {isRunning ? '⚡ Live Pipeline Log' : '📋 Pipeline Activity Log'}
            </span>
            {visibleLogs.length > 0 && (
              <span className="rrp__logviewer-count">{visibleLogs.length}</span>
            )}
            {isRunning && (
              <span className="rrp__logviewer-live">LIVE</span>
            )}
            {logCollapsed && visibleLogs.length > 0 && (
              <span className="rrp__logviewer-collapsed-hint">
                {isRunning ? 'live' : `${visibleLogs.length} entries`}
              </span>
            )}
          </div>
          <div className="rrp__logviewer-header-right" onClick={e => e.stopPropagation()}>
            {/* Stop button in log header — always visible while running */}
            {isRunning && !cancelling && (
              <button
                className="rrp__stop-btn-compact"
                onClick={() => setShowCancelConfirm(true)}
                aria-label="Stop research and analysis"
              >
                <span className="rrp__stop-icon rrp__stop-icon--sm" aria-hidden="true" />
                Stop
              </button>
            )}
            {cancelling && (
              <span className="rrp__cancel-status-compact">Cancelling…</span>
            )}
            {/* Filter buttons */}
            {!logCollapsed && (
              <div className="rrp__logviewer-filters" role="group" aria-label="Log filter">
                {(['all', 'errors', 'warn', 'info'] as const).map(f => (
                  <button
                    key={f}
                    className={`rrp__logviewer-filter${logFilter === f ? ' rrp__logviewer-filter--active' : ''}`}
                    onClick={() => setLogFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'errors' ? 'Errors' : f === 'warn' ? 'Warnings' : 'Info'}
                    {f !== 'all' && visibleLogs.filter(e =>
                      f === 'errors' ? (e.status === 'fail' || e.source === 'error') :
                      f === 'warn'   ? (e.status === 'fail' || e.source === 'warn' || e.source === 'error') :
                      e.source === 'info'
                    ).length > 0 && (
                      <span className="rrp__logviewer-filter-count">
                        {visibleLogs.filter(e =>
                          f === 'errors' ? (e.status === 'fail' || e.source === 'error') :
                          f === 'warn'   ? (e.status === 'fail' || e.source === 'warn' || e.source === 'error') :
                          e.source === 'info'
                        ).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <button
              className="rrp__logviewer-copy-btn"
              onClick={handleCopyLogs}
              disabled={logs.length === 0}
            >
              {allCopied ? '✓ Copied!' : '⎘ Copy All Logs'}
            </button>
            <button
              className="rrp__logviewer-toggle-btn"
              onClick={() => setLogCollapsed(c => !c)}
              type="button"
              title={logCollapsed ? 'Expand log viewer' : 'Collapse log viewer'}
            >
              {logCollapsed ? '▼' : '▲'}
            </button>
          </div>
        </div>

        {!logCollapsed && (
          <>
            <div
              className="rrp__logviewer-stream"
              ref={logScrollRef}
              onScroll={handleLogScroll}
            >
              {filteredLogs.length === 0 ? (
                <div className="rrp__logviewer-empty">
                  {isRunning ? (
                    <><Spinner /> <span>Waiting for log entries…</span></>
                  ) : logs.length === 0 ? (
                    <span>No log entries available.</span>
                  ) : (
                    <span>No entries match the current filter.</span>
                  )}
                </div>
              ) : (
                filteredLogs.map((entry, i) => (
                  <LogEntryRow key={`${entry.layer}-${entry.source}-${i}`} entry={entry} />
                ))
              )}
              {/* Copy All button at the bottom for convenience */}
              {visibleLogs.length > 20 && (
                <div className="rrp__logviewer-footer">
                  <button
                    className="rrp__logviewer-copy-btn"
                    onClick={handleCopyLogs}
                    disabled={logs.length === 0}
                  >
                    {allCopied ? '✓ Copied!' : '⎘ Copy All Logs'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      </>)}

      {/* ── Styles ── */}
      <style>{`
/* ── ResearchRunPanel shell ─────────────────────────────────── */
.rrp__progress {
  position: relative;
  width: 100%;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  padding: 2rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

/* Round stop icon — used inside all stop buttons */
.rrp__stop-icon {
  display: inline-block;
  width: 14px; height: 14px;
  background: #dc2626;
  border-radius: 50%;
  position: relative;
  flex-shrink: 0;
}
.rrp__stop-icon::after {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 6px; height: 6px;
  background: #fff;
  border-radius: 1px;
}
.rrp__stop-icon--sm {
  width: 11px; height: 11px;
}
.rrp__stop-icon--sm::after {
  width: 5px; height: 5px;
}

/* Top-left stop button */
.rrp__stop-topleft {
  position: absolute;
  top: 0.6rem;
  left: 0.6rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: none;
  color: #6B7280;
  border: 1px solid #D1D5DB;
  border-radius: 0.375rem;
  padding: 0.3rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  z-index: 2;
}
.rrp__stop-topleft:hover {
  color: #dc2626;
  border-color: #fca5a5;
}
.rrp__stop-topleft:active { transform: scale(0.98); }
.rrp__stop-topleft--cancelling {
  color: #991b1b;
  cursor: default;
  font-size: 0.75rem;
}
.rrp__progress--running { border-color: #3b82f6; }
.rrp__progress--success { border-color: #10b981; background: #f0fdf4; }
.rrp__progress--failed  { border-color: #ef4444; background: #fef2f2; }

/* Spinner */
.rrp__spinner {
  display: inline-flex; width: 40px; height: 40px; position: relative;
}
.rrp__spinner span {
  position: absolute; inset: 0;
  border: 3px solid #dbeafe;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: rrp-spin 0.7s linear infinite;
}
@keyframes rrp-spin { to { transform: rotate(360deg); } }

/* Checkmark / failmark */
.rrp__checkmark {
  font-size: 2.25rem; line-height: 1; color: #10b981; font-weight: 700;
}
.rrp__failmark {
  font-size: 2.25rem; line-height: 1; color: #ef4444; font-weight: 700;
}

.rrp__progress-icon { display: flex; align-items: center; justify-content: center; }

.rrp__progress-status {}
.rrp__progress-headline {
  font-size: 1.2rem; font-weight: 700; color: #1e293b;
}
.rrp__progress-headline--done   { color: #059669; }
.rrp__progress-headline--failed { color: #dc2626; }

.rrp__progress-stage {
  font-size: 0.95rem; font-weight: 600; color: #3b82f6;
}
.rrp__progress--success .rrp__progress-stage { color: #059669; }
.rrp__progress--failed  .rrp__progress-stage { color: #dc2626; }

.rrp__progress-msg {
  font-size: 0.9rem; color: #475569; max-width: 56ch;
}
.rrp__progress-failure {
  font-size: 0.88rem; color: #dc2626; max-width: 56ch; line-height: 1.5;
}

/* Animated ellipsis */
.rrp__ellipsis span {
  display: inline-block;
  animation: rrp-dot 1.4s infinite both;
  font-weight: 700;
}
.rrp__ellipsis span:nth-child(2) { animation-delay: 0.2s; }
.rrp__ellipsis span:nth-child(3) { animation-delay: 0.4s; }
@keyframes rrp-dot { 0%,80%,100% { opacity: 0; } 40% { opacity: 1; } }

/* Continue button */
.rrp__continue-btn {
  margin-top: 0.5rem;
  background: #10b981; color: #fff;
  border: none; border-radius: 6px;
  padding: 0.55rem 1.4rem;
  font-size: 0.95rem; font-weight: 600;
  cursor: pointer; transition: background 0.15s;
}
.rrp__continue-btn:hover { background: #059669; }

/* ── Stop Button ───────────────────────────────────────────── */
.rrp__stop-btn {
  margin-top: 1rem;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  background: none; color: #6B7280;
  border: 1px solid #D1D5DB; border-radius: 0.375rem;
  padding: 0.45rem 1.1rem;
  font-size: 0.88rem; font-weight: 500;
  cursor: pointer; transition: color 0.15s, border-color 0.15s;
}
.rrp__stop-btn:hover { color: #dc2626; border-color: #fca5a5; }
.rrp__stop-btn:active { transform: scale(0.98); }

.rrp__cancel-status {
  margin-top: 0.5rem; font-size: 0.9rem; color: #dc2626; font-weight: 600;
}

/* Compact stop button in log viewer header */
.rrp__stop-btn-compact {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: none; color: #6B7280;
  border: 1px solid #D1D5DB; border-radius: 0.375rem;
  padding: 0.2rem 0.6rem;
  font-size: 0.72rem; font-weight: 500;
  cursor: pointer; transition: color 0.15s, border-color 0.15s;
  margin-right: 0.5rem;
}
.rrp__stop-btn-compact:hover { color: #dc2626; border-color: #fca5a5; }
.rrp__cancel-status-compact {
  font-size: 0.8rem; color: #dc2626; font-weight: 600; margin-right: 0.5rem;
}

/* ── Confirmation Dialog ───────────────────────────────────── */
.rrp__confirm-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999;
  animation: rrp-fade-in 0.15s ease-out;
}
@keyframes rrp-fade-in { from { opacity: 0; } to { opacity: 1; } }

.rrp__confirm-dialog {
  background: #fff; border-radius: 12px;
  padding: 1.75rem 2rem;
  max-width: 420px; width: 90%;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  animation: rrp-slide-up 0.2s ease-out;
}
@keyframes rrp-slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.rrp__confirm-title {
  font-size: 1.15rem; font-weight: 700; color: #1e293b;
  margin-bottom: 0.5rem;
}
.rrp__confirm-text {
  font-size: 0.88rem; color: #475569; line-height: 1.6;
  margin-bottom: 1.25rem;
}
.rrp__confirm-actions {
  display: flex; gap: 0.75rem; justify-content: flex-end;
}
.rrp__confirm-cancel {
  background: #f1f5f9; border: 1px solid #d1d5db; border-radius: 6px;
  padding: 0.5rem 1.2rem; font-size: 0.88rem; font-weight: 600;
  color: #374151; cursor: pointer; transition: background 0.1s;
}
.rrp__confirm-cancel:hover { background: #e2e8f0; }
.rrp__confirm-stop {
  background: #dc2626; border: none; border-radius: 6px;
  padding: 0.5rem 1.2rem; font-size: 0.88rem; font-weight: 700;
  color: #fff; cursor: pointer; transition: background 0.1s;
}
.rrp__confirm-stop:hover { background: #b91c1c; }

/* ── Log Viewer ─────────────────────────────────────────────── */
.rrp__logviewer {
  width: 100%;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  margin-bottom: 0.5rem;
}

.rrp__logviewer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.55rem 0.85rem;
  background: #f8fafc; border-bottom: 1px solid #e2e8f0;
  gap: 0.5rem; flex-wrap: wrap;
}
.rrp__logviewer-header-left {
  display: flex; align-items: center; gap: 0.45rem;
}
.rrp__logviewer-header-right {
  display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
}
.rrp__logviewer-title {
  font-weight: 700; font-size: 0.84rem; color: #1e293b;
}
.rrp__logviewer-count {
  background: #f1f5f9; border: 1px solid #cbd5e1;
  border-radius: 10px; padding: 1px 7px;
  font-size: 0.75rem; color: #475569;
  font-variant-numeric: tabular-nums;
}
.rrp__logviewer-live {
  background: #3b82f6; color: #fff;
  border-radius: 10px; padding: 1px 7px;
  font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em;
  animation: rrp-pulse 1.4s ease-in-out infinite;
}
@keyframes rrp-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }

.rrp__logviewer-filters {
  display: flex; gap: 3px;
}
.rrp__logviewer-filter {
  background: #f1f5f9; border: 1px solid #d1d5db;
  border-radius: 4px; padding: 2px 8px;
  font-size: 0.72rem; font-weight: 500; color: #374151;
  cursor: pointer; transition: background 0.1s; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 3px;
}
.rrp__logviewer-filter:hover { background: #e5e7eb; }
.rrp__logviewer-filter--active {
  background: #1e40af; border-color: #1e40af; color: #fff;
}
.rrp__logviewer-filter--active:hover { background: #1d4ed8; }
.rrp__logviewer-filter-count {
  background: rgba(255,255,255,0.25);
  border-radius: 8px; padding: 0 5px; font-size: 0.68rem;
}

.rrp__logviewer-copy-btn {
  background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 5px;
  padding: 3px 10px; font-size: 0.72rem; font-weight: 600;
  color: #166534; cursor: pointer; white-space: nowrap;
  transition: background 0.1s;
}
.rrp__logviewer-copy-btn:hover { background: #dcfce7; }
.rrp__logviewer-copy-btn:disabled { opacity: 0.5; cursor: default; }

/* ── Log viewer collapse toggle ─────────────────────────── */
.rrp__logviewer--collapsed .rrp__logviewer-header { border-bottom: none; }
.rrp__logviewer-toggle-btn {
  background: none;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 0.1rem 0.4rem;
  cursor: pointer;
  font-size: 0.65rem;
  color: #64748b;
  line-height: 1;
  transition: background 0.1s, color 0.1s;
}
.rrp__logviewer-toggle-btn:hover { background: #f1f5f9; color: #334155; }
.rrp__logviewer-collapsed-hint {
  font-size: 0.7rem;
  color: #94a3b8;
  font-style: italic;
  margin-left: 0.25rem;
}

.rrp__logviewer-stream {
  max-height: 420px; overflow-y: auto; overflow-x: hidden;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.78rem; line-height: 1.4;
}

.rrp__logviewer-empty {
  padding: 2rem 1rem; text-align: center;
  color: #94a3b8; display: flex; align-items: center; justify-content: center; gap: 0.5rem;
}

.rrp__logviewer-footer {
  padding: 0.45rem 0.85rem; border-top: 1px solid #e2e8f0;
  background: #f8fafc; text-align: right;
}

/* ── Log Entry Rows ─────────────────────────────────────────── */
.rrp__log-entry { border-bottom: 1px solid #f1f5f9; }
.rrp__log-entry--fail    { background: #fef8f8; }
.rrp__log-entry--success { background: transparent; }
.rrp__log-entry--skip    { background: #fafafa; opacity: 0.75; }
.rrp__log-entry--partial { background: #fffbf0; }
.rrp__log-entry--warn    { background: #fffbeb; }

.rrp__log-row {
  display: flex; align-items: baseline; gap: 0.35rem;
  padding: 0.22rem 0.75rem; flex-wrap: nowrap; overflow: hidden;
}

.rrp__log-status {
  flex-shrink: 0; width: 14px; font-weight: 700; text-align: center; font-size: 0.75rem;
}
.rrp__log-status--success { color: #059669; }
.rrp__log-status--fail    { color: #ef4444; }
.rrp__log-status--skip    { color: #9ca3af; }
.rrp__log-status--partial { color: #f59e0b; }
.rrp__log-status--warn    { color: #d97706; }

.rrp__log-ts {
  color: #94a3b8; flex-shrink: 0; font-size: 0.72rem;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.rrp__log-layer {
  color: #6366f1; flex-shrink: 0; font-size: 0.72rem; font-weight: 600; white-space: nowrap;
}
.rrp__log-source {
  color: #0891b2; flex-shrink: 0; font-size: 0.72rem; white-space: nowrap;
}
.rrp__log-method {
  color: #374151; flex: 1; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; font-size: 0.78rem;
}
.rrp__log-pts {
  color: #059669; flex-shrink: 0; font-size: 0.7rem; font-weight: 600; white-space: nowrap;
}
.rrp__log-dur {
  color: #94a3b8; flex-shrink: 0; font-size: 0.7rem; white-space: nowrap;
}
.rrp__log-expand {
  flex-shrink: 0; color: #94a3b8; font-size: 0.7rem; cursor: pointer;
}

/* Log detail expand */
.rrp__log-detail {
  padding: 0.35rem 0.75rem 0.45rem 1.5rem;
  border-top: 1px dashed #e5e7eb; background: #f8fafc;
  font-size: 0.76rem; line-height: 1.6; color: #374151; display: flex; flex-direction: column; gap: 3px;
  overflow: hidden; word-break: break-word;
}
.rrp__log-detail-row code { background: #f3f4f6; padding: 0 4px; border-radius: 3px; word-break: break-all; overflow-wrap: break-word; }
.rrp__log-detail-row--error { color: #dc2626; }
.rrp__log-detail-row--step { color: #6b7280; padding-left: 0.5rem; }

/* ── Live Activity Stream ────────────────────────────────────── */
/* (activity stream removed — unified into Pipeline Activity Log above) */
      `}</style>
    </>
  );
}
