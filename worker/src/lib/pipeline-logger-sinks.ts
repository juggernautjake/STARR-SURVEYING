// worker/src/lib/pipeline-logger-sinks.ts
//
// Bridges the cross-cutting Phase A subsystems (captcha-solver, storage,
// research-events, browser-factory) into the in-app log viewer.
//
// Why this file exists:
//   The in-app Log Viewer (Research & Analysis → Logs tab) reads from
//   `/api/admin/research/{projectId}/logs`, which serves entries from
//   `_liveLogRegistry` in `worker/src/lib/logger.ts`. That registry is
//   populated only by `PipelineLogger.addEntry()`. So the raw
//   `console.log('[captcha-solver] ...')` calls from cross-cutting
//   subsystems land in the worker stdout / DigitalOcean logs but never
//   surface in the in-app viewer for a specific project.
//
//   This file provides sink adapters that wrap `PipelineLogger` so any
//   subsystem call carrying a `jobId` (= projectId) ALSO becomes a
//   LayerAttempt entry on the active logger for that project — making
//   the activity visible alongside the rest of the pipeline timeline.
//
// Pattern:
//   - Each subsystem already has a pluggable sink interface (e.g.
//     captcha-solver's `SolveAttemptSink`).
//   - This file provides factory functions that build sinks pointing at
//     the registry. Worker bootstrap installs them once at startup.
//   - When a subsystem fires, the sink looks up the active logger via
//     `getLoggerForProject(record.jobId)`. If found, it emits a
//     `LayerAttempt`; if not (e.g. the job is not a Pipeline run, or the
//     pipeline already cleared its logger), it falls back to `delegate`
//     (which is `consoleSolveAttemptSink` by default — operator still
//     sees the activity in the worker console).

import type {
  SolveAttemptRecord,
  SolveAttemptSink,
} from './captcha-solver.js';
import { consoleSolveAttemptSink } from './captcha-solver.js';
import { getLoggerForProject } from './logger.js';

// ── Captcha solver sink ────────────────────────────────────────────────────

/**
 * Build a captcha SolveAttemptSink that ALSO routes every attempt into
 * the active PipelineLogger for the project. The supplied `delegate`
 * (defaults to `consoleSolveAttemptSink`) still runs unconditionally so
 * the worker console keeps showing every attempt regardless of whether
 * a logger is registered.
 *
 * Usage in worker bootstrap:
 *   import { setSolveAttemptSink } from './lib/captcha-solver';
 *   import { makePipelineLoggerCaptchaSink } from './lib/pipeline-logger-sinks';
 *   setSolveAttemptSink(makePipelineLoggerCaptchaSink());
 *
 * Result in the in-app log viewer:
 *   [captcha] capsolver recaptcha_v2 → tyler-clerk (1240ms) success — 1 pts | cost=$0.0008
 */
export function makePipelineLoggerCaptchaSink(
  delegate: SolveAttemptSink = consoleSolveAttemptSink,
): SolveAttemptSink {
  return {
    async record(a: SolveAttemptRecord): Promise<void> {
      // Always run the delegate (console sink) first so a registry miss
      // does not cause us to lose the log line.
      try { await delegate.record(a); }
      catch { /* delegate errors are swallowed by the caller's wrapper */ }

      const logger = getLoggerForProject(a.jobId);
      if (!logger) return;

      // Build a pseudo-input that captures the most useful diagnostic
      // surface for an operator scanning the timeline.
      const adapterInput = a.adapterId ?? 'unknown-adapter';
      const builder = logger.attempt('captcha', a.provider, a.challengeType, adapterInput);

      const detail = [
        a.costUsd != null  ? `cost=$${a.costUsd.toFixed(4)}` : null,
        a.proxyUrl         ? `proxy=${a.proxyUrl}`           : null,
        `duration=${a.durationMs}ms`,
      ].filter(Boolean).join(' ');

      try {
        if (a.success) {
          builder.success(1, detail);
        } else {
          builder.fail(a.errorMessage ?? 'captcha solve failed');
        }
      } catch {
        // Logger emit failure is non-fatal — telemetry never blocks the
        // captcha solve return value.
      }
    },
  };
}
