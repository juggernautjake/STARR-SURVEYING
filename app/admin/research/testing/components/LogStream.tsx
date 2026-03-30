// LogStream.tsx — Real-time log viewer synced to the execution timeline
'use client';

import { useEffect, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LogEntry {
  id: string;
  timestamp: number;        // ms since run start
  level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  source: string;           // e.g. "cad-scraper", "phase-3"
  message: string;
  details?: string;
  data?: unknown;
}

interface LogStreamProps {
  logs: LogEntry[];
  currentTime: number;      // ms — from timeline scrubber
  isLive: boolean;          // true = auto-scroll, false = rewinding
  maxHeight?: string;
  filter?: string;          // text filter
  levelFilter?: Set<string>;
}

// ── Level colors ─────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  info:    '#3B82F6',
  warn:    '#D97706',
  error:   '#DC2626',
  debug:   '#9CA3AF',
  success: '#059669',
};

const LEVEL_ICONS: Record<string, string> = {
  info:    'ℹ',
  warn:    '⚠',
  error:   '✕',
  debug:   '⋯',
  success: '✓',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function LogStream({
  logs,
  currentTime,
  isLive,
  maxHeight = '400px',
  filter,
  levelFilter,
}: LogStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Filter logs
  const filtered = logs.filter((log) => {
    if (filter && !log.message.toLowerCase().includes(filter.toLowerCase()) &&
        !log.source.toLowerCase().includes(filter.toLowerCase())) {
      return false;
    }
    if (levelFilter && !levelFilter.has(log.level)) return false;
    return true;
  });

  // Find the most recent log at or before currentTime
  let activeLogIndex = -1;
  for (let i = filtered.length - 1; i >= 0; i--) {
    if (filtered[i].timestamp <= currentTime) {
      activeLogIndex = i;
      break;
    }
  }

  // Auto-scroll
  useEffect(() => {
    if (isLive && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    } else if (!isLive && activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [logs.length, currentTime, isLive]);

  function formatTimestamp(ms: number): string {
    const s = Math.floor(ms / 1000);
    const frac = Math.floor((ms % 1000) / 10);
    return `${s}.${frac.toString().padStart(2, '0')}s`;
  }

  return (
    <div className="log-stream" ref={containerRef} style={{ maxHeight }}>
      {filtered.length === 0 && (
        <div className="log-stream__empty">No log entries yet.</div>
      )}
      {filtered.map((log, i) => {
        const isFuture = log.timestamp > currentTime;
        const isActive = i === activeLogIndex;
        return (
          <div
            key={log.id}
            ref={isActive ? activeRef : undefined}
            className={[
              'log-stream__entry',
              `log-stream__entry--${log.level}`,
              isFuture ? 'log-stream__entry--future' : '',
              isActive ? 'log-stream__entry--active' : '',
            ].join(' ')}
          >
            <span className="log-stream__timestamp">{formatTimestamp(log.timestamp)}</span>
            <span
              className="log-stream__level"
              style={{ color: LEVEL_COLORS[log.level] }}
            >
              {LEVEL_ICONS[log.level]}
            </span>
            <span className="log-stream__source">[{log.source}]</span>
            <span className="log-stream__message">{log.message}</span>
            {log.details && (
              <div className="log-stream__details">{log.details}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
