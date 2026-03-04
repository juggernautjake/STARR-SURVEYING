// worker/src/lib/logger.ts — Per-layer attempt tracking for the research pipeline

import type { LayerAttempt } from '../types/index.js';

/**
 * Structured logger that records each layer attempt in the pipeline.
 * Every search method, API call, or extraction pass creates a LayerAttempt
 * entry for debugging and audit trail purposes.
 */
export class PipelineLogger {
  private attempts: LayerAttempt[] = [];
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  /**
   * Record the start of a layer attempt. Returns a function to call when
   * the attempt finishes (either success or failure).
   */
  startAttempt(opts: {
    layer: string;
    source: string;
    method: string;
    input: string;
  }): (result: {
    status: LayerAttempt['status'];
    dataPointsFound?: number;
    error?: string;
    nextLayer?: string;
    details?: string;
  }) => LayerAttempt {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    return (result) => {
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
      };

      this.attempts.push(attempt);
      this.logToConsole(attempt);
      return attempt;
    };
  }

  /**
   * Log a quick info/skip message without timing.
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
   * Log a warning.
   */
  warn(layer: string, message: string): void {
    console.warn(`[${this.projectId}] [${layer}] WARNING: ${message}`);
  }

  /**
   * Log an error.
   */
  error(layer: string, message: string, err?: unknown): void {
    const errMsg = err instanceof Error ? err.message : String(err ?? '');
    console.error(`[${this.projectId}] [${layer}] ERROR: ${message}${errMsg ? ` — ${errMsg}` : ''}`);
  }

  /**
   * Get all recorded attempts.
   */
  getAttempts(): LayerAttempt[] {
    return [...this.attempts];
  }

  /**
   * Get a summary string of all attempts for debugging.
   */
  getSummary(): string {
    return this.attempts
      .map((a) => `[${a.layer}] ${a.method} → ${a.status} (${a.duration_ms}ms, ${a.dataPointsFound} points)${a.error ? ` ERROR: ${a.error}` : ''}`)
      .join('\n');
  }

  private logToConsole(attempt: LayerAttempt): void {
    const icon = attempt.status === 'success' ? '✅' : attempt.status === 'partial' ? '⚠️' : attempt.status === 'fail' ? '❌' : '⏭️';
    console.log(
      `[${this.projectId}] ${icon} [${attempt.layer}] ${attempt.method} (${attempt.source}) → ${attempt.status} in ${attempt.duration_ms}ms | ${attempt.dataPointsFound} data points${attempt.error ? ` | Error: ${attempt.error}` : ''}`,
    );
    if (attempt.details) {
      console.log(`[${this.projectId}]    Details: ${attempt.details}`);
    }
  }
}
