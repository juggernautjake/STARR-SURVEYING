// TestCard.tsx — Reusable module card with full debugger (timeline, code, logs)
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ExecutionTimeline, { type TimelineEvent, type EventType } from './ExecutionTimeline';
import CodeViewer, { type CodeFile } from './CodeViewer';
import LogStream, { type LogEntry } from './LogStream';
import OutputViewer from './OutputViewer';
import { usePropertyContext } from './PropertyContextBar';

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

// ── Helpers ──────────────────────────────────────────────────────────────────

let eventIdCounter = 0;
function nextEventId(): string {
  return `evt-${++eventIdCounter}-${Date.now()}`;
}

function nextLogId(): string {
  return `log-${++eventIdCounter}-${Date.now()}`;
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
  const [logFilter, setLogFilter] = useState('');

  const startTimeRef = useRef<number>(0);
  const playbackRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up interval on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (playbackRef.current) {
        clearInterval(playbackRef.current);
        playbackRef.current = null;
      }
    };
  }, []);

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

  // ── Run test ───────────────────────────────────────────────────────────────

  const handleRun = async () => {
    // Reset state
    setStatus('running');
    setEvents([]);
    setLogs([]);
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

    try {
      const res = await fetch('/api/admin/research/testing/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module,
          inputs,
          projectId: context.projectId || undefined,
          branch: contextRecord.branch || undefined,
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
            setScreenshots(data.result.screenshots as string[]);
            addEvent('screenshot', 'Screenshots captured', `${(data.result.screenshots as unknown[]).length} screenshots`);
          }

          // Extract logs from result if present
          if (data.result?.log && Array.isArray(data.result.log)) {
            for (const rawEntry of data.result.log) {
              // Validate entry is a non-null object before accessing properties
              if (typeof rawEntry !== 'object' || rawEntry === null) continue;
              const entry = rawEntry as Record<string, unknown>;
              const entryStatus = typeof entry.status === 'string' ? entry.status : '';
              const entrySource = typeof entry.source === 'string' ? entry.source : module;
              const entryLayer  = typeof entry.layer  === 'string' ? entry.layer  : '';
              const entryMethod = typeof entry.method === 'string' ? entry.method : '';
              const entryDetail = typeof entry.details === 'string' ? entry.details
                : entryStatus;
              const entryError  = typeof entry.error  === 'string' ? entry.error  : undefined;

              // Build human-readable message — skip empty parts to avoid "[] : " artifacts
              const msgParts: string[] = [];
              if (entryLayer)  msgParts.push(`[${entryLayer}]`);
              if (entryMethod) msgParts.push(entryMethod);
              if (entryDetail) msgParts.push(entryDetail);
              else if (!entryLayer && !entryMethod) msgParts.push(`log from ${entrySource}`);
              const logMessage = msgParts.join(' ');

              // Build event label (layer: method, or whichever is present)
              const evtLabel = [entryLayer, entryMethod].filter(Boolean).join(': ')
                || `log from ${entrySource}`;

              addLog(
                entryStatus === 'fail' ? 'error' : entryStatus === 'warn' ? 'warn' : 'info',
                entrySource,
                logMessage,
                entryError,
              );
              const evtType: EventType = entryStatus === 'fail' ? 'error' :
                entryStatus === 'warn' ? 'warning' : 'data-found';
              addEvent(evtType, evtLabel, entryDetail);
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
    if (playbackRef.current) {
      clearInterval(playbackRef.current);
      playbackRef.current = null;
    }
  };

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

          {/* Action buttons */}
          <div className="test-card__actions">
            <button
              className="test-card__run-btn"
              onClick={handleRun}
              disabled={status === 'running' || missingInputs.length > 0}
            >
              {status === 'running' ? 'Running...' : 'Run'}
            </button>
            <button className="test-card__clear-btn" onClick={handleClear}>
              Clear
            </button>
            {(status === 'success' || status === 'error') && (
              <button
                className="test-card__debugger-btn"
                onClick={() => setShowDebugger(!showDebugger)}
              >
                {showDebugger ? 'Hide Debugger' : 'Show Debugger'}
              </button>
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
                      onFileSelect={setActiveFileIndex}
                    />
                  </div>
                  <div className="test-card__split-right">
                    <div className="test-card__log-filter">
                      <input
                        type="text"
                        placeholder="Filter logs..."
                        value={logFilter}
                        onChange={(e) => setLogFilter(e.target.value)}
                      />
                    </div>
                    <LogStream
                      logs={logs}
                      currentTime={currentTime}
                      isLive={isPlaying && currentTime >= totalDuration - 500}
                      maxHeight="300px"
                      filter={logFilter}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <div className="test-card__log-filter">
                    <input
                      type="text"
                      placeholder="Filter logs..."
                      value={logFilter}
                      onChange={(e) => setLogFilter(e.target.value)}
                    />
                  </div>
                  <LogStream
                    logs={logs}
                    currentTime={currentTime}
                    isLive={isPlaying && currentTime >= totalDuration - 500}
                    maxHeight="300px"
                    filter={logFilter}
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
