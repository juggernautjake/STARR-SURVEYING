// lib/cad/logger.ts — Centralized CAD error/event logger
// Writes structured entries to the browser console and maintains an in-memory
// ring-buffer so the CAD debug panel can display recent activity.
//
// Every ERROR and WARN is ALSO mirrored into the global error-report store so
// it shows up in the copyable "Errors & Warnings" modal — that is how CAD
// errors/warnings become easy to copy for a bug report.

import { useErrorReportStore } from './store/error-report-store';

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

export interface LogEntry {
  id: number;
  level: LogLevel;
  context: string;   // e.g. 'CanvasViewport', 'UndoStore', 'FileIO'
  message: string;
  data?: unknown;
  timestamp: number; // Date.now()
}

const MAX_ENTRIES = 200;
let _seq = 0;
const _entries: LogEntry[] = [];
type Listener = (entry: LogEntry) => void;
const _listeners: Set<Listener> = new Set();

function push(level: LogLevel, context: string, message: string, data?: unknown): LogEntry {
  const entry: LogEntry = {
    id: ++_seq,
    level,
    context,
    message,
    data,
    timestamp: Date.now(),
  };

  // Ring-buffer: trim oldest when over limit
  _entries.push(entry);
  if (_entries.length > MAX_ENTRIES) _entries.shift();

  // Console output
  const ts = new Date(entry.timestamp).toISOString().slice(11, 23); // HH:MM:SS.mmm
  const prefix = `[StarrCAD] [${ts}] [${level}] [${context}]`;
  if (data !== undefined) {
    // eslint-disable-next-line no-console
    (level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log)(
      prefix, message, data,
    );
  } else {
    // eslint-disable-next-line no-console
    (level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log)(
      prefix, message,
    );
  }

  // Notify debug panel listeners
  for (const fn of _listeners) {
    try { fn(entry); } catch { /* ignore listener errors */ }
  }

  // Mirror errors + warnings into the global copyable error-report store
  // (silent capture — does not pop the modal open; the user opens it on
  // demand from the status bar). INFO/DEBUG are excluded to avoid flooding.
  if (level === 'ERROR' || level === 'WARN') {
    try {
      let body = message;
      if (data !== undefined) {
        let dataStr: string;
        try {
          dataStr = data instanceof Error
            ? `${data.name}: ${data.message}\n${data.stack ?? ''}`
            : JSON.stringify(data, replacerWithErrors, 2);
        } catch {
          dataStr = String(data);
        }
        body = `${message}\n\n${dataStr}`;
      }
      useErrorReportStore.getState().capture({
        title: `[${context}] ${message}`,
        body,
        severity: level === 'ERROR' ? 'ERROR' : 'WARNING',
      });
    } catch { /* store not ready (e.g. SSR) — console output already happened */ }
  }

  return entry;
}

/** JSON.stringify replacer that serializes Error objects (which otherwise
 *  stringify to "{}") so the copied body carries the real message + stack. */
function replacerWithErrors(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export const cadLog = {
  error: (context: string, message: string, data?: unknown) => push('ERROR', context, message, data),
  warn:  (context: string, message: string, data?: unknown) => push('WARN',  context, message, data),
  info:  (context: string, message: string, data?: unknown) => push('INFO',  context, message, data),
  debug: (context: string, message: string, data?: unknown) => push('DEBUG', context, message, data),

  /** Return a shallow copy of the current entries (newest last). */
  getEntries: (): readonly LogEntry[] => [..._entries],

  /** Remove all stored entries. */
  clear: () => { _entries.length = 0; },

  /** Subscribe to new log entries. Returns an unsubscribe function. */
  subscribe: (fn: Listener): (() => void) => {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },
};
