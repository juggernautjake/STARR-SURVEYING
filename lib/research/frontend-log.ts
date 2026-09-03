// lib/research/frontend-log.ts — the browser's half of a run's log.
//
// ── THE OWNER ASKED FOR BOTH, AND THE VIEWER SHOWED ONE ─────────────────────────────────────────
//
// > "We need to be able to immediately retreive the worker and frontend logs. Really, both logs
// >  should be displayed in the pipeline log viewer."
//
// The pipeline log viewer has only ever shown worker entries. Everything the browser knew about the
// same run — the POST that started it and what it answered, every poll and its status, a fetch that
// failed, a console error thrown while rendering the result — lived in a separate buffer that only
// surfaced if somebody filed an error report.
//
// That gap is not cosmetic. Half of the contradictions the owner reported on 2026-09-03 were
// disagreements BETWEEN the two halves: a panel latching "Research Failed" while the worker went on
// to retrieve seventeen documents, a poll landing on a previous run's cached result. Neither is
// visible in a worker log, because neither happened in the worker. Both are plainly visible in a
// browser log, and there was nowhere to look at one.
//
// ── WHY THIS ADAPTS RATHER THAN ADDS A SECOND VIEWER ────────────────────────────────────────────
//
// `PipelineLogEntry` is the shape the viewer already filters, orders, de-duplicates and copies. A
// browser event rendered into that shape inherits all of it — including the Copy All Logs export,
// which is the button the owner actually uses. A parallel panel would need its own filter, its own
// ordering and its own export, and the two would drift.
//
// What it must NOT do is let a browser entry pass for a worker one. Every entry produced here is
// stamped `layer: 'Browser'`, so the origin is on screen next to the line and in the export.

import { getBreadcrumbs, getConsoleLogs } from '@/lib/errorHandler';

/** The subset of `PipelineLogEntry` this module produces. Structurally identical on purpose. */
export interface FrontendLogEntry {
  layer: string;
  source: string;
  method: string;
  status: 'success' | 'fail' | 'skip' | 'partial' | 'warn';
  input?: string;
  details?: string;
  error?: string;
  dataPointsFound: number;
  duration_ms: number;
  timestamp?: string;
}

/** The one label that marks an entry as having happened in the browser. */
export const BROWSER_LAYER = 'Browser';

/**
 * An HTTP status rendered as a log status.
 *
 * A 4xx or 5xx is a `fail` — the request did not do what it was asked. A 3xx is `partial` rather
 * than success because a redirect on an API call is usually an auth bounce, and reading that as a
 * success is how a signed-out session looks like a working one.
 */
function statusFor(httpStatus: number | undefined): FrontendLogEntry['status'] {
  if (httpStatus === undefined) return 'success';
  if (httpStatus >= 500 || httpStatus >= 400) return 'fail';
  if (httpStatus >= 300) return 'partial';
  return 'success';
}

/**
 * Browser breadcrumbs and console output, as log entries the pipeline viewer can show.
 *
 * `sinceIso` filters to the run in question — the buffers are session-wide and hold up to thirty
 * breadcrumbs and twenty console lines, so without it a five-minute run would be shown alongside
 * whatever the operator did before starting it. Absent, everything held is returned, which is the
 * right answer for "show me what this browser knows".
 *
 * Ordering is left to the viewer's merge, which already sorts by timestamp across both halves.
 */
export function frontendLogEntries(sinceIso?: string | null): FrontendLogEntry[] {
  const out: FrontendLogEntry[] = [];
  const after = (ts: string): boolean => !sinceIso || ts >= sinceIso;

  for (const c of getBreadcrumbs()) {
    if (!after(c.timestamp)) continue;
    const httpStatus = typeof c.data?.status === 'number' ? (c.data.status as number) : undefined;
    out.push({
      layer: BROWSER_LAYER,
      source: c.type,
      // `GET /api/…` reads better in a log than `api_call`, and the URL is the part that identifies
      // which call this was.
      method: typeof c.data?.method === 'string' ? (c.data.method as string) : c.type,
      status: statusFor(httpStatus),
      input: typeof c.data?.url === 'string' ? (c.data.url as string) : undefined,
      details: c.description,
      dataPointsFound: 0,
      duration_ms: 0,
      timestamp: c.timestamp,
    });
  }

  for (const l of getConsoleLogs()) {
    if (!after(l.timestamp)) continue;
    const isError = l.level === 'error';
    out.push({
      layer: BROWSER_LAYER,
      source: `console.${l.level}`,
      method: 'console',
      // A console warning is a `warn`, not a failure: the viewer's Warnings filter is where an
      // operator looks for "something was odd", and burying warnings under Errors makes both
      // lists lie.
      status: isError ? 'fail' : l.level === 'warn' ? 'warn' : 'success',
      details: l.message,
      error: isError ? l.message : undefined,
      dataPointsFound: 0,
      duration_ms: 0,
      timestamp: l.timestamp,
    });
  }

  return out;
}

/** One line for the panel header, so an empty browser half says why rather than looking broken. */
export function describeFrontendLog(entries: FrontendLogEntry[]): string {
  if (entries.length === 0) {
    return 'No browser activity recorded for this run yet. The buffers are session-wide and hold '
      + 'the last 30 actions and 20 console lines, so a reload clears them.';
  }
  const failures = entries.filter((e) => e.status === 'fail').length;
  return failures > 0
    ? `${entries.length} browser entr${entries.length === 1 ? 'y' : 'ies'}, ${failures} of them failures.`
    : `${entries.length} browser entr${entries.length === 1 ? 'y' : 'ies'}.`;
}
