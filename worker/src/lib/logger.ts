// worker/src/lib/logger.ts — Per-layer attempt tracking for the research pipeline
// Every action, API call, decision, and result is logged step-by-step.

import type { LayerAttempt } from '../types/index.js';

/**
 * Structured logger that records each layer attempt in the pipeline.
 * Every search method, API call, or extraction pass creates a LayerAttempt
 * entry for debugging and audit trail purposes.
 *
 * Step logging: Each attempt can accumulate a steps[] array of human-readable
 * action descriptions. These record EXACTLY what happened at each point
 * so that logs can be reviewed to create further error handling or refactoring.
 */
export class PipelineLogger {
  private attempts: LayerAttempt[] = [];
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  /**
   * Record the start of a layer attempt. Returns a StepTracker that
   * collects step-by-step actions and finalizes with a status.
   */
  startAttempt(opts: {
    layer: string;
    source: string;
    method: string;
    input: string;
  }): StepTracker {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const steps: string[] = [];

    const logStep = (msg: string) => {
      const elapsed = Date.now() - startTime;
      const entry = `[+${elapsed}ms] ${msg}`;
      steps.push(entry);
      console.log(`[${this.projectId}] [${opts.layer}]   STEP: ${entry}`);
    };

    // Log the start
    logStep(`START ${opts.method} (${opts.source}) | input: ${opts.input}`);

    const finish = (result: {
      status: LayerAttempt['status'];
      dataPointsFound?: number;
      error?: string;
      nextLayer?: string;
      details?: string;
    }): LayerAttempt => {
      logStep(`FINISH → ${result.status}${result.error ? ` | error: ${result.error}` : ''}${result.details ? ` | ${result.details}` : ''}`);

      const attempt: LayerAttempt = {
        layer: opts.layer,
        source: opts.source,
        method: opts.method,
        input: opts.input,
        status: result.status,
        duration_ms: Date.now() - startTime,
        dataPointsFound: result.dataPointsFound ?? 0,
        error: result.error,
        nextLayer: result.nextLayer,
        timestamp,
        details: result.details,
        steps: [...steps],
      };

      this.attempts.push(attempt);
      this.logToConsole(attempt);
      return attempt;
    };

    // Return both the finish function and the step logger
    return Object.assign(finish, { step: logStep });
  }

  /**
   * Log a quick info message. Also recorded in attempts for full audit trail.
   */
  info(layer: string, message: string): void {
    const attempt: LayerAttempt = {
      layer,
      source: 'info',
      method: 'info',
      input: '',
      status: 'skip',
      duration_ms: 0,
      dataPointsFound: 0,
      timestamp: new Date().toISOString(),
      details: message,
    };
    this.attempts.push(attempt);
    console.log(`[${this.projectId}] [${layer}] ${message}`);
  }

  /**
   * Log a warning. Recorded in attempts with 'skip' status.
   */
  warn(layer: string, message: string): void {
    const attempt: LayerAttempt = {
      layer,
      source: 'warn',
      method: 'warn',
      input: '',
      status: 'skip',
      duration_ms: 0,
      dataPointsFound: 0,
      timestamp: new Date().toISOString(),
      details: `WARNING: ${message}`,
    };
    this.attempts.push(attempt);
    console.warn(`[${this.projectId}] [${layer}] WARNING: ${message}`);
  }

  /**
   * Log an error. Recorded in attempts with 'fail' status.
   */
  error(layer: string, message: string, err?: unknown): void {
    const errMsg = err instanceof Error ? err.message : String(err ?? '');
    const fullMsg = `${message}${errMsg ? ` — ${errMsg}` : ''}`;
    const attempt: LayerAttempt = {
      layer,
      source: 'error',
      method: 'error',
      input: '',
      status: 'fail',
      duration_ms: 0,
      dataPointsFound: 0,
      timestamp: new Date().toISOString(),
      error: fullMsg,
      details: err instanceof Error ? err.stack : undefined,
    };
    this.attempts.push(attempt);
    console.error(`[${this.projectId}] [${layer}] ERROR: ${fullMsg}`);
  }

  /**
   * Get all recorded attempts (including info/warn/error entries).
   */
  getAttempts(): LayerAttempt[] {
    return [...this.attempts];
  }

  /**
   * Get total attempt count for monitoring.
   */
  getAttemptCount(): number {
    return this.attempts.length;
  }

  /**
   * Get a summary string of all attempts for debugging.
   */
  getSummary(): string {
    return this.attempts
      .map((a) => {
        const base = `[${a.layer}] ${a.method} -> ${a.status} (${a.duration_ms}ms, ${a.dataPointsFound} pts)${a.error ? ` ERR: ${a.error}` : ''}`;
        if (a.steps && a.steps.length > 0) {
          return base + '\n' + a.steps.map((s) => `    ${s}`).join('\n');
        }
        return base;
      })
      .join('\n');
  }

  private logToConsole(attempt: LayerAttempt): void {
    const icon = attempt.status === 'success' ? '[OK]'
      : attempt.status === 'partial' ? '[PARTIAL]'
      : attempt.status === 'fail' ? '[FAIL]'
      : '[SKIP]';
    console.log(
      `[${this.projectId}] ${icon} [${attempt.layer}] ${attempt.method} (${attempt.source}) -> ${attempt.status} in ${attempt.duration_ms}ms | ${attempt.dataPointsFound} data points${attempt.error ? ` | Error: ${attempt.error}` : ''}`,
    );
    if (attempt.details) {
      console.log(`[${this.projectId}]    Details: ${attempt.details}`);
    }
  }
}

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
