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
import type { PipelineLogger } from './logger.js';

// Global flag — set to true by the pipeline runner when testMode=true
let tracingEnabled = false;

export function enableTracing(): void {
  tracingEnabled = true;
}

export function disableTracing(): void {
  tracingEnabled = false;
}

export function isTracingEnabled(): boolean {
  return tracingEnabled;
}

/**
 * Create a tracer bound to a specific source file.
 * Returns a function that emits timeline events with file:line info.
 *
 * The returned function is a no-op when tracing is disabled (production),
 * so there is zero overhead in non-test runs.
 */
export function createTracer(filePath: string) {
  return function trace(
    logger: PipelineLogger,
    functionName: string,
    line: number,
    label: string,
    data?: Record<string, unknown>,
  ): void {
    if (!tracingEnabled) return;

    const projectId = logger.getProjectId();
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
  };
}
