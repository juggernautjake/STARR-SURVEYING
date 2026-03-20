// lib/research/pipeline-logger.ts — Structured pipeline logging system
//
// Provides detailed, structured logging throughout the entire research pipeline.
// Every operation, decision, comparison, and trigger is logged with timestamps,
// context, and severity levels. Logs are both console-emitted (for server logs)
// and accumulated in-memory for API response inclusion.
//
// Log entries are categorized by pipeline phase and tagged with severity:
//   DEBUG  — Verbose details for debugging (coordinates, URLs, byte counts)
//   INFO   — Normal progress milestones
//   WARN   — Non-fatal issues that may affect results
//   ERROR  — Failures that blocked a pipeline step
//   TRIGGER — A criteria-based trigger was activated (review, re-compare, etc.)
//   MATCH  — Two data sources agree (confirmation)
//   CONFLICT — Two data sources disagree (needs resolution)

// ── Types ────────────────────────────────────────────────────────────────────

export type LogSeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'TRIGGER' | 'MATCH' | 'CONFLICT';

export type PipelinePhase =
  | 'init'
  | 'geocode'
  | 'gis_zoom'
  | 'map_capture'
  | 'screenshot'
  | 'visual_compare'
  | 'resource_analyze'
  | 'cross_validate'
  | 'trigger_check'
  | 'deed_compare'
  | 'plat_compare'
  | 'lot_identify'
  | 'priority_rank'
  | 'synthesis'
  | 'cleanup';

export interface PipelineLogEntry {
  /** ISO timestamp */
  ts: string;
  /** Log severity */
  severity: LogSeverity;
  /** Which pipeline phase generated this log */
  phase: PipelinePhase;
  /** Short human-readable message */
  message: string;
  /** Structured detail data (for API response / debugging) */
  detail?: Record<string, unknown>;
  /** Duration in ms if this was a timed operation */
  duration_ms?: number;
  /** Which trigger rule fired (if severity is TRIGGER) */
  trigger_rule?: string;
}

// ── PipelineLogger Class ─────────────────────────────────────────────────────

export class PipelineLogger {
  private entries: PipelineLogEntry[] = [];
  private projectId: string;
  private startTime: number;
  private phaseTimers: Map<string, number> = new Map();

  constructor(projectId: string) {
    this.projectId = projectId;
    this.startTime = Date.now();
  }

  // ── Core logging methods ─────────────────────────────────────────────────

  log(severity: LogSeverity, phase: PipelinePhase, message: string, detail?: Record<string, unknown>): void {
    const entry: PipelineLogEntry = {
      ts: new Date().toISOString(),
      severity,
      phase,
      message,
      detail,
    };
    this.entries.push(entry);

    // Console output for server-side debugging
    const prefix = `[Pipeline:${this.projectId.slice(0, 8)}][${phase}]`;
    switch (severity) {
      case 'ERROR':
        console.error(`${prefix} ${message}`, detail ? JSON.stringify(detail).slice(0, 500) : '');
        break;
      case 'WARN':
        console.warn(`${prefix} ${message}`, detail ? JSON.stringify(detail).slice(0, 300) : '');
        break;
      case 'TRIGGER':
        console.log(`${prefix} 🔔 TRIGGER: ${message}`, detail ? JSON.stringify(detail).slice(0, 300) : '');
        break;
      case 'CONFLICT':
        console.log(`${prefix} ⚠️ CONFLICT: ${message}`, detail ? JSON.stringify(detail).slice(0, 300) : '');
        break;
      case 'MATCH':
        console.log(`${prefix} ✓ MATCH: ${message}`, detail ? JSON.stringify(detail).slice(0, 300) : '');
        break;
      case 'DEBUG':
        // Only emit DEBUG to console in development
        if (process.env.NODE_ENV !== 'production') {
          console.log(`${prefix} [DEBUG] ${message}`);
        }
        break;
      default:
        console.log(`${prefix} ${message}`);
    }
  }

  debug(phase: PipelinePhase, message: string, detail?: Record<string, unknown>): void {
    this.log('DEBUG', phase, message, detail);
  }

  info(phase: PipelinePhase, message: string, detail?: Record<string, unknown>): void {
    this.log('INFO', phase, message, detail);
  }

  warn(phase: PipelinePhase, message: string, detail?: Record<string, unknown>): void {
    this.log('WARN', phase, message, detail);
  }

  error(phase: PipelinePhase, message: string, detail?: Record<string, unknown>): void {
    this.log('ERROR', phase, message, detail);
  }

  trigger(phase: PipelinePhase, rule: string, message: string, detail?: Record<string, unknown>): void {
    const entry: PipelineLogEntry = {
      ts: new Date().toISOString(),
      severity: 'TRIGGER',
      phase,
      message,
      detail,
      trigger_rule: rule,
    };
    this.entries.push(entry);
    console.log(`[Pipeline:${this.projectId.slice(0, 8)}][${phase}] 🔔 TRIGGER [${rule}]: ${message}`);
  }

  match(phase: PipelinePhase, message: string, detail?: Record<string, unknown>): void {
    this.log('MATCH', phase, message, detail);
  }

  conflict(phase: PipelinePhase, message: string, detail?: Record<string, unknown>): void {
    this.log('CONFLICT', phase, message, detail);
  }

  // ── Phase timing ─────────────────────────────────────────────────────────

  startPhase(phase: PipelinePhase, message?: string): void {
    this.phaseTimers.set(phase, Date.now());
    this.info(phase, message || `Starting phase: ${phase}`);
  }

  endPhase(phase: PipelinePhase, message?: string): number {
    const start = this.phaseTimers.get(phase);
    const duration = start ? Date.now() - start : 0;
    this.phaseTimers.delete(phase);

    const entry: PipelineLogEntry = {
      ts: new Date().toISOString(),
      severity: 'INFO',
      phase,
      message: message || `Phase ${phase} complete`,
      duration_ms: duration,
    };
    this.entries.push(entry);
    console.log(`[Pipeline:${this.projectId.slice(0, 8)}][${phase}] Complete (${duration}ms)`);

    return duration;
  }

  // ── Timed operation helper ───────────────────────────────────────────────

  async timed<T>(
    phase: PipelinePhase,
    label: string,
    fn: () => Promise<T>,
  ): Promise<{ result: T; duration_ms: number }> {
    const start = Date.now();
    this.debug(phase, `Starting: ${label}`);
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.info(phase, `${label} completed (${duration}ms)`, { duration_ms: duration });
      return { result, duration_ms: duration };
    } catch (err) {
      const duration = Date.now() - start;
      this.error(phase, `${label} failed after ${duration}ms: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  // ── Output ───────────────────────────────────────────────────────────────

  /** Get all log entries */
  getEntries(): PipelineLogEntry[] {
    return [...this.entries];
  }

  /** Get entries filtered by severity */
  getEntriesBySeverity(...severities: LogSeverity[]): PipelineLogEntry[] {
    return this.entries.filter(e => severities.includes(e.severity));
  }

  /** Get entries for a specific phase */
  getEntriesByPhase(phase: PipelinePhase): PipelineLogEntry[] {
    return this.entries.filter(e => e.phase === phase);
  }

  /** Get all trigger events */
  getTriggers(): PipelineLogEntry[] {
    return this.entries.filter(e => e.severity === 'TRIGGER');
  }

  /** Get human-readable step log (array of strings) */
  getSteps(): string[] {
    return this.entries
      .filter(e => e.severity !== 'DEBUG')
      .map(e => {
        const icon = e.severity === 'TRIGGER' ? '🔔'
          : e.severity === 'MATCH' ? '✓'
          : e.severity === 'CONFLICT' ? '⚠️'
          : e.severity === 'ERROR' ? '✗'
          : e.severity === 'WARN' ? '⚡'
          : '→';
        return `[${e.phase}] ${icon} ${e.message}${e.duration_ms ? ` (${e.duration_ms}ms)` : ''}`;
      });
  }

  /** Get total elapsed time since logger creation */
  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }

  /** Get a compact summary */
  getSummary(): {
    total_entries: number;
    errors: number;
    warnings: number;
    triggers_fired: number;
    matches: number;
    conflicts: number;
    elapsed_ms: number;
  } {
    return {
      total_entries: this.entries.length,
      errors: this.entries.filter(e => e.severity === 'ERROR').length,
      warnings: this.entries.filter(e => e.severity === 'WARN').length,
      triggers_fired: this.entries.filter(e => e.severity === 'TRIGGER').length,
      matches: this.entries.filter(e => e.severity === 'MATCH').length,
      conflicts: this.entries.filter(e => e.severity === 'CONFLICT').length,
      elapsed_ms: this.getElapsedMs(),
    };
  }
}
