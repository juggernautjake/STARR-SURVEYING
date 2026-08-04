/**
 * Bell County Property Research System — Entry Point
 *
 * Single function that the county router calls.
 * Everything needed for Bell County research lives in this folder.
 */

import { orchestrateBellResearch } from './orchestrator.js';
import { withRunContext } from '../../infra/run-context.js';
export { orchestrateBellResearch };
export type { OrchestratorProgress, ProgressCallback } from './orchestrator.js';
export type { BellResearchInput } from './types/research-input.js';
export type { BellResearchResult } from './types/research-result.js';
export { buildToggleSections, generateResearchSummary } from './reports/report-builder.js';
export { generateSurveyPlan } from './reports/survey-plan-generator.js';

/**
 * Run the complete Bell County property research pipeline.
 *
 * This is the function called when the user clicks "Initiate Research & Analysis"
 * for a Bell County property. It handles everything:
 *   - Identifies the property (CAD + GIS + geocoding)
 *   - Scrapes all data sources (clerk, plats, FEMA, TxDOT, tax)
 *   - Captures screenshots of every page visited
 *   - AI-analyzes all documents (deeds, plats)
 *   - Detects discrepancies across sources
 *   - Scores confidence on all data
 *   - Builds the structured research result
 *
 * @param input - User-provided property info (at least one identifier required)
 * @param onProgress - Callback for real-time progress updates (drives the UI log)
 * @returns Complete research result with all toggle sections populated
 */
export async function runBellCountyResearch(
  input: import('./types/research-input').BellResearchInput,
  onProgress: import('./orchestrator').ProgressCallback,
  signal?: AbortSignal,
): Promise<import('./types/research-result').BellResearchResult> {
  // R4b — the Bell pipeline is a second entry point, and until now it ran outside the ambient run
  // that `runPipeline` establishes. Three Bell AI call sites were recorded as blocked on "needs
  // projectId threaded from the Bell pipeline" — which was wrong: `BellResearchInput` has carried a
  // `projectId` all along, for status updates and storage. The blocker was a reason nobody checked.
  //
  // Wrapping here rather than in `orchestrateBellResearch` keeps the context at the outermost edge,
  // so anything the orchestrator calls — now or later — is attributed without further thought.
  return withRunContext(input.projectId, () => orchestrateBellResearch(input, onProgress, signal));
}
