// TestCard.tsx — Reusable module card with full debugger (timeline, code, logs, SSE stream)
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
  const sseRef = useRef<EventSource | null>(null);
  const codeFileCacheRef = useRef<Map<string, CodeFile>>(new Map());

  // Clean up SSE on unmount
  useEffect(() => {
    return () => {
      sseRef.current?.close();
      if (playbackRef.current) clearInterval(playbackRef.current);
    };
  }, []);

  // ── Check inputs ───────────────────────────────────────────────────────────

  const missingInputs = requiredInputs.filter((key) => {
    const val = (context as unknown as Record<string, string>)[key];
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

  // ── SSE stream connection ─────────────────────────────────────────────────

  const connectSSE = useCallback((projectId: string) => {
    // Close any existing connection
    sseRef.current?.close();

    const url = `/api/admin/research/testing/stream?projectId=${encodeURIComponent(projectId)}`;
    const sse = new EventSource(url);
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'connected') {
          addLog('debug', module, 'SSE stream connected');
          return;
        }

        if (data.type === 'complete') {
          addLog('info', module, `Stream complete: ${data.status}`);
          sse.close();
          sseRef.current = null;
          return;
        }

        // Convert worker log events to timeline events + log entries
        if (data.type === 'log') {
          const level: LogEntry['level'] =
            data.status === 'fail' ? 'error' :
            data.status === 'warn' ? 'warn' :
            data.status === 'ok' ? 'success' : 'info';

          addLog(
            level,
            data.source || data.layer || module,
            `[${data.layer || ''}] ${data.method || ''}: ${data.details || data.status || ''}`,
            data.error,
          );

          // Map to timeline event types
          const evtType: EventType =
            data.status === 'fail' ? 'error' :
            data.status === 'warn' ? 'warning' :
            data.type === 'browser-action' ? 'browser-action' :
            data.type === 'ai-call' ? 'ai-call' :
            data.type === 'api-call' ? 'api-call' :
            data.type === 'screenshot' ? 'screenshot' :
            'data-found';

          addEvent(evtType, `${data.layer || module}: ${data.method || ''}`, data.details || data.status || '', {
            file: data.file,
            function: data.function,
            line: data.line,
          });

          // If the event has file/line info, load the code file
          if (data.file) {
            loadCodeFile(data.file, data.line);
          }
        }
      } catch {
        // Ignore parse errors (e.g., heartbeat comments)
      }
    };

    sse.onerror = () => {
      // SSE will auto-reconnect; we don't need to log every reconnect
    };
  }, [module, addEvent, addLog]);

  // ── Code file loading ─────────────────────────────────────────────────────

  const loadCodeFile = useCallback(async (filePath: string, line?: number) => {
    // Check cache first
    if (codeFileCacheRef.current.has(filePath)) {
      const cached = codeFileCacheRef.current.get(filePath)!;
      setCodeFiles((prev) => {
        const idx = prev.findIndex((f) => f.path === filePath);
        if (idx >= 0) {
          // Update highlighted line
          const updated = [...prev];
          updated[idx] = { ...cached, highlightedLines: line ? [line] : undefined };
          return updated;
        }
        return [...prev, { ...cached, highlightedLines: line ? [line] : undefined }];
      });
      // Switch to this file tab
      setCodeFiles((prev) => {
        const idx = prev.findIndex((f) => f.path === filePath);
        if (idx >= 0) setActiveFileIndex(idx);
        return prev;
      });
      if (line) setActiveLine(line);
      return;
    }

    // Fetch from GitHub API (current branch)
    try {
      const res = await fetch(`/api/admin/research/testing/files?path=${encodeURIComponent(filePath)}&branch=main`);
      if (res.ok) {
        const data = await res.json();
        if (data.type === 'file' && data.content) {
          const ext = filePath.split('.').pop() || '';
          const language = ['ts', 'tsx'].includes(ext) ? 'typescript' : 'javascript';
          const codeFile: CodeFile = {
            path: filePath,
            content: data.content,
            language,
            highlightedLines: line ? [line] : undefined,
          };
          codeFileCacheRef.current.set(filePath, codeFile);
          setCodeFiles((prev) => {
            if (prev.find((f) => f.path === filePath)) return prev;
            return [...prev, codeFile];
          });
          const newIdx = codeFiles.length; // will be at the end
          setActiveFileIndex(newIdx);
          if (line) setActiveLine(line);
        }
      }
    } catch {
      // Silently fail — code viewer just won't show this file
    }
  }, [codeFiles.length]);

  // ── Run test ───────────────────────────────────────────────────────────────

  const handleRun = async () => {
    // Reset state
    setStatus('running');
    setEvents([]);
    setLogs([]);
    setCodeFiles([]);
    codeFileCacheRef.current.clear();
    setResult(null);
    setError(undefined);
    setDuration(undefined);
    setScreenshots([]);
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
      const val = (context as unknown as Record<string, string>)[key];
      if (val && val.trim()) inputs[key] = val.trim();
    }

    addLog('info', module, `Inputs: ${JSON.stringify(inputs)}`);
    addEvent('api-call', 'API Request', `POST /api/admin/research/testing/run — module: ${module}`);

    // Connect SSE if we have a projectId (for real-time worker events)
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
        }),
      });

      const data = await res.json();
      const elapsed = Date.now() - startTimeRef.current;

      if (data.success) {
        addEvent('phase-complete', `${title} completed`, `Duration: ${(data.duration / 1000).toFixed(2)}s`);
        addLog('success', module, `Completed in ${(data.duration / 1000).toFixed(2)}s`);
        setResult(data.result);
        setDuration(data.duration);
        setStatus('success');

        // Extract screenshots if present
        if (data.result?.screenshots) {
          setScreenshots(data.result.screenshots);
          addEvent('screenshot', 'Screenshots captured', `${data.result.screenshots.length} screenshots`);
        }

        // Extract logs from result if present (for non-SSE mode)
        if (data.result?.log && Array.isArray(data.result.log)) {
          for (const entry of data.result.log) {
            addLog(
              entry.status === 'fail' ? 'error' : entry.status === 'warn' ? 'warn' : 'info',
              entry.source || module,
              `[${entry.layer}] ${entry.method}: ${entry.details || entry.status}`,
              entry.error,
            );
            const evtType: EventType = entry.status === 'fail' ? 'error' :
              entry.status === 'warn' ? 'warning' : 'data-found';
            addEvent(evtType, `${entry.layer}: ${entry.method}`, entry.details || entry.status, {
              file: entry.file,
              function: entry.function,
              line: entry.line,
            });

            // Load code files referenced in the log entries
            if (entry.file) {
              loadCodeFile(entry.file, entry.line);
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
    codeFileCacheRef.current.clear();
    setResult(null);
    setError(undefined);
    setDuration(undefined);
    setScreenshots([]);
    setCurrentTime(0);
    setTotalDuration(0);
    setIsPlaying(false);
    setShowDebugger(false);
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
      } else {
        // Attempt to load the file on click
        loadCodeFile(evt.file, evt.line);
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

              {/* Code + Logs split view */}
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
