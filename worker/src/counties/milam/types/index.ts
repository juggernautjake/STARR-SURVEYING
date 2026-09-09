/**
 * Milam County Research System — Type Definitions
 *
 * The input and result shapes are the shared ones the orchestrator reads and writes. They carry
 * Bell's name because they were written there; a Milam result is the same structure with Milam's
 * sources in its labels.
 */

export type { BellResearchInput as MilamResearchInput } from '../../bell/types/research-input.js';
export type { BellResearchResult as MilamResearchResult } from '../../bell/types/research-result.js';
