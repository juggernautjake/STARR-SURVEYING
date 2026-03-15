// worker/src/lib/logger.ts — Per-layer attempt tracking for the research pipeline
// Every action, API call, decision, and result is logged step-by-step.
//
// Supports two calling styles:
//   New style: logger.attempt('layer', 'source', 'method', 'input').success(n, 'details')
//   Legacy style: const t = logger.startAttempt({...}); t({ status: 'success', ... })

import type { LayerAttempt } from '../types/index.js';

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
  }

  /** Returns the project ID (used internally by LayerAttemptBuilder). */
  getProjectId(): string {
    return this.projectId;
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
      const elapsed = Date.now() - startTime;
      console.log(`[${this.projectId}] [${opts.layer}]   STEP: [+${elapsed}ms] ${msg}`);
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
    this.log_.push({
      layer, source: 'info', method: 'info', input: '',
      status: 'skip', duration_ms: 0, dataPointsFound: 0,
      timestamp: new Date().toISOString(), details: message,
    });
    console.log(`[${this.projectId}] [${layer}] ${message}`);
  }

  /**
   * Log a warning.
   */
  warn(layer: string, message: string): void {
    this.log_.push({
      layer, source: 'warn', method: 'warn', input: '',
      status: 'warn', duration_ms: 0, dataPointsFound: 0,
      timestamp: new Date().toISOString(), details: message,
    });
    console.warn(`[${this.projectId}] ⚠ [${layer}] ${message}`);
  }

  /**
   * Log an error.
   * @deprecated Prefer logger.attempt(...).fail() for new code.
   */
  error(layer: string, message: string, err?: unknown): void {
    const errMsg = err instanceof Error ? err.message : String(err ?? '');
    const fullMsg = `${message}${errMsg ? ` — ${errMsg}` : ''}`;
    this.log_.push({
      layer, source: 'error', method: 'error', input: '',
      status: 'fail', duration_ms: 0, dataPointsFound: 0,
      timestamp: new Date().toISOString(), error: fullMsg,
      details: err instanceof Error ? err.stack : undefined,
    });
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
