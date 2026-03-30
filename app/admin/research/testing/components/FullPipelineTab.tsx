// FullPipelineTab.tsx — Run the full pipeline with phase skip/resume controls
'use client';

import { useRef, useState } from 'react';
import { usePropertyContext } from './PropertyContextBar';
import ExecutionTimeline, { type TimelineEvent } from './ExecutionTimeline';
import LogStream, { type LogEntry } from './LogStream';
import OutputViewer from './OutputViewer';

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

  const startTimeRef = useRef(0);
  const logCounterRef = useRef(0);
  const evtCounterRef = useRef(0);

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
    startTimeRef.current = Date.now();

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
        }),
      });

      const data = await res.json();
      const elapsed = Date.now() - startTimeRef.current;

      if (data.success) {
        addEvent('phase-complete', 'Pipeline completed', `Duration: ${(data.duration / 1000).toFixed(1)}s`);
        addLog('success', `Pipeline completed in ${(data.duration / 1000).toFixed(1)}s`);
        setResult(data.result);
        setDuration(data.duration);
        setStatus('success');
      } else {
        addEvent('phase-failed', 'Pipeline failed', data.error || 'Unknown error');
        addLog('error', data.error || 'Pipeline failed');
        setError(data.error);
        setResult(data.result);
        setDuration(data.duration);
        setStatus('error');
      }

      setTotalDuration(elapsed);
      setCurrentTime(elapsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      addEvent('error', 'Request failed', msg);
      addLog('error', msg);
      setError(msg);
      setStatus('error');
    }

    setIsPlaying(false);
  };

  const missingInputs = !context.propertyId;

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
          {status === 'running' ? `Running...${currentPhase ? ` (${currentPhase})` : ''}` : 'Run Full Pipeline'}
        </button>
        {missingInputs && (
          <span className="test-card__warning" style={{ display: 'inline' }}>
            Property ID is required
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
          onSeek={setCurrentTime}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onStepForward={() => {}}
          onStepBack={() => {}}
          onJumpForward={() => {}}
          onJumpBack={() => {}}
          onSpeedChange={setSpeed}
        />
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <LogStream
          logs={logs}
          currentTime={currentTime}
          isLive={isPlaying}
          maxHeight="300px"
        />
      )}

      {/* Output */}
      {(result || error) && (
        <OutputViewer result={result} error={error} duration={duration} />
      )}
    </div>
  );
}
