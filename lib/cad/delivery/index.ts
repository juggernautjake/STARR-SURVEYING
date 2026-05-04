// lib/cad/delivery/index.ts
// Phase 7 — final-delivery package barrel. Hosts the
// completeness checker today; RPLS workflow, seal engine,
// export pipelines, and deliverable orchestration land in
// follow-up slices.

export {
  checkDrawingCompleteness,
  summarizeCompleteness,
} from './completeness-checker';
export type {
  CompletenessCheck,
  CompletenessInputs,
  CompletenessSeverity,
  CompletenessSummary,
} from './completeness-checker';
