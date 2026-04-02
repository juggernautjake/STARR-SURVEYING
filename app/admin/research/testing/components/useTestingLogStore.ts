// useTestingLogStore.ts — Shared log store for cross-component log aggregation.
//
// KNOWN GAP ADDRESSED: LogViewerTab previously had no visibility into logs
// produced by active TestCard runs. This module provides a lightweight
// publish/subscribe store so TestCard can emit logs and LogViewerTab (or any
// component) can observe them in real-time.
//
// Implementation: Module-scoped state + subscription pattern (no external deps).
// React components subscribe via the useTestingLogStore() hook which triggers
// re-renders when new entries arrive.

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SharedLogEntry {
  id: string;
  timestamp: string;          // ISO string for display in LogViewerTab
  relativeMs: number;         // ms since run start (for timeline sync)
  module: string;             // e.g. "cad-scraper", "phase-1-discover"
  level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  message: string;
  details?: string;
  runId: string;              // groups entries by test run
}

type Listener = () => void;

// ── Module-scoped store ──────────────────────────────────────────────────────
// Shared across all component instances in the same page.

let entries: SharedLogEntry[] = [];
const listeners = new Set<Listener>();
const MAX_ENTRIES = 5000;

function notify() {
  for (const fn of listeners) fn();
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Append log entries from a TestCard run. */
export function publishLogs(newEntries: SharedLogEntry[]) {
  entries = [...entries, ...newEntries].slice(-MAX_ENTRIES);
  notify();
}

/** Clear all stored entries (e.g. when navigating away). */
export function clearLogStore() {
  entries = [];
  notify();
}

/** Get current snapshot (for non-React code). */
export function getLogStoreSnapshot(): SharedLogEntry[] {
  return entries;
}

// ── React Hook ───────────────────────────────────────────────────────────────

/**
 * Subscribe to the shared log store. Returns a stable reference to the
 * current entries array that updates on every publish.
 */
export function useTestingLogStore() {
  const [, forceRender] = useState(0);
  const entriesRef = useRef(entries);

  useEffect(() => {
    const listener = () => {
      entriesRef.current = entries;
      forceRender((n) => n + 1);
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const publish = useCallback((newEntries: SharedLogEntry[]) => {
    publishLogs(newEntries);
  }, []);

  const clear = useCallback(() => {
    clearLogStore();
  }, []);

  return {
    entries: entriesRef.current,
    publish,
    clear,
  };
}
