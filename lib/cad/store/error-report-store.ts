// lib/cad/store/error-report-store.ts
//
// cad-multi-error-report-modal Slice 1 — global error-report
// channel. Any code in the app can push a structured error /
// diagnostic into this store; the MultiErrorModal mounted at the
// CADLayout root renders + copies them.
//
// Why a store rather than a Context: errors can be reported from
// non-React sites (logger, store mutators, async file handlers)
// + we don't want every reporting call to walk a Provider chain.

import { create } from 'zustand';

export type ErrorReportSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface ErrorReportEntry {
  /** Stable id so the modal can key + dismiss individual rows. */
  id: string;
  /** Short headline shown in the collapsed row. */
  title: string;
  /** Full multi-line body — shown in a readOnly textarea when the
   *  entry is expanded + copied verbatim by the per-entry Copy
   *  button. */
  body: string;
  /** ERROR / WARNING / INFO drives the row's icon + color. */
  severity: ErrorReportSeverity;
  /** Optional one-line hint surfaced as a callout above the body. */
  hint?: string;
  /** Millisecond timestamp at the time of report. */
  timestamp: number;
}

export interface ErrorReportStoreState {
  entries: ErrorReportEntry[];
  open: boolean;
  /** Push an entry. The store auto-generates an id + timestamp +
   *  flips `open` to true so the modal surfaces. */
  report: (input: Omit<ErrorReportEntry, 'id' | 'timestamp'>) => string;
  /** Silently append an entry WITHOUT opening the modal — used to
   *  mirror every cadLog error/warning so it is captured + copyable
   *  on demand, without a disruptive pop-up on each one. */
  capture: (input: Omit<ErrorReportEntry, 'id' | 'timestamp'>) => string;
  /** Remove a single entry by id. */
  dismiss: (id: string) => void;
  /** Wipe all entries (keeps `open` as-is so the user can choose
   *  whether to close after clearing). */
  clear: () => void;
  /** Open or close the modal without touching the entries. */
  setOpen: (open: boolean) => void;
}

let idCounter = 0;
const nextId = () => `err-${Date.now()}-${++idCounter}`;

// Cap the buffer so a long session (or a runaway warning) can't grow
// the array without bound. Newest are kept at the front.
const MAX_ENTRIES = 500;

export const useErrorReportStore = create<ErrorReportStoreState>((set) => ({
  entries: [],
  open: false,
  report: (input) => {
    const id = nextId();
    const entry: ErrorReportEntry = {
      ...input,
      id,
      timestamp: Date.now(),
    };
    set((state) => ({ entries: [entry, ...state.entries].slice(0, MAX_ENTRIES), open: true }));
    return id;
  },
  capture: (input) => {
    const id = nextId();
    const entry: ErrorReportEntry = { ...input, id, timestamp: Date.now() };
    set((state) => ({ entries: [entry, ...state.entries].slice(0, MAX_ENTRIES) }));
    return id;
  },
  dismiss: (id) => set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),
  clear: () => set({ entries: [] }),
  setOpen: (open) => set({ open }),
}));

/** Format every entry as a flat copy-pasteable string. Used by
 *  the modal's "Copy all" button + by the cadLog mirror. */
export function formatEntries(entries: ReadonlyArray<ErrorReportEntry>): string {
  const lines: string[] = [];
  for (const e of entries) {
    const ts = new Date(e.timestamp).toISOString();
    lines.push(`[${ts}] [${e.severity}] ${e.title}`);
    if (e.hint) lines.push(`  Hint: ${e.hint}`);
    for (const bodyLine of e.body.split('\n')) lines.push(`  ${bodyLine}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
