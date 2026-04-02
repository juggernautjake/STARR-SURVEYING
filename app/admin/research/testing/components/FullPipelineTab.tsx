// FullPipelineTab.tsx — Run the full pipeline with phase skip/resume controls
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePropertyContext } from './PropertyContextBar';
import ExecutionTimeline, { type TimelineEvent } from './ExecutionTimeline';
import LogStream, { type LogEntry } from './LogStream';
import OutputViewer from './OutputViewer';
import { publishLogs, type SharedLogEntry } from './useTestingLogStore';

const PIPELINE_PHASES = [
  { key: 'discover', label: 'Phase 1: Discovery', critical: true },
  { key: 'harvest', label: 'Phase 2: Harvesting', critical: true },
  { key: 'analyze', label: 'Phase 3: AI Extraction', critical: true },
  { key: 'subdivision', label: 'Phase 4: Subdivision', critical: false },
  { key: 'adjacent', label: 'Phase 5: Adjacent', critical: false },
  { key: 'row', label: 'Phase 6: TxDOT ROW', critical: false },
  { key: 'reconcile', label: 'Phase 7: Reconciliation', critical: true },
  { key: 'confidence', label: 'Phase 8: Confidence', critical: true },
  { key: 'purchase', label: 'Phase 9: Purchase', critical: false },
];

export default function FullPipelineTab() {
  const { context } = usePropertyContext();

  const [enabledPhases, setEnabledPhases] = useState<Set<string>>(
    new Set(PIPELINE_PHASES.map((p) => p.key))
  );
  const [resumeFrom, setResumeFrom] = useState('');
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | undefined>();
  const [duration, setDuration] = useState<number | undefined>();
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
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

  const startTimeRef = useRef(0);
  const logCounterRef = useRef(0);
  const evtCounterRef = useRef(0);
  // Ticker that advances currentTime/totalDuration every 100ms while running,
  // mirroring what TestCard does. Without this the timeline stays frozen at t=0
  // until the entire multi-minute fetch resolves.
  const playbackRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (playbackRef.current) {
        clearInterval(playbackRef.current);
        playbackRef.current = null;
      }
    };
  }, []);

  const togglePhase = (key: string) => {
    setEnabledPhases((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addLog = (level: LogEntry['level'], message: string) => {
    const ts = Date.now() - startTimeRef.current;
    setLogs((prev) => [...prev, {
      id: `plog-${++logCounterRef.current}-${Date.now()}`,
      timestamp: ts,
      level,
      source: 'pipeline',
      message,
    }]);
    setCurrentTime(ts);
    setTotalDuration(ts);
    // Update currentPhase from log messages that mention a phase name.
    // Build pattern dynamically from PIPELINE_PHASES so it stays in sync.
    // Store p.key so it can be matched against p.key in the progress display.
    const lc = message.toLowerCase();
    const matchedKey = PIPELINE_PHASES.find((p) =>
      lc.includes(p.key) || lc.includes(p.label.toLowerCase())
    )?.key ?? null;
    if (matchedKey) setCurrentPhase(matchedKey);
  };

  const addEvent = (type: TimelineEvent['type'], label: string, desc: string) => {
    const ts = Date.now() - startTimeRef.current;
    setEvents((prev) => [...prev, {
      id: `pevt-${++evtCounterRef.current}-${Date.now()}`,
      timestamp: ts,
      type,
      label,
      description: desc,
    }]);
    setCurrentTime(ts);
    setTotalDuration(ts);
  };

  const findAdjacentEvent = (direction: 'next' | 'prev') => {
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    if (direction === 'next') return sorted.find((e) => e.timestamp > currentTime);
    return [...sorted].reverse().find((e) => e.timestamp < currentTime);
  };

  const handleStepForward = () => {
    const next = findAdjacentEvent('next');
    if (next) setCurrentTime(next.timestamp);
  };

  const handleStepBack = () => {
    const prev = findAdjacentEvent('prev');
    if (prev) setCurrentTime(prev.timestamp);
  };

  const handleRun = async () => {
    setStatus('running');
    setEvents([]);
    setLogs([]);
    setResult(null);
    setError(undefined);
    setDuration(undefined);
    setIsPlaying(true);
    setCurrentTime(0);
    setTotalDuration(0);
    setCurrentPhase(null);
    setLogFilter('');
    logCounterRef.current = 0;
    evtCounterRef.current = 0;
    startTimeRef.current = Date.now();

    // Start live ticker — advances the timeline every 100ms so the scrubber
    // moves while we wait for the (potentially 5-minute) pipeline response.
    if (playbackRef.current) clearInterval(playbackRef.current);
    playbackRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setCurrentTime(elapsed);
      setTotalDuration(elapsed);
    }, 100);

    addEvent('phase-start', 'Pipeline started', 'Full pipeline execution');
    addLog('info', 'Starting full pipeline...');

    const inputs: Record<string, unknown> = {
      propertyId: context.propertyId,
      address: context.address,
      county: context.county,
      state: context.state,
      ownerName: context.ownerName,
      skipPhases: PIPELINE_PHASES.filter((p) => !enabledPhases.has(p.key)).map((p) => p.key),
      resumeFrom: resumeFrom || undefined,
    };
    if (context.lat) inputs.lat = parseFloat(context.lat);
    if (context.lon) inputs.lon = parseFloat(context.lon);

    try {
      const res = await fetch('/api/admin/research/testing/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'full-pipeline',
          inputs,
          projectId: context.projectId || undefined,
          branch: context.branch || undefined,
        }),
      });

      const data = await res.json() as {
        success: boolean;
        async?: boolean;
        duration: number;
        result: unknown;
        error?: string;
        message?: string;
        pollUrl?: string;
      };
      const elapsed = Date.now() - startTimeRef.current;

      if (data.success) {
        setCurrentPhase(null);
        if (data.async) {
          // 202 Accepted — pipeline started in background
          const msg = data.message ?? 'Pipeline accepted. Running in the background.';
          addEvent('checkpoint', 'Pipeline accepted (async)', msg);
          addLog('info', msg);
          if (data.pollUrl) addLog('info', `Poll: GET ${data.pollUrl}`);
        } else {
          addEvent('phase-complete', 'Pipeline completed', `Duration: ${(data.duration / 1000).toFixed(1)}s`);
          addLog('success', `Pipeline completed in ${(data.duration / 1000).toFixed(1)}s`);
        }
        setResult(data.result);
        setDuration(data.duration);
        setStatus('success');
      } else {
        setCurrentPhase(null);
        addEvent('phase-failed', 'Pipeline failed', data.error || 'Unknown error');
        addLog('error', data.error || 'Pipeline failed');
        setError(data.error);
        setResult((data as Record<string, unknown>).result ?? null);
        setDuration(data.duration);
        setStatus('error');
      }

      setTotalDuration(elapsed);
      setCurrentTime(elapsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      const elapsed = Date.now() - startTimeRef.current;
      setCurrentPhase(null);
      addEvent('error', 'Request failed', msg);
      addLog('error', msg);
      setError(msg);
      setDuration(elapsed);
      setTotalDuration(elapsed);
      setCurrentTime(elapsed);
      setStatus('error');
    }

    // Publish logs to the shared store for LogViewerTab
    setLogs((currentLogs) => {
      const runId = `full-pipeline-${startTimeRef.current}`;
      const shared: SharedLogEntry[] = currentLogs.map((l) => ({
        id: l.id,
        timestamp: new Date(startTimeRef.current + l.timestamp).toISOString(),
        relativeMs: l.timestamp,
        module: 'full-pipeline',
        level: l.level,
        message: l.message,
        details: undefined,
        runId,
      }));
      publishLogs(shared);
      return currentLogs;
    });

    // Stop the live ticker
    if (playbackRef.current) {
      clearInterval(playbackRef.current);
      playbackRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleClear = () => {
    setStatus('idle');
    setEvents([]);
    setLogs([]);
    setResult(null);
    setError(undefined);
    setDuration(undefined);
    setCurrentTime(0);
    setTotalDuration(0);
    setIsPlaying(false);
    setCurrentPhase(null);
    if (playbackRef.current) {
      clearInterval(playbackRef.current);
      playbackRef.current = null;
    }
  };

  const handleExportRun = useCallback(() => {
    const exportData = {
      module: 'full-pipeline',
      title: 'Full Pipeline',
      exportedAt: new Date().toISOString(),
      status,
      duration,
      totalDuration,
      events,
      logs,
      result,
      error,
      enabledPhases: Array.from(enabledPhases),
      resumeFrom: resumeFrom || undefined,
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
    a.download = `full-pipeline-run-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [status, duration, totalDuration, events, logs, result, error, enabledPhases, resumeFrom, context]);

  // Require at least an address or a property ID to run the pipeline.
  // Phase 1 discovery uses address; resuming from later phases needs propertyId.
  const missingInputs = !context.address && !context.propertyId;

  return (
    <div className="full-pipeline-tab">
      {/* Phase selection */}
      <div className="full-pipeline-tab__phases">
        <h4>Pipeline Phases</h4>
        <div className="full-pipeline-tab__phase-grid">
          {PIPELINE_PHASES.map((p) => (
            <label key={p.key} className="full-pipeline-tab__phase-toggle">
              <input
                type="checkbox"
                checked={enabledPhases.has(p.key)}
                onChange={() => togglePhase(p.key)}
              />
              <span className={p.critical ? 'full-pipeline-tab__phase--critical' : ''}>
                {p.label}
                {p.critical && ' *'}
              </span>
            </label>
          ))}
        </div>
        <div className="full-pipeline-tab__resume">
          <label>Resume from phase:</label>
          <select value={resumeFrom} onChange={(e) => setResumeFrom(e.target.value)}>
            <option value="">Start from beginning</option>
            {PIPELINE_PHASES.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Run button */}
      <div className="full-pipeline-tab__actions">
        <button
          className="test-card__run-btn"
          onClick={handleRun}
          disabled={status === 'running' || missingInputs}
        >
          {status === 'running'
            ? `Running...${currentPhase
                ? ` (${PIPELINE_PHASES.find((p) => p.key === currentPhase)?.label ?? currentPhase})`
                : ''}`
            : 'Run Full Pipeline'}
        </button>
        {(status === 'success' || status === 'error') && (
          <>
            <button className="test-card__clear-btn" onClick={handleClear}>
              Clear
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
        {missingInputs && (
          <span className="test-card__warning" style={{ display: 'inline' }}>
            Address or Property ID is required
          </span>
        )}
      </div>

      {/* Phase progress */}
      {status !== 'idle' && (
        <div className="full-pipeline-tab__progress">
          {PIPELINE_PHASES.filter((p) => enabledPhases.has(p.key)).map((p) => (
            <div
              key={p.key}
              className={`full-pipeline-tab__phase-step ${
                currentPhase === p.key ? 'full-pipeline-tab__phase-step--active' : ''
              }`}
            >
              <span className="full-pipeline-tab__phase-dot" />
              {p.label}
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      {events.length > 0 && (
        <ExecutionTimeline
          events={events}
          currentTime={currentTime}
          totalDuration={totalDuration}
          isPlaying={isPlaying}
          speed={speed}
          onSeek={(t) => { setCurrentTime(t); setIsPlaying(false); }}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onStepForward={handleStepForward}
          onStepBack={handleStepBack}
          onJumpForward={handleStepForward}
          onJumpBack={handleStepBack}
          onSpeedChange={setSpeed}
        />
      )}

      {/* Logs */}
      {logs.length > 0 && (
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
            isLive={isPlaying}
            maxHeight="300px"
            filter={logFilter}
            levelFilter={logLevelFilter}
          />
        </div>
      )}

      {/* Output */}
      {(result || error) && (
        <OutputViewer result={result} error={error} duration={duration} />
      )}
    </div>
  );
}
