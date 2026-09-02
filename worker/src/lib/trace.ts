// worker/src/lib/trace.ts — Lightweight function-level tracing for the Testing Lab
//
// Instruments key pipeline functions with checkpoint calls that emit timeline
// events with precise file:line metadata. Only active when testMode=true
// (no overhead in production runs).
//
// Usage in a service file:
//   import { createTracer } from '../lib/trace.js';
//   const trace = createTracer('worker/src/services/discovery-engine.ts');
//
//   export async function runDiscovery(input, logger) {
//     trace(logger, 'runDiscovery', 12, 'entry', { address: input.address });
//     const result = await cadAdapter.search(address);
//     trace(logger, 'runDiscovery', 15, 'search-complete', { count: result.length });
//   }

import { getTracker } from './timeline-tracker.js';
import { globalStepGate } from './step-gate.js';
import type { PipelineLogger } from './logger.js';

// ── C2: tracing is PER PROJECT, and used not to be ──────────────────────────────────────────────
//
// This was `let tracingEnabled = false` — one boolean for the whole process — and `disableTracing()`
// is called on the completion AND the failure path of every run. So with two runs going at once:
//
//   run A starts in testMode        → tracing on
//   run B finishes (or crashes)     → tracing OFF, for everybody
//   run A carries on               → the Testing Lab watching it goes silent, mid-run
//
// A completing run must not reach into a live one. Nothing failed and nothing said so; the timeline
// simply stopped, which reads as "the run stalled" rather than "another run turned your tracing off".
//
// A Set keyed by project id, because the question this answers is always asked about a specific run:
// `trace()` already has the project from its logger, and `getTracker(projectId)` next to it was
// already per-project. The global flag was the odd one out.
const tracingProjects = new Set<string>();

export function enableTracing(projectId: string): void {
  tracingProjects.add(projectId);
}

export function disableTracing(projectId: string): void {
  tracingProjects.delete(projectId);
}

/**
 * Is tracing on for this run?
 *
 * The argument is required for a decision about a run. The no-argument form answers "is ANY run
 * being traced", which is only ever useful for a health readout — never for gating a trace call,
 * where it would put run B's events into run A's timeline.
 */
export function isTracingEnabled(projectId: string): boolean {
  return tracingProjects.has(projectId);
}

/** How many runs are being traced. For diagnostics; not a gate. */
export function tracedProjectCount(): number {
  return tracingProjects.size;
}

/**
 * Create a tracer bound to a specific source file.
 * Returns a function that emits timeline events with file:line info.
 *
 * The returned function is a no-op when tracing is disabled (production),
 * so there is zero overhead in non-test runs.
 *
 * When step-through mode is active for the project, each trace call also
 * awaits the step gate — blocking pipeline execution until the developer
 * clicks "Next Step" in the Testing Lab UI.
 */
export function createTracer(filePath: string) {
  return async function trace(
    logger: PipelineLogger,
    functionName: string,
    line: number,
    label: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    // The project is read BEFORE the gate, because the gate is now a question about this run rather
    // than about the process.
    const projectId = logger.getProjectId();
    if (!tracingProjects.has(projectId)) return;

    const tracker = getTracker(projectId);

    // Determine event type from the label
    const labelLower = label.toLowerCase();
    const type =
      labelLower.includes('error') || labelLower.includes('fail') ? 'error' as const :
      labelLower.includes('warn') ? 'warning' as const :
      labelLower.includes('entry') || labelLower.includes('start') ? 'phase-start' as const :
      labelLower.includes('complete') || labelLower.includes('done') || labelLower.includes('success') ? 'data-found' as const :
      labelLower.includes('api') || labelLower.includes('fetch') || labelLower.includes('request') ? 'api-call' as const :
      labelLower.includes('ai') || labelLower.includes('claude') || labelLower.includes('anthropic') ? 'ai-call' as const :
      labelLower.includes('browser') || labelLower.includes('playwright') || labelLower.includes('navigate') ? 'browser-action' as const :
      labelLower.includes('screenshot') || labelLower.includes('capture') ? 'screenshot' as const :
      'log' as const;

    // Determine status for line highlighting on the frontend
    const status = labelLower.includes('error') || labelLower.includes('fail') ? 'failed' :
      labelLower.includes('complete') || labelLower.includes('success') || labelLower.includes('done') ? 'success' :
      'executing';

    tracker.add(type, `${functionName}: ${label}`, JSON.stringify(data ?? {}).slice(0, 200), {
      file: filePath,
      function: functionName,
      line,
      data: { ...data, _traceStatus: status },
    });

    // In step-through mode, block execution at this checkpoint until the
    // developer advances via POST /research/step/:projectId.
    if (globalStepGate.isStepMode(projectId)) {
      await globalStepGate.addCheckpoint(projectId, `${functionName}: ${label}`);
    }
  };
}
