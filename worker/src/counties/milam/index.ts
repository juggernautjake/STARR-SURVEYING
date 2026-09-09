/**
 * Milam County Property Research System — Entry Point
 *
 * Single function that the county router calls. The run itself is the shared orchestrator
 * (`counties/bell/orchestrator.ts`, `orchestrateCountyResearch`) driven by `MILAM_MODULE`.
 */

import { orchestrateCountyResearch, type ProgressCallback } from '../bell/orchestrator.js';
import { withRunContext } from '../../infra/run-context.js';
import { MILAM_MODULE } from './module.js';
import type { MilamResearchInput, MilamResearchResult } from './types/index.js';

export { MILAM_MODULE };
export { MILAM_ENDPOINTS } from './config/endpoints.js';
export type { MilamResearchInput, MilamResearchResult } from './types/index.js';

/**
 * Run the complete Milam County property research pipeline.
 *
 * Same contract as `runBellCountyResearch`: identification (CAD + GIS + geocode), plats first,
 * clerk, FEMA/TxDOT/tax, captures, AI reading (unless a gather run), relevance, correlation,
 * adjoiners, completeness, summary — filed to the project as it goes.
 */
export async function runMilamCountyResearch(
  input: MilamResearchInput,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
): Promise<MilamResearchResult> {
  return withRunContext(input.projectId, () => orchestrateCountyResearch(MILAM_MODULE, input, onProgress, signal));
}
