'use client';

// PipelineProgressPanel.tsx
// Animated real-time progress panel for the STARR RECON pipeline.
// Driven by `pipelineResult` from the polling interval — no fake timers.
// Stage is inferred from the "Stage N:" prefix in the `message` field.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BoundaryInfo {
  type?: string;
  callCount?: number;
  confidence?: number;
  verified?: boolean;
}

interface PipelineResultSummary {
  propertyId?: string;
  ownerName?: string;
  legalDescription?: string;
  acreage?: string | number;
  documentCount?: number;
  duration_ms?: number;
  boundary?: BoundaryInfo | null;
}

interface PipelineDocument {
  ref?: { documentType?: string; instrumentNumber?: string | null; source?: string };
  hasText?: boolean;
  hasImage?: boolean;
  hasOcr?: boolean;
  extractedData?: { type?: string; confidence?: number } | null;
}

export interface PipelineLogEntry {
  layer: string;
  source: string;
  method: string;
  status: 'success' | 'fail' | 'skip' | 'partial' | 'warn';
  input?: string;
  details?: string;
  error?: string;
  dataPointsFound: number;
  duration_ms: number;
  steps?: string[];
  timestamp?: string;
}

export interface PipelineProgressProps {
  status:       string | null;         // 'starting'|'running'|'success'|'partial'|'failed'|'complete'|null
  message?:     string;                // Latest "Stage N: …" message from updateStatus
  /** Short stage label from the worker (e.g. "Phase 3", "Routing") — used when message is absent. */
  currentStage?: string;
  result?:      PipelineResultSummary | null;
  documents?:   PipelineDocument[];
  log?:         PipelineLogEntry[];
  /** Human-readable explanation of why the pipeline failed, with actionable guidance. */
  failureReason?: string;
  /**
   * Full master report text from Stage 6 (MASTER_VALIDATION_REPORT.txt).
   * Formatted surveyor report with traverse quality, top actions, discrepancy log, etc.
   * Only present on successful/partial completion when Stage 6 ran.
   */
  masterReportText?: string;
  /**
   * Optional async callback that loads persisted run logs from the server.
   * Called when the run ends and in-memory logs are empty.
   * Should return an array of PipelineLogEntry or null on failure.
   */
  onLoadLogs?: () => Promise<PipelineLogEntry[] | null>;
  /**
   * When true, hides the result summary card, document pills, and master report.
   * Use in Stage 2 (Research & Analysis) so these completion details only appear
   * in Stage 3 (Review).
   */
  hideCompletionDetails?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true for any status that means the pipeline has finished running. */
function isDoneStatus(status: string | null): boolean {
  return status === 'success' || status === 'partial' || status === 'failed' || status === 'complete';
}

function Spinner() {
  return (
    <span className="ppanel__spinner" aria-label="loading">
      <span />
    </span>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: PipelineResultSummary }) {
  const confidence = result.boundary?.confidence;
  const confPct    = confidence != null ? Math.round(confidence * 100) : null;

  return (
    <div className="ppanel__result-card">
      {result.ownerName && (
        <div className="ppanel__result-row">
          <span className="ppanel__result-label">Owner</span>
          <span className="ppanel__result-value ppanel__result-value--owner">{result.ownerName}</span>
        </div>
      )}
      {result.propertyId && (
        <div className="ppanel__result-row">
          <span className="ppanel__result-label">Property ID</span>
          <span className="ppanel__result-value">{result.propertyId}</span>
        </div>
      )}
      {result.acreage && (
        <div className="ppanel__result-row">
          <span className="ppanel__result-label">Acreage</span>
          <span className="ppanel__result-value">{result.acreage} ac</span>
        </div>
      )}
      {result.documentCount != null && result.documentCount > 0 && (
        <div className="ppanel__result-row">
          <span className="ppanel__result-label">Documents</span>
          <span className="ppanel__result-value">{result.documentCount}</span>
        </div>
      )}
      {result.boundary && (
        <div className="ppanel__result-row">
          <span className="ppanel__result-label">Boundary</span>
          <span className="ppanel__result-value">
            {result.boundary.type}
            {result.boundary.callCount != null && ` · ${result.boundary.callCount} calls`}
            {confPct != null && (
              <span className={`ppanel__confidence ppanel__confidence--${confPct >= 80 ? 'high' : confPct >= 50 ? 'mid' : 'low'}`}>
                {confPct}%
              </span>
            )}
            {result.boundary.verified && <span className="ppanel__verified">✓</span>}
          </span>
        </div>
      )}
      {result.legalDescription && (
        <div className="ppanel__result-row ppanel__result-row--legal">
          <span className="ppanel__result-label">Legal</span>
          <span className="ppanel__result-value ppanel__result-value--legal">
            {result.legalDescription.length > 160
              ? result.legalDescription.slice(0, 160) + '…'
              : result.legalDescription}
          </span>
        </div>
      )}
      {result.duration_ms != null && (
        <div className="ppanel__result-row ppanel__result-row--meta">
          <span className="ppanel__result-label">Duration</span>
          <span className="ppanel__result-value ppanel__result-value--meta">
            {(result.duration_ms / 1000).toFixed(1)}s
          </span>
        </div>
      )}
    </div>
  );
}

function DocumentPill({ doc, idx }: { doc: PipelineDocument; idx: number }) {
  const type = doc.ref?.documentType ?? `Document ${idx + 1}`;
  const instr = doc.ref?.instrumentNumber;
  const tags: string[] = [];
  if (doc.hasText)  tags.push('text');
  if (doc.hasImage) tags.push('image');
  if (doc.hasOcr)   tags.push('ocr');

  return (
    <div className="ppanel__doc-pill">
      <span className="ppanel__doc-type">{type}</span>
      {instr && <span className="ppanel__doc-instr">#{instr}</span>}
      {tags.map(t => <span key={t} className={`ppanel__doc-tag ppanel__doc-tag--${t}`}>{t}</span>)}
      {doc.extractedData && (
        <span className="ppanel__doc-tag ppanel__doc-tag--extracted">
          {doc.extractedData.type}
          {doc.extractedData.confidence != null && ` ${Math.round(doc.extractedData.confidence * 100)}%`}
        </span>
      )}
    </div>
  );
}

function LogEntry({ entry }: { entry: PipelineLogEntry }) {
  const [open, setOpen] = useState(false);
  // info/warn/error are plain informational messages where source===method===the level
  const isInfoMsg = entry.source === 'info' || entry.source === 'warn' || entry.source === 'error';
  // For info/warn/error entries: show details inline in the method column; the
  // "details" expand section is still available when the row has extras.
  const inlineText = isInfoMsg ? (entry.details ?? entry.error ?? '') : null;
  const hasExtra = !!(entry.error || entry.input || (entry.steps?.length) ||
    (!isInfoMsg && entry.details));
  const ts = entry.timestamp ? formatTimestamp(entry.timestamp) : null;
  const icon = statusIcon(entry.status);

  return (
    <div className={`ppanel__log-entry ppanel__log-entry--${entry.status}`}>
      <div
        className="ppanel__log-row"
        onClick={() => hasExtra && setOpen(o => !o)}
        style={{ cursor: hasExtra ? 'pointer' : 'default' }}
      >
        <span className={`ppanel__log-status ppanel__log-status--${entry.status}`}>{icon}</span>
        {ts && <span className="ppanel__log-ts">{ts}</span>}
        <span className="ppanel__log-layer">{entry.layer}</span>
        {!isInfoMsg && <span className="ppanel__log-source">{entry.source}</span>}
        <span className="ppanel__log-method ppanel__log-method--msg">
          {isInfoMsg ? inlineText : entry.method}
        </span>
        {entry.dataPointsFound > 0 && (
          <span className="ppanel__log-points">{entry.dataPointsFound} pt{entry.dataPointsFound !== 1 ? 's' : ''}</span>
        )}
        {entry.duration_ms > 0 && !isInfoMsg && (
          <span className="ppanel__log-dur">{(entry.duration_ms / 1000).toFixed(2)}s</span>
        )}
        {hasExtra && (
          <span className="ppanel__log-expand">{open ? '▲' : '▼'}</span>
        )}
      </div>
      {open && hasExtra && (
        <div className="ppanel__log-detail">
          {entry.input   && <div className="ppanel__log-detail-row"><b>Input:</b> <code>{entry.input}</code></div>}
          {!isInfoMsg && entry.details && <div className="ppanel__log-detail-row"><b>Details:</b> {entry.details}</div>}
          {entry.error   && <div className="ppanel__log-detail-row ppanel__log-detail-row--error"><b>Error:</b> {entry.error}</div>}
          {entry.steps?.map((s, i) => (
            <div key={i} className="ppanel__log-detail-row ppanel__log-detail-row--step">↳ {s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Detailed Log Entry ────────────────────────────────────────────────────────

/** Detailed log entry — shows timestamp, input, all steps, and full error. */
function DetailedLogEntry({ entry, idx }: { entry: PipelineLogEntry; idx: number }) {
  const [open, setOpen] = useState(false);
  const stepCount = entry.steps?.length ?? 0;
  const hasSteps = stepCount > 0;
  const statusIcon = entry.status === 'success' ? '✓' : entry.status === 'fail' ? '✕' : entry.status === 'skip' ? '−' : '~';

  return (
    <div className={`ppanel__log-entry ppanel__dlog-entry ppanel__log-entry--${entry.status}`}>
      <div
        className="ppanel__log-row"
        onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer' }}
      >
        <span className={`ppanel__log-status ppanel__log-status--${entry.status}`}>{statusIcon}</span>
        <span className="ppanel__dlog-idx">#{idx + 1}</span>
        <span className="ppanel__log-layer">{entry.layer}</span>
        <span className="ppanel__log-source">{entry.source}</span>
        <span className="ppanel__log-method">{entry.method}</span>
        {entry.dataPointsFound > 0 && (
          <span className="ppanel__log-points">{entry.dataPointsFound} pt{entry.dataPointsFound !== 1 ? 's' : ''}</span>
        )}
        {entry.duration_ms > 0 && (
          <span className="ppanel__log-dur">{(entry.duration_ms / 1000).toFixed(2)}s</span>
        )}
        {hasSteps && <span className="ppanel__dlog-stepcnt">{stepCount} step{stepCount !== 1 ? 's' : ''}</span>}
        <span className="ppanel__log-expand">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="ppanel__dlog-detail">
          {entry.input && (
            <div className="ppanel__dlog-field">
              <span className="ppanel__dlog-label">Input:</span>
              <code className="ppanel__dlog-code">{entry.input}</code>
            </div>
          )}
          {entry.details && (
            <div className="ppanel__dlog-field">
              <span className="ppanel__dlog-label">Result:</span>
              <span className="ppanel__dlog-value">{entry.details}</span>
            </div>
          )}
          {entry.error && (
            <div className="ppanel__dlog-field ppanel__dlog-field--error">
              <span className="ppanel__dlog-label">Error:</span>
              <span className="ppanel__dlog-value ppanel__dlog-value--error">{entry.error}</span>
            </div>
          )}
          {hasSteps && (
            <div className="ppanel__dlog-steps">
              <div className="ppanel__dlog-steps-title">Execution steps ({stepCount}):</div>
              {entry.steps!.map((s, si) => (
                <div key={si} className="ppanel__dlog-step">
                  <span className="ppanel__dlog-step-num">{si + 1}.</span>
                  <span className="ppanel__dlog-step-text">{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type LogFilter = 'all' | 'errors' | 'warnings' | 'info';

/** Return the status icon character for a log entry. */
function statusIcon(status: PipelineLogEntry['status']): string {
  switch (status) {
    case 'success': return '✓';
    case 'fail':    return '✕';
    case 'warn':    return '⚠';
    case 'partial': return '~';
    default:        return '−';
  }
}

/** Format a timestamp to a short HH:MM:SS string for display. */
function formatTimestamp(ts: string | undefined): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
  } catch {
    return '';
  }
}

/** Format all basic log entries as plain text for clipboard copy. */
function formatLogAsText(log: PipelineLogEntry[]): string {
  return log.map(e => {
    const icon = statusIcon(e.status);
    const pts  = e.dataPointsFound > 0 ? ` [${e.dataPointsFound} pts]` : '';
    const dur  = e.duration_ms > 0 ? ` (${(e.duration_ms / 1000).toFixed(2)}s)` : '';
    const ts   = e.timestamp ? `[${formatTimestamp(e.timestamp)}] ` : '';
    // For info/warn/error entries (source===method===level), emit the message directly
    const isMsg = e.source === 'info' || e.source === 'warn' || e.source === 'error';
    const line = isMsg
      ? `${icon} ${ts}${e.layer}: ${e.details ?? e.error ?? e.method}${pts}`
      : `${icon} ${ts}${e.layer} | ${e.source} | ${e.method}${pts}${dur}`;
    const extras: string[] = [];
    if (!isMsg && e.details) extras.push(`Details: ${e.details}`);
    if (e.error && !isMsg)   extras.push(`Error: ${e.error}`);
    return extras.length ? `${line}\n    ${extras.join('\n    ')}` : line;
  }).join('\n');
}

/** Format all log entries with full details, steps, and inputs (detailed diagnostic log). */
function formatDetailedLogAsText(log: PipelineLogEntry[]): string {
  return log.map((e, idx) => {
    const icon = statusIcon(e.status);
    const pts  = e.dataPointsFound > 0 ? ` [${e.dataPointsFound} pts]` : '';
    const dur  = e.duration_ms > 0 ? ` (${(e.duration_ms / 1000).toFixed(2)}s)` : '';
    const ts   = e.timestamp ? ` @ ${e.timestamp}` : '';
    const isMsg = e.source === 'info' || e.source === 'warn' || e.source === 'error';
    let out = `--- Entry ${idx + 1} ---\n`;
    out += `${icon} [${e.layer}] ${e.source} → ${e.method}${pts}${dur}${ts}\n`;
    if (e.input)   out += `  Input:   ${e.input}\n`;
    if (isMsg)     out += `  Message: ${e.details ?? e.error ?? ''}\n`;
    else if (e.details) out += `  Details: ${e.details}\n`;
    if (e.error && !isMsg)   out += `  Error:   ${e.error}\n`;
    if (e.steps?.length) {
      out += `  Steps (${e.steps.length}):\n`;
      out += e.steps.map(s => `    ↳ ${s}`).join('\n') + '\n';
    }
    return out;
  }).join('\n');
}

export function PipelineProgressPanel({
  status,
  message,
  currentStage: currentStageProp,
  result,
  documents,
  log: logProp,
  failureReason,
  masterReportText,
  onLoadLogs,
  hideCompletionDetails,
}: PipelineProgressProps) {
  const [allCopied,     setAllCopied]     = useState(false);
  const [logFilter,     setLogFilter]     = useState<LogFilter>('all');
  // Persisted logs loaded automatically when in-memory log is empty after run.
  const [loadedLog,     setLoadedLog]     = useState<PipelineLogEntry[] | null>(null);
  const [logsLoading,   setLogsLoading]   = useState(false);
  const [logsLoadError, setLogsLoadError] = useState('');
  // Whether the user has manually scrolled up inside the log stream (stops auto-scroll).
  const [userScrolled, setUserScrolled]   = useState(false);
  // Ref to the scrollable log container for auto-scroll behaviour.
  const logStreamRef = useRef<HTMLDivElement>(null);
  // Master report section — collapsed by default, expanded on click.
  const [reportExpanded, setReportExpanded] = useState(false);
  const [reportCopied,   setReportCopied]   = useState(false);

  // Resolved log — prefer in-memory prop, fall back to on-demand loaded.
  const log = (logProp && logProp.length > 0) ? logProp : (loadedLog ?? undefined);

  // Apply filter to get the visible log entries
  const filteredLog = useMemo(() => {
    if (!log) return undefined;
    switch (logFilter) {
      case 'errors':   return log.filter(e => e.status === 'fail');
      case 'warnings': return log.filter(e => e.status === 'warn');
      case 'info':     return log.filter(e => e.status === 'skip' || e.source === 'info');
      default:         return log;
    }
  }, [log, logFilter]);

  // Counts for filter buttons
  const errorCount   = useMemo(() => log?.filter(e => e.status === 'fail').length ?? 0, [log]);
  const warningCount = useMemo(() => log?.filter(e => e.status === 'warn').length ?? 0, [log]);

  // Live update feed: last 6 meaningful log entries (shown during run as "what's happening now")
  const liveUpdates = useMemo(() => {
    if (!log || log.length === 0) return [];
    return [...log]
      .filter(e => {
        const hasText = !!(e.details || e.error || (e.source === 'info' && e.method));
        return hasText && e.status !== 'skip';
      })
      .slice(-6)
      .reverse();
  }, [log]);

  // Auto-scroll the log stream to the latest entry while the run is in progress
  // (stops once the user manually scrolls up).
  useEffect(() => {
    if (!logStreamRef.current || userScrolled) return;
    logStreamRef.current.scrollTop = logStreamRef.current.scrollHeight;
  }, [log?.length, userScrolled]);

  // When the run ends: reset user-scroll so the auto-scroll starts fresh next run,
  // then scroll the panel into view so the user immediately sees the completed log.
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const wasRunning = prevStatusRef.current === 'running' || prevStatusRef.current === 'starting';
    const isNowDone  = isDoneStatus(status);
    if (wasRunning && isNowDone) {
      setUserScrolled(false);
      if (logStreamRef.current) {
        setTimeout(() => {
          logStreamRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 300);
      }
    }
    prevStatusRef.current = status;
  }, [status]);

  // Auto-load persisted logs from the server when the run ends and no in-memory
  // log is available.  This means logs are always visible immediately after a run.
  useEffect(() => {
    // Guard: trigger on any completion status including county-specific 'complete'
    const isDoneNow = isDoneStatus(status);
    if (!isDoneNow) return;
    // Guard: in-memory log already present — nothing to load
    if (logProp && logProp.length > 0) return;
    // Guard: persisted logs already loaded, or load already in-flight, or no loader provided
    if (loadedLog || logsLoading || !onLoadLogs) return;

    setLogsLoading(true);
    onLoadLogs()
      .then(loaded => {
        if (loaded && loaded.length > 0) setLoadedLog(loaded);
        else setLogsLoadError('No saved logs for this run.');
      })
      .catch(() => setLogsLoadError('Failed to load saved logs.'))
      .finally(() => setLogsLoading(false));
  // Run only when status transitions to done; don't re-run on other changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Treat county-specific 'complete' the same as 'success' for display purposes.
  const isRunning  = status === 'running' || status === 'starting';
  const isSuccess  = status === 'success' || status === 'partial' || status === 'complete';
  const isFailed   = status === 'failed';
  const isPartial  = status === 'partial';
  const isDone     = isDoneStatus(status);

  // Strip "Stage N: " prefix for cleaner display; fall back to currentStageProp
  const cleanMessage = message?.replace(/^Stage\s*\d+(?:\.\d+)?:\s*/i, '') ?? null;
  // Best available stage description for the running state
  const stageDescription = cleanMessage || currentStageProp || null;

  const copyToClipboard = useCallback((text: string, onDone: () => void) => {
    navigator.clipboard.writeText(text)
      .then(onDone)
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        onDone();
      });
  }, []);

  /** Copy the full combined log (basic summary + detailed) to the clipboard. */
  const handleCopyAllLogs = useCallback(() => {
    if (!log || log.length === 0) return;
    const ts  = new Date().toLocaleString();
    const sep = '═'.repeat(60);
    const filterNote = logFilter !== 'all' ? ` — filter: ${logFilter} (${filteredLog?.length ?? 0} of ${log.length} entries shown)` : '';
    const combined =
      `${sep}\n` +
      `STARR RECON — Full Run Log\n` +
      `Exported: ${ts}   Entries: ${log.length}${filterNote}\n` +
      `Errors: ${errorCount}   Warnings: ${warningCount}\n` +
      `${sep}\n\n` +
      `── SUMMARY (one line per entry) ──────────────────────────\n` +
      formatLogAsText(log) + '\n\n' +
      `── DETAILED DIAGNOSTIC (inputs · steps · errors) ─────────\n` +
      formatDetailedLogAsText(log);
    copyToClipboard(combined, () => {
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 2000);
    });
  }, [log, filteredLog, logFilter, errorCount, warningCount, copyToClipboard]);

  /** Render the appropriate placeholder content when no log entries exist yet. */
  function renderLogEmpty() {
    if (isRunning) {
      return (
        <div className="ppanel__logstream-waiting">
          <Spinner />
          <span>Waiting for log entries…</span>
        </div>
      );
    }
    if (isDone) {
      return (
        <div className="ppanel__logstream-empty">
          {logsLoadError || 'No logs available for this run.'}
        </div>
      );
    }
    return null;
  }

  /** Format a single live-update entry as a short readable string. */
  function liveUpdateText(entry: PipelineLogEntry): string {
    const isInfoMsg = entry.source === 'info' || entry.source === 'warn' || entry.source === 'error';
    if (isInfoMsg) return entry.details ?? entry.error ?? entry.method ?? '';
    const prefix = entry.status === 'fail' ? '✕' : entry.status === 'warn' ? '⚠' : '✓';
    const text = entry.details ?? entry.method ?? '';
    return `${prefix} ${text}`;
  }

  return (
    <div className={`ppanel ppanel--${status ?? 'idle'}`}>

      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <div className="ppanel__header">
        <div className="ppanel__header-left">
          {isRunning && <span className="ppanel__header-spinner"><Spinner /></span>}
          {isSuccess  && <span className="ppanel__header-icon ppanel__header-icon--success">✓</span>}
          {isFailed   && <span className="ppanel__header-icon ppanel__header-icon--error">✕</span>}
          <span className="ppanel__header-title">
            {isRunning  && (stageDescription ?? 'Research running…')}
            {isSuccess  && (isPartial ? 'Research complete — partial results' : 'Research complete')}
            {isFailed   && 'Research failed'}
            {!status    && 'Starting research…'}
          </span>
        </div>
        <div className="ppanel__header-right">
          {result?.duration_ms && (
            <span className="ppanel__header-dur">{(result.duration_ms / 1000).toFixed(1)}s</span>
          )}
          {/* Copy All Logs — always visible so users can copy at any time */}
          <button
            className="ppanel__header-btn ppanel__header-btn--copy"
            onClick={handleCopyAllLogs}
            type="button"
            title="Copy all run logs to clipboard"
            disabled={!log || log.length === 0}
          >
            {allCopied ? '✓ Copied!' : '⎘ Copy All Logs'}
          </button>
        </div>
      </div>

      {/* ── Failure reason banner ────────────────────────────────────── */}
      {isFailed && failureReason && (
        <div className="ppanel__failure-reason">
          <span className="ppanel__failure-reason-icon">&#9888;</span>
          <span className="ppanel__failure-reason-text">{failureReason}</span>
        </div>
      )}

      {/* ── Live run section (replaces the old 5-stage stepper) ─────────
           Shows during an active run: large animated indicator, current
           stage text, and a live feed of recent log activity.         */}
      {isRunning && (
        <div className="ppanel__live">
          <div className="ppanel__live-core">
            <div className="ppanel__live-ring">
              <span className="ppanel__live-spinner" aria-label="running">
                <span />
              </span>
            </div>
            <div className="ppanel__live-info">
              <div className="ppanel__live-head">Researching property…</div>
              {stageDescription && (
                <div className="ppanel__live-stage">{stageDescription}</div>
              )}
            </div>
          </div>
          {liveUpdates.length > 0 && (
            <div className="ppanel__live-feed">
              {liveUpdates.map((u: PipelineLogEntry, i: number) => (
                <div
                  key={i}
                  className={`ppanel__live-update${i === 0 ? ' ppanel__live-update--latest' : ''}`}
                >
                  {liveUpdateText(u)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Result card (visible when done and details are not hidden) ─── */}
      {isSuccess && result && !hideCompletionDetails && (
        <div className="ppanel__section">
          <ResultCard result={result} />
        </div>
      )}

      {/* ── Document pills (visible when done, docs exist, and details not hidden) ── */}
      {isDone && documents && documents.length > 0 && !hideCompletionDetails && (
        <div className="ppanel__section ppanel__section--docs">
          <div className="ppanel__section-title">
            Documents captured
            <span className="ppanel__section-count">{documents.length}</span>
          </div>
          <div className="ppanel__docs">
            {documents.map((doc, i) => (
              <DocumentPill key={i} doc={doc} idx={i} />
            ))}
          </div>
        </div>
      )}

      {/* ── Master Report (collapsible — hidden when completion details are suppressed) ── */}
      {isDone && masterReportText && !hideCompletionDetails && (
        <div className="ppanel__section ppanel__section--report">
          <div
            className="ppanel__report-header"
            onClick={() => setReportExpanded(e => !e)}
            style={{ cursor: 'pointer' }}
          >
            <span className="ppanel__section-title" style={{ marginBottom: 0 }}>
              📄 Master Validation Report
            </span>
            <div className="ppanel__report-header-actions" onClick={e => e.stopPropagation()}>
              <button
                className="ppanel__report-copy-btn"
                type="button"
                title="Copy full report to clipboard"
                onClick={() => {
                  copyToClipboard(masterReportText, () => {
                    setReportCopied(true);
                    setTimeout(() => setReportCopied(false), 2000);
                  });
                }}
              >
                {reportCopied ? '✓ Copied!' : '⎘ Copy'}
              </button>
              <span className="ppanel__log-expand">{reportExpanded ? '▲' : '▼'}</span>
            </div>
          </div>
          {reportExpanded && (
            <pre className="ppanel__report-body">{masterReportText}</pre>
          )}
        </div>
      )}

      {/* ── Run Log Stream (always visible — live during run, persisted after) ── */}
      <div className="ppanel__logstream">

        {/* Log stream header with entry count + copy button */}
        <div className="ppanel__logstream-header">
          <div className="ppanel__logstream-header-left">
            <span className="ppanel__logstream-title">📋 Run Log</span>
            {log && log.length > 0 && (
              <span className="ppanel__logstream-count">{log.length}</span>
            )}
            {logsLoading && (
              <span className="ppanel__logstream-loading">
                <Spinner /> Loading saved logs…
              </span>
            )}
          </div>
          <button
            className="ppanel__logstream-copy-btn"
            onClick={handleCopyAllLogs}
            type="button"
            title="Copy all run logs to clipboard (summary + full details with steps)"
            disabled={!log || log.length === 0}
          >
            {allCopied ? '✓ Copied!' : '⎘ Copy All Logs'}
          </button>
        </div>

        {/* Filter bar — only visible when there are log entries */}
        {log && log.length > 0 && (
          <div className="ppanel__logstream-filters">
            {(['all', 'errors', 'warnings', 'info'] as LogFilter[]).map(f => {
              const count = f === 'errors' ? errorCount
                : f === 'warnings' ? warningCount
                : f === 'info' ? (log.filter(e => e.status === 'skip' || e.source === 'info').length)
                : log.length;
              return (
                <button
                  key={f}
                  className={`ppanel__logstream-filter${logFilter === f ? ' ppanel__logstream-filter--active' : ''}${f === 'errors' && errorCount > 0 ? ' ppanel__logstream-filter--has-errors' : ''}${f === 'warnings' && warningCount > 0 ? ' ppanel__logstream-filter--has-warnings' : ''}`}
                  onClick={() => setLogFilter(f)}
                  type="button"
                >
                  {f === 'all' ? 'All' : f === 'errors' ? '✕ Errors' : f === 'warnings' ? '⚠ Warnings' : '− Info'}
                  <span className="ppanel__logstream-filter-count">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Scrollable log entry list */}
        <div
          className="ppanel__logstream-entries"
          ref={logStreamRef}
          onScroll={() => {
            if (!logStreamRef.current) return;
            const { scrollTop, scrollHeight, clientHeight } = logStreamRef.current;
            // If user scrolls away from the bottom, stop auto-scrolling
            setUserScrolled(scrollHeight - scrollTop - clientHeight > 40);
          }}
        >
          {(!log || log.length === 0) ? (
            renderLogEmpty()
          ) : filteredLog && filteredLog.length === 0 ? (
            <div className="ppanel__logstream-empty">No {logFilter} entries in this run.</div>
          ) : (
            (filteredLog ?? log).map((entry, i) => <LogEntry key={i} entry={entry} />)
          )}
        </div>

        {/* Footer: entry count + second copy button (visible once logs exist) */}
        {log && log.length > 0 && (
          <div className="ppanel__logstream-footer">
            <span className="ppanel__logstream-footer-note">
              {logFilter !== 'all'
                ? `${filteredLog?.length ?? 0} of ${log.length} entr${log.length !== 1 ? 'ies' : 'y'} (${logFilter} filter)`
                : `${log.length} entr${log.length !== 1 ? 'ies' : 'y'}`}
              {isDone ? ' — run complete' : ' — live'}
              {errorCount > 0 && <span className="ppanel__logstream-footer-errors"> · {errorCount} error{errorCount !== 1 ? 's' : ''}</span>}
              {warningCount > 0 && <span className="ppanel__logstream-footer-warnings"> · {warningCount} warning{warningCount !== 1 ? 's' : ''}</span>}
            </span>
            <button
              className="ppanel__logstream-copy-btn ppanel__logstream-copy-btn--footer"
              onClick={handleCopyAllLogs}
              type="button"
              title="Copy all run logs to clipboard"
            >
              {allCopied ? '✓ Copied!' : '⎘ Copy All Logs'}
            </button>
          </div>
        )}

      </div>

    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
// Scoped CSS-in-JS via a <style> tag so this component is self-contained
// and works without a separate CSS import.

export function PipelineProgressStyles() {
  return (
    <style>{`
/* ── Panel shell ─────────────────────────────────────────── */
.ppanel {
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  font-size: 0.82rem;
  line-height: 1.4;
  box-shadow: 0 2px 8px rgba(0,0,0,0.07);
  margin: 0.75rem 0;
}
.ppanel--running { border-color: #3b82f6; }
.ppanel--success { border-color: #10b981; }
.ppanel--partial { border-color: #f59e0b; }
.ppanel--failed  { border-color: #ef4444; }

/* ── Failure reason banner ────────────────────────────────── */
.ppanel__failure-reason {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.7rem 0.9rem;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  color: #991b1b;
  font-size: 0.82rem;
  line-height: 1.5;
}
.ppanel__failure-reason-icon {
  flex-shrink: 0;
  font-size: 1rem;
  line-height: 1.4;
  color: #dc2626;
}
.ppanel__failure-reason-text {
  flex: 1;
}

/* ── Header ──────────────────────────────────────────────── */
.ppanel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.9rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  gap: 0.5rem;
}
.ppanel--running .ppanel__header { background: #eff6ff; border-color: #bfdbfe; }
.ppanel--success .ppanel__header { background: #ecfdf5; border-color: #a7f3d0; }
.ppanel--partial .ppanel__header { background: #fffbeb; border-color: #fde68a; }
.ppanel--failed  .ppanel__header { background: #fef2f2; border-color: #fecaca; }

.ppanel__header-left {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex: 1;
  min-width: 0;
}
.ppanel__header-right {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}
.ppanel__header-title {
  font-weight: 600;
  font-size: 0.84rem;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ppanel__header-dur {
  font-size: 0.75rem;
  color: #64748b;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ppanel__header-btn {
  border-radius: 5px;
  padding: 0.2rem 0.55rem;
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.1s, color 0.1s;
  border: 1px solid;
}
.ppanel__header-btn--copy {
  background: #f0fdf4;
  border-color: #a7f3d0;
  color: #166534;
}
.ppanel__header-btn--copy:hover { background: #dcfce7; }
.ppanel__header-btn:disabled { opacity: 0.55; cursor: default; }
.ppanel__header-icon--success { color: #10b981; font-size: 1rem; font-weight: 700; }
.ppanel__header-icon--error   { color: #ef4444; font-size: 1rem; font-weight: 700; }
.ppanel__header-spinner       { display: flex; align-items: center; }

/* ── Spinner ─────────────────────────────────────────────── */
.ppanel__spinner {
  display: inline-flex;
  width: 14px;
  height: 14px;
  position: relative;
  flex-shrink: 0;
}
.ppanel__spinner span {
  position: absolute;
  inset: 0;
  border: 2px solid #dbeafe;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: ppanel-spin 0.7s linear infinite;
}
@keyframes ppanel-spin { to { transform: rotate(360deg); } }
@keyframes ppanel-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }

/* ── Stage track styles removed — replaced by live-run section ── */

/* ── Live run section (replaces the old 5-stage stepper) ────── */
.ppanel__live {
  padding: 1.2rem 1rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
}

.ppanel__live-core {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.ppanel__live-ring {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ppanel__live-spinner {
  display: inline-flex;
  width: 44px;
  height: 44px;
  position: relative;
}

.ppanel__live-spinner span {
  position: absolute;
  inset: 0;
  border: 4px solid #dbeafe;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: ppanel-spin 0.9s linear infinite;
}

.ppanel__live-info {
  flex: 1;
  min-width: 0;
}

.ppanel__live-head {
  font-size: 1rem;
  font-weight: 700;
  color: #1d4ed8;
  margin-bottom: 0.2rem;
}

.ppanel__live-stage {
  font-size: 0.82rem;
  color: #3b82f6;
  animation: ppanel-pulse 1.8s ease-in-out infinite;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ppanel__live-feed {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.5rem 0.65rem;
  background: rgba(255,255,255,0.6);
  border-radius: 6px;
  border: 1px solid #dbeafe;
  max-height: 10rem;
  overflow: hidden;
}

.ppanel__live-update {
  font-size: 0.73rem;
  color: #475569;
  line-height: 1.45;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.6;
}

.ppanel__live-update--latest {
  color: #1e293b;
  font-weight: 500;
  opacity: 1;
}

/* ── Section ─────────────────────────────────────────────── */
.ppanel__section {
  padding: 0.55rem 0.9rem;
  border-top: 1px solid #f1f5f9;
}
.ppanel__section-title {
  font-weight: 600;
  font-size: 0.78rem;
  color: #475569;
  margin-bottom: 0.4rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.ppanel__section-count {
  background: #e2e8f0;
  color: #475569;
  border-radius: 9999px;
  padding: 0 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
}

/* ── Master Report section ───────────────────────────────── */
.ppanel__section--report {
  padding: 0;
  border-top: 1px solid #f1f5f9;
}
.ppanel__report-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.9rem;
  gap: 0.5rem;
}
.ppanel__report-header:hover { background: #f8fafc; }
.ppanel__report-header-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}
.ppanel__report-copy-btn {
  font-size: 0.72rem;
  padding: 0.15rem 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  color: #475569;
  cursor: pointer;
  white-space: nowrap;
}
.ppanel__report-copy-btn:hover { background: #f1f5f9; }
.ppanel__report-body {
  margin: 0;
  padding: 0.6rem 0.9rem 0.75rem;
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
  font-family: 'Courier New', monospace;
  font-size: 0.72rem;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-x: auto;
  max-height: 480px;
  overflow-y: auto;
  color: #1e293b;
}

/* ── Result card ─────────────────────────────────────────── */
.ppanel__result-card {
  background: #f8fafc;
  border-radius: 6px;
  padding: 0.5rem 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.ppanel__result-row {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.79rem;
}
.ppanel__result-row--meta   { margin-top: 0.15rem; }
.ppanel__result-row--legal  { align-items: flex-start; }
.ppanel__result-label {
  color: #64748b;
  font-weight: 600;
  flex-shrink: 0;
  min-width: 5.5rem;
  font-size: 0.73rem;
}
.ppanel__result-value        { color: #1e293b; }
.ppanel__result-value--owner { font-weight: 700; color: #0f172a; }
.ppanel__result-value--legal { color: #475569; font-size: 0.73rem; line-height: 1.4; }
.ppanel__result-value--meta  { color: #94a3b8; font-size: 0.72rem; }

.ppanel__confidence {
  display: inline-block;
  margin-left: 0.35rem;
  padding: 0.05rem 0.35rem;
  border-radius: 9999px;
  font-size: 0.68rem;
  font-weight: 700;
}
.ppanel__confidence--high { background: #d1fae5; color: #065f46; }
.ppanel__confidence--mid  { background: #fef9c3; color: #713f12; }
.ppanel__confidence--low  { background: #fee2e2; color: #991b1b; }

.ppanel__verified {
  color: #10b981;
  margin-left: 0.3rem;
  font-weight: 700;
}

/* ── Documents ───────────────────────────────────────────── */
.ppanel__docs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.ppanel__doc-pill {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 0.2rem 0.45rem;
  font-size: 0.72rem;
}
.ppanel__doc-type  { color: #334155; font-weight: 600; }
.ppanel__doc-instr { color: #94a3b8; font-size: 0.68rem; }
.ppanel__doc-tag {
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.ppanel__doc-tag--text      { background: #dbeafe; color: #1e40af; }
.ppanel__doc-tag--image     { background: #dcfce7; color: #166534; }
.ppanel__doc-tag--ocr       { background: #f0fdf4; color: #166534; }
.ppanel__doc-tag--extracted { background: #fef9c3; color: #713f12; }

/* ── Log entry rows (used inside the stream) ─────────────── */
.ppanel__log-entry {
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.72rem;
}
.ppanel__log-entry:last-child { border-bottom: none; }

.ppanel__log-row {
  display: flex;
  align-items: flex-start;
  gap: 0.3rem;
  padding: 0.25rem 0.45rem;
  flex-wrap: nowrap;
  min-width: 0;
}
.ppanel__log-entry--fail  .ppanel__log-row { background: #fff5f5; }
.ppanel__log-entry--warn  .ppanel__log-row { background: #fffbeb; }
.ppanel__log-entry--skip  .ppanel__log-row { opacity: 0.55; }

.ppanel__log-status {
  flex-shrink: 0;
  font-weight: 700;
  font-size: 0.7rem;
  width: 12px;
  text-align: center;
}
.ppanel__log-status--success { color: #10b981; }
.ppanel__log-status--fail    { color: #ef4444; }
.ppanel__log-status--warn    { color: #d97706; }
.ppanel__log-status--skip    { color: #94a3b8; }
.ppanel__log-status--partial { color: #f59e0b; }

.ppanel__log-ts { color: #94a3b8; flex-shrink: 0; font-variant-numeric: tabular-nums; font-size: 0.66rem; white-space: nowrap; }

.ppanel__log-layer  { color: #6366f1; font-weight: 600; flex-shrink: 0; min-width: 3.5rem; max-width: 9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ppanel__log-source { color: #0369a1; flex-shrink: 0; min-width: 3rem; max-width: 7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ppanel__log-method { color: #475569; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ppanel__log-method--msg { white-space: normal; word-break: break-word; overflow-wrap: break-word; overflow: visible; }
.ppanel__log-points { color: #059669; flex-shrink: 0; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ppanel__log-dur    { color: #94a3b8; flex-shrink: 0; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ppanel__log-expand { color: #94a3b8; flex-shrink: 0; font-size: 0.6rem; margin-left: auto; }

.ppanel__log-detail {
  padding: 0.2rem 0.6rem 0.3rem 1.8rem;
  background: #f0f9ff;
  border-top: 1px solid #e0f2fe;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.ppanel__log-detail-row         { color: #334155; word-break: break-word; overflow-wrap: break-word; }
.ppanel__log-detail-row--error  { color: #b91c1c; }
.ppanel__log-detail-row--step   { color: #64748b; }
.ppanel__log-detail code {
  background: #e2e8f0;
  padding: 0.05rem 0.25rem;
  border-radius: 3px;
  font-size: 0.68rem;
  word-break: break-all;
}

/* ── Log Stream (always-visible, scrollable) ─────────────── */
.ppanel__logstream {
  border-top: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.ppanel__logstream-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0.9rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  gap: 0.5rem;
}
.ppanel--running .ppanel__logstream-header { background: #eff6ff; border-color: #bfdbfe; }

.ppanel__logstream-header-left {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.ppanel__logstream-title {
  font-weight: 700;
  font-size: 0.8rem;
  color: #334155;
}

.ppanel__logstream-count {
  background: #e2e8f0;
  color: #475569;
  border-radius: 9999px;
  padding: 0.02rem 0.45rem;
  font-size: 0.7rem;
  font-weight: 700;
}

.ppanel__logstream-loading {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  color: #64748b;
  font-style: italic;
}

.ppanel__logstream-copy-btn {
  background: #f0fdf4;
  border: 1px solid #a7f3d0;
  border-radius: 5px;
  padding: 0.2rem 0.6rem;
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 600;
  color: #166534;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.1s, color 0.1s;
}
.ppanel__logstream-copy-btn:hover { background: #dcfce7; }
.ppanel__logstream-copy-btn:disabled { opacity: 0.5; cursor: default; }

.ppanel__logstream-entries {
  max-height: 480px;
  overflow-y: auto;
  overflow-x: hidden;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.ppanel__logstream-waiting {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.9rem;
  font-size: 0.8rem;
  color: #64748b;
  font-style: italic;
}

.ppanel__logstream-empty {
  padding: 0.75rem 0.9rem;
  font-size: 0.78rem;
  color: #94a3b8;
  font-style: italic;
}

.ppanel__logstream-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0.9rem;
  background: #f1f5f9;
  border-top: 1px solid #e2e8f0;
  gap: 0.5rem;
}

.ppanel__logstream-footer-note {
  font-size: 0.72rem;
  color: #64748b;
  flex: 1;
}

.ppanel__logstream-footer-errors   { color: #dc2626; font-weight: 600; }
.ppanel__logstream-footer-warnings { color: #d97706; font-weight: 600; }

/* ── Log filter bar ──────────────────────────────────────── */
.ppanel__logstream-filters {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.7rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  flex-wrap: wrap;
}
.ppanel__logstream-filter {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
  cursor: pointer;
  font-size: 0.69rem;
  font-weight: 500;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}
.ppanel__logstream-filter:hover { background: #f1f5f9; border-color: #cbd5e1; }
.ppanel__logstream-filter--active { background: #e0e7ff; border-color: #6366f1; color: #3730a3; font-weight: 700; }
.ppanel__logstream-filter--has-errors  { border-color: #fca5a5; color: #dc2626; }
.ppanel__logstream-filter--has-errors.ppanel__logstream-filter--active { background: #fee2e2; border-color: #ef4444; color: #991b1b; }
.ppanel__logstream-filter--has-warnings  { border-color: #fcd34d; color: #d97706; }
.ppanel__logstream-filter--has-warnings.ppanel__logstream-filter--active { background: #fef3c7; border-color: #f59e0b; color: #92400e; }
.ppanel__logstream-filter-count {
  background: rgba(0,0,0,0.07);
  border-radius: 9999px;
  padding: 0 0.3rem;
  font-size: 0.65rem;
  font-variant-numeric: tabular-nums;
}

.ppanel__logstream-copy-btn--footer {
  font-size: 0.7rem;
}

/* ── Detailed log entry (used inside LogEntry expand) ────── */
.ppanel__dlog-idx {
  flex-shrink: 0;
  color: #94a3b8;
  font-size: 0.67rem;
  font-variant-numeric: tabular-nums;
  min-width: 1.8rem;
}

.ppanel__dlog-stepcnt {
  flex-shrink: 0;
  font-size: 0.67rem;
  color: #059669;
  background: #d1fae5;
  border-radius: 9999px;
  padding: 0.02rem 0.35rem;
  font-weight: 600;
}

.ppanel__dlog-detail {
  padding: 0.3rem 0.65rem 0.4rem 2rem;
  background: #ecfdf5;
  border-top: 1px solid #a7f3d0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.ppanel__dlog-field {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  font-size: 0.71rem;
}

.ppanel__dlog-field--error { background: #fff5f5; border-radius: 4px; padding: 0.1rem 0.3rem; }

.ppanel__dlog-label {
  flex-shrink: 0;
  font-weight: 600;
  color: #475569;
  min-width: 3.5rem;
  font-size: 0.69rem;
}

.ppanel__dlog-code {
  background: #e2e8f0;
  padding: 0.05rem 0.25rem;
  border-radius: 3px;
  font-size: 0.67rem;
  word-break: break-all;
  font-family: monospace;
}

.ppanel__dlog-value { color: #334155; word-break: break-word; }
.ppanel__dlog-value--error { color: #b91c1c; }

.ppanel__dlog-steps {
  margin-top: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.ppanel__dlog-steps-title {
  font-weight: 600;
  font-size: 0.69rem;
  color: #475569;
  margin-bottom: 0.1rem;
}

.ppanel__dlog-step {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  font-size: 0.69rem;
  color: #374151;
}

.ppanel__dlog-step-num {
  flex-shrink: 0;
  color: #9ca3af;
  font-size: 0.65rem;
  font-variant-numeric: tabular-nums;
  min-width: 1.2rem;
  text-align: right;
}

.ppanel__dlog-step-text {
  flex: 1;
  word-break: break-word;
  font-family: monospace;
  font-size: 0.68rem;
  color: #1e293b;
}
    `}</style>
  );
}

