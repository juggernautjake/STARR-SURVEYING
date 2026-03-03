// lib/cad/logger.ts — Centralized CAD error/event logger
// Writes structured entries to the browser console and maintains an in-memory
// ring-buffer so the CAD debug panel can display recent activity.

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

  return entry;
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
