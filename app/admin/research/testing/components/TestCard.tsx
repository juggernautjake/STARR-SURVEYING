// TestCard.tsx — Reusable module card with full debugger (timeline, code, logs)
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ExecutionTimeline, { type TimelineEvent, type EventType } from './ExecutionTimeline';
import CodeViewer, { type CodeFile, type LineState } from './CodeViewer';
import LogStream, { type LogEntry } from './LogStream';
import OutputViewer from './OutputViewer';
import { usePropertyContext } from './PropertyContextBar';
import { publishLogs, type SharedLogEntry } from './useTestingLogStore';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TestCardProps {
  title: string;
  description: string;
  module: string;
  requiresBrowser: boolean;
  requiresApiKey: boolean;
  estimatedRuntime: string;
  requiredInputs: string[];
  optionalInputs?: string[];
}

type CardStatus = 'idle' | 'running' | 'paused' | 'success' | 'error';
type ExecutionMode = 'continuous' | 'until-fail' | 'step';

// ── Helpers ──────────────────────────────────────────────────────────────────

let eventIdCounter = 0;
function nextEventId(): string {
  return `evt-${++eventIdCounter}-${Date.now()}`;
}

function nextLogId(): string {
  return `log-${++eventIdCounter}-${Date.now()}`;
}

// ── Log entry parsing helper ──────────────────────────────────────────────────

interface ParsedLogEntry {
  level: LogEntry['level'];
  source: string;
  message: string;
  details: string | undefined;
  evtType: EventType;
  evtLabel: string;
  evtDetail: string;
}

/**
 * Safely parse a raw log entry object from the worker result.
 * Returns null if the entry is not a valid non-null object.
 */
function parseRawLogEntry(raw: unknown, fallbackSource: string): ParsedLogEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const entry = raw as Record<string, unknown>;

  const status     = typeof entry.status  === 'string' ? entry.status  : '';
  const source     = typeof entry.source  === 'string' ? entry.source  : fallbackSource;
  const layer      = typeof entry.layer   === 'string' ? entry.layer   : '';
  const method     = typeof entry.method  === 'string' ? entry.method  : '';
  const detailStr  = typeof entry.details === 'string' ? entry.details : status;
  const errorStr   = typeof entry.error   === 'string' ? entry.error   : undefined;

  const msgParts: string[] = [];
  if (layer)  msgParts.push(`[${layer}]`);
  if (method) msgParts.push(method);
  if (detailStr) msgParts.push(detailStr);
  else if (!layer && !method) msgParts.push(`log from ${source}`);
  const message = msgParts.join(' ');

  const evtLabel = [layer, method].filter(Boolean).join(': ') || `log from ${source}`;
  const level: LogEntry['level'] =
    status === 'fail' ? 'error' : status === 'warn' ? 'warn' : 'info';
  const evtType: EventType =
    status === 'fail' ? 'error' : status === 'warn' ? 'warning' : 'data-found';

  return { level, source, message, details: errorStr, evtType, evtLabel, evtDetail: detailStr };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TestCard({
  title,
  description,
  module,
  requiresBrowser,
  requiresApiKey,
  estimatedRuntime,
  requiredInputs,
  optionalInputs = [],
}: TestCardProps) {
  const { context } = usePropertyContext();

  // State
  const [status, setStatus] = useState<CardStatus>('idle');
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [codeFiles, setCodeFiles] = useState<CodeFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [activeLine, setActiveLine] = useState<number | undefined>();
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | undefined>();
  const [duration, setDuration] = useState<number | undefined>();
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [asyncMessage, setAsyncMessage] = useState<string | undefined>();

  // Timeline state
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDebugger, setShowDebugger] = useState(false);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('continuous');
  const [workerBranch, setWorkerBranch] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState('');
  const [logLevelFilter, setLogLevelFilter] = useState<Set<string>>(
    new Set(['info', 'warn', 'error', 'success', 'debug'])
  );

  const toggleLogLevel = (level: string) => {
    setLogLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const startTimeRef = useRef<number>(0);
  const playbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const replayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const executionModeRef = useRef<ExecutionMode>(executionMode);
  executionModeRef.current = executionMode; // keep ref in sync

  // Clean up intervals + SSE on unmount
  useEffect(() => {
    return () => {
      if (playbackRef.current) {
        clearInterval(playbackRef.current);
        playbackRef.current = null;
      }
      if (replayRef.current) {
        clearInterval(replayRef.current);
        replayRef.current = null;
      }
      sseRef.current?.close();
    };
  }, []);

  // Post-run playback: when isPlaying and the run is done, advance currentTime
  // by speed × 100 ms every 100 ms, clamped at totalDuration.
  useEffect(() => {
    if (replayRef.current) {
      clearInterval(replayRef.current);
      replayRef.current = null;
    }
    if (status !== 'running' && isPlaying && totalDuration > 0) {
      replayRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          const next = prev + 100 * speed;
          if (next >= totalDuration) {
            // Reached end — stop playback
            if (replayRef.current) {
              clearInterval(replayRef.current);
              replayRef.current = null;
            }
            setIsPlaying(false);
            return totalDuration;
          }
          return next;
        });
      }, 100);
    }
    return () => {
      if (replayRef.current) {
        clearInterval(replayRef.current);
        replayRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, status, speed, totalDuration]);

  // ── Check worker branch on expand ──────────────────────────────────────────
  useEffect(() => {
    if (!isExpanded) return;
    fetch('/api/admin/research/testing/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module: 'deploy-status', inputs: {} }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.success && d.result?.branch) setWorkerBranch(d.result.branch); })
      .catch(() => {});
  }, [isExpanded]);

  // ── Check inputs ───────────────────────────────────────────────────────────

  const contextRecord = context as unknown as Record<string, string>;

  const missingInputs = requiredInputs.filter((key) => {
    const val = contextRecord[key];
    return !val || val.trim() === '';
  });

  // ── Add event helper ───────────────────────────────────────────────────────

  const addEvent = useCallback((type: EventType, label: string, desc: string, extra?: Partial<TimelineEvent>) => {
    const ts = Date.now() - startTimeRef.current;
    const evt: TimelineEvent = {
      id: nextEventId(),
      timestamp: ts,
      type,
      label,
      description: desc,
      ...extra,
    };
    setEvents((prev) => [...prev, evt]);
    setCurrentTime(ts);
    setTotalDuration(ts);
    return evt;
  }, []);

  const addLog = useCallback((level: LogEntry['level'], source: string, message: string, details?: string) => {
    const ts = Date.now() - startTimeRef.current;
    setLogs((prev) => [...prev, {
      id: nextLogId(),
      timestamp: ts,
      level,
      source,
      message,
      details,
    }]);
    setCurrentTime(ts);
    setTotalDuration(ts);
  }, []);

  // ── SSE stream for real-time worker events ──────────────────────────────────

  const connectSSE = useCallback((projectId: string) => {
    sseRef.current?.close();
    const url = `/api/admin/research/testing/stream?projectId=${encodeURIComponent(projectId)}`;
    const sse = new EventSource(url);
    sseRef.current = sse;

    // Track files we've already requested to avoid duplicate fetches
    const fetchedFiles = new Set<string>();
    // Track whether we've received any timeline events — if yes, skip
    // raw log events to avoid duplicates (both come from the same
    // LayerAttempt entries in the worker).
    let hasTimelineEvents = false;

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'connected') return;

        if (data.type === 'complete') {
          sse.close();
          sseRef.current = null;
          return;
        }

        // Stage update — always process (not duplicated by timeline)
        if (data.type === 'stage') {
          addLog('info', module, `Stage: ${data.stage}${data.message ? ` — ${data.message}` : ''}`);
        }

        // Timeline events from the worker's TimelineTracker.
        // These are richer than raw log entries (they include file/line
        // metadata) and come from the same LayerAttempt source, so when
        // timeline events are flowing we skip raw log events to avoid dupes.
        if (data.sseType === 'tl') {
          hasTimelineEvents = true;

          const VALID_TYPES = [
            'phase-start', 'phase-complete', 'phase-failed', 'api-call',
            'ai-call', 'browser-action', 'data-found', 'warning', 'error',
            'screenshot', 'log', 'checkpoint',
          ];
          const evtType: EventType = VALID_TYPES.includes(data.type) ? data.type as EventType : 'log';

          const evt: TimelineEvent = {
            id: data.id || nextEventId(),
            timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now() - startTimeRef.current,
            type: evtType,
            label: data.label || '',
            description: data.description || '',
            file: data.file,
            function: data.function,
            line: data.line,
            duration: data.duration,
          };
          setEvents((prev) => [...prev, evt]);

          // Also create a log entry from the timeline event so the LogStream
          // shows it (timeline events are the single source of truth).
          const logLevel: LogEntry['level'] =
            evtType === 'error' ? 'error' :
            evtType === 'warning' ? 'warn' :
            evtType === 'phase-complete' ? 'success' : 'info';
          addLog(logLevel, module, `${data.label || ''}: ${data.description || ''}`);

          // Auto-pause in "Run Until Fail" mode when an error event arrives
          if (executionModeRef.current === 'until-fail' && evtType === 'error') {
            setIsPlaying(false);
            setStatus('paused');
            addLog('warn', module, 'Auto-paused: error detected (Run Until Fail mode)');
          }

          // Lazy-load source file for CodeViewer (deduplicated)
          if (data.file && typeof data.file === 'string' && !fetchedFiles.has(data.file)) {
            fetchedFiles.add(data.file);
            const branch = contextRecord.branch || 'main';
            fetch(`/api/admin/research/testing/files?path=${encodeURIComponent(data.file)}&branch=${encodeURIComponent(branch)}`)
              .then((res) => res.ok ? res.json() : null)
              .then((fileData) => {
                if (fileData?.type === 'file' && fileData.content) {
                  const ext = (data.file as string).split('.').pop() || '';
                  const lang = ['ts', 'tsx'].includes(ext) ? 'typescript' : 'javascript';
                  setCodeFiles((prev) => {
                    if (prev.find((f) => f.path === data.file)) return prev;
                    return [...prev, { path: data.file, content: fileData.content, language: lang, highlightedLines: data.line ? [data.line] : undefined }];
                  });
                }
              })
              .catch(() => { /* non-fatal */ });
          }
          // Update line state for the CodeViewer (green/red/yellow highlighting)
          if (data.file && typeof data.line === 'number' && data.data?._traceStatus) {
            const traceStatus = data.data._traceStatus as string;
            const lineState: LineState =
              traceStatus === 'failed' ? 'failed' :
              traceStatus === 'success' ? 'success' : 'executing';
            setCodeFiles((prev) => prev.map((f) => {
              if (f.path !== data.file) return f;
              const states = new Map(f.lineStates || []);
              states.set(data.line as number, lineState);
              return { ...f, lineStates: states };
            }));
          }

          if (data.line) setActiveLine(data.line);
          return; // Don't fall through to raw log handler
        }

        // Raw log entries — only process if timeline events aren't available
        // (fallback for workers without TimelineTracker instrumentation).
        if (data.type === 'log' && !hasTimelineEvents) {
          const parsed = parseRawLogEntry(data, module);
          if (parsed) {
            addLog(parsed.level, parsed.source, parsed.message, parsed.details);
            addEvent(parsed.evtType, parsed.evtLabel, parsed.evtDetail);
          } else {
            const level: LogEntry['level'] =
              data.status === 'fail' ? 'error' :
              data.status === 'warn' ? 'warn' :
              data.status === 'success' ? 'success' : 'info';
            addLog(level, data.source || module, data.details || data.method || 'log entry');
          }
        }
      } catch {
        // Ignore parse errors from heartbeat comments
      }
    };

    sse.onerror = () => {
      // EventSource auto-reconnects; no action needed
    };
  }, [module, addLog, addEvent, contextRecord.branch]);

  // ── Run test ───────────────────────────────────────────────────────────────

  const handleRun = async () => {
    // Reset state
    setStatus('running');
    setEvents([]);
    setLogs([]);
    setCodeFiles([]);
    setActiveFileIndex(0);
    setActiveLine(undefined);
    setResult(null);
    setError(undefined);
    setDuration(undefined);
    setScreenshots([]);
    setAsyncMessage(undefined);
    setIsPlaying(true);
    setCurrentTime(0);
    setTotalDuration(0);
    setIsExpanded(true);
    setShowDebugger(true);
    setLogFilter(''); // clear any filter from the previous run so new logs are visible
    startTimeRef.current = Date.now();

    // Start playback timer
    if (playbackRef.current) clearInterval(playbackRef.current);
    playbackRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setCurrentTime(elapsed);
      setTotalDuration(elapsed);
    }, 100);

    addEvent('phase-start', `Starting ${title}`, `Running module: ${module}`);
    addLog('info', module, `Starting ${title}...`);

    // Build inputs from property context
    const inputs: Record<string, unknown> = {};
    for (const key of [...requiredInputs, ...optionalInputs]) {
      const val = contextRecord[key];
      if (val && val.trim()) inputs[key] = val.trim();
    }

    addLog('info', module, `Inputs: ${JSON.stringify(inputs)}`);
    addEvent('api-call', 'API Request', `POST /api/admin/research/testing/run — module: ${module}`);

    // Connect SSE stream for real-time events (only if we have a projectId
    // — without one, the worker has no project to track)
    if (context.projectId) {
      connectSSE(context.projectId);
    }

    try {
      const res = await fetch('/api/admin/research/testing/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module,
          inputs,
          projectId: context.projectId || undefined,
          branch: contextRecord.branch || undefined,
          executionMode,
        }),
      });

      const data = await res.json() as {
        success: boolean;
        async?: boolean;
        duration: number;
        result: Record<string, unknown> | null;
        status?: number;
        error?: string;
        message?: string;
        pollUrl?: string;
      };
      const elapsed = Date.now() - startTimeRef.current;

      if (data.success) {
        if (data.async) {
          // 202 Accepted — job started in worker background
          const msg = data.message ?? 'Job accepted. Running in the background on the worker.';
          addEvent('checkpoint', `${title} accepted (async)`, msg);
          addLog('info', module, msg);
          if (data.pollUrl) addLog('info', module, `Poll: GET ${data.pollUrl}`);
          setAsyncMessage(msg + (data.pollUrl ? `\n\nPoll for results: GET ${data.pollUrl}` : ''));
          setResult(data.result);
          setDuration(data.duration);
          setStatus('success');
        } else {
          addEvent('phase-complete', `${title} completed`, `Duration: ${(data.duration / 1000).toFixed(2)}s`);
          addLog('success', module, `Completed in ${(data.duration / 1000).toFixed(2)}s`);
          setResult(data.result);
          setDuration(data.duration);
          setStatus('success');

          // Extract screenshots if present
          if (data.result?.screenshots && Array.isArray(data.result.screenshots)) {
            const ssArr = data.result.screenshots as string[];
            setScreenshots(ssArr);
            addEvent('screenshot', 'Screenshots captured', `${ssArr.length} screenshots`);
          }

          // Extract logs from result if present
          if (data.result?.log && Array.isArray(data.result.log)) {
            for (const rawEntry of data.result.log) {
              const parsed = parseRawLogEntry(rawEntry, module);
              if (!parsed) continue;
              addLog(parsed.level, parsed.source, parsed.message, parsed.details);
              addEvent(parsed.evtType, parsed.evtLabel, parsed.evtDetail);
            }
          }
        }
      } else {
        addEvent('phase-failed', `${title} failed`, data.error || 'Unknown error');
        addLog('error', module, data.error || 'Request failed');
        setError(data.error);
        setResult(data.result);
        setDuration(data.duration);
        setStatus('error');
      }

      setTotalDuration(elapsed);
      setCurrentTime(elapsed);
    } catch (err) {
      const elapsed = Date.now() - startTimeRef.current;
      const msg = err instanceof Error ? err.message : 'Network error';
      addEvent('error', 'Request failed', msg);
      addLog('error', module, msg);
      setError(msg);
      setStatus('error');
      setTotalDuration(elapsed);
      setCurrentTime(elapsed);
    }

    // Close SSE stream
    sseRef.current?.close();
    sseRef.current = null;

    // Publish all logs to the shared store so LogViewerTab can see them
    setLogs((currentLogs) => {
      const runId = `${module}-${startTimeRef.current}`;
      const shared: SharedLogEntry[] = currentLogs.map((l) => ({
        id: l.id,
        timestamp: new Date(startTimeRef.current + l.timestamp).toISOString(),
        relativeMs: l.timestamp,
        module,
        level: l.level,
        message: l.message,
        details: l.details,
        runId,
      }));
      publishLogs(shared);
      return currentLogs; // don't modify state
    });

    // Stop playback timer
    if (playbackRef.current) {
      clearInterval(playbackRef.current);
      playbackRef.current = null;
    }
    setIsPlaying(false);
  };

  // ── Clear ──────────────────────────────────────────────────────────────────

  const handleClear = () => {
    setStatus('idle');
    setEvents([]);
    setLogs([]);
    setCodeFiles([]);
    setResult(null);
    setError(undefined);
    setDuration(undefined);
    setScreenshots([]);
    setAsyncMessage(undefined);
    setCurrentTime(0);
    setTotalDuration(0);
    setIsPlaying(false);
    setShowDebugger(false);
    setLogFilter('');
    sseRef.current?.close();
    sseRef.current = null;
    if (playbackRef.current) {
      clearInterval(playbackRef.current);
      playbackRef.current = null;
    }
  };

  // ── Export Run ─────────────────────────────────────────────────────────────

  const handleExportRun = useCallback(() => {
    const exportData = {
      module,
      title,
      exportedAt: new Date().toISOString(),
      status,
      duration,
      totalDuration,
      events,
      logs,
      result,
      error,
      screenshots,
      inputs: {
        projectId: context.projectId,
        propertyId: context.propertyId,
        address: context.address,
        county: context.county,
      },
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-run-${module}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [module, title, status, duration, totalDuration, events, logs, result, error, screenshots, context]);

  // ── Timeline controls ─────────────────────────────────────────────────────

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    setIsPlaying(false);
  };

  const handleTogglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const findAdjacentEvent = (direction: 'next' | 'prev') => {
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    if (direction === 'next') {
      return sorted.find((e) => e.timestamp > currentTime);
    } else {
      return [...sorted].reverse().find((e) => e.timestamp < currentTime);
    }
  };

  const handleStepForward = () => {
    const next = findAdjacentEvent('next');
    if (next) setCurrentTime(next.timestamp);
  };

  const handleStepBack = () => {
    const prev = findAdjacentEvent('prev');
    if (prev) setCurrentTime(prev.timestamp);
  };

  const handleEventClick = (evt: TimelineEvent) => {
    setCurrentTime(evt.timestamp);
    if (evt.file) {
      const existingIdx = codeFiles.findIndex((f) => f.path === evt.file);
      if (existingIdx >= 0) {
        setActiveFileIndex(existingIdx);
      }
      if (evt.line) setActiveLine(evt.line);
    }
  };

  // ── GitHub file operations ─────────────────────────────────────────────────

  const handleOpenFile = useCallback(async (filePath: string) => {
    const branchName = contextRecord.branch || 'main';
    try {
      const res = await fetch(`/api/admin/research/testing/files?path=${encodeURIComponent(filePath)}&branch=${encodeURIComponent(branchName)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.type === 'file' && data.content) {
          const ext = filePath.split('.').pop() || '';
          const lang = ['ts', 'tsx'].includes(ext) ? 'typescript' : 'javascript';
          setCodeFiles((prev) => {
            const existing = prev.findIndex((f) => f.path === filePath);
            if (existing >= 0) {
              setActiveFileIndex(existing);
              return prev;
            }
            setActiveFileIndex(prev.length);
            return [...prev, { path: filePath, content: data.content, language: lang }];
          });
        }
      }
    } catch {
      // non-fatal
    }
  }, [contextRecord.branch]);

  const handleSaveFile = useCallback(async (file: CodeFile) => {
    const branchName = contextRecord.branch || 'main';
    try {
      const res = await fetch('/api/admin/research/testing/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch: branchName,
          path: file.path,
          content: file.content,
          message: `Edit ${file.path.split('/').pop()} from Testing Lab`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        addLog('success', module, `Saved ${file.path} to ${branchName} (commit: ${data.commit?.slice(0, 7)})`);
      } else {
        addLog('error', module, `Failed to save: ${data.error || 'unknown error'}`);
      }
    } catch (err) {
      addLog('error', module, `Save failed: ${err instanceof Error ? err.message : 'network error'}`);
    }
  }, [contextRecord.branch, module, addLog]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const statusClass = `test-card--${status}`;

  return (
    <div className={`test-card ${statusClass}`}>
      {/* Header */}
      <div className="test-card__header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="test-card__title-row">
          <h4 className="test-card__title">{title}</h4>
          <div className="test-card__badges">
            {requiresBrowser && <span className="test-card__badge test-card__badge--browser">Browser</span>}
            {requiresApiKey && <span className="test-card__badge test-card__badge--api">API Key</span>}
            <span className="test-card__badge test-card__badge--time">{estimatedRuntime}</span>
            <span className={`test-card__status-dot test-card__status-dot--${status}`} />
          </div>
        </div>
        <p className="test-card__description">{description}</p>
        <span className="test-card__expand-toggle">{isExpanded ? '▾' : '▸'}</span>
      </div>

      {isExpanded && (
        <div className="test-card__body">
          {/* Input check */}
          {missingInputs.length > 0 && (
            <div className="test-card__warning">
              Missing required inputs: {missingInputs.join(', ')}
            </div>
          )}

          {/* Branch mismatch warning */}
          {workerBranch && contextRecord.branch && workerBranch !== contextRecord.branch && (
            <div className="test-card__warning test-card__warning--branch">
              Worker is on <strong>{workerBranch}</strong> but Testing Lab is set to <strong>{contextRecord.branch}</strong>.
              Tests will run against the worker&apos;s code ({workerBranch}). Deploy your branch first from the status bar above.
            </div>
          )}

          {/* Execution mode selector */}
          <div className="test-card__mode-selector">
            <span className="test-card__mode-label">Mode:</span>
            {([
              { key: 'continuous' as const, label: 'Continuous', title: 'Run at selected speed, pause manually' },
              { key: 'until-fail' as const, label: 'Until Fail', title: 'Run until an error occurs, then auto-pause' },
              { key: 'step' as const, label: 'Step', title: 'Pause after each checkpoint — click Next to advance' },
            ]).map((m) => (
              <button
                key={m.key}
                className={`test-card__mode-btn ${executionMode === m.key ? 'test-card__mode-btn--active' : ''}`}
                onClick={() => setExecutionMode(m.key)}
                title={m.title}
                disabled={status === 'running'}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="test-card__actions">
            <button
              className="test-card__run-btn"
              onClick={handleRun}
              disabled={status === 'running' || missingInputs.length > 0}
            >
              {status === 'running'
                ? 'Running...'
                : executionMode === 'until-fail'
                  ? 'Run Until Fail'
                  : executionMode === 'step'
                    ? 'Step Through'
                    : 'Run'}
            </button>
            {/* Step controls — visible during run or replay */}
            {(status === 'running' || status === 'paused' || status === 'success' || status === 'error') && events.length > 0 && (
              <div className="test-card__step-controls">
                <button
                  className="test-card__step-btn"
                  onClick={handleStepBack}
                  title="Previous event"
                >
                  ◀ Prev
                </button>
                <button
                  className="test-card__step-btn test-card__step-btn--primary"
                  onClick={() => {
                    if (isPlaying) {
                      setIsPlaying(false);
                      if (status === 'running') setStatus('paused');
                    } else {
                      setIsPlaying(true);
                      if (status === 'paused') setStatus('running');
                    }
                  }}
                  title={isPlaying ? 'Pause' : 'Resume'}
                >
                  {isPlaying ? '▌▌ Pause' : '▶ Resume'}
                </button>
                <button
                  className="test-card__step-btn"
                  onClick={handleStepForward}
                  title="Next event"
                >
                  Next ▶
                </button>
              </div>
            )}
            <button className="test-card__clear-btn" onClick={handleClear}>
              Clear
            </button>
            {(status === 'success' || status === 'error') && (
              <>
                <button
                  className="test-card__debugger-btn"
                  onClick={() => setShowDebugger(!showDebugger)}
                >
                  {showDebugger ? 'Hide Debugger' : 'Show Debugger'}
                </button>
                <button
                  className="test-card__export-btn"
                  onClick={handleExportRun}
                  title="Export timeline + logs as JSON"
                >
                  Export Run
                </button>
              </>
            )}
          </div>

          {/* Debugger panel */}
          {showDebugger && events.length > 0 && (
            <div className="test-card__debugger">
              {/* Timeline */}
              <ExecutionTimeline
                events={events}
                currentTime={currentTime}
                totalDuration={totalDuration}
                isPlaying={isPlaying}
                speed={speed}
                onSeek={handleSeek}
                onTogglePlay={handleTogglePlay}
                onStepForward={handleStepForward}
                onStepBack={handleStepBack}
                onJumpForward={handleStepForward}
                onJumpBack={handleStepBack}
                onSpeedChange={setSpeed}
                onEventClick={handleEventClick}
              />

                  {/* Log filter + stream — full width when no code trace, split when code is available */}
              {codeFiles.length > 0 ? (
                <div className="test-card__split">
                  <div className="test-card__split-left">
                    <CodeViewer
                      files={codeFiles}
                      activeFileIndex={activeFileIndex}
                      activeLine={activeLine}
                      readOnly={status === 'running'}
                      branch={contextRecord.branch || 'main'}
                      onFileSelect={setActiveFileIndex}
                      onSave={handleSaveFile}
                      onOpenFile={handleOpenFile}
                    />
                  </div>
                  <div className="test-card__split-right">
                    <div className="test-card__log-controls">
                      <div className="test-card__log-filter">
                        <input
                          type="text"
                          placeholder="Filter logs..."
                          value={logFilter}
                          onChange={(e) => setLogFilter(e.target.value)}
                        />
                      </div>
                      <div className="test-card__log-levels">
                        {(['info', 'warn', 'error', 'success', 'debug'] as const).map((level) => (
                          <button
                            key={level}
                            className={`test-card__log-level-btn test-card__log-level-btn--${level} ${logLevelFilter.has(level) ? 'test-card__log-level-btn--active' : ''}`}
                            onClick={() => toggleLogLevel(level)}
                            title={`Toggle ${level} logs`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                    <LogStream
                      logs={logs}
                      currentTime={currentTime}
                      isLive={isPlaying && currentTime >= totalDuration - 500}
                      maxHeight="300px"
                      filter={logFilter}
                      levelFilter={logLevelFilter}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <div className="test-card__log-controls">
                    <div className="test-card__log-filter">
                      <input
                        type="text"
                        placeholder="Filter logs..."
                        value={logFilter}
                        onChange={(e) => setLogFilter(e.target.value)}
                      />
                    </div>
                    <div className="test-card__log-levels">
                      {(['info', 'warn', 'error', 'success', 'debug'] as const).map((level) => (
                        <button
                          key={level}
                          className={`test-card__log-level-btn test-card__log-level-btn--${level} ${logLevelFilter.has(level) ? 'test-card__log-level-btn--active' : ''}`}
                          onClick={() => toggleLogLevel(level)}
                          title={`Toggle ${level} logs`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>
                  <LogStream
                    logs={logs}
                    currentTime={currentTime}
                    isLive={isPlaying && currentTime >= totalDuration - 500}
                    maxHeight="400px"
                    filter={logFilter}
                    levelFilter={logLevelFilter}
                  />
                </div>
              )}
            </div>
          )}

          {/* Async job notice */}
          {asyncMessage && (
            <div className="test-card__async-notice">
              <span style={{ marginRight: '0.4rem' }}>⏳</span>
              {asyncMessage.split('\n\n').map((line, i) => (
                <span
                  key={`async-line-${i}`}
                  style={i > 0 ? { display: 'block', marginTop: '0.3rem', fontFamily: 'monospace', fontSize: '0.78rem' } : undefined}
                >{line}</span>
              ))}
            </div>
          )}

          {/* Output */}
          {(result || error) && (
            <OutputViewer
              result={result}
              screenshots={screenshots}
              error={error}
              duration={duration}
            />
          )}
        </div>
      )}
    </div>
  );
}
