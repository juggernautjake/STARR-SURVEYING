// worker/src/lib/timeline-tracker.ts — Granular timeline event collector
//
// Captures per-step events during pipeline execution so the Testing Lab
// frontend can render them on the ExecutionTimeline, populate the CodeViewer
// with source file/line traces, and support speed-controlled playback.
//
// Events are stored in-memory per project and exposed via the
// /research/status/:projectId endpoint's `timeline` field.

import type { LayerAttempt } from '../types/index.js';

// ── Timeline Event Type ──────────────────────────────────────────────────────

export interface TimelineEntry {
  id: string;
  /** ms since pipeline start */
  timestamp: number;
  type:
    | 'phase-start'
    | 'phase-complete'
    | 'phase-failed'
    | 'api-call'
    | 'ai-call'
    | 'browser-action'
    | 'data-found'
    | 'warning'
    | 'error'
    | 'screenshot'
    | 'log'
    | 'checkpoint';
  label: string;
  description: string;
  /** Source file path (for CodeViewer) */
  file?: string;
  /** Function name (for CodeViewer) */
  function?: string;
  /** Line number (for CodeViewer) */
  line?: number;
  /** Duration of the operation in ms (for span events) */
  duration?: number;
  /** Arbitrary event payload */
  data?: unknown;
}

// ── Source file mapping ──────────────────────────────────────────────────────
// Maps layer/source names from PipelineLogger to actual source file paths
// so the frontend CodeViewer can display the running code.

const SOURCE_FILE_MAP: Record<string, { file: string; function?: string }> = {
  // Phase 1 — Discovery
  'property-discovery':   { file: 'worker/src/services/property-discovery.ts', function: 'discoverProperty' },
  'discovery-engine':     { file: 'worker/src/services/discovery-engine.ts', function: 'runDiscovery' },
  'bis-adapter':          { file: 'worker/src/adapters/bis-adapter.ts', function: 'search' },
  'trueautomation-adapter': { file: 'worker/src/adapters/trueautomation-adapter.ts', function: 'search' },
  'tyler-adapter':        { file: 'worker/src/adapters/tyler-adapter.ts', function: 'search' },
  'address-normalizer':   { file: 'worker/src/services/address-normalizer.ts', function: 'normalize' },

  // Phase 2 — Harvest
  'document-harvester':   { file: 'worker/src/services/document-harvester.ts', function: 'harvest' },
  'kofile-clerk-adapter': { file: 'worker/src/adapters/kofile-clerk-adapter.ts', function: 'search' },
  'texasfile-adapter':    { file: 'worker/src/adapters/texasfile-adapter.ts', function: 'search' },
  'countyfusion-adapter': { file: 'worker/src/adapters/countyfusion-adapter.ts', function: 'search' },

  // Phase 3 — AI Extraction
  'ai-extraction':        { file: 'worker/src/services/ai-extraction.ts', function: 'extract' },
  'ai-document-analyzer': { file: 'worker/src/services/ai-document-analyzer.ts', function: 'analyze' },
  'adaptive-vision':      { file: 'worker/src/services/adaptive-vision.ts', function: 'analyzeImage' },
  'ai-plat-analyzer':     { file: 'worker/src/services/ai-plat-analyzer.ts', function: 'analyzePlat' },
  'ai-deed-analyzer':     { file: 'worker/src/services/ai-deed-analyzer.ts', function: 'analyzeDeed' },

  // Phase 4 — Subdivision
  'subdivision-intelligence': { file: 'worker/src/services/subdivision-intelligence.ts', function: 'analyze' },
  'lot-enumerator':       { file: 'worker/src/services/lot-enumerator.ts', function: 'enumerate' },

  // Phase 5 — Adjacent
  'adjacent-research':    { file: 'worker/src/services/adjacent-research.ts', function: 'research' },
  'cross-validation-engine': { file: 'worker/src/services/cross-validation-engine.ts', function: 'validate' },

  // Phase 6 — TxDOT ROW
  'txdot-row':            { file: 'worker/src/services/txdot-row.ts', function: 'fetchROW' },
  'road-classifier':      { file: 'worker/src/services/road-classifier.ts', function: 'classify' },

  // Phase 7 — Reconciliation
  'geometric-reconciliation-engine': { file: 'worker/src/services/geometric-reconciliation-engine.ts', function: 'reconcile' },
  'reading-aggregator':   { file: 'worker/src/services/reading-aggregator.ts', function: 'aggregate' },
  'source-weighting':     { file: 'worker/src/services/source-weighting.ts', function: 'weight' },

  // Phase 8 — Confidence
  'confidence-scoring-engine': { file: 'worker/src/services/confidence-scoring-engine.ts', function: 'score' },
  'discrepancy-analyzer': { file: 'worker/src/services/discrepancy-analyzer.ts', function: 'analyze' },

  // Phase 9 — Purchase
  'document-purchase-orchestrator': { file: 'worker/src/services/document-purchase-orchestrator.ts', function: 'purchase' },

  // Infrastructure
  'orchestrator':         { file: 'worker/src/orchestrator/master-orchestrator.ts', function: 'runPipeline' },
  'handshake':            { file: 'worker/src/index.ts', function: 'progressCallback' },
  'info':                 { file: 'worker/src/index.ts' },

  // External data sources
  'fema-nfhl-client':     { file: 'worker/src/sources/fema-nfhl-client.ts', function: 'query' },
  'glo-client':           { file: 'worker/src/sources/glo-client.ts', function: 'query' },
  'nrcs-soil-client':     { file: 'worker/src/sources/nrcs-soil-client.ts', function: 'query' },
  'usgs-client':          { file: 'worker/src/sources/usgs-client.ts', function: 'fetch' },
};

// ── Per-project tracker ──────────────────────────────────────────────────────

const trackers = new Map<string, TimelineTracker>();

/** Get or create a tracker for a project (use during pipeline runs). */
export function getTracker(projectId: string): TimelineTracker {
  if (!trackers.has(projectId)) {
    trackers.set(projectId, new TimelineTracker(projectId));
  }
  return trackers.get(projectId)!;
}

/** Get a tracker only if it already exists (use in read-only contexts like status endpoints). */
export function getTrackerIfExists(projectId: string): TimelineTracker | undefined {
  return trackers.get(projectId);
}

export function clearTracker(projectId: string): void {
  trackers.delete(projectId);
}

// ── TimelineTracker class ────────────────────────────────────────────────────

let idCounter = 0;

export class TimelineTracker {
  private projectId: string;
  private startTime: number;
  private entries: TimelineEntry[] = [];
  private paused = false;
  private pausedAt: number | null = null;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.startTime = Date.now();
  }

  // ── Core API ───────────────────────────────────────────────────────────────

  /** Add a timeline event. Returns the event for chaining. */
  add(
    type: TimelineEntry['type'],
    label: string,
    description: string,
    extra?: Partial<Pick<TimelineEntry, 'file' | 'function' | 'line' | 'duration' | 'data'>>,
  ): TimelineEntry {
    const entry: TimelineEntry = {
      id: `tl-${this.projectId.slice(0, 8)}-${++idCounter}`,
      timestamp: Date.now() - this.startTime,
      type,
      label,
      description,
      ...extra,
    };
    this.entries.push(entry);
    return entry;
  }

  /** Record a phase start event. */
  phaseStart(phase: number | string, name: string): TimelineEntry {
    return this.add('phase-start', `Phase ${phase}: ${name}`, `Starting ${name}`, {
      file: 'worker/src/orchestrator/master-orchestrator.ts',
      function: 'runPipeline',
    });
  }

  /** Record a phase completion event. */
  phaseComplete(phase: number | string, name: string, durationMs: number): TimelineEntry {
    return this.add('phase-complete', `Phase ${phase}: ${name}`, `Completed in ${(durationMs / 1000).toFixed(1)}s`, {
      duration: durationMs,
      file: 'worker/src/orchestrator/master-orchestrator.ts',
      function: 'runPipeline',
    });
  }

  /** Record a phase failure event. */
  phaseFailed(phase: number | string, name: string, error: string): TimelineEntry {
    return this.add('phase-failed', `Phase ${phase}: ${name}`, error, {
      file: 'worker/src/orchestrator/master-orchestrator.ts',
      function: 'runPipeline',
    });
  }

  /** Record a screenshot capture event. */
  screenshot(url: string, label?: string): TimelineEntry {
    return this.add('screenshot', label || 'Screenshot captured', url, { data: { url } });
  }

  /**
   * Convert a LayerAttempt from PipelineLogger into a timeline event.
   * This is the main bridge between the existing logging system and the timeline.
   */
  fromLayerAttempt(entry: LayerAttempt): TimelineEntry {
    // Determine event type from LayerAttempt status
    const type: TimelineEntry['type'] =
      entry.status === 'fail' ? 'error' :
      entry.status === 'warn' ? 'warning' :
      entry.source === 'handshake' ? 'checkpoint' :
      entry.layer?.includes('AI') || entry.source?.includes('ai') ? 'ai-call' :
      entry.source?.includes('playwright') || entry.source?.includes('browser') ? 'browser-action' :
      entry.source?.includes('api') || entry.source?.includes('client') ? 'api-call' :
      entry.dataPointsFound > 0 ? 'data-found' :
      'log';

    // Look up source file mapping
    const sourceKey = entry.source?.toLowerCase().replace(/\s+/g, '-') || '';
    const fileInfo = SOURCE_FILE_MAP[sourceKey] || SOURCE_FILE_MAP[entry.layer?.toLowerCase().replace(/\s+/g, '-') || ''];

    const label = [entry.layer, entry.method].filter(Boolean).join(': ') || entry.source || 'log';
    const desc = entry.details || entry.error || entry.status;

    return this.add(type, label, desc || '', {
      file: fileInfo?.file,
      function: fileInfo?.function || entry.method,
      duration: entry.duration_ms > 0 ? entry.duration_ms : undefined,
      data: entry.dataPointsFound > 0 ? { dataPoints: entry.dataPointsFound } : undefined,
    });
  }

  // ── Pause / Resume ─────────────────────────────────────────────────────────

  pause(): void {
    if (!this.paused) {
      this.paused = true;
      this.pausedAt = Date.now();
      this.add('checkpoint', 'Paused', 'Pipeline execution paused by user');
    }
  }

  resume(): void {
    if (this.paused && this.pausedAt !== null) {
      // Adjust startTime to exclude the paused duration
      this.startTime += Date.now() - this.pausedAt;
      this.paused = false;
      this.pausedAt = null;
      this.add('checkpoint', 'Resumed', 'Pipeline execution resumed');
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  getEntries(): TimelineEntry[] {
    return [...this.entries];
  }

  getProjectId(): string {
    return this.projectId;
  }

  getStartTime(): number {
    return this.startTime;
  }

  getElapsed(): number {
    return Date.now() - this.startTime;
  }
}
