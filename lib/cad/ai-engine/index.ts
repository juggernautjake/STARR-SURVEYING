// lib/cad/ai-engine/index.ts
// Public barrel export for the Phase 6 AI Drawing Engine.
// Consumers should import from this barrel rather than individual files.

export * from './types';
export { classifyPoints } from './stage-1-classify';
export { assembleFeatures, kasaCircleFit } from './stage-2-assemble';
export { parseCallsRegex, extractMonument } from './deed-parser';
export { reconcileDeed } from './stage-3-reconcile';
export {
  computeOptimalPlacement,
  findLongestBoundaryBearing,
} from './stage-4-placement';
export { optimizeLabelsAiAware } from './stage-5-labels';
export {
  computeConfidence,
  getTier,
  scoreAllElements,
} from './stage-6-confidence';
export { runAIPipeline, type PipelineProgressFn } from './pipeline';
export {
  parseCallsWithClaude,
  MissingApiKeyError,
} from './claude-deed-parser';
export type { ClaudeDeedParseResult } from './claude-deed-parser';
export {
  resolveOffsetsSync,
  detectSuffixOffsets,
  detectCompanionPairs,
  detectUnresolvedOffsetIndicators,
  applyOffset,
} from './offset-resolver';
export type {
  OffsetShot,
  OffsetDirection,
  OffsetResolutionMethod,
  OffsetResolutionDetail,
} from './offset-resolver';
export { fetchEnrichmentData } from './enrichment';
export { runDeliberation } from './deliberation';
export type { DeliberationInputs } from './deliberation';
export { applyAnswerEffects } from './apply-answers';
