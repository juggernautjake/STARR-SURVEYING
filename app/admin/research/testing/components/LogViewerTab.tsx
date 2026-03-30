// LogViewerTab.tsx — Aggregated log viewer across all test runs
'use client';

import { useRef, useState } from 'react';

interface AggregatedLog {
  id: string;
  timestamp: string;
  module: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  message: string;
  details?: string;
}

export default function LogViewerTab() {
  const [logs, setLogs] = useState<AggregatedLog[]>([]);
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set(['info', 'warn', 'error', 'success', 'debug']));
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState('');
  const loadCountRef = useRef(0);

  const toggleLevel = (level: string) => {
    setLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const loadProjectLogs = async () => {
    if (!projectId) return;
    setLoading(true);
    const batchId = ++loadCountRef.current;
    try {
      const res = await fetch(`/api/admin/research/${projectId}/logs`);
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        const rawLogs = (data.logs ?? data.log ?? []) as Record<string, unknown>[];
        const entries: AggregatedLog[] = rawLogs.map((l, i) => ({
          id: `alog-${batchId}-${i}`,
          timestamp: String(l.timestamp ?? new Date().toISOString()),
          module: String(l.source ?? l.layer ?? 'unknown'),
          level: l.status === 'fail' ? 'error'
            : l.status === 'warn' ? 'warn'
            : l.status === 'success' ? 'success'
            : (l.level ?? 'info') as AggregatedLog['level'],
          message: `[${l.layer ?? ''}] ${l.method ?? ''}: ${l.details ?? l.status ?? ''}`,
          details: l.error as string | undefined,
        }));
        setLogs(entries);
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  };

  const filtered = logs.filter((log) => {
    if (!levelFilter.has(log.level)) return false;
    if (filter && !log.message.toLowerCase().includes(filter.toLowerCase()) &&
        !log.module.toLowerCase().includes(filter.toLowerCase())) {
      return false;
    }
    return true;
  });

  const LEVELS = ['info', 'warn', 'error', 'success', 'debug'];
  const LEVEL_COLORS: Record<string, string> = {
    info: '#3B82F6', warn: '#D97706', error: '#DC2626', success: '#059669', debug: '#9CA3AF',
  };

  return (
    <div className="log-viewer-tab">
      {/* Controls */}
      <div className="log-viewer-tab__controls">
        <div className="log-viewer-tab__project-input">
          <input
            type="text"
            placeholder="Project ID to load logs..."
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          />
          <button
            className="test-card__run-btn"
            onClick={loadProjectLogs}
            disabled={!projectId || loading}
          >
            {loading ? 'Loading...' : 'Load Logs'}
          </button>
        </div>
        <input
          type="text"
          className="log-viewer-tab__filter"
          placeholder="Filter logs..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="log-viewer-tab__levels">
          {LEVELS.map((level) => (
            <button
              key={level}
              className={`log-viewer-tab__level-btn ${levelFilter.has(level) ? 'log-viewer-tab__level-btn--active' : ''}`}
              style={{ borderColor: LEVEL_COLORS[level], color: levelFilter.has(level) ? '#fff' : LEVEL_COLORS[level], background: levelFilter.has(level) ? LEVEL_COLORS[level] : 'transparent' }}
              onClick={() => toggleLevel(level)}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Log entries */}
      <div className="log-viewer-tab__entries">
        {filtered.length === 0 && (
          <div className="log-viewer-tab__empty">
            {logs.length === 0
              ? 'No logs loaded. Enter a project ID and click Load Logs, or run a test.'
              : 'No logs match the current filters.'}
          </div>
        )}
        {filtered.map((log) => (
          <div key={log.id} className={`log-viewer-tab__entry log-viewer-tab__entry--${log.level}`}>
            <span className="log-viewer-tab__timestamp">{log.timestamp}</span>
            <span className="log-viewer-tab__level" style={{ color: LEVEL_COLORS[log.level] }}>
              {log.level.toUpperCase()}
            </span>
            <span className="log-viewer-tab__module">[{log.module}]</span>
            <span className="log-viewer-tab__message">{log.message}</span>
            {log.details && <div className="log-viewer-tab__details">{log.details}</div>}
          </div>
        ))}
      </div>

      {/* Stats */}
      {logs.length > 0 && (
        <div className="log-viewer-tab__stats">
          Showing {filtered.length} of {logs.length} entries
        </div>
      )}
    </div>
  );
}
