// worker/src/lib/logger.ts — Per-layer attempt tracking for the research pipeline
// Every action, API call, decision, and result is logged step-by-step.
//
// Supports two calling styles:
//   New style: logger.attempt('layer', 'source', 'method', 'input').success(n, 'details')
//   Legacy style: const t = logger.startAttempt({...}); t({ status: 'success', ... })

import type { LayerAttempt } from '../types/index.js';
import { getTracker } from './timeline-tracker.js';

// ── Global live-log registry ──────────────────────────────────────────────────
// Maintains a running copy of each project's log entries so the status endpoint
// can include partial logs in its response during an active pipeline run.
// Entries are pushed in addEntry() and cleared when the pipeline completes.

const _liveLogRegistry = new Map<string, LayerAttempt[]>();

/** Return the current partial log for a running pipeline, if available. */
export function getLiveLogForProject(projectId: string): LayerAttempt[] | undefined {
  return _liveLogRegistry.get(projectId);
}

/** Remove the live log entry when a pipeline finishes (success or failure). */
export function clearLiveLogForProject(projectId: string): void {
  _liveLogRegistry.delete(projectId);
  _loggerInstanceRegistry.delete(projectId);
}

// ── Global PipelineLogger instance registry ───────────────────────────────────
// Lets cross-cutting subsystems (captcha-solver, storage, research-events,
// browser-factory) find the active PipelineLogger for a job and emit
// LayerAttempt entries through it. Without this, those subsystems can only
// log to console — they never surface in the in-app log viewer because
// the viewer reads from `_liveLogRegistry`, which is populated only by
// PipelineLogger.addEntry().
//
// Lifecycle:
//   - PipelineLogger constructor registers itself.
//   - clearLiveLogForProject() unregisters when the pipeline finishes.
//   - Subsystems call getLoggerForProject(projectId) and skip-if-null —
//     pipelines without a registered logger still get console output.

const _loggerInstanceRegistry = new Map<string, PipelineLogger>();

/** Look up the active PipelineLogger for a project, if any. */
export function getLoggerForProject(projectId: string | undefined): PipelineLogger | undefined {
  if (!projectId) return undefined;
  return _loggerInstanceRegistry.get(projectId);
}

// ── New-style builder returned by attempt() ────────────────────────────────

/**
 * Fluent builder returned by PipelineLogger.attempt().
 * Call .success(), .partial(), .fail(), or .skip() to finalise the entry.
 */
export class LayerAttemptBuilder {
  private logger: PipelineLogger;
  private base: Omit<LayerAttempt, 'status' | 'duration_ms' | 'dataPointsFound'>;
  private startTime: number;
  private _steps: string[] = [];

  constructor(
    logger: PipelineLogger,
    layer: string,
    source: string,
    method: string,
    input: string,
  ) {
    this.logger = logger;
    this.startTime = Date.now();
    this.base = { layer, source, method, input, timestamp: new Date().toISOString() };
  }

  /** Log an intermediate action step (console only). */
  step(msg: string): void {
    const elapsed = Date.now() - this.startTime;
    const entry = `[+${elapsed}ms] ${msg}`;
    this._steps.push(entry);
    console.log(`[${this.logger.getProjectId()}] [${this.base.layer}]   STEP: ${entry}`);
  }

  success(dataPoints = 1, details?: string): LayerAttempt {
    return this._finish('success', dataPoints, details);
  }

  partial(dataPoints = 0, details?: string): LayerAttempt {
    return this._finish('partial', dataPoints, details);
  }

  fail(error: string, nextLayer?: string): LayerAttempt {
    const entry: LayerAttempt = {
      ...this.base,
      status: 'fail',
      duration_ms: Date.now() - this.startTime,
      dataPointsFound: 0,
      error,
      nextLayer,
      steps: this._steps.length ? [...this._steps] : undefined,
    };
    this.logger.addEntry(entry);
    return entry;
  }

  warn(message: string, details?: string): LayerAttempt {
    const entry: LayerAttempt = {
      ...this.base,
      status: 'warn',
      duration_ms: Date.now() - this.startTime,
      dataPointsFound: 0,
      error: message,
      details,
      steps: this._steps.length ? [...this._steps] : undefined,
    };
    this.logger.addEntry(entry);
    return entry;
  }

  skip(reason: string): LayerAttempt {
    const entry: LayerAttempt = {
      ...this.base,
      status: 'skip',
      duration_ms: Date.now() - this.startTime,
      dataPointsFound: 0,
      error: reason,
      steps: this._steps.length ? [...this._steps] : undefined,
    };
    this.logger.addEntry(entry);
    return entry;
  }

  private _finish(
    status: 'success' | 'partial',
    dataPoints: number,
    details?: string,
  ): LayerAttempt {
    const entry: LayerAttempt = {
      ...this.base,
      status,
      duration_ms: Date.now() - this.startTime,
      dataPointsFound: dataPoints,
      details,
      steps: this._steps.length ? [...this._steps] : undefined,
    };
    this.logger.addEntry(entry);
    return entry;
  }
}

// ── Legacy StepTracker (returned by startAttempt) ──────────────────────────

/**
 * A StepTracker is returned from startAttempt(). It's callable (to finish)
 * and has a .step() method to log intermediate actions.
 */
export type StepTracker = ((result: {
  status: LayerAttempt['status'];
  dataPointsFound?: number;
  error?: string;
  nextLayer?: string;
  details?: string;
}) => LayerAttempt) & {
  /** Log an intermediate step within this attempt */
  step: (msg: string) => void;
};

// ── PipelineLogger ─────────────────────────────────────────────────────────

/**
 * Structured logger that records each layer attempt in the pipeline.
 * Every search method, API call, or extraction pass creates a LayerAttempt
 * entry for debugging and audit trail purposes.
 *
 * New calling style:
 *   logger.attempt('Stage2', 'source', 'method', 'input').success(n, 'details')
 *
 * Legacy calling style (kept for backward compatibility):
 *   const t = logger.startAttempt({ layer, source, method, input });
 *   t.step('doing something');
 *   t({ status: 'success', dataPointsFound: 1 });
 */
export class PipelineLogger {
  private log_: LayerAttempt[] = [];
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
    // Register so cross-cutting subsystems (captcha, storage, research-events)
    // can route their LayerAttempt entries through this logger and reach the
    // in-app log viewer. Idempotent: a second logger for the same projectId
    // overwrites the first (last-writer-wins matches the existing
    // _liveLogRegistry behavior — multiple loggers per project would
    // already produce interleaved entries).
    _loggerInstanceRegistry.set(projectId, this);
  }

  /** Returns the project ID (used internally by LayerAttemptBuilder). */
  getProjectId(): string {
    return this.projectId;
  }

  /** Push an entry to the global live-log registry for this project. */
  private _registerLive(entry: LayerAttempt): void {
    if (!_liveLogRegistry.has(this.projectId)) {
      _liveLogRegistry.set(this.projectId, []);
    }
    _liveLogRegistry.get(this.projectId)!.push(entry);
  }

  // ── New-style API ─────────────────────────────────────────────────────────

  /**
   * Create a new layer attempt builder.
   * Call .success(), .partial(), .fail(), or .skip() on the result to record it.
   */
  attempt(
    layer: string,
    source: string,
    method: string,
    input: string,
  ): LayerAttemptBuilder {
    return new LayerAttemptBuilder(this, layer, source, method, input);
  }

  /** Add a pre-built LayerAttempt entry directly (used by LayerAttemptBuilder). */
  addEntry(entry: LayerAttempt): void {
    this.log_.push(entry);
    this._registerLive(entry);

    // Bridge to TimelineTracker — every log entry becomes a timeline event
    // so the Testing Lab frontend can render it on the ExecutionTimeline.
    try {
      getTracker(this.projectId).fromLayerAttempt(entry);
    } catch {
      // Non-fatal: if timeline tracker fails, logging still works
    }

    const icon = entry.status === 'success' ? '✓'
      : entry.status === 'partial' ? '◐'
      : entry.status === 'fail'    ? '✗'
      : entry.status === 'warn'    ? '⚠'
      : '⊘';
    const logFn = entry.status === 'fail' ? console.error
      : entry.status === 'warn'    ? console.warn
      : console.log;
    logFn(
      `[${this.projectId}] ${icon} [${entry.layer}] ${entry.method} → ${entry.source}` +
      ` (${entry.duration_ms}ms) ${entry.status}` +
      (entry.dataPointsFound > 0 ? ` — ${entry.dataPointsFound} pts` : '') +
      (entry.error ? ` — ${entry.error}` : '') +
      (entry.details ? ` | ${entry.details}` : ''),
    );
  }

  /** Get all recorded log entries. */
  getLog(): LayerAttempt[] {
    return [...this.log_];
  }

  // ── Legacy-style API (kept for backward compatibility) ────────────────────

  /**
   * Record the start of a layer attempt. Returns a StepTracker that
   * collects step-by-step actions and finalises with a status call.
   * @deprecated Prefer attempt() for new code.
   */
  startAttempt(opts: {
    layer: string;
    source: string;
    method: string;
    input: string;
  }): StepTracker {
    const builder = this.attempt(opts.layer, opts.source, opts.method, opts.input);
    const startTime = Date.now();

    const logStep = (msg: string) => {
      // builder.step() already logs to console — don't double-log here
      builder.step(msg);
    };

    const finish = (result: {
      status: LayerAttempt['status'];
      dataPointsFound?: number;
      error?: string;
      nextLayer?: string;
      details?: string;
    }): LayerAttempt => {
      switch (result.status) {
        case 'success': return builder.success(result.dataPointsFound ?? 0, result.details);
        case 'partial': return builder.partial(result.dataPointsFound ?? 0, result.details);
        case 'fail':    return builder.fail(result.error ?? 'unknown error', result.nextLayer);
        case 'warn':    return builder.warn(result.error ?? result.details ?? 'warning');
        default:        return builder.skip(result.error ?? result.details ?? 'skipped');
      }
    };

    // Prevent double-step logging: builder.step is already called inside logStep
    // so we patch the builder to be a no-op for the legacy path.
    return Object.assign(finish, { step: logStep });
  }

  /**
   * Log a quick info message.
   * @deprecated Prefer console.log for informational messages in new code.
   */
  info(layer: string, message: string): void {
    const entry: LayerAttempt = {
      layer, source: 'info', method: 'info', input: '',
      status: 'skip', duration_ms: 0, dataPointsFound: 0,
      timestamp: new Date().toISOString(), details: message,
    };
    this.log_.push(entry);
    this._registerLive(entry);
    console.log(`[${this.projectId}] [${layer}] ${message}`);
  }

  /**
   * Log a warning.
   */
  warn(layer: string, message: string): void {
    const entry: LayerAttempt = {
      layer, source: 'warn', method: 'warn', input: '',
      status: 'warn', duration_ms: 0, dataPointsFound: 0,
      timestamp: new Date().toISOString(), details: message,
    };
    this.log_.push(entry);
    this._registerLive(entry);
    console.warn(`[${this.projectId}] ⚠ [${layer}] ${message}`);
  }

  /**
   * Log an error.
   * @deprecated Prefer logger.attempt(...).fail() for new code.
   */
  error(layer: string, message: string, err?: unknown): void {
    const errMsg = err instanceof Error ? err.message : String(err ?? '');
    const fullMsg = `${message}${errMsg ? ` — ${errMsg}` : ''}`;
    const entry: LayerAttempt = {
      layer, source: 'error', method: 'error', input: '',
      status: 'fail', duration_ms: 0, dataPointsFound: 0,
      timestamp: new Date().toISOString(), error: fullMsg,
      details: err instanceof Error ? err.stack : undefined,
    };
    this.log_.push(entry);
    this._registerLive(entry);
    console.error(`[${this.projectId}] [${layer}] ERROR: ${fullMsg}`);
  }

  /**
   * Get all recorded attempts.
   * @deprecated Use getLog() in new code.
   */
  getAttempts(): LayerAttempt[] {
    return this.getLog();
  }

  /** Get total attempt count for monitoring. */
  getAttemptCount(): number {
    return this.log_.length;
  }

  /**
   * Get a summary string of all attempts for debugging.
   */
  getSummary(): string {
    return this.log_
      .map((a) => {
        const base = `[${a.layer}] ${a.method} -> ${a.status} (${a.duration_ms}ms, ${a.dataPointsFound} pts)${a.error ? ` ERR: ${a.error}` : ''}`;
        if (a.steps && a.steps.length > 0) {
          return base + '\n' + a.steps.map((s) => `    ${s}`).join('\n');
        }
        return base;
      })
      .join('\n');
  }
}
